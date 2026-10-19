// The other visitors, drawn from their poses: a head with a dark visor on its front, a hand per
// tracked controller, a ring on the floor under the head and the name over it. Only visitors on the
// same page are drawn; the panel lists the rest.
import * as THREE from 'three';
import { emptyPose, hasPart, INTERP_DELAY_MS, latestPose, PART, PART_LENGTH, samplePose } from './pose.js';
import { makeLabel } from './world.js';

const headGeo = new THREE.BoxGeometry(0.2, 0.24, 0.22);
const visorGeo = new THREE.BoxGeometry(0.17, 0.06, 0.02).translate(0, 0.02, -0.115);
const handGeo = new THREE.BoxGeometry(0.06, 0.04, 0.12);
const ringGeo = new THREE.RingGeometry(0.2, 0.26, 32).rotateX(-Math.PI / 2);
const visorMat = new THREE.MeshBasicMaterial({ color: '#111318' });
const WAVE_MS = 1200;

export function createAvatars(scene) {
  const avatars = new Map(); // Trystero peer id → avatar
  const pose = emptyPose();

  function build(peer) {
    const mat = new THREE.MeshLambertMaterial({ color: peer.color });
    const ringMat = new THREE.MeshBasicMaterial({ color: peer.color, transparent: true, opacity: 0.6 });
    const group = new THREE.Group();
    const head = new THREE.Mesh(headGeo, mat);
    head.add(new THREE.Mesh(visorGeo, visorMat));
    const hands = [new THREE.Mesh(handGeo, mat), new THREE.Mesh(handGeo, mat)];
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.01;
    group.add(head, hands[0], hands[1], ring);
    group.visible = false;
    scene.add(group);
    const a = { group, head, hands, ring, mat, ringMat, label: null, name: null, color: peer.color, waveAt: -Infinity };
    avatars.set(peer.peerId, a);
    relabel(peer, a);
    return a;
  }

  function relabel(peer, a) {
    const name = peer.name || '…';
    if (a.name === name && a.color === peer.color) return;
    if (a.label) {
      a.group.remove(a.label);
      a.label.material.map.dispose();
      a.label.material.dispose();
    }
    a.label = makeLabel(name, 0.11, { color: '#ffffff', background: `${peer.color}cc` });
    a.group.add(a.label);
    a.name = name;
    a.color = peer.color;
    a.mat.color.set(peer.color);
    a.ringMat.color.set(peer.color);
  }

  return {
    /** Adds or refreshes a visitor's avatar (name, colour). */
    update(peer) {
      const a = avatars.get(peer.peerId) || build(peer);
      relabel(peer, a);
    },

    remove(peerId) {
      const a = avatars.get(peerId);
      if (!a) return;
      scene.remove(a.group);
      a.mat.dispose();
      a.ringMat.dispose();
      a.label?.material.map.dispose();
      a.label?.material.dispose();
      avatars.delete(peerId);
    },

    wave(peerId, now) {
      const a = avatars.get(peerId);
      if (a) a.waveAt = now;
    },

    /** Places every avatar for time `now` (ms, performance.now()). */
    frame(now, myPage, peers) {
      for (const [peerId, a] of avatars) {
        const peer = peers.get(peerId);
        const p = peer && peer.page === myPage && latestPose(peer.buffer) ? samplePose(peer.buffer, now - INTERP_DELAY_MS, pose) : null;
        if (!p || !hasPart(p, PART.head)) {
          a.group.visible = false;
          continue;
        }
        a.group.visible = true;
        a.head.position.fromArray(p, 0);
        a.head.quaternion.fromArray(p, 3);
        for (let i = 0; i < 2; i++) {
          const part = i === 0 ? PART.left : PART.right;
          const hand = a.hands[i];
          hand.visible = hasPart(p, part);
          if (hand.visible) {
            hand.position.fromArray(p, part * PART_LENGTH);
            hand.quaternion.fromArray(p, part * PART_LENGTH + 3);
          }
        }
        a.ring.position.set(p[0], 0.01, p[2]);
        const k = (now - a.waveAt) / WAVE_MS;
        const bounce = k >= 0 && k < 1 ? Math.sin(k * Math.PI * 4) * (1 - k) : 0;
        a.head.scale.setScalar(1 + 0.25 * Math.abs(bounce));
        a.label.position.set(p[0], p[1] + 0.26 + 0.12 * Math.abs(bounce), p[2]);
      }
    },
  };
}
