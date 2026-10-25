// A shared session as the sites run one: what each site's together.js did the same way, taken from
// the hallway's (the others were copies of it). It starts a session in a room and leaves it, steps
// out for a door and back (pause, resume), keeps the room in the address so the address is the
// invitation, sends this visitor's pose and draws the others (avatars.js), counts who is here, and
// takes waves, at most one a second from each visitor since anyone can send anything. It words
// nothing: a site listens for 'change' and 'notice' and says things its own way.
//
//   const together = createTogether({ appId, page: 'hallway', camera, renderer, hands,
//     avatars: { parent: scene, font } });
//   together.on('change', () => redrawPanel(together.company(), together.condition()));
//   together.on('notice', ({ kind, peer }) => toast(kind, peer));
//   together.start(roomFromUrl(location.href) ?? undefined);   // a new room by default
//   // every frame:
//   together.update(performance.now());
//
// session.js (and Trystero under it, about 360 kB) is imported only when a session starts, so a
// visit without one costs nothing. update() allocates nothing.
import { createAvatars, readPose } from './avatars.js';
import { cleanName, loadIdentity, saveName } from './identity.js';
import { emptyPose } from './pose.js';
import { newRoom } from './room.js';

/** How long a session may go without a relay before condition() says it's slow. */
export const RELAY_WAIT_MS = 10000;
/** How soon the same visitor's next wave counts. */
export const WAVE_AGAIN_MS = 1000;
/** The channel the sites wave on, with the data 1. */
export const WAVE_CHANNEL = 'wave';

/**
 * What createTogether takes.
 * @typedef {object} TogetherOptions
 * @property {string} appId  the same for every site that shares rooms
 * @property {string} page  this page's id in the session, such as 'hallway'
 * @property {import('three').Object3D|null} [camera]  the viewer's head; without it no pose is sent
 * @property {{ xr: { isPresenting: boolean } }|null} [renderer]  whether in VR, for the hands
 * @property {(() => ArrayLike<import('./avatars.js').Hand>)|null} [hands]  the XR controllers
 * @property {{ parent: import('three').Object3D, font?: string, ground?: ((x: number, z: number) => number)|null }|null} [avatars]
 *   createAvatars' options, or null to draw no one
 * @property {((peer: import('./session.js').Peer, avatar: import('./avatars.js').Avatar|undefined) => boolean)|null} [isHere]
 *   narrows who is here among those on this page (vrlbry: the same room of the library). Here is
 *   who is drawn and who company() counts as here. Called every frame for each avatar, so it
 *   mustn't allocate; `avatar` is undefined when there are no avatars.
 * @property {((page: string) => string)|null} [pageName]  pages in words, for the layer's log
 * @property {((o: import('./session.js').JoinOptions) => import('./session.js').Session)|null} [joinSession]
 *   used instead of importing session.js: for tests
 * @property {() => number} [now]  the clock for waves (ms), performance.now() by default
 */
/**
 * Something a site may want to say. 'join': a visitor said hello, on this page or another;
 * 'arrive': one came onto this page from another (`from`); 'leave': one left the session; 'wave':
 * one waved (at most once a second each).
 * @typedef {{ kind: 'join'|'arrive'|'leave'|'wave', peer: import('./session.js').Peer, from?: string|null }} Notice
 */
/**
 * The others, counted: here (on this page and isHere), nearby (on this page, not isHere),
 * away (on another page), connecting (connected, their hello not yet come).
 * @typedef {{ here: number, nearby: number, away: number, connecting: number }} Company
 */
/**
 * How the session stands, for a site's own status words. online: navigator.onLine; loaded: the
 * session module has loaded and the room is joined; relays: the Nostr relays open; slow: still none
 * RELAY_WAIT_MS after joining; failed: handshakes with others that failed (a network that needs a
 * TURN relay).
 * @typedef {{ online: boolean, loaded: boolean, relays: number, slow: boolean, failed: number }} Condition
 */
/**
 * The events and what their listeners get. 'change': anything shown may have changed; 'session':
 * a session was joined (after start or resume), for a site's own shared values and listeners.
 * @typedef {{ change: undefined, notice: Notice, session: import('./session.js').Session }} TogetherEvents
 */

/** session.js's log line for a failed handshake with a peer. */
const HANDSHAKE_FAILED = /^Couldn't connect to a peer/;

const storage = (name) => {
  try {
    return globalThis.window?.[name] ?? null;
  } catch {
    return null; // blocked storage
  }
};

export class Together {
  #o;
  #page;
  #avatars;
  #drawn;
  #session = null;
  #room = null;
  #paused = false;
  #joining = 0; // which join is current: a slow import must not join a room left since
  #waited = false; // RELAY_WAIT_MS have passed since joining
  #timer = undefined;
  #failed = 0;
  #waves = new Map(); // peer id → when its last wave counted
  #pages = new Map(); // peer id → its page as last seen, to tell when it came onto this one
  #listeners = new Map();
  #pose = emptyPose();

  /** Less motion: a wave is only its notice, without the avatar's bob. */
  reduceMotion = false;

  /** @param {TogetherOptions} options */
  constructor({ appId, page, camera = null, renderer = null, hands = null, avatars = null, isHere = null, pageName = null, joinSession = null, now = () => performance.now() }) {
    this.#o = { appId, camera, renderer, hands, isHere, pageName, joinSession, now };
    this.#page = page;
    this.#avatars = avatars ? createAvatars(avatars) : null;
    // Made once: avatars.place calls it every frame.
    this.#drawn = isHere ? (peer, avatar) => peer.page === page && isHere(peer, avatar) : (peer) => peer.page === page;
    const changed = () => this.active && this.#emit('change');
    globalThis.addEventListener?.('online', changed);
    globalThis.addEventListener?.('offline', changed);
  }

  /**
   * The session joined, or null (not started, paused, or still loading).
   * @returns {import('./session.js').Session|null}
   */
  get session() {
    return this.#session;
  }

  /**
   * The room, kept while paused; null out of a session.
   * @returns {string|null}
   */
  get room() {
    return this.#room;
  }

  /** Stepped out for a door, keeping the room. */
  get paused() {
    return this.#paused;
  }

  /** In a session: joined, or joining. */
  get active() {
    return !!this.#room && !this.#paused;
  }

  /** The others' avatars (avatars.js), or null when the page draws no one. */
  get avatars() {
    return this.#avatars;
  }

  /**
   * This visitor: the session's self in one, else the identity kept for the tab.
   * @returns {import('./identity.js').Identity & Partial<import('./session.js').Self>}
   */
  get self() {
    return this.#session?.self ?? loadIdentity(storage('sessionStorage'), storage('localStorage'));
  }

  /** The address that brings others into the session: this page with only ?room=; '' out of one. */
  get inviteLink() {
    if (!this.#room) return '';
    try {
      const url = new URL(location.href);
      url.search = '';
      url.hash = '';
      url.searchParams.set('room', this.#room);
      return url.href;
    } catch {
      return '';
    }
  }

  /**
   * Listens for an event; returns a function that stops listening.
   * @template {keyof TogetherEvents} K
   * @param {K} type
   * @param {(detail: TogetherEvents[K]) => void} fn
   * @returns {() => void}
   */
  on(type, fn) {
    let set = this.#listeners.get(type);
    if (!set) this.#listeners.set(type, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }

  /**
   * Names this visitor for everyone in the session, and keeps the name for the tab and as the
   * default for new tabs, on every site of the origin. A name that cleans up to nothing is ignored.
   * Returns the name kept.
   * @param {string} name
   * @returns {string}
   */
  setName(name) {
    const clean = cleanName(name);
    if (!clean) return this.self.name;
    saveName(storage('sessionStorage'), storage('localStorage'), clean);
    this.#session?.setName(clean);
    this.#emit('change');
    return clean;
  }

  /**
   * Waves to everyone in the session. False when not in one.
   * @returns {boolean}
   */
  wave() {
    if (!this.#session) return false;
    this.#session.channel(WAVE_CHANNEL).send(1);
    return true;
  }

  /** @returns {Company} */
  company() {
    let here = 0, nearby = 0, away = 0, connecting = 0;
    const isHere = this.#o.isHere;
    if (this.#session) {
      for (const p of this.#session.peers.values()) {
        if (!p.page) connecting++;
        else if (p.page !== this.#page) away++;
        else if (!isHere || isHere(p, this.#avatars?.get(p.peerId))) here++;
        else nearby++;
      }
    }
    return { here, nearby, away, connecting };
  }

  /** @returns {Condition} */
  condition() {
    const s = this.#session;
    const relays = s ? s.relays.open : 0;
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    return { online, loaded: !!s, relays, slow: this.#waited && !relays, failed: this.#failed };
  }

  /**
   * The others whose hello has come, as the session has them (session.js's Peer).
   * @returns {import('./session.js').Peer[]}
   */
  people() {
    const out = [];
    if (this.#session) for (const p of this.#session.peers.values()) if (p.page) out.push(p);
    return out;
  }

  /**
   * Starts a session in `room`, a new one by default, and puts the room in the address.
   * @param {string} [room]
   */
  start(room = newRoom()) {
    this.#leave();
    this.#room = room;
    this.#paused = false;
    this.#setAddress(room);
    this.#join();
    this.#emit('change');
  }

  /**
   * Leaves the session and takes the room out of the address. Resolves once left.
   * @returns {Promise<void>}
   */
  stop() {
    const left = this.#leave();
    this.#room = null;
    this.#paused = false;
    this.#setAddress(null);
    this.#emit('change');
    return left;
  }

  /**
   * Leaves for now, keeping the room: going through a door, whose link carries the room on.
   * Resolves once left, so a site can wait (briefly) before it navigates.
   * @returns {Promise<void>}
   */
  pause() {
    if (!this.active) return Promise.resolve();
    const left = this.#leave();
    this.#paused = true;
    this.#emit('change');
    return left;
  }

  /** Back after a pause: the navigation didn't happen, or Back restored the page. */
  resume() {
    if (!this.#paused || !this.#room) return;
    this.#paused = false;
    this.#join();
    this.#emit('change');
  }

  /**
   * Every frame: sends this visitor's pose (at most 15 times a second) and places the others who
   * are here. Allocates nothing.
   * @param {number} now  performance.now()
   */
  update(now) {
    const s = this.#session;
    if (!s) return;
    const { camera, renderer, hands } = this.#o;
    if (camera) s.setPose(readPose(camera, renderer?.xr.isPresenting && hands ? hands() : null, this.#pose));
    s.tick();
    this.#avatars?.place(now, s.peers, this.#drawn);
  }

  #emit(type, detail) {
    const set = this.#listeners.get(type);
    if (set) for (const fn of [...set]) fn(detail);
  }

  async #join() {
    const ticket = ++this.#joining;
    clearTimeout(this.#timer);
    this.#waited = false;
    this.#failed = 0;
    this.#timer = setTimeout(() => {
      this.#waited = true;
      if (this.active) this.#emit('change');
    }, RELAY_WAIT_MS);
    let join = this.#o.joinSession;
    try {
      // A stand-in is awaited too, so a quick stop wins over it as over an import.
      join = join ? await join : (await import('./session.js')).joinSession;
    } catch (err) {
      console.warn(`layersharedsession: the session module could not be loaded (${err?.message || err})`);
      return;
    }
    if (ticket !== this.#joining || !this.active) return;
    const { appId, pageName } = this.#o;
    const page = this.#page;
    const s = join({ appId, room: this.#room, page, identity: loadIdentity(storage('sessionStorage'), storage('localStorage')), storage: storage('sessionStorage'), pageName: pageName ?? undefined });
    this.#session = s;
    s.on('relays', () => this.#emit('change'));
    s.on('self', () => this.#emit('change'));
    s.on('log', (e) => {
      if (e.kind !== 'error' || !HANDSHAKE_FAILED.test(e.text)) return;
      this.#failed++;
      this.#emit('change');
    });
    s.channel(WAVE_CHANNEL).on((_, p) => this.#waved(p));
    s.on('join', (p) => {
      this.#pages.set(p.peerId, p.page);
      // A ping can come before the hello, and show() keeps the page an avatar was made with.
      const a = this.#avatars?.show(p);
      if (a) a.page = p.page;
      this.#emit('notice', { kind: 'join', peer: p });
      this.#emit('change');
    });
    s.on('update', (p) => {
      const from = this.#pages.get(p.peerId) ?? null;
      this.#pages.set(p.peerId, p.page);
      const a = this.#avatars?.show(p);
      if (a) a.page = p.page;
      if (from !== p.page && p.page === page) this.#emit('notice', { kind: 'arrive', peer: p, from });
      this.#emit('change');
    });
    s.on('leave', (p) => {
      this.#waves.delete(p.peerId);
      this.#pages.delete(p.peerId);
      this.#avatars?.drop(p.peerId);
      this.#emit('notice', { kind: 'leave', peer: p });
      this.#emit('change');
    });
    this.#emit('session', s);
    this.#emit('change');
  }

  /** Leaves the session joined, if any, and forgets what was counted in it. Resolves once left. */
  #leave() {
    this.#joining++;
    clearTimeout(this.#timer);
    this.#waited = false;
    this.#failed = 0;
    this.#waves.clear();
    this.#pages.clear();
    const s = this.#session;
    if (!s) return Promise.resolve();
    this.#session = null;
    this.#avatars?.clear();
    return Promise.resolve(s.leave()).then(
      () => {},
      () => {},
    );
  }

  /** ?room= in the address, or out of it, keeping history.state (a site's Back keeps fields there). */
  #setAddress(room) {
    try {
      const url = new URL(location.href);
      if (room) url.searchParams.set('room', room);
      else url.searchParams.delete('room');
      history.replaceState(history.state, '', url.href);
    } catch {
      // An address that can't change (a sandboxed frame), or no page at all.
    }
  }

  /** A wave from `peer`: its avatar bobs (unless reduceMotion) and a notice says so. */
  #waved(peer) {
    const t = this.#o.now();
    if (t - (this.#waves.get(peer.peerId) ?? -Infinity) < WAVE_AGAIN_MS) return;
    this.#waves.set(peer.peerId, t);
    if (!this.reduceMotion) this.#avatars?.wave(peer.peerId, t);
    this.#emit('notice', { kind: 'wave', peer });
  }
}

/**
 * A shared session as a site runs one (see the top of this file).
 * @param {TogetherOptions} options
 * @returns {Together}
 */
export function createTogether(options) {
  return new Together(options);
}
