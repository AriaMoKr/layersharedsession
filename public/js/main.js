// The test page: joins the room in ?room= (making one up when there is none), draws the other
// visitors on this page, and sends this visitor's pose. Both pages (index.html and b.html) run this
// module; <body data-page> says which one it is.
import * as THREE from 'three';
import { joinSession } from './session.js';
import { linkInRoom, newRoom, roomFromUrl, withRoom } from './room.js';
import { hash, loadIdentity, saveName } from './identity.js';
import { emptyPose } from './pose.js';
import { APP_ID, pageInfo, pageTitle } from './pages.js';
import { buildWorld, PEDESTAL } from './world.js';
import { createAvatars, readPose } from './avatars.js';
import { createControls } from './controls.js';
import { createUi } from './ui.js';

const storage = (name) => {
  try {
    return window[name];
  } catch {
    return null;
  }
};

const page = pageInfo(document.body.dataset.page);
const other = pageInfo(page.other);

let room = roomFromUrl(location.href);
if (!room) {
  room = newRoom();
  history.replaceState(history.state, '', withRoom(location.href, room));
}
const identity = loadIdentity(storage('sessionStorage'), storage('localStorage'));

// The scene.
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.getElementById('app').append(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 100);
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);
const world = buildWorld(scene, page, other);
const avatars = createAvatars({ parent: scene });

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// The session.
const session = joinSession({ appId: APP_ID, room, page: page.id, identity, storage: storage('sessionStorage'), pageName: pageTitle });
const ui = createUi(document.getElementById('panel'), page);
const otherHref = linkInRoom(location.href, other.file, room);
ui.setRoom(room, location.href);
ui.setOther(otherHref, other.title);
ui.setSelf(session.self);

const nameOf = (memberId) => {
  if (memberId === session.self.memberId) return 'you';
  for (const p of session.peers.values()) if (p.memberId === memberId) return p.name;
  return 'someone who left';
};
// The switch's "set by" follows renames: keep who set it, find their name when drawing.
let switchBy = null;
const refreshSwitch = () => ui.setSwitch(!!session.get('switch', false), switchBy && nameOf(switchBy));
const refreshPeers = () => {
  ui.setPeers(session.peers.values(), page.id);
  refreshSwitch();
};

session.on('log', (entry) => ui.addLog(entry));
session.on('relays', (r) => ui.setRelays(r));
session.on('self', (self) => {
  ui.setSelf(self);
  refreshSwitch();
});
session.on('join', (p) => {
  avatars.show(p);
  refreshPeers();
});
session.on('update', (p) => {
  avatars.show(p);
  refreshPeers();
});
session.on('leave', (p) => {
  avatars.drop(p.peerId);
  refreshPeers();
});
session.on('shared', ({ key, value, by, from, initial }) => {
  if (key !== 'switch') return;
  switchBy = by;
  world.setSwitch(!!value);
  refreshSwitch();
  if (!from) return;
  const text = initial ? `The switch is ${value ? 'on' : 'off'} (last set by ${nameOf(by)})` : `${nameOf(by)} turned the switch ${value ? 'on' : 'off'}`;
  ui.addLog({ t: performance.now(), kind: 'info', text });
});
refreshSwitch();

const wave = session.channel('wave');
wave.on((_, p) => {
  avatars.wave(p.peerId, performance.now());
  ui.addLog({ t: performance.now(), kind: 'info', text: `${p.name} waved` });
});
const sendWave = () => {
  wave.send(1);
  ui.addLog({ t: performance.now(), kind: 'info', text: 'You waved' });
};

ui.onName((name) => {
  saveName(storage('sessionStorage'), storage('localStorage'), name);
  session.setName(name);
});
ui.onSwitch(() => session.set('switch', !session.get('switch', false)));
ui.onWave(sendWave);

// Going through the door: leave the room first, so the others see you go at once (not when the
// connection times out), then load the other page in the same room.
let leaving = false;
function goThroughDoor() {
  if (leaving) return;
  leaving = true;
  ui.addLog({ t: performance.now(), kind: 'info', text: `Going to ${other.title}…` });
  const timeout = new Promise((resolve) => setTimeout(resolve, 400));
  Promise.race([session.leave(), timeout]).finally(() => location.assign(otherHref));
}
ui.onDoor(goThroughDoor);
addEventListener('pagehide', () => session.leave());
// Back/Forward may restore this page from the back/forward cache with the session already left.
addEventListener('pageshow', (e) => {
  if (e.persisted) location.reload();
});

// Moving and selecting.
const controls = createControls({
  renderer,
  camera,
  rig,
  dom: renderer.domElement,
  onSelect: select,
  onSqueeze: sendWave,
});
{
  // Start somewhere around the pedestal (each visitor at their own angle), facing it.
  const a = ((hash(session.self.memberId) % 360) * Math.PI) / 180;
  controls.place(new THREE.Vector3(PEDESTAL.x + Math.sin(a) * 2.5, 0, PEDESTAL.z + Math.cos(a) * 2.5), PEDESTAL);
}

const raycaster = new THREE.Raycaster();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();
function select(ray) {
  raycaster.ray.copy(ray);
  const hits = raycaster.intersectObjects([world.button, world.portal], false);
  if (hits.length) {
    if (hits[0].object === world.button) session.set('switch', !session.get('switch', false));
    else goThroughDoor();
    return;
  }
  if (ray.intersectPlane(floorPlane, hitPoint)) controls.goTo(hitPoint);
}

// VR.
if (navigator.xr) {
  navigator.xr.isSessionSupported('immersive-vr').then((ok) => ui.showVR(ok)).catch(() => {});
}
async function toggleVR() {
  const current = renderer.xr.getSession();
  if (current) {
    await current.end();
    return;
  }
  try {
    const xrSession = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
    await renderer.xr.setSession(xrSession);
    ui.setVRLabel('Exit VR');
    xrSession.addEventListener('end', () => ui.setVRLabel('Enter VR'));
  } catch (err) {
    ui.addLog({ t: performance.now(), kind: 'error', text: `Couldn't enter VR: ${err.message}` });
  }
}
ui.onVR(toggleVR);

// The frame: move, draw, then send where the head and hands ended up.
const pose = emptyPose();
const onThisPage = (p) => p.page === page.id;
let last = performance.now();
function frame(time = performance.now()) {
  const dt = Math.min(0.1, Math.max(0, (time - last) / 1000));
  last = time;
  controls.update(dt);
  avatars.place(performance.now(), session.peers, onThisPage);
  world.update(time);
  renderer.render(scene, camera);

  session.setPose(readPose(camera, renderer.xr.isPresenting ? controls.hands : null, pose));
  session.tick();
}
renderer.setAnimationLoop(frame);

// For scripted testing (a hidden browser pane gets no animation frames: drive it with tick()).
window.__lss = {
  session,
  renderer,
  scene,
  camera,
  rig,
  controls,
  avatars,
  world,
  goThroughDoor,
  tick(dt = 1 / 60, n = 1) {
    for (let i = 0; i < n; i++) frame(last + dt * 1000);
  },
};
