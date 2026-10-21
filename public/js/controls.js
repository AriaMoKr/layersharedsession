// Moving about, on every device, kept simple: it's a test bench, not hallway's controls.
//   Desktop: drag to look, WASD or arrows to walk (Shift runs), Q/E to turn, click to select.
//   Phone: drag to look, tap to select (the floor walks there).
//   VR: the left stick walks the way you face, the right stick turns 30° at a time, the trigger
//   selects (the floor teleports there), the grip waves.
// "Select" hands main.js a ray; main.js decides what was hit.
import * as THREE from 'three';
import { FLOOR_HALF } from './world.js';

const EYE = 1.6;
const WALK = 2;
const RUN = 4;
const TURN = Math.PI / 6;
const DRAG_PX = 6;

export function createControls({ renderer, camera, rig, dom, onSelect, onSqueeze }) {
  let yaw = 0;
  let pitch = 0;
  const keys = new Set();
  let walkTarget = null;
  let drag = null;
  let snapReady = { left: true, right: true };

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const v = new THREE.Vector3();
  const head = new THREE.Vector3();
  const forward = new THREE.Vector3();

  // Pointer (mouse, touch, pen) on the canvas.
  dom.style.touchAction = 'none';
  dom.addEventListener('pointerdown', (e) => {
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    dom.setPointerCapture(e.pointerId);
  });
  dom.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_PX) return;
    drag.moved = true;
    yaw += dx * 0.005;
    pitch = Math.max(-1.4, Math.min(1.4, pitch + dy * 0.005));
    drag.x = e.clientX;
    drag.y = e.clientY;
  });
  dom.addEventListener('pointerup', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const wasDrag = drag.moved;
    drag = null;
    if (wasDrag) return;
    const r = dom.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    onSelect(raycaster.ray, 'pointer');
  });
  dom.addEventListener('pointercancel', () => {
    drag = null;
  });

  const isTyping = () => {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  };
  addEventListener('keydown', (e) => {
    if (isTyping()) return;
    keys.add(e.code);
    if (e.code === 'KeyQ') yaw += TURN;
    if (e.code === 'KeyE') yaw -= TURN;
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  // XR controllers: their target ray selects, and is the hand in this visitor's pose (avatars.js
  // readPose, as the sites send it).
  const hands = []; // { controller, source }
  for (let i = 0; i < 2; i++) {
    const controller = renderer.xr.getController(i);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
      new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6 }),
    );
    line.scale.z = 4;
    controller.add(line);
    rig.add(controller);
    const entry = { controller, source: null };
    hands.push(entry);
    controller.addEventListener('connected', (e) => {
      entry.source = e.data;
    });
    controller.addEventListener('disconnected', () => {
      entry.source = null;
    });
    controller.addEventListener('select', () => {
      controller.updateMatrixWorld();
      const ray = new THREE.Ray();
      ray.origin.setFromMatrixPosition(controller.matrixWorld);
      ray.direction.set(0, 0, -1).transformDirection(controller.matrixWorld);
      onSelect(ray, 'xr');
    });
    controller.addEventListener('squeezestart', () => onSqueeze?.());
  }

  function clampToFloor(p) {
    const m = FLOOR_HALF - 0.3;
    p.x = Math.max(-m, Math.min(m, p.x));
    p.z = Math.max(-m, Math.min(m, p.z));
    return p;
  }

  /** Turns the rig by `delta` about the head, so a turn in VR doesn't swing you around. */
  function turnAboutHead(delta) {
    camera.getWorldPosition(head);
    yaw += delta;
    rig.rotation.y = yaw;
    rig.updateMatrixWorld(true);
    camera.getWorldPosition(v);
    rig.position.x += head.x - v.x;
    rig.position.z += head.z - v.z;
  }

  return {
    get yaw() {
      return yaw;
    },

    /** Puts the visitor at `position`, facing `target` (both on the floor). */
    place(position, target) {
      rig.position.set(position.x, 0, position.z);
      yaw = Math.atan2(-(target.x - position.x), -(target.z - position.z));
      pitch = 0;
    },

    /** Walks (on a screen) or jumps (in VR) to a point on the floor. */
    goTo(point) {
      const p = clampToFloor(point.clone());
      if (renderer.xr.isPresenting) {
        camera.getWorldPosition(head);
        rig.position.x += p.x - head.x;
        rig.position.z += p.z - head.z;
      } else {
        walkTarget = p;
      }
    },

    update(dt) {
      const xr = renderer.xr.isPresenting;
      if (!xr) {
        camera.position.set(0, EYE, 0);
        camera.rotation.set(pitch, 0, 0);
      }
      rig.rotation.y = yaw;

      // Which way is forward: the head's facing, flattened onto the floor.
      camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() < 1e-6) forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      forward.normalize();
      const rightX = -forward.z;
      const rightZ = forward.x;

      let fx = 0;
      let sx = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) fx += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) fx -= 1;
      if (keys.has('KeyD')) sx += 1;
      if (keys.has('KeyA')) sx -= 1;
      if (keys.has('ArrowLeft')) yaw += 1.8 * dt;
      if (keys.has('ArrowRight')) yaw -= 1.8 * dt;
      let speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? RUN : WALK;

      if (xr) {
        const left = hands.left?.source?.gamepad;
        if (left && left.axes.length >= 4) {
          const ax = left.axes[2];
          const ay = left.axes[3];
          if (Math.hypot(ax, ay) > 0.15) {
            fx += -ay;
            sx += ax;
            speed = WALK;
          }
        }
        const right = hands.right?.source?.gamepad;
        if (right && right.axes.length >= 4) {
          const ax = right.axes[2];
          if (Math.abs(ax) > 0.7 && snapReady.right) {
            turnAboutHead(ax > 0 ? -TURN : TURN);
            snapReady.right = false;
          } else if (Math.abs(ax) < 0.3) {
            snapReady.right = true;
          }
        }
      }

      if (fx || sx) {
        walkTarget = null;
        const len = Math.hypot(fx, sx) || 1;
        rig.position.x += ((forward.x * fx + rightX * sx) / len) * speed * dt;
        rig.position.z += ((forward.z * fx + rightZ * sx) / len) * speed * dt;
      } else if (walkTarget) {
        const dx = walkTarget.x - rig.position.x;
        const dz = walkTarget.z - rig.position.z;
        const d = Math.hypot(dx, dz);
        const step = 3 * dt;
        if (d <= step) {
          rig.position.x = walkTarget.x;
          rig.position.z = walkTarget.z;
          walkTarget = null;
        } else {
          rig.position.x += (dx / d) * step;
          rig.position.z += (dz / d) * step;
        }
      }
      clampToFloor(rig.position);
    },

    /** The XR controllers, { controller, source }, for readPose. */
    hands,
  };
}
