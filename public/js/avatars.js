// The other visitors, drawn from their poses as the sites draw them: a head with a dark visor on
// its front, a hand per tracked controller, a ring on the floor under the head, and the name in a
// pill over it. When someone waves, their head bobs bigger and the name lifts. Every part is an
// unlit MeshBasicMaterial whose faces are shaded as if lit from above, so the avatars look the same
// in a scene with real-time lights or one with baked light (the hallway's), and cost little on a
// Quest. Also here: readPose, this visitor's own pose from the camera and the XR controllers.
//
//   const avatars = createAvatars({ parent: scene });
//   session.on('join', (p) => avatars.show(p));     // and 'update' (renamed, recoloured)
//   session.on('leave', (p) => avatars.drop(p.peerId));
//   wave.on((_, p) => avatars.wave(p.peerId, performance.now()));
//   // every frame:
//   session.setPose(readPose(camera, renderer.xr.isPresenting ? hands : null, pose));
//   session.tick();
//   avatars.place(performance.now(), session.peers, (p) => p.page === PAGE_ID);
//
// The geometry is made with the first avatar, so a page that never meets anyone builds nothing.
// readPose and place allocate nothing.
import * as THREE from 'three';
import { emptyPose, hasPart, INTERP_DELAY_MS, latestPose, PART, PART_LENGTH, samplePose, setPart } from './pose.js';

/** How long a wave's bob lasts, in ms. */
export const WAVE_MS = 1200;
/** The labels' font family when the page names none. */
export const LABEL_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';

/**
 * A visitor's avatar. `page` is the peer's page when the avatar was made: show() leaves it to the
 * caller, which can use it to tell when someone came onto this page. Callers may keep their own
 * fields on it too.
 * @typedef {object} Avatar
 * @property {string} peerId
 * @property {THREE.Group} group  the head, hands, ring and label
 * @property {THREE.Mesh} head
 * @property {[THREE.Mesh, THREE.Mesh]} hands  left, right
 * @property {THREE.Mesh} ring
 * @property {THREE.Sprite} label  the name
 * @property {THREE.MeshBasicMaterial} material  the head's and hands'
 * @property {THREE.MeshBasicMaterial} ringMaterial
 * @property {string} name  as on the label
 * @property {string} color  '#rrggbb'
 * @property {string|null} page
 * @property {number} waveAt  when the last wave began (ms), -Infinity before any
 */

/**
 * What createAvatars returns.
 * @typedef {object} Avatars
 * @property {THREE.Group} group  every avatar, under `parent`, named 'visitors'
 * @property {Avatar[]} list  the avatars, in the order made
 * @property {(peer: AvatarPeer) => Avatar} show  makes the peer's avatar, or relabels and recolours it
 * @property {(peerId: string) => Avatar|undefined} get
 * @property {(peerId: string) => void} drop  removes the avatar and frees its materials and label
 * @property {(peerId: string, now: number) => boolean} wave  starts the bob (false: no such avatar)
 * @property {(now: number, peers: Map<string, AvatarPeer>, isHere: (peer: AvatarPeer, avatar: Avatar) => boolean) => void} place
 *   per frame: puts each avatar where its peer was INTERP_DELAY_MS ago, and hides those not here
 * @property {() => void} clear  drops every avatar
 */

/**
 * What an avatar needs of a peer (session.js's Peer has it all).
 * @typedef {object} AvatarPeer
 * @property {string} peerId
 * @property {string|null} name  null until their hello: the label says '…'
 * @property {string} color  '#rrggbb'
 * @property {string|null} page
 * @property {import('./pose.js').PoseBuffer} buffer
 */

/**
 * A controller and its input source, as three's renderer.xr.getController gives them: its
 * handedness says which hand it is.
 * @typedef {object} Hand
 * @property {THREE.Object3D} controller
 * @property {{ handedness: string }|null} source  the XRInputSource, null when disconnected
 */

/** A box whose faces are shaded as if lit from above (for an unlit material with vertexColors). */
function shadedBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  // BoxGeometry's faces, 4 vertices each: +x, -x, +y, -y, +z, -z.
  const shade = [0.78, 0.78, 1, 0.55, 0.88, 0.88];
  const colors = [];
  for (const s of shade) for (let i = 0; i < 4; i++) colors.push(s, s, s);
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
}

let parts = null;
/** The geometry and visor every avatar shares, made with the first one. */
function avatarParts() {
  return (parts ||= {
    head: shadedBox(0.2, 0.24, 0.22),
    visor: shadedBox(0.17, 0.06, 0.02).translate(0, 0.02, -0.115),
    hand: shadedBox(0.06, 0.04, 0.12),
    ring: new THREE.RingGeometry(0.2, 0.25, 32).rotateX(-Math.PI / 2),
    visorMaterial: new THREE.MeshBasicMaterial({ color: '#15110c', vertexColors: true }),
  });
}

/** A name in a pill of the visitor's colour, 10 cm high. */
function labelSprite(text, color, font) {
  const size = 44;
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d');
  const css = `600 ${size}px ${font}`;
  g.font = css;
  const w = Math.ceil(g.measureText(text).width) + size;
  const h = Math.ceil(size * 1.6);
  canvas.width = w;
  canvas.height = h;
  g.font = css; // resizing the canvas resets the context
  g.fillStyle = `${color}d9`;
  g.beginPath();
  g.roundRect(0, 0, w, h, h / 2);
  g.fill();
  g.fillStyle = '#1a1208';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  const height = 0.1;
  sprite.scale.set((height * w) / h, height, 1);
  return sprite;
}

function disposeLabel(label) {
  label.material.map?.dispose();
  label.material.dispose();
}

/**
 * The other visitors' avatars, under `parent`.
 * @param {object} o
 * @param {THREE.Object3D} o.parent  the scene, or a group in it
 * @param {string} [o.font]  the labels' font family (CSS), LABEL_FONT by default
 * @param {((x: number, z: number) => number)|null} [o.ground]  the ground's height under a
 *   visitor, for the ring; the floor is level at 0 without it
 * @returns {Avatars}
 */
export function createAvatars({ parent, font = LABEL_FONT, ground = null }) {
  const group = new THREE.Group();
  group.name = 'visitors';
  parent.add(group);
  /** @type {Avatar[]} */
  const list = []; // index loops, no allocation per frame
  const sample = emptyPose();

  const get = (peerId) => list.find((a) => a.peerId === peerId);

  function show(peer) {
    let a = get(peer.peerId);
    if (!a) {
      const p = avatarParts();
      const material = new THREE.MeshBasicMaterial({ color: peer.color, vertexColors: true });
      const ringMaterial = new THREE.MeshBasicMaterial({ color: peer.color, transparent: true, opacity: 0.55, depthWrite: false });
      const head = new THREE.Mesh(p.head, material);
      head.add(new THREE.Mesh(p.visor, p.visorMaterial));
      /** @type {[THREE.Mesh, THREE.Mesh]} */
      const hands = [new THREE.Mesh(p.hand, material), new THREE.Mesh(p.hand, material)];
      const ring = new THREE.Mesh(p.ring, ringMaterial);
      const g = new THREE.Group();
      g.name = `visitor ${peer.peerId}`;
      g.visible = false;
      g.add(head, hands[0], hands[1], ring);
      group.add(g);
      a = { peerId: peer.peerId, group: g, head, hands, ring, label: null, material, ringMaterial, name: null, color: null, page: peer.page, waveAt: -Infinity };
      list.push(a);
    }
    const name = peer.name || '…';
    if (a.name !== name || a.color !== peer.color) {
      if (a.label) {
        a.group.remove(a.label);
        disposeLabel(a.label);
      }
      a.label = labelSprite(name, peer.color, font);
      a.group.add(a.label);
      a.material.color.set(peer.color);
      a.ringMaterial.color.set(peer.color);
      a.name = name;
      a.color = peer.color;
    }
    return a;
  }

  function drop(peerId) {
    const i = list.findIndex((a) => a.peerId === peerId);
    if (i < 0) return;
    const a = list[i];
    list.splice(i, 1);
    group.remove(a.group);
    a.material.dispose();
    a.ringMaterial.dispose();
    if (a.label) disposeLabel(a.label);
  }

  function wave(peerId, now) {
    const a = get(peerId);
    if (!a) return false;
    a.waveAt = now;
    return true;
  }

  function place(now, peers, isHere) {
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const peer = peers.get(a.peerId);
      const p = peer && isHere(peer, a) && latestPose(peer.buffer) ? samplePose(peer.buffer, now - INTERP_DELAY_MS, sample) : null;
      if (!p || !hasPart(p, PART.head)) {
        a.group.visible = false;
        continue;
      }
      a.group.visible = true;
      a.head.position.fromArray(p, 0);
      a.head.quaternion.fromArray(p, 3);
      for (let h = 0; h < 2; h++) {
        const part = h === 0 ? PART.left : PART.right;
        const hand = a.hands[h];
        hand.visible = hasPart(p, part);
        if (!hand.visible) continue;
        hand.position.fromArray(p, part * PART_LENGTH);
        hand.quaternion.fromArray(p, part * PART_LENGTH + 3);
      }
      a.ring.position.set(p[0], (ground ? ground(p[0], p[2]) : 0) + 0.01, p[2]);
      // A wave: the head bobs bigger and the name lifts, four times, dying away.
      const k = (now - a.waveAt) / WAVE_MS;
      const bob = k >= 0 && k < 1 ? Math.abs(Math.sin(k * Math.PI * 4) * (1 - k)) : 0;
      a.head.scale.setScalar(1 + 0.25 * bob);
      a.label.position.set(p[0], p[1] + 0.25 + 0.12 * bob, p[2]);
    }
  }

  function clear() {
    while (list.length) drop(list[0].peerId);
  }

  return { group, list, show, get, drop, wave, place, clear };
}

const handPos = new THREE.Vector3();
const handQuat = new THREE.Quaternion();

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
export function readPose(camera, hands, out) {
  camera.getWorldPosition(handPos);
  camera.getWorldQuaternion(handQuat);
  setPart(out, PART.head, handPos, handQuat);
  setPart(out, PART.left, null);
  setPart(out, PART.right, null);
  if (!hands) return out;
  for (let i = 0; i < hands.length; i++) {
    const side = hands[i].source?.handedness;
    if (side !== 'left' && side !== 'right') continue;
    hands[i].controller.getWorldPosition(handPos);
    hands[i].controller.getWorldQuaternion(handQuat);
    setPart(out, side === 'left' ? PART.left : PART.right, handPos, handQuat);
  }
  return out;
}
