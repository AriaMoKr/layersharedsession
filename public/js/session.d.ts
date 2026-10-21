/**
 * Joins `room`. `identity` is { memberId, name, color } (identity.js); `page` names the page in
 * the session (visitors on other pages are in the session too, just elsewhere). `storage` keeps a
 * replaced member id (sessionStorage). `now` is the clock for every time the session reports: by
 * default performance.now(), the milliseconds since this page began loading. `pageName` turns a
 * page id into words for the log.
 * @param {JoinOptions} options
 * @returns {Session}
 */
export function joinSession({ appId, room, page, identity, storage, now, pageName, config }: JoinOptions): Session;
export const POSE_HZ: 15;
/**
 * Another visitor in the room. Until their hello arrives, `memberId`, `name` and `page` are null and
 * `color` is grey. Times are the session's clock (`now`).
 */
export type Peer = {
    /**
     * Trystero's id for their page load
     */
    peerId: string;
    /**
     * lasts as long as their tab (identity.js)
     */
    memberId: string | null;
    name: string | null;
    /**
     * '#rrggbb'
     */
    color: string;
    /**
     * the page they are on, such as 'hallway'
     */
    page: string | null;
    /**
     * when WebRTC came up
     */
    connectedAt: number;
    /**
     * when their hello arrived
     */
    helloAt: number | null;
    /**
     * how long they were gone, when they came back within 10 minutes
     */
    backAfter: number | null;
    /**
     * the round trip in ms, every 2 s
     */
    rtt: number | null;
    /**
     * how many poses have arrived
     */
    poses: number;
    /**
     * their recent poses, for samplePose
     */
    buffer: import("./pose.js").PoseBuffer;
};
/**
 * This visitor, as the others see them.
 */
export type Self = {
    selfId: string;
    memberId: string;
    name: string;
    color: string;
    page: string;
};
/**
 * the Nostr relays connected
 */
export type Relays = {
    open: number;
    total: number;
};
export type LogEntry = {
    t: number;
    kind: "info" | "error" | "measure";
    text: string;
};
/**
 * A shared value that changed. `from` is the peer it came from (null for this visitor's own write);
 * `initial` is true for the values a newcomer receives on arrival.
 */
export type SharedChange = {
    key: string;
    value: unknown;
    by: string;
    from: Peer | null;
    initial: boolean;
};
/**
 * The events and what their listeners get.
 */
export type SessionEvents = {
    /**
     * a peer said hello
     */
    join: Peer;
    /**
     * a peer renamed, moved page, or has a new round trip
     */
    update: Peer;
    leave: Peer;
    /**
     * a peer's pose arrived
     */
    pose: Peer;
    shared: SharedChange;
    /**
     * this visitor's name or member id changed
     */
    self: Self;
    relays: Relays;
    /**
     * a listener added late gets the log so far
     */
    log: LogEntry;
};
/**
 * A channel's named messages: `send` to all, or to one peer; `on` listens, and returns a function
 * that stops listening.
 */
export type Channel<T = unknown> = {
    send: (data: T, peerId?: string) => Promise<unknown>;
    on: (fn: (data: T, peer: Peer) => void) => () => void;
};
/**
 * A session joined (joinSession).
 */
export type Session = {
    self: Self;
    room: string;
    /**
     * by Trystero peer id
     */
    peers: Map<string, Peer>;
    relays: Relays;
    shared: import("./shared.js").Shared;
    /**
     * when the first visitor said hello
     */
    firstPeerAt: number | null;
    on: <K extends keyof SessionEvents>(type: K, fn: (detail: SessionEvents[K]) => void) => () => void;
    /**
     * this visitor's pose, every frame
     */
    setPose: (pose: Float32Array) => void;
    /**
     * sends the pose when it changed, at most POSE_HZ a second; every frame
     */
    tick: () => void;
    /**
     * renames this visitor for everyone
     */
    setName: (name: string) => void;
    /**
     * a shared value
     */
    get: <T = unknown>(key: string, fallback?: T) => T;
    /**
     * writes a shared value for everyone
     */
    set: (key: string, value: unknown) => void;
    channel: <T = unknown>(name: string) => Channel<T>;
    /**
     * leaves the room, so the others see it at once
     */
    leave: () => Promise<unknown>;
};
/**
 * What joinSession takes. `config` is passed on to Trystero's joinRoom (relayUrls, turnConfig, …).
 */
export type JoinOptions = {
    /**
     * the same for every site that shares rooms
     */
    appId: string;
    room: string;
    /**
     * this page's id in the session: 1–32 of a–z, 0–9 and '-'
     */
    page: string;
    identity: import("./identity.js").Identity;
    storage?: import("./identity.js").StorageLike | null | undefined;
    now?: (() => number) | undefined;
    pageName?: ((page: string) => string) | undefined;
    config?: Record<string, unknown> | undefined;
};
