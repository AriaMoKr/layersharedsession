// Pure (no three): a visitor's pose as it goes over the wire, whether it changed enough to send,
// and the buffer that smooths the poses received from another visitor.
//
// A pose is a Float32Array of 21 numbers: the head, then the left hand, then the right hand, each
// as position (x, y, z, metres, world space) and orientation (quaternion x, y, z, w). A hand that
// isn't tracked (no controller, or not in VR) has NaN for its x. 84 bytes a message.

export const PART = { head: 0, left: 1, right: 2 };
export const PART_LENGTH = 7;
export const POSE_LENGTH = 3 * PART_LENGTH;

/** A pose with nothing tracked. */
export function emptyPose() {
  return new Float32Array(POSE_LENGTH).fill(NaN);
}

export function hasPart(pose, part) {
  return !Number.isNaN(pose[part * PART_LENGTH]);
}

/** Sets one part from a position {x, y, z} and quaternion {x, y, z, w} (three's Vector3 and
 * Quaternion fit), or clears it when position is null. */
export function setPart(pose, part, position, quaternion) {
  const o = part * PART_LENGTH;
  if (!position) {
    pose.fill(NaN, o, o + PART_LENGTH);
    return pose;
  }
  pose[o] = position.x;
  pose[o + 1] = position.y;
  pose[o + 2] = position.z;
  pose[o + 3] = quaternion.x;
  pose[o + 4] = quaternion.y;
  pose[o + 5] = quaternion.z;
  pose[o + 6] = quaternion.w;
  return pose;
}

/** The angle in radians between two unit quaternions stored in arrays at the given offsets. */
function quatAngle(a, ao, b, bo) {
  const dot = a[ao] * b[bo] + a[ao + 1] * b[bo + 1] + a[ao + 2] * b[bo + 2] + a[ao + 3] * b[bo + 3];
  return 2 * Math.acos(Math.min(1, Math.abs(dot)));
}

/**
 * Whether `next` differs from `prev` (the last pose sent, or null) enough to send: a part appeared
 * or went, a position moved more than `posEps` metres on an axis, or an orientation turned more
 * than `rotEps` radians. The defaults (2 mm, about half a degree) are below what anyone notices.
 */
export function poseChanged(prev, next, posEps = 0.002, rotEps = 0.01) {
  if (!prev) return true;
  for (let part = 0; part < 3; part++) {
    const o = part * PART_LENGTH;
    const had = !Number.isNaN(prev[o]);
    const has = !Number.isNaN(next[o]);
    if (had !== has) return true;
    if (!has) continue;
    if (Math.abs(prev[o] - next[o]) > posEps) return true;
    if (Math.abs(prev[o + 1] - next[o + 1]) > posEps) return true;
    if (Math.abs(prev[o + 2] - next[o + 2]) > posEps) return true;
    if (quatAngle(prev, o + 3, next, o + 3) > rotEps) return true;
  }
  return false;
}

/** A pose received over the wire (an ArrayBuffer or a typed array) as a Float32Array copy of
 * POSE_LENGTH numbers, or null when it isn't one. */
export function decodePose(data) {
  let bytes;
  if (data instanceof ArrayBuffer) bytes = data;
  else if (ArrayBuffer.isView(data)) bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  else return null;
  if (bytes.byteLength !== POSE_LENGTH * 4) return null;
  const pose = new Float32Array(bytes);
  for (let part = 0; part < 3; part++) {
    const o = part * PART_LENGTH;
    if (Number.isNaN(pose[o])) continue;
    for (let i = o; i < o + PART_LENGTH; i++) if (!Number.isFinite(pose[i])) return null;
  }
  return pose;
}

// Interpolation. Poses arrive about 15 times a second, a little unevenly. Drawing each as it comes
// makes a visitor jerk along; drawing the pose of a moment ago (INTERP_DELAY_MS), blended between
// the two received around it, makes them glide. The times are the receiver's own clock (when each
// pose arrived), so the visitors' clocks never need to agree.

export const INTERP_DELAY_MS = 100;

/** A buffer of the last `capacity` poses received from one visitor. */
export function createBuffer(capacity = 8) {
  return { capacity, samples: [] };
}

/** Adds a pose received at time `t` (ms). Out-of-order times replace the newest. */
export function pushSample(buffer, t, pose) {
  const s = buffer.samples;
  if (s.length && t <= s[s.length - 1].t) s[s.length - 1] = { t: s[s.length - 1].t, pose };
  else s.push({ t, pose });
  if (s.length > buffer.capacity) s.shift();
}

/** The latest pose received, or null. */
export function latestPose(buffer) {
  const s = buffer.samples;
  return s.length ? s[s.length - 1].pose : null;
}

function slerpInto(out, o, a, b, t) {
  let ax = a[o], ay = a[o + 1], az = a[o + 2], aw = a[o + 3];
  let bx = b[o], by = b[o + 1], bz = b[o + 2], bw = b[o + 3];
  let dot = ax * bx + ay * by + az * bz + aw * bw;
  if (dot < 0) {
    bx = -bx; by = -by; bz = -bz; bw = -bw;
    dot = -dot;
  }
  let wa, wb;
  if (dot > 0.9995) {
    // Nearly the same: a normalised lerp, which slerp approaches.
    wa = 1 - t;
    wb = t;
  } else {
    const theta = Math.acos(dot);
    const sin = Math.sin(theta);
    wa = Math.sin((1 - t) * theta) / sin;
    wb = Math.sin(t * theta) / sin;
  }
  let x = wa * ax + wb * bx, y = wa * ay + wb * by, z = wa * az + wb * bz, w = wa * aw + wb * bw;
  const len = Math.hypot(x, y, z, w) || 1;
  out[o] = x / len;
  out[o + 1] = y / len;
  out[o + 2] = z / len;
  out[o + 3] = w / len;
}

/**
 * The pose to draw at time `t` (ms, the receiver's clock, already moved back by the delay) into
 * `out`, which it returns; null when nothing has arrived. Before the first sample it holds the
 * first, after the last it holds the last (no guessing ahead). A hand that is tracked on only one
 * side of the blend takes the newer sample's state.
 */
export function samplePose(buffer, t, out) {
  const s = buffer.samples;
  if (!s.length) return null;
  if (t <= s[0].t) {
    out.set(s[0].pose);
    return out;
  }
  const last = s[s.length - 1];
  if (t >= last.t) {
    out.set(last.pose);
    return out;
  }
  let i = s.length - 1;
  while (i > 0 && s[i - 1].t > t) i--;
  const a = s[i - 1], b = s[i];
  const f = (t - a.t) / (b.t - a.t);
  for (let part = 0; part < 3; part++) {
    const o = part * PART_LENGTH;
    const inA = !Number.isNaN(a.pose[o]);
    const inB = !Number.isNaN(b.pose[o]);
    if (!inA || !inB) {
      for (let k = o; k < o + PART_LENGTH; k++) out[k] = b.pose[k];
      continue;
    }
    for (let k = o; k < o + 3; k++) out[k] = a.pose[k] + (b.pose[k] - a.pose[k]) * f;
    slerpInto(out, o + 3, a.pose, b.pose, f);
  }
  return out;
}
