// The test page: starts a session in the room in ?room= (making one up when there is none) through
// the layer's controller (together.js), which draws the other visitors on this page and sends this
// visitor's pose; Stop leaves it, and Start begins a new one. Both pages (index.html and b.html) run
// this module; <body data-page> says which one it is.
import * as THREE from 'three';
import { createTogether } from './together.js';
import { linkInRoom, roomFromUrl } from './room.js';
import { hash } from './identity.js';
import { APP_ID, pageInfo, pageTitle } from './pages.js';
import { buildWorld, PEDESTAL } from './world.js';
import { createControls } from './controls.js';
import { createUi } from './ui.js';

const page = pageInfo(document.body.dataset.page);
const other = pageInfo(page.other);
const log = (text, kind = 'info') => ui.addLog({ t: performance.now(), kind, text });

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

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// The session.
let controls = null;
const together = createTogether({
  appId: APP_ID,
  page: page.id,
  camera,
  renderer,
  hands: () => controls.hands,
  avatars: { parent: scene },
  pageName: pageTitle,
});
const ui = createUi(document.getElementById('panel'), page);

/** The door's link: the other page, in the same room when in one. */
const otherHref = () => (together.room ? linkInRoom(location.href, other.file, together.room) : new URL(other.file, location.href).href);
const nameOf = (memberId) => {
  if (memberId === together.self.memberId) return 'you';
  for (const p of together.people()) if (p.memberId === memberId) return p.name;
  return 'someone who left';
};
// The switch's "set by" follows renames: keep who set it, find their name when drawing.
let switchBy = null;
const refreshSwitch = () => ui.setSwitch(!!together.session?.get('switch', false), switchBy && nameOf(switchBy));
function refresh() {
  const s = together.session;
  ui.setRoom(together.room, together.inviteLink);
  ui.setActive(together.active, !!s);
  ui.setOther(otherHref(), other.title);
  ui.setSelf(together.self);
  ui.setRelays(s ? s.relays : null, together.active);
  ui.setPeers(s ? s.peers.values() : [], page.id);
  refreshSwitch();
}
together.on('change', refresh);

// Each session joined (at load, after Start, and after a pause): the page's own listeners.
together.on('session', (s) => {
  switchBy = null;
  world.setSwitch(false);
  s.on('log', (entry) => ui.addLog(entry)); // the log so far, then each line
  s.on('shared', ({ key, value, by, from, initial }) => {
    if (key !== 'switch') return;
    switchBy = by;
    world.setSwitch(!!value);
    refreshSwitch();
    if (!from) return;
    log(initial ? `The switch is ${value ? 'on' : 'off'} (last set by ${nameOf(by)})` : `${nameOf(by)} turned the switch ${value ? 'on' : 'off'}`);
  });
});
together.on('notice', ({ kind, peer }) => {
  if (kind === 'wave') log(`${peer.name} waved`);
});

const toggleSwitch = () => together.session?.set('switch', !together.session.get('switch', false));
const sendWave = () => {
  if (together.wave()) log('You waved');
};
ui.onName((name) => together.setName(name));
ui.onSwitch(toggleSwitch);
ui.onWave(sendWave);
ui.onStartStop(() => {
  if (together.active) {
    log(`Left the session in ${together.room}`);
    together.stop();
  } else {
    together.start();
    log(`Started a session in ${together.room}`);
  }
});

// Going through the door: leave the room first, so the others see you go at once (not when the
// connection times out), then load the other page in the same room.
let leaving = false;
function goThroughDoor() {
  if (leaving) return;
  leaving = true;
  log(`Going to ${other.title}…`);
  const href = otherHref();
  const timeout = new Promise((resolve) => setTimeout(resolve, 400));
  Promise.race([together.pause(), timeout]).finally(() => location.assign(href));
}
ui.onDoor(goThroughDoor);
addEventListener('pagehide', () => together.pause());
// Back/Forward may restore this page from the back/forward cache, with the session left: join again.
addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  leaving = false;
  if (together.paused) log('Back on this page');
  together.resume();
});

// Moving and selecting.
controls = createControls({
  renderer,
  camera,
  rig,
  dom: renderer.domElement,
  onSelect: select,
  onSqueeze: sendWave,
});
{
  // Start somewhere around the pedestal (each visitor at their own angle), facing it.
  const a = ((hash(together.self.memberId) % 360) * Math.PI) / 180;
  controls.place(new THREE.Vector3(PEDESTAL.x + Math.sin(a) * 2.5, 0, PEDESTAL.z + Math.cos(a) * 2.5), PEDESTAL);
}

const raycaster = new THREE.Raycaster();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();
function select(ray) {
  raycaster.ray.copy(ray);
  const hits = raycaster.intersectObjects([world.button, world.portal], false);
  if (hits.length) {
    if (hits[0].object === world.button) toggleSwitch();
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
    log(`Couldn't enter VR: ${err.message}`, 'error');
  }
}
ui.onVR(toggleVR);

// The frame: move, send where the head and hands are and place the others, then draw.
let last = performance.now();
function frame(time = performance.now()) {
  const dt = Math.min(0.1, Math.max(0, (time - last) / 1000));
  last = time;
  controls.update(dt);
  together.update(performance.now());
  world.update(time);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);

together.start(roomFromUrl(location.href) ?? undefined);
refresh();

// For scripted testing (a hidden browser pane gets no animation frames: drive it with tick()).
window.__lss = {
  together,
  get session() {
    return together.session;
  },
  renderer,
  scene,
  camera,
  rig,
  controls,
  avatars: together.avatars,
  world,
  goThroughDoor,
  tick(dt = 1 / 60, n = 1) {
    for (let i = 0; i < n; i++) frame(last + dt * 1000);
  },
};
