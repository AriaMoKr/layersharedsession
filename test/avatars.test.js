// The avatars as the sites draw them, and this visitor's pose from the camera and controllers, in
// Node: three runs without a renderer, and a stand-in canvas takes the labels' drawing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAvatars, readPose, WAVE_MS } from '../public/js/avatars.js';
import { createBuffer, emptyPose, hasPart, INTERP_DELAY_MS, PART, pushSample, setPart } from '../public/js/pose.js';

const fonts = [];
globalThis.document = {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ({
      set font(f) {
        fonts.push(f);
      },
      measureText: (text) => ({ width: text.length * 20 }),
      beginPath() {},
      roundRect() {},
      fill() {},
      fillText() {},
    }),
  }),
};

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const q = new THREE.Quaternion();
const facing = new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), Math.PI / 2);

function peer(id, { name = `Name ${id}`, color = '#3366cc', page = 'hallway' } = {}) {
  return { peerId: id, name, color, page, buffer: createBuffer() };
}
/** A pose at time t: the head at (x, 1.6, z), the hands only when given. */
function posed(p, t, x, z, hands = false) {
  const pose = emptyPose();
  setPart(pose, PART.head, v(x, 1.6, z), facing);
  if (hands) {
    setPart(pose, PART.left, v(x - 0.3, 1.1, z), q);
    setPart(pose, PART.right, v(x + 0.3, 1.1, z), q);
  }
  pushSample(p.buffer, t, pose);
}
const here = (p) => p.page === 'hallway';

test('one avatar a peer, under a "visitors" group, sharing its geometry', () => {
  const scene = new THREE.Scene();
  const avatars = createAvatars({ parent: scene });
  assert.equal(scene.getObjectByName('visitors'), avatars.group);
  const a = avatars.show(peer('a'));
  const b = avatars.show(peer('b'));
  assert.equal(avatars.show(peer('a')), a, 'shown again: the same avatar');
  assert.deepEqual(avatars.list, [a, b]);
  assert.equal(avatars.get('b'), b);
  assert.equal(a.head.geometry, b.head.geometry);
  assert.equal(a.hands[0].geometry, b.hands[1].geometry);
  assert.notEqual(a.material, b.material, 'each has its own colour');
  assert.equal(a.group.visible, false, 'hidden until placed');
  assert.ok(a.head.material instanceof THREE.MeshBasicMaterial && a.head.material.vertexColors, 'unlit, shaded by vertex colours');
});

test('the label follows the name and colour, and is only redrawn when they change', () => {
  const avatars = createAvatars({ parent: new THREE.Group(), font: 'Hall Sans, sans-serif' });
  const p = peer('a', { name: null, color: '#9aa3ad' });
  const a = avatars.show(p);
  assert.equal(a.name, '…', 'before the hello');
  assert.ok(fonts.at(-1).endsWith('Hall Sans, sans-serif'), 'the page\'s font');
  const first = a.label;
  let freed = 0;
  first.material.map.addEventListener('dispose', () => freed++);
  first.material.addEventListener('dispose', () => freed++);
  assert.equal(avatars.show(p).label, first, 'unchanged: the same label');
  Object.assign(p, { name: 'Ada', color: '#cc3366' });
  avatars.show(p);
  assert.notEqual(a.label, first);
  assert.equal(freed, 2, 'the old label is freed');
  assert.equal(a.name, 'Ada');
  assert.equal(a.material.color.getHexString(), new THREE.Color('#cc3366').getHexString());
  assert.equal(a.group.children.filter((c) => c.isSprite).length, 1);
});

test('place: where the peer was INTERP_DELAY_MS ago, hands as tracked, ring on the ground', () => {
  const avatars = createAvatars({ parent: new THREE.Group() });
  const p = peer('a');
  const a = avatars.show(p);
  posed(p, 1000, 0, -1);
  posed(p, 1100, 1, -1, true);
  const peers = new Map([['a', p]]);
  avatars.place(1050 + INTERP_DELAY_MS, peers, here);
  assert.equal(a.group.visible, true);
  assert.ok(Math.abs(a.head.position.x - 0.5) < 1e-6, 'half way');
  assert.ok(a.head.quaternion.angleTo(facing) < 1e-3, 'float32 precision');
  assert.equal(a.hands[0].visible, true, 'a hand tracked on one side of the blend takes the newer');
  avatars.place(1000 + INTERP_DELAY_MS, peers, here);
  assert.equal(a.hands[0].visible, false);
  assert.equal(a.hands[1].visible, false);
  assert.equal(a.ring.position.y, 0.01, 'a level floor at 0');
  assert.ok(Math.abs(a.label.position.y - 1.85) < 1e-6, 'the name over the head');
});

test('place hides those not here, or with no pose yet; isHere sees the avatar too', () => {
  const avatars = createAvatars({ parent: new THREE.Group() });
  const p = peer('a', { page: 'outside' });
  const a = avatars.show(p);
  const peers = new Map([['a', p]]);
  avatars.place(2000, peers, () => true);
  assert.equal(a.group.visible, false, 'no pose yet');
  posed(p, 1000, 0, 0);
  avatars.place(2000, peers, here);
  assert.equal(a.group.visible, false, 'on another page');
  const seen = [];
  avatars.place(2000, peers, (pp, av) => (seen.push([pp, av]), true));
  assert.equal(a.group.visible, true);
  assert.deepEqual(seen, [[p, a]]);
  avatars.place(2000, new Map(), () => true);
  assert.equal(a.group.visible, false, 'gone from the session');
});

test('the ring stands on uneven ground', () => {
  const avatars = createAvatars({ parent: new THREE.Group(), ground: (x, z) => 0.1 * x - z });
  const p = peer('a');
  const a = avatars.show(p);
  posed(p, 0, 2, -1);
  avatars.place(1000, new Map([['a', p]]), here);
  assert.ok(Math.abs(a.ring.position.y - (0.2 + 1 + 0.01)) < 1e-6);
});

test('a wave bobs the head and lifts the name for WAVE_MS, then stops', () => {
  const avatars = createAvatars({ parent: new THREE.Group() });
  const p = peer('a');
  const a = avatars.show(p);
  posed(p, 0, 0, 0);
  const peers = new Map([['a', p]]);
  assert.equal(avatars.wave('nobody', 1000), false);
  assert.equal(avatars.wave('a', 1000), true);
  avatars.place(1000 + WAVE_MS / 8, peers, here); // the first peak
  assert.ok(a.head.scale.x > 1.2, `head scale ${a.head.scale.x}`);
  assert.ok(a.label.position.y > 1.85 + 0.1);
  avatars.place(1000 + WAVE_MS, peers, here);
  assert.equal(a.head.scale.x, 1);
  assert.ok(Math.abs(a.label.position.y - 1.85) < 1e-6);
});

test('drop frees an avatar\'s materials and label; clear drops them all', () => {
  const scene = new THREE.Scene();
  const avatars = createAvatars({ parent: scene });
  const a = avatars.show(peer('a'));
  avatars.show(peer('b'));
  const freed = [];
  for (const m of [a.material, a.ringMaterial, a.label.material, a.label.material.map]) m.addEventListener('dispose', () => freed.push(m));
  avatars.drop('a');
  avatars.drop('a');
  assert.equal(freed.length, 4);
  assert.equal(avatars.get('a'), undefined);
  assert.equal(a.group.parent, null);
  avatars.clear();
  assert.deepEqual(avatars.list, []);
  assert.equal(avatars.group.children.length, 0);
});

test('readPose: the head from the camera, the hands from the controllers in VR', () => {
  const rig = new THREE.Group();
  rig.position.set(2, 0, -3);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.6, 0);
  camera.quaternion.copy(facing);
  const left = new THREE.Group();
  left.position.set(-0.2, 1.2, -0.3);
  const right = new THREE.Group();
  right.position.set(0.2, 1.2, -0.3);
  rig.add(camera, left, right);
  rig.updateMatrixWorld(true);
  const hands = [
    { controller: right, source: { handedness: 'right' } },
    { controller: left, source: { handedness: 'left' } },
    { controller: new THREE.Group(), source: { handedness: 'none' } },
    { controller: new THREE.Group(), source: null },
  ];
  const out = emptyPose();
  assert.equal(readPose(camera, hands, out), out);
  assert.deepEqual([...out.slice(0, 3)].map((n) => +n.toFixed(4)), [2, 1.6, -3]);
  assert.ok(new THREE.Quaternion().fromArray(out, 3).angleTo(facing) < 1e-3, 'float32 precision');
  assert.deepEqual([...out.slice(7, 10)].map((n) => +n.toFixed(4)), [1.8, 1.2, -3.3]);
  assert.deepEqual([...out.slice(14, 17)].map((n) => +n.toFixed(4)), [2.2, 1.2, -3.3]);
  readPose(camera, null, out);
  assert.ok(hasPart(out, PART.head));
  assert.equal(hasPart(out, PART.left), false, 'out of VR: no hands');
  assert.equal(hasPart(out, PART.right), false);
});
