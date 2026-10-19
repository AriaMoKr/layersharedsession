// The shared-session layer: a page joins a room and learns who else is in it, where they are and
// how they're posed, and shares values with them. Peer to peer over WebRTC through Trystero, whose
// default strategy finds the other visitors through public Nostr relays: no server of our own.
//
//   const session = joinSession({ appId, room, page, identity });
//   session.on('join', (peer) => …);         // also 'leave', 'update', 'pose', 'shared', 'self',
//                                            // 'relays', 'log', and channel messages
//   session.setPose(pose); session.tick();   // every frame: sends the pose when it changed (15/s)
//   session.set('switch', true);             // a shared value, see shared.js
//   const wave = session.channel('wave');    // named messages: wave.send(data), wave.on(fn)
//
// Messages (Trystero actions):
//   hello  JSON  { memberId, name, color, page }: to a new peer, and to all when it changes
//   pose   84 bytes, see pose.js: at most POSE_HZ a second, when it changed, and to a new peer
//   state  JSON  { k: 'snapshot' | 'write', e: { key: { value, clock, by } } }: every value to a
//                new peer (a snapshot), each write to all
//   x:…    JSON  a channel's messages
import { joinRoom, selfId, getRelaySockets } from 'trystero';
import { createBuffer, decodePose, poseChanged, pushSample, POSE_LENGTH } from './pose.js';
import { createShared, getValue, mergeSnapshot, setLocal, snapshot } from './shared.js';
import { cleanName, colorFor, newMemberId, saveMemberId } from './identity.js';

export const POSE_HZ = 15;
const PING_MS = 2000;
const RELAY_CHECK_MS = 1000;
// How long a visitor who left is remembered, to tell "back after 3.2 s" when they return.
const REMEMBER_LEFT_MS = 10 * 60 * 1000;

const MEMBER_RE = /^[a-z0-9]{12}$/;
const COLOR_RE = /^#[0-9a-f]{6}$/;
const PAGE_RE = /^[a-z0-9-]{1,32}$/;

/**
 * Joins `room`. `identity` is { memberId, name, color } (identity.js); `page` names the page in
 * the session (visitors on other pages are in the session too, just elsewhere). `storage` keeps a
 * replaced member id (sessionStorage). `now` is the clock for every time the session reports: by
 * default performance.now(), the milliseconds since this page began loading. `pageName` turns a
 * page id into words for the log.
 */
export function joinSession({ appId, room, page, identity, storage = null, now = () => performance.now(), pageName = (id) => id, config = {} }) {
  const listeners = new Map();
  const emit = (type, detail) => {
    const set = listeners.get(type);
    if (set) for (const fn of [...set]) fn(detail);
  };
  // The log is kept, so a listener added after joining (the page's panel) still gets it all.
  const logged = [];
  const on = (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
    if (type === 'log') for (const entry of logged) fn(entry);
    return () => listeners.get(type)?.delete(fn);
  };
  const log = (text, kind = 'info') => {
    const entry = { t: now(), kind, text };
    logged.push(entry);
    if (logged.length > 500) logged.shift();
    emit('log', entry);
  };
  const swallow = (what) => (err) => log(`${what}: ${err?.message || err}`, 'error');

  const self = { selfId, memberId: identity.memberId, name: identity.name, color: identity.color, page };
  const peers = new Map(); // Trystero peer id → peer
  const left = new Map(); // member id → { at, name, page }
  const shared = createShared();
  const relays = { open: 0, total: 0 };
  const timers = [];
  let firstPeerAt = null;
  let localPose = null;
  let sentPose = null;
  let nextPoseAt = 0;
  let closed = false;

  log(`Joining room ${room} as ${self.name}, peer id ${selfId}`);
  const tr = joinRoom({ appId, ...config }, room, {
    onJoinError: (e) => log(`Couldn't connect to a peer: ${e.error}`, 'error'),
  });

  const helloPayload = () => ({ memberId: self.memberId, name: self.name, color: self.color, page: self.page });
  const peerName = (p) => p.name || `peer ${p.peerId.slice(0, 6)}`;

  const hello = tr.makeAction('hello', {
    onMessage: (data, { peerId }) => {
      const p = peers.get(peerId);
      if (!p || !data || typeof data !== 'object') return;
      if (!MEMBER_RE.test(data.memberId) || !COLOR_RE.test(data.color) || !PAGE_RE.test(data.page)) return;
      const name = cleanName(data.name) || `Guest ${data.memberId.slice(0, 4).toUpperCase()}`;
      if (data.memberId === self.memberId && peerId !== selfId) resolveClash(peerId);
      const first = p.memberId === null;
      const movedFrom = !first && p.page !== data.page ? p.page : null;
      const renamedFrom = !first && p.name !== name ? p.name : null;
      Object.assign(p, { memberId: data.memberId, name, color: data.color, page: data.page });
      if (first) {
        p.helloAt = now();
        if (firstPeerAt === null) {
          firstPeerAt = p.helloAt;
          log(`First visitor seen ${(firstPeerAt / 1000).toFixed(1)} s after this page began loading`, 'measure');
        }
        const gone = left.get(p.memberId);
        if (gone && p.helloAt - gone.at < REMEMBER_LEFT_MS) {
          p.backAfter = p.helloAt - gone.at;
          log(`${name} is back, on ${pageName(p.page)}, ${(p.backAfter / 1000).toFixed(1)} s after leaving ${pageName(gone.page)}`, 'measure');
        } else {
          log(`${name} joined, on ${pageName(p.page)}`);
        }
        left.delete(p.memberId);
        emit('join', p);
      } else {
        if (renamedFrom) log(`${renamedFrom} is now called ${name}`);
        if (movedFrom) log(`${name} moved from ${pageName(movedFrom)} to ${pageName(p.page)}`);
        emit('update', p);
      }
    },
  });

  const poseAction = tr.makeAction('pose', {
    onMessage: (data, { peerId }) => {
      const p = peers.get(peerId);
      const pose = decodePose(data);
      if (!p || !pose) return;
      p.poses += 1;
      pushSample(p.buffer, now(), pose);
      emit('pose', p);
    },
  });

  const stateAction = tr.makeAction('state', {
    onMessage: (data, { peerId }) => {
      if (!data || typeof data !== 'object') return;
      const initial = data.k === 'snapshot';
      for (const key of mergeSnapshot(shared, data.e)) {
        const entry = shared.entries.get(key);
        emit('shared', { key, value: entry.value, by: entry.by, from: peers.get(peerId) || null, initial });
      }
    },
  });

  // Two tabs with the same member id: a duplicated tab copies sessionStorage. The one with the
  // greater Trystero peer id takes a new member id, so both sides settle on the same answer.
  function resolveClash(otherPeerId) {
    if (selfId < otherPeerId) return;
    self.memberId = newMemberId();
    self.color = colorFor(self.memberId);
    saveMemberId(storage, self.memberId);
    log(`Another tab had this tab's member id, so this tab took a new one: ${self.memberId}`);
    emit('self', self);
    hello.send(helloPayload()).catch(swallow('hello'));
  }

  tr.onPeerJoin = (peerId) => {
    const p = {
      peerId,
      memberId: null,
      name: null,
      color: '#9aa3ad',
      page: null,
      connectedAt: now(),
      helloAt: null,
      backAfter: null,
      rtt: null,
      poses: 0,
      buffer: createBuffer(),
    };
    peers.set(peerId, p);
    log(`Connected to peer ${peerId.slice(0, 6)} (WebRTC is up)`);
    // What a newcomer needs at once: who this is, every shared value, and where this visitor is.
    hello.send(helloPayload(), { target: peerId }).catch(swallow('hello'));
    if (shared.entries.size) stateAction.send({ k: 'snapshot', e: snapshot(shared) }, { target: peerId }).catch(swallow('state'));
    if (localPose) poseAction.send(localPose, { target: peerId }).catch(swallow('pose'));
  };

  tr.onPeerLeave = (peerId) => {
    const p = peers.get(peerId);
    if (!p) return;
    peers.delete(peerId);
    if (p.memberId) left.set(p.memberId, { at: now(), name: p.name, page: p.page });
    log(`${peerName(p)} left${p.page ? ` ${pageName(p.page)}` : ''}`);
    emit('leave', p);
  };

  timers.push(
    setInterval(() => {
      for (const p of peers.values()) {
        tr.ping(p.peerId)
          .then((ms) => {
            if (!peers.has(p.peerId)) return;
            const firstPing = p.rtt === null;
            p.rtt = ms;
            if (firstPing) log(`Round trip to ${peerName(p)}: ${Math.round(ms)} ms`, 'measure');
            emit('update', p);
          })
          .catch(() => {});
      }
    }, PING_MS),
  );

  function checkRelays() {
    const sockets = Object.values(getRelaySockets() || {});
    const open = sockets.filter((s) => s.readyState === 1).length;
    if (open !== relays.open || sockets.length !== relays.total) {
      relays.open = open;
      relays.total = sockets.length;
      log(`Nostr relays: ${open} of ${sockets.length} connected`);
      emit('relays', { ...relays });
    }
  }
  checkRelays();
  timers.push(setInterval(checkRelays, RELAY_CHECK_MS));

  const channels = new Map();

  return {
    self,
    room,
    peers,
    relays,
    shared,
    get firstPeerAt() {
      return firstPeerAt;
    },
    on,

    /** This visitor's pose (pose.js), read from the scene every frame. Sent by tick(). */
    setPose(pose) {
      if (pose.length !== POSE_LENGTH) throw new Error('session: a pose has 21 numbers');
      localPose = pose;
    },

    /** Sends the pose when it changed and its turn has come (POSE_HZ). Call every frame. */
    tick() {
      if (closed || !localPose || !peers.size) return;
      const t = now();
      if (t < nextPoseAt || !poseChanged(sentPose, localPose)) return;
      sentPose = Float32Array.from(localPose);
      nextPoseAt = t + 1000 / POSE_HZ;
      poseAction.send(sentPose).catch(swallow('pose'));
    },

    setName(name) {
      const clean = cleanName(name);
      if (!clean || clean === self.name) return;
      self.name = clean;
      emit('self', self);
      hello.send(helloPayload()).catch(swallow('hello'));
    },

    get(key, fallback) {
      return getValue(shared, key, fallback);
    },

    /** Writes a shared value, here and for everyone in the room. */
    set(key, value) {
      const entry = setLocal(shared, key, value, self.memberId);
      emit('shared', { key, value, by: self.memberId, from: null, initial: false });
      stateAction.send({ k: 'write', e: { [key]: entry } }).catch(swallow('state'));
    },

    /** Named messages of the page's own: send(data, peerId?) to all (or one), on(fn(data, peer)). */
    channel(name) {
      if (channels.has(name)) return channels.get(name);
      const fns = new Set();
      const action = tr.makeAction(`x:${name}`, {
        onMessage: (data, { peerId }) => {
          const p = peers.get(peerId);
          if (p) for (const fn of fns) fn(data, p);
        },
      });
      const ch = {
        send: (data, peerId) => action.send(data, peerId ? { target: peerId } : undefined).catch(swallow(name)),
        on: (fn) => {
          fns.add(fn);
          return () => fns.delete(fn);
        },
      };
      channels.set(name, ch);
      return ch;
    },

    /** Leaves the room (the others see it at once, not after a timeout). */
    leave() {
      if (closed) return Promise.resolve();
      closed = true;
      for (const id of timers) clearInterval(id);
      return tr.leave();
    },
  };
}
