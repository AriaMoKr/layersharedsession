// The session controller in Node, with a stand-in for joinSession: a session object that keeps
// what it was asked and lets a test play the others (connect, hello, wave, leave). The address,
// history, storage and the window's events are stand-ins too, and setTimeout is mocked for the
// relay wait.
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBuffer, emptyPose, PART, pushSample, setPart } from '../public/js/pose.js';
import { isRoom } from '../public/js/room.js';
import { createTogether, RELAY_WAIT_MS, WAVE_AGAIN_MS } from '../public/js/together.js';

mock.timers.enable({ apis: ['setTimeout'] });

globalThis.document = {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ({ measureText: (text) => ({ width: text.length * 20 }), beginPath() {}, roundRect() {}, fill() {}, fillText() {} }),
  }),
};
const store = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)) };
};
globalThis.window = { sessionStorage: store(), localStorage: store() };
globalThis.location = { href: '' };
const addressed = []; // each replaceState's state and address
globalThis.history = {
  state: { back: 'the door' },
  replaceState(state, _title, href) {
    addressed.push({ state, href });
    location.href = href;
  },
};
const windowListeners = new Map();
globalThis.addEventListener = (type, fn) => windowListeners.set(type, [...(windowListeners.get(type) ?? []), fn]);

/** Every stand-in session joined, in order. */
const joined = [];

/** joinSession's stand-in: what it was given in `o`, what it was told, and the others played. */
function standIn(o) {
  const listeners = new Map();
  const channels = new Map();
  const s = {
    o,
    self: { memberId: o.identity.memberId, name: o.identity.name, color: o.identity.color, page: o.page },
    peers: new Map(),
    relays: { open: 0, total: 3 },
    shared: new Map(),
    poses: 0,
    lastPose: null,
    ticks: 0,
    left: false,
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type).delete(fn);
    },
    emit(type, detail) {
      for (const fn of listeners.get(type) ?? []) fn(detail);
    },
    channel(name) {
      if (!channels.has(name)) {
        const fns = new Set();
        const ch = {
          sent: [],
          send: (data) => (ch.sent.push(data), Promise.resolve()),
          on: (fn) => (fns.add(fn), () => fns.delete(fn)),
          deliver: (data, peer) => fns.forEach((fn) => fn(data, peer)),
        };
        channels.set(name, ch);
      }
      return channels.get(name);
    },
    setPose(pose) {
      s.poses++;
      s.lastPose = pose;
    },
    tick() {
      s.ticks++;
    },
    setName(name) {
      s.self.name = name;
    },
    get: (key) => s.shared.get(key),
    set: (key, value) => void s.shared.set(key, value),
    leave() {
      s.left = true;
      return Promise.resolve();
    },
    /** Another visitor connects; their hello hasn't come. */
    connect(peerId) {
      const p = { peerId, memberId: null, name: null, color: '#9aa3ad', page: null, rtt: null, buffer: createBuffer() };
      s.peers.set(peerId, p);
      return p;
    },
    /** Their hello: 'join' the first time, 'update' after. */
    hello(peerId, page, name = `Name ${peerId}`) {
      const p = s.peers.get(peerId) ?? s.connect(peerId);
      const first = p.memberId === null;
      Object.assign(p, { memberId: `member${peerId}`, name, color: '#3366cc', page });
      s.emit(first ? 'join' : 'update', p);
      return p;
    },
    drop(peerId) {
      const p = s.peers.get(peerId);
      s.peers.delete(peerId);
      s.emit('leave', p);
    },
  };
  joined.push(s);
  return s;
}

let clock = 0;
/** A controller on page 'hallway' with the stand-in, and what it emits. */
function make(o = {}) {
  location.href = 'https://example.test/hallway/?lang=en#top';
  const t = createTogether({ appId: 'test-app', page: 'hallway', joinSession: standIn, now: () => clock, ...o });
  const changes = { n: 0 };
  t.on('change', () => changes.n++);
  const notices = [];
  t.on('notice', (n) => notices.push(n));
  return { t, changes, notices };
}
/** Lets a join that is loading finish. */
const settle = () => new Promise((resolve) => setImmediate(resolve));
/** A pose sample for a peer, so that place() can draw them. */
function posed(p) {
  const pose = emptyPose();
  setPart(pose, PART.head, new THREE.Vector3(1, 1.6, 1), new THREE.Quaternion());
  pushSample(p.buffer, 0, pose);
}

test('start joins a room and puts it in the address, keeping history.state and the rest', async () => {
  const { t } = make({ pageName: (page) => `the ${page}` });
  const sessions = [];
  t.on('session', (s) => sessions.push(s));
  assert.equal(t.active, false);
  assert.equal(t.room, null);
  assert.equal(t.inviteLink, '');

  t.start('k3vd-q8hn');
  assert.equal(t.active, true);
  assert.equal(t.room, 'k3vd-q8hn');
  assert.equal(t.session, null, 'still loading');
  assert.equal(t.condition().loaded, false);
  assert.equal(location.href, 'https://example.test/hallway/?lang=en&room=k3vd-q8hn#top');
  assert.equal(addressed.at(-1).state, history.state, "a site's Back keeps its fields in history.state");
  assert.equal(t.inviteLink, 'https://example.test/hallway/?room=k3vd-q8hn', 'only the room');

  await settle();
  const s = joined.at(-1);
  assert.equal(t.session, s);
  assert.deepEqual(sessions, [s]);
  assert.equal(s.o.appId, 'test-app');
  assert.equal(s.o.room, 'k3vd-q8hn');
  assert.equal(s.o.page, 'hallway');
  assert.equal(s.o.storage, window.sessionStorage);
  assert.equal(s.o.pageName('outside'), 'the outside');
  assert.equal(t.self, s.self);
  assert.equal(t.condition().loaded, true);

  t.start();
  assert.ok(isRoom(t.room), 'a new room by default');
  assert.equal(s.left, true, 'the last room left');
  t.stop();
});

test('stop leaves and takes ?room= out of the address', async () => {
  const { t } = make();
  t.start('aaaa-bbbb');
  await settle();
  const s = joined.at(-1);
  const left = t.stop();
  assert.ok(left instanceof Promise);
  await left;
  assert.equal(s.left, true);
  assert.equal(t.session, null);
  assert.equal(t.room, null);
  assert.equal(t.active, false);
  assert.equal(location.href, 'https://example.test/hallway/?lang=en#top');
  assert.equal(addressed.at(-1).state, history.state);
  assert.equal(t.inviteLink, '');
});

test('pause leaves but keeps the room; resume joins it again', async () => {
  const { t } = make();
  const sessions = [];
  t.on('session', (s) => sessions.push(s));
  t.start('cccc-dddd');
  await settle();
  const first = joined.at(-1);

  await t.pause();
  assert.equal(first.left, true);
  assert.equal(t.paused, true);
  assert.equal(t.active, false);
  assert.equal(t.session, null);
  assert.equal(t.room, 'cccc-dddd');
  assert.match(location.href, /room=cccc-dddd/, 'the address keeps the room');

  t.resume();
  assert.equal(t.paused, false);
  await settle();
  const second = joined.at(-1);
  assert.notEqual(second, first);
  assert.equal(second.o.room, 'cccc-dddd');
  assert.deepEqual(sessions, [first, second], "'session' again, for the site's own listeners");

  const n = joined.length;
  t.resume();
  await settle();
  assert.equal(joined.length, n, 'not paused: resume does nothing');
  t.stop();
  await t.pause();
  assert.equal(t.paused, false, 'not in a session: nothing to pause');
});

test('a join still loading is dropped when the session stops or moves on', async () => {
  const { t } = make();
  const n = joined.length;
  t.start('eeee-ffff');
  t.stop();
  await settle();
  assert.equal(joined.length, n, 'stopped before it loaded: never joined');
  assert.equal(t.session, null);

  t.start('gggg-hhhh');
  t.start('jjjj-kkkk');
  await settle();
  assert.equal(joined.length, n + 1, 'one join');
  assert.equal(joined.at(-1).o.room, 'jjjj-kkkk', 'the later room');

  t.start('mmmm-nnnn');
  t.pause();
  await settle();
  assert.equal(joined.length, n + 1, 'paused before it loaded');
  t.resume();
  await settle();
  assert.equal(joined.length, n + 2);
  assert.equal(joined.at(-1).o.room, 'mmmm-nnnn');
  t.stop();
});

test('condition: slow after RELAY_WAIT_MS without a relay, and failed handshakes counted', async () => {
  const { t, changes } = make();
  t.start('pppp-qqqq');
  await settle();
  const s = joined.at(-1);
  assert.deepEqual(t.condition(), { online: true, loaded: true, relays: 0, slow: false, failed: 0 });

  const n = changes.n;
  mock.timers.tick(RELAY_WAIT_MS - 1);
  assert.equal(t.condition().slow, false);
  mock.timers.tick(1);
  assert.equal(t.condition().slow, true);
  assert.equal(changes.n, n + 1, "a change, so the status can say it can't reach the relays");

  s.relays.open = 2;
  s.emit('relays', { ...s.relays });
  assert.equal(changes.n, n + 2);
  assert.equal(t.condition().relays, 2);
  assert.equal(t.condition().slow, false, 'a relay open');

  s.emit('log', { t: 1, kind: 'error', text: "Couldn't connect to a peer: Ice connection failed" });
  s.emit('log', { t: 2, kind: 'error', text: 'Something else went wrong' });
  s.emit('log', { t: 3, kind: 'info', text: "Couldn't connect to a peer, said as info" });
  assert.equal(t.condition().failed, 1);
  assert.equal(changes.n, n + 3);

  t.stop();
  assert.deepEqual(t.condition(), { online: true, loaded: false, relays: 0, slow: false, failed: 0 });
  t.start('rrrr-ssss');
  t.stop();
  const m = changes.n;
  mock.timers.tick(RELAY_WAIT_MS);
  assert.equal(changes.n, m, 'the wait ends with the session');
  assert.equal(t.condition().slow, false);
});

test('online and offline are a change while in a session', async () => {
  const { t, changes } = make();
  const fire = (type) => windowListeners.get(type).at(-1)();
  fire('offline');
  assert.equal(changes.n, 0, 'out of a session: nothing to say');

  t.start('tttt-uuuu');
  const was = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
  try {
    const n = changes.n;
    fire('offline');
    assert.equal(changes.n, n + 1);
    assert.equal(t.condition().online, false);
  } finally {
    if (was) Object.defineProperty(globalThis, 'navigator', was);
    else delete globalThis.navigator;
  }
  t.stop();
});

test('waves: one a second from each visitor, with a bob unless reduceMotion', async () => {
  const { t, notices } = make({ avatars: { parent: new THREE.Scene() } });
  assert.equal(t.wave(), false, 'not in a session');
  t.start('vvvv-wwww');
  await settle();
  const s = joined.at(-1);
  const wave = s.channel('wave');
  assert.equal(t.wave(), true);
  assert.deepEqual(wave.sent, [1]);

  const a = s.hello('a', 'hallway');
  const b = s.hello('b', 'outside');
  notices.length = 0;
  clock = 5000;
  wave.deliver(1, a);
  clock = 5000 + WAVE_AGAIN_MS - 1;
  wave.deliver(1, a); // too soon
  wave.deliver(1, b);
  clock = 5000 + WAVE_AGAIN_MS;
  wave.deliver(1, a);
  assert.deepEqual(
    notices.map((n) => [n.kind, n.peer.peerId]),
    [['wave', 'a'], ['wave', 'b'], ['wave', 'a']],
  );
  assert.equal(t.avatars.get('a').waveAt, 5000 + WAVE_AGAIN_MS, 'the avatar bobs');

  t.reduceMotion = true;
  clock = 9000;
  wave.deliver(1, b);
  assert.deepEqual([notices.at(-1).kind, notices.at(-1).peer], ['wave', b], 'still said');
  assert.equal(t.avatars.get('b').waveAt, 5000 + WAVE_AGAIN_MS - 1, 'but no bob');
  t.stop();
});

test('isHere decides who is drawn and how company counts', async () => {
  const space = new Map([['a', 'stacks'], ['b', 'reading room'], ['c', 'stacks']]);
  const asked = [];
  const { t } = make({
    avatars: { parent: new THREE.Scene() },
    isHere: (peer, avatar) => {
      asked.push([peer.peerId, avatar?.peerId]);
      return space.get(peer.peerId) === 'stacks';
    },
  });
  assert.deepEqual(t.company(), { here: 0, nearby: 0, away: 0, connecting: 0 });
  t.start('xxxx-yyyy');
  await settle();
  const s = joined.at(-1);
  for (const [id, page] of [['a', 'hallway'], ['b', 'hallway'], ['c', 'outside']]) posed(s.hello(id, page));
  s.connect('d');

  assert.deepEqual(t.company(), { here: 1, nearby: 1, away: 1, connecting: 1 });
  assert.deepEqual(t.people().map((p) => p.peerId), ['a', 'b', 'c'], 'those whose hello came');
  asked.length = 0;
  t.update(1000);
  assert.equal(t.avatars.get('a').group.visible, true);
  assert.equal(t.avatars.get('b').group.visible, false, 'on this page, elsewhere in it');
  assert.equal(t.avatars.get('c').group.visible, false, 'on another page');
  assert.deepEqual(asked, [['a', 'a'], ['b', 'b']], 'asked only of those on this page, with their avatar');

  const plain = make({ avatars: { parent: new THREE.Scene() } }).t;
  plain.start('zzzz-2222');
  await settle();
  const s2 = joined.at(-1);
  for (const [id, page] of [['a', 'hallway'], ['b', 'hallway'], ['c', 'outside']]) posed(s2.hello(id, page));
  assert.deepEqual(plain.company(), { here: 2, nearby: 0, away: 1, connecting: 0 }, 'without isHere: everyone on this page');
  plain.update(1000);
  assert.deepEqual(plain.avatars.list.map((a) => a.group.visible), [true, true, false]);
  t.stop();
  plain.stop();
  assert.equal(plain.avatars.list.length, 0, 'gone with the session');
});

test('notices: join, arrive and leave', async () => {
  const { t, notices } = make({ avatars: { parent: new THREE.Scene() } });
  t.start('3333-4444');
  await settle();
  const s = joined.at(-1);
  s.emit('update', s.connect('a')); // a ping's round trip, before their hello
  s.hello('a', 'outside');
  assert.equal(t.avatars.get('a').page, 'outside', 'the page of the hello, not of the ping');
  s.hello('a', 'outside', 'Renamed'); // an update on the same page
  s.hello('a', 'hallway');
  s.hello('b', 'hallway');
  s.drop('a');
  assert.deepEqual(
    notices.map(({ kind, peer, from }) => (from === undefined ? [kind, peer.peerId] : [kind, peer.peerId, from])),
    [['join', 'a'], ['arrive', 'a', 'outside'], ['join', 'b'], ['leave', 'a']],
  );
  assert.equal(notices[2].peer, s.peers.get('b'), 'the peer as the session has it: the site words where they are');
  assert.equal(t.avatars.get('a'), undefined, 'dropped');
  assert.equal(t.avatars.get('b').page, 'hallway');
  t.stop();
});

test('update sends the pose and ticks, with the hands only in VR', async () => {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(1, 1.6, 2);
  const renderer = { xr: { isPresenting: false } };
  let handsAsked = 0;
  const { t } = make({ camera, renderer, hands: () => (handsAsked++, []) });
  t.update(0); // not in a session: nothing to do
  t.start('5555-6666');
  await settle();
  const s = joined.at(-1);
  t.update(16);
  assert.equal(s.ticks, 1);
  assert.equal(s.poses, 1);
  assert.deepEqual([...s.lastPose.subarray(0, 3)].map((x) => Math.round(x * 100) / 100), [1, 1.6, 2]);
  assert.equal(handsAsked, 0, 'not in VR');
  renderer.xr.isPresenting = true;
  const pose = s.lastPose;
  t.update(32);
  assert.equal(handsAsked, 1);
  assert.equal(s.lastPose, pose, 'the same pose array every frame');
  t.stop();

  const headless = make().t;
  headless.start('7777-8888');
  await settle();
  headless.update(16);
  assert.deepEqual([joined.at(-1).ticks, joined.at(-1).poses], [1, 0], 'no camera: no pose, still ticks');
  headless.stop();
});

test('setName cleans the name, keeps it and tells the session', async () => {
  const { t, changes } = make();
  assert.equal(t.setName('  Ada   Lovelace '), 'Ada Lovelace');
  assert.equal(window.localStorage.getItem('lss.name'), 'Ada Lovelace', 'the default for new tabs');
  assert.equal(t.self.name, 'Ada Lovelace');
  assert.equal(changes.n, 1);
  t.start('9999-aaaa');
  await settle();
  const s = joined.at(-1);
  assert.equal(s.o.identity.name, 'Ada Lovelace');
  assert.equal(s.o.identity.memberId, t.self.memberId);
  assert.equal(t.setName('Grace'), 'Grace');
  assert.equal(s.self.name, 'Grace');
  assert.equal(t.setName('   '), 'Grace', 'nothing left of it: ignored');
  t.stop();
});

test('on returns a function that stops listening', () => {
  const { t } = make();
  let n = 0;
  const off = t.on('change', () => n++);
  t.setName('Once');
  off();
  t.setName('Twice');
  assert.equal(n, 1);
});
