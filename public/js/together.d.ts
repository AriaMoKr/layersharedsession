/**
 * A shared session as a site runs one (see the top of this file).
 * @param {TogetherOptions} options
 * @returns {Together}
 */
export function createTogether(options: TogetherOptions): Together;
/** How long a session may go without a relay before condition() says it's slow. */
export const RELAY_WAIT_MS: 10000;
/** How soon the same visitor's next wave counts. */
export const WAVE_AGAIN_MS: 1000;
/** The channel the sites wave on, with the data 1. */
export const WAVE_CHANNEL: "wave";
export class Together {
    /** @param {TogetherOptions} options */
    constructor({ appId, page, camera, renderer, hands, avatars, isHere, pageName, joinSession, now }: TogetherOptions);
    /** Less motion: a wave is only its notice, without the avatar's bob. */
    reduceMotion: boolean;
    /**
     * The session joined, or null (not started, paused, or still loading).
     * @returns {import('./session.js').Session|null}
     */
    get session(): import("./session.js").Session | null;
    /**
     * The room, kept while paused; null out of a session.
     * @returns {string|null}
     */
    get room(): string | null;
    /** Stepped out for a door, keeping the room. */
    get paused(): boolean;
    /** In a session: joined, or joining. */
    get active(): boolean;
    /** The others' avatars (avatars.js), or null when the page draws no one. */
    get avatars(): import("./avatars.js").Avatars | null;
    /**
     * This visitor: the session's self in one, else the identity kept for the tab.
     * @returns {import('./identity.js').Identity & Partial<import('./session.js').Self>}
     */
    get self(): import("./identity.js").Identity & Partial<import("./session.js").Self>;
    /** The address that brings others into the session: this page with only ?room=; '' out of one. */
    get inviteLink(): string;
    /**
     * Listens for an event; returns a function that stops listening.
     * @template {keyof TogetherEvents} K
     * @param {K} type
     * @param {(detail: TogetherEvents[K]) => void} fn
     * @returns {() => void}
     */
    on<K extends keyof TogetherEvents>(type: K, fn: (detail: TogetherEvents[K]) => void): () => void;
    /**
     * Names this visitor for everyone in the session, and keeps the name for the tab and as the
     * default for new tabs, on every site of the origin. A name that cleans up to nothing is ignored.
     * Returns the name kept.
     * @param {string} name
     * @returns {string}
     */
    setName(name: string): string;
    /**
     * Waves to everyone in the session. False when not in one.
     * @returns {boolean}
     */
    wave(): boolean;
    /** @returns {Company} */
    company(): Company;
    /** @returns {Condition} */
    condition(): Condition;
    /**
     * The others whose hello has come, as the session has them (session.js's Peer).
     * @returns {import('./session.js').Peer[]}
     */
    people(): import("./session.js").Peer[];
    /**
     * Starts a session in `room`, a new one by default, and puts the room in the address.
     * @param {string} [room]
     */
    start(room?: string): void;
    /**
     * Leaves the session and takes the room out of the address. Resolves once left.
     * @returns {Promise<void>}
     */
    stop(): Promise<void>;
    /**
     * Leaves for now, keeping the room: going through a door, whose link carries the room on.
     * Resolves once left, so a site can wait (briefly) before it navigates.
     * @returns {Promise<void>}
     */
    pause(): Promise<void>;
    /** Back after a pause: the navigation didn't happen, or Back restored the page. */
    resume(): void;
    /**
     * Every frame: sends this visitor's pose (at most 15 times a second) and places the others who
     * are here. Allocates nothing.
     * @param {number} now  performance.now()
     */
    update(now: number): void;
    #private;
}
/**
 * What createTogether takes.
 */
export type TogetherOptions = {
    /**
     * the same for every site that shares rooms
     */
    appId: string;
    /**
     * this page's id in the session, such as 'hallway'
     */
    page: string;
    /**
     * the viewer's head; without it no pose is sent
     */
    camera?: import("three").Object3D<import("three").Object3DEventMap> | null | undefined;
    /**
     * whether in VR, for the hands
     */
    renderer?: {
        xr: {
            isPresenting: boolean;
        };
    } | null | undefined;
    /**
     * the XR controllers
     */
    hands?: (() => ArrayLike<import("./avatars.js").Hand>) | null | undefined;
    /**
     * createAvatars' options, or null to draw no one
     */
    avatars?: {
        parent: import("three").Object3D;
        font?: string;
        ground?: ((x: number, z: number) => number) | null;
    } | null | undefined;
    /**
     * narrows who is here among those on this page (vrlbry: the same room of the library). Here is
     * who is drawn and who company() counts as here. Called every frame for each avatar, so it
     * mustn't allocate; `avatar` is undefined when there are no avatars.
     */
    isHere?: ((peer: import("./session.js").Peer, avatar: import("./avatars.js").Avatar | undefined) => boolean) | null | undefined;
    /**
     * pages in words, for the layer's log
     */
    pageName?: ((page: string) => string) | null | undefined;
    /**
     * used instead of importing session.js: for tests
     */
    joinSession?: ((o: import("./session.js").JoinOptions) => import("./session.js").Session) | null | undefined;
    /**
     * the clock for waves (ms), performance.now() by default
     */
    now?: (() => number) | undefined;
};
/**
 * Something a site may want to say. 'join': a visitor said hello, on this page or another;
 * 'arrive': one came onto this page from another (`from`); 'leave': one left the session; 'wave':
 * one waved (at most once a second each).
 */
export type Notice = {
    kind: "join" | "arrive" | "leave" | "wave";
    peer: import("./session.js").Peer;
    from?: string | null;
};
/**
 * The others, counted: here (on this page and isHere), nearby (on this page, not isHere),
 * away (on another page), connecting (connected, their hello not yet come).
 */
export type Company = {
    here: number;
    nearby: number;
    away: number;
    connecting: number;
};
/**
 * How the session stands, for a site's own status words. online: navigator.onLine; loaded: the
 * session module has loaded and the room is joined; relays: the Nostr relays open; slow: still none
 * RELAY_WAIT_MS after joining; failed: handshakes with others that failed (a network that needs a
 * TURN relay).
 */
export type Condition = {
    online: boolean;
    loaded: boolean;
    relays: number;
    slow: boolean;
    failed: number;
};
/**
 * The events and what their listeners get. 'change': anything shown may have changed; 'session':
 * a session was joined (after start or resume), for a site's own shared values and listeners.
 */
export type TogetherEvents = {
    change: undefined;
    notice: Notice;
    session: import("./session.js").Session;
};
