// The test scene: a floor in the page's colours with a grid (so movement reads), a few pillars, the
// shared switch on its pedestal, and a door to the other page.
import * as THREE from 'three';

export const FLOOR_HALF = 10;
export const PEDESTAL = new THREE.Vector3(0, 0, -2);
export const DOOR = new THREE.Vector3(0, 0, -8);

export function labelTexture(text, { color = '#ffffff', background = 'rgba(10,12,16,0.78)', size = 48 } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = `600 ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + size;
  const h = Math.ceil(size * 1.6);
  canvas.width = w;
  canvas.height = h;
  ctx.font = font;
  ctx.fillStyle = background;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + size * 0.04);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { texture: tex, aspect: w / h };
}

/** A sprite with text, `height` metres tall. */
export function makeLabel(text, height = 0.12, opts) {
  const { texture, aspect } = labelTexture(text, opts);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(height * aspect, height, 1);
  return sprite;
}

export function buildWorld(scene, page, otherPage) {
  scene.background = new THREE.Color('#0b0d12');
  scene.fog = new THREE.Fog('#0b0d12', 12, 26);
  scene.add(new THREE.HemisphereLight('#dfe8ff', '#202028', 1.6));
  const sun = new THREE.DirectionalLight('#ffffff', 1.4);
  sun.position.set(3, 6, 2);
  scene.add(sun);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(FLOOR_HALF * 2, FLOOR_HALF * 2).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: page.floor }),
  );
  scene.add(floor);
  const grid = new THREE.GridHelper(FLOOR_HALF * 2, FLOOR_HALF * 2, page.grid, page.grid);
  grid.position.y = 0.002;
  scene.add(grid);

  const pillarGeo = new THREE.BoxGeometry(0.4, 3, 0.4).translate(0, 1.5, 0);
  const pillarMat = new THREE.MeshLambertMaterial({ color: '#3a3f4b' });
  for (const [x, z] of [[-5, -5], [5, -5], [-5, 3], [5, 3]]) {
    const p = new THREE.Mesh(pillarGeo, pillarMat);
    p.position.set(x, 0, z);
    scene.add(p);
  }

  const title = makeLabel(page.title, 0.5, { color: page.accent });
  title.position.set(0, 3.2, -9.5);
  scene.add(title);

  // The shared switch: press the button, and everyone's lamp follows.
  const pedestal = new THREE.Group();
  pedestal.position.copy(PEDESTAL);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.95, 24).translate(0, 0.475, 0), new THREE.MeshLambertMaterial({ color: '#4a505e' }));
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 32), new THREE.MeshLambertMaterial({ color: '#c0392b' }));
  button.position.y = 0.98;
  const lampMat = new THREE.MeshLambertMaterial({ color: '#2a2a2a', emissive: '#000000' });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 24, 16), lampMat);
  lamp.position.y = 1.45;
  const switchLabel = makeLabel('Shared switch', 0.1);
  switchLabel.position.y = 1.75;
  pedestal.add(stand, button, lamp, switchLabel);
  scene.add(pedestal);

  // The door to the other page.
  const door = new THREE.Group();
  door.position.copy(DOOR);
  const frameMat = new THREE.MeshLambertMaterial({ color: '#8a7350' });
  const post = new THREE.BoxGeometry(0.15, 2.3, 0.15).translate(0, 1.15, 0);
  const left = new THREE.Mesh(post, frameMat);
  left.position.x = -0.65;
  const right = new THREE.Mesh(post, frameMat);
  right.position.x = 0.65;
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.15, 0.15), frameMat);
  lintel.position.y = 2.35;
  const portal = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 2.3).translate(0, 1.15, 0),
    new THREE.MeshBasicMaterial({ color: otherPage.accent, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
  );
  const doorLabel = makeLabel(`To ${otherPage.title}`, 0.16);
  doorLabel.position.y = 2.65;
  door.add(left, right, lintel, portal, doorLabel);
  scene.add(door);

  return {
    floor,
    button,
    portal,
    setSwitch(on) {
      lampMat.color.set(on ? '#ffd76a' : '#2a2a2a');
      lampMat.emissive.set(on ? '#ffb020' : '#000000');
      button.material.color.set(on ? '#2ecc71' : '#c0392b');
    },
    update(time) {
      portal.material.opacity = 0.3 + 0.08 * Math.sin(time / 600);
    },
  };
}
