/**
 * The other visitors' avatars, under `parent`.
 * @param {object} o
 * @param {THREE.Object3D} o.parent  the scene, or a group in it
 * @param {string} [o.font]  the labels' font family (CSS), LABEL_FONT by default
 * @param {((x: number, z: number) => number)|null} [o.ground]  the ground's height under a
 *   visitor, for the ring; the floor is level at 0 without it
 * @returns {Avatars}
 */
export function createAvatars({ parent, font, ground }: {
    parent: THREE.Object3D;
    font?: string | undefined;
    ground?: ((x: number, z: number) => number) | null | undefined;
}): Avatars;
/**
 * This visitor's pose into `out`, which it returns: the head from `camera`, and in VR each
 * controller in `hands` by its handedness. Pass null for `hands` out of VR
 * (`renderer.xr.isPresenting ? hands : null`); a hand with no controller is left untracked.
 * Allocates nothing.
 * @param {THREE.Object3D} camera  the viewer's head
 * @param {ArrayLike<Hand>|null} hands
 * @param {Float32Array} out  a pose (pose.js emptyPose)
 * @returns {Float32Array}
 */
export function readPose(camera: THREE.Object3D, hands: ArrayLike<Hand> | null, out: Float32Array): Float32Array;
/** How long a wave's bob lasts, in ms. */
export const WAVE_MS: 1200;
/** The labels' font family when the page names none. */
export const LABEL_FONT: "system-ui, -apple-system, \"Segoe UI\", Roboto, \"Noto Sans\", sans-serif";
/**
 * A visitor's avatar. `page` is the peer's page when the avatar was made: show() leaves it to the
 * caller, which can use it to tell when someone came onto this page. Callers may keep their own
 * fields on it too.
 */
export type Avatar = {
    peerId: string;
    /**
     * the head, hands, ring and label
     */
    group: THREE.Group;
    head: THREE.Mesh;
    /**
     * left, right
     */
    hands: [THREE.Mesh, THREE.Mesh];
    ring: THREE.Mesh;
    /**
     * the name
     */
    label: THREE.Sprite;
    /**
     * the head's and hands'
     */
    material: THREE.MeshBasicMaterial;
    ringMaterial: THREE.MeshBasicMaterial;
    /**
     * as on the label
     */
    name: string;
    /**
     * '#rrggbb'
     */
    color: string;
    page: string | null;
    /**
     * when the last wave began (ms), -Infinity before any
     */
    waveAt: number;
};
/**
 * What createAvatars returns.
 */
export type Avatars = {
    /**
     * every avatar, under `parent`, named 'visitors'
     */
    group: THREE.Group;
    /**
     * the avatars, in the order made
     */
    list: Avatar[];
    /**
     * makes the peer's avatar, or relabels and recolours it
     */
    show: (peer: AvatarPeer) => Avatar;
    get: (peerId: string) => Avatar | undefined;
    /**
     * removes the avatar and frees its materials and label
     */
    drop: (peerId: string) => void;
    /**
     * starts the bob (false: no such avatar)
     */
    wave: (peerId: string, now: number) => boolean;
    /**
     *   per frame: puts each avatar where its peer was INTERP_DELAY_MS ago, and hides those not here
     */
    place: (now: number, peers: Map<string, AvatarPeer>, isHere: (peer: AvatarPeer, avatar: Avatar) => boolean) => void;
    /**
     * drops every avatar
     */
    clear: () => void;
};
/**
 * What an avatar needs of a peer (session.js's Peer has it all).
 */
export type AvatarPeer = {
    peerId: string;
    /**
     * null until their hello: the label says '…'
     */
    name: string | null;
    /**
     * '#rrggbb'
     */
    color: string;
    page: string | null;
    buffer: import("./pose.js").PoseBuffer;
};
/**
 * A controller and its input source, as three's renderer.xr.getController gives them: its
 * handedness says which hand it is.
 */
export type Hand = {
    controller: THREE.Object3D;
    /**
     * the XRInputSource, null when disconnected
     */
    source: {
        handedness: string;
    } | null;
};
import * as THREE from 'three';
