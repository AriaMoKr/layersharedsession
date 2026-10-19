import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBuffer,
  decodePose,
  emptyPose,
  hasPart,
  latestPose,
  PART,
  POSE_LENGTH,
  poseChanged,
  pushSample,
  samplePose,
  setPart,
} from '../public/js/pose.js';

const ID = { x: 0, y: 0, z: 0, w: 1 };
// A quarter turn about y.
const Q90 = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };

function headAt(x, y, z, q = ID) {
  return setPart(emptyPose(), PART.head, { x, y, z }, q);
}

test('a pose has a head and optional hands', () => {
  const p = headAt(1, 1.6, -2);
  assert.equal(p.length, POSE_LENGTH);
  assert.ok(hasPart(p, PART.head));
  assert.ok(!hasPart(p, PART.left));
  setPart(p, PART.left, { x: 0.2, y: 1, z: 0 }, ID);
  assert.ok(hasPart(p, PART.left));
  setPart(p, PART.left, null);
  assert.ok(!hasPart(p, PART.left));
});

test('poseChanged ignores jitter and notices movement, turns and hands', () => {
  const a = headAt(0, 1.6, 0);
  assert.ok(poseChanged(null, a));
  assert.ok(!poseChanged(a, headAt(0.001, 1.6, 0)));
  assert.ok(poseChanged(a, headAt(0.01, 1.6, 0)));
  const small = { x: 0, y: Math.sin(0.002), z: 0, w: Math.cos(0.002) }; // 0.004 rad
  assert.ok(!poseChanged(a, headAt(0, 1.6, 0, small)));
  assert.ok(poseChanged(a, headAt(0, 1.6, 0, Q90)));
  const withHand = setPart(headAt(0, 1.6, 0), PART.right, { x: 0.3, y: 1.2, z: -0.3 }, ID);
  assert.ok(poseChanged(a, withHand));
  // q and -q are the same orientation.
  assert.ok(!poseChanged(a, headAt(0, 1.6, 0, { x: 0, y: 0, z: 0, w: -1 })));
});

test('decodePose takes an ArrayBuffer or a typed array of 84 bytes, and copies it', () => {
  const p = headAt(1, 2, 3);
  const fromView = decodePose(p);
  assert.deepEqual([...fromView], [...p]);
  assert.notEqual(fromView.buffer, p.buffer);
  assert.deepEqual([...decodePose(p.buffer.slice(0))], [...p]);
  // A view into a bigger buffer, at an offset.
  const big = new Uint8Array(100);
  big.set(new Uint8Array(p.buffer), 8);
  assert.deepEqual([...decodePose(new Uint8Array(big.buffer, 8, 84))], [...p]);
});

test('decodePose rejects other sizes, types and non-finite tracked parts', () => {
  assert.equal(decodePose(new Float32Array(20)), null);
  assert.equal(decodePose([1, 2, 3]), null);
  assert.equal(decodePose('pose'), null);
  const bad = headAt(0, 1.6, 0);
  bad[1] = Infinity;
  assert.equal(decodePose(bad), null);
});

test('samplePose holds the ends and blends between samples', () => {
  const buf = createBuffer();
  const out = emptyPose();
  assert.equal(samplePose(buf, 0, out), null);
  pushSample(buf, 100, headAt(0, 1.6, 0));
  pushSample(buf, 200, headAt(1, 1.6, 0, Q90));
  assert.equal(samplePose(buf, 50, out)[0], 0);
  assert.equal(samplePose(buf, 300, out)[0], 1);
  const mid = samplePose(buf, 150, out);
  assert.ok(Math.abs(mid[0] - 0.5) < 1e-6);
  // Halfway through a quarter turn is an eighth of a turn: y = sin(22.5°), w = cos(22.5°).
  assert.ok(Math.abs(mid[4] - Math.sin(Math.PI / 8)) < 1e-6);
  assert.ok(Math.abs(mid[6] - Math.cos(Math.PI / 8)) < 1e-6);
  assert.equal(latestPose(buf)[0], 1);
});

test('samplePose takes the newer sample for a hand tracked on one side only', () => {
  const buf = createBuffer();
  const a = headAt(0, 1.6, 0);
  const b = setPart(headAt(0, 1.6, 0), PART.left, { x: 0.2, y: 1, z: -0.2 }, ID);
  pushSample(buf, 0, a);
  pushSample(buf, 100, b);
  const out = samplePose(buf, 40, emptyPose());
  assert.ok(hasPart(out, PART.left));
  assert.ok(Math.abs(out[7] - 0.2) < 1e-6);
});

test('the buffer keeps the last few samples and merges same-time ones', () => {
  const buf = createBuffer(3);
  for (let t = 0; t < 5; t++) pushSample(buf, t * 10, headAt(t, 0, 0));
  assert.equal(buf.samples.length, 3);
  assert.equal(buf.samples[0].t, 20);
  pushSample(buf, 40, headAt(9, 0, 0));
  assert.equal(buf.samples.length, 3);
  assert.equal(latestPose(buf)[0], 9);
});
