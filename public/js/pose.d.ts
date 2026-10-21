/** A pose with nothing tracked. @returns {Pose} */
export function emptyPose(): Pose;
/** Whether a part is tracked. @param {Pose} pose @param {number} part a PART @returns {boolean} */
export function hasPart(pose: Pose, part: number): boolean;
/**
 * Sets one part from a position {x, y, z} and quaternion {x, y, z, w} (three's Vector3 and
 * Quaternion fit), or clears it when position is null. Returns the pose.
 * @param {Pose} pose
 * @param {number} part  a PART
 * @param {Position|null} position
 * @param {Orientation} [quaternion]  needed with a position
 * @returns {Pose}
 */
export function setPart(pose: Pose, part: number, position: Position | null, quaternion?: Orientation): Pose;
/**
 * Whether `next` differs from `prev` (the last pose sent, or null) enough to send: a part appeared
 * or went, a position moved more than `posEps` metres on an axis, or an orientation turned more
 * than `rotEps` radians. The defaults (2 mm, about half a degree) are below what anyone notices.
 * @param {Pose|null} prev
 * @param {Pose} next
 * @param {number} [posEps]
 * @param {number} [rotEps]
 * @returns {boolean}
 */
export function poseChanged(prev: Pose | null, next: Pose, posEps?: number, rotEps?: number): boolean;
/**
 * A pose received over the wire (an ArrayBuffer or a typed array) as a Float32Array copy of
 * POSE_LENGTH numbers, or null when it isn't one.
 * @param {unknown} data
 * @returns {Pose|null}
 */
export function decodePose(data: unknown): Pose | null;
/** A buffer of the last `capacity` poses received from one visitor. @param {number} [capacity] @returns {PoseBuffer} */
export function createBuffer(capacity?: number): PoseBuffer;
/**
 * Adds a pose received at time `t` (ms). Out-of-order times replace the newest.
 * @param {PoseBuffer} buffer
 * @param {number} t
 * @param {Pose} pose
 */
export function pushSample(buffer: PoseBuffer, t: number, pose: Pose): void;
/** The latest pose received, or null. @param {PoseBuffer} buffer @returns {Pose|null} */
export function latestPose(buffer: PoseBuffer): Pose | null;
/**
 * The pose to draw at time `t` (ms, the receiver's clock, already moved back by the delay) into
 * `out`, which it returns; null when nothing has arrived. Before the first sample it holds the
 * first, after the last it holds the last (no guessing ahead). A hand that is tracked on only one
 * side of the blend takes the newer sample's state. Allocates nothing.
 * @param {PoseBuffer} buffer
 * @param {number} t
 * @param {Pose} out
 * @returns {Pose|null}
 */
export function samplePose(buffer: PoseBuffer, t: number, out: Pose): Pose | null;
/** The parts of a pose, by index. @type {{ readonly head: 0, readonly left: 1, readonly right: 2 }} */
export const PART: {
    readonly head: 0;
    readonly left: 1;
    readonly right: 2;
};
export const PART_LENGTH: 7;
export const POSE_LENGTH: number;
export const INTERP_DELAY_MS: 100;
/**
 * A pose: POSE_LENGTH numbers, the head, left hand and right hand, each a position and a quaternion.
 */
export type Pose = Float32Array;
/**
 * The poses received from one visitor, oldest first, by the receiver's clock (ms).
 */
export type PoseBuffer = {
    capacity: number;
    samples: {
        t: number;
        pose: Pose;
    }[];
};
/**
 * three's Vector3 fits
 */
export type Position = {
    x: number;
    y: number;
    z: number;
};
/**
 * three's Quaternion fits
 */
export type Orientation = {
    x: number;
    y: number;
    z: number;
    w: number;
};
