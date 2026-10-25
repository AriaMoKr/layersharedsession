# Shared session

**https://ariamokr.github.io/layersharedsession/**

A shared-session layer for three.js WebXR sites, and a page that tests it. Everyone who opens the
same link sees everyone else: where they are, which way they look, and their hands in VR. They
can share values (the test page has a switch anyone can flip) and send each other messages.

[Hallway](https://ariamokr.github.io/hallway/) uses it for its shared sessions: "Together" on its
control panel. The places behind its doors, [vrlbry](https://ariamokr.github.io/vrlbry/),
[Outside](https://ariamokr.github.io/outside/) and [Breadboard](https://ariamokr.github.io/breadboard/),
join the same session, so a room carries through the doors.

It runs peer to peer over WebRTC with [Trystero](https://github.com/dmotz/trystero). Trystero's
default strategy finds the other visitors through public Nostr relays, so there is no server to
run. `public/` is the whole site and any static host can serve it, GitHub Pages included.

There is no voice or video yet.

## What we've found

- **Across networks:** a phone on mobile data and a laptop on wired ethernet connected directly,
  with no TURN relay (2026-10-19). Mobile carriers often put phones behind shared addresses, so
  this was the case most likely to fail. Stricter networks may still need TURN (see
  [Limits](#limits)).
- **On one PC:** two pages find each other 0.3–0.5 s after the second one starts loading, once
  the relays answer. The round trip is 1–4 ms.
- **Changing page:** a visitor who goes through the door is back on the other page, as seen from
  the page that stayed, 0.35–0.4 s after leaving it (one PC).
- **In hallway:** two visitors in one room saw each other in the hall. The room carried through
  the door links, and leaving and rejoining worked. Its test was a hallway branch, now merged.

The Quest has not been measured on its own yet: how the others' motion looks in VR, and the frame
rate with several visitors.

## What the test page tests

- **Connecting.** How long until visitors see each other, on which networks and devices, and
  whether some pairs never connect. Those pairs need a TURN relay.
- **Round trip.** The ping time to each visitor, every 2 seconds.
- **Poses.** The head (and hands in VR) as 84-byte messages, at most 15 a second and only when
  they change. The receiving page draws each pose 100 ms late, blended between the poses received
  around it, so visitors glide instead of jerking.
- **Shared values.** The switch is the last value written. "Last" is decided by a counter, not by
  the time of day, so devices with different clocks still agree. A visitor who arrives later gets
  every value.
- **Avatars.** The other visitors are drawn by the layer's `avatars.js`, exactly as on the
  sites, and bob when they wave.
- **Changing page.** The door goes to the other page in the same room, as one of hallway's doors
  goes to another site. The page leaves the room before it unloads. The next page joins again, and
  the others recognise the visitor coming back by a member id kept in the tab's `sessionStorage`.
  Both sides log how long that took.
- **The controller.** The page runs its session through the layer's `together.js`, as the sites
  can: starting and stopping it, the room in the address, the door, and the waves.

Times in the log are seconds since the page began loading. Measurements are in yellow.

## Running it

```bash
npm install     # three.js and Trystero, copied into public/vendor/
npm start       # http://localhost:8092/
npm test
```

Open http://localhost:8092/. The page makes up a room (`?room=k3vd-q8hn`) and puts it in the
address. **Copy invite link** copies that address; open it anywhere to join the same room.
**Stop** leaves the session and takes the room out of the address; **Start** begins a new one.

### On one PC

Open the link in two windows side by side, not two tabs. A tab in the background gets no animation
frames, so it stops sending its pose. Give each window its own name in the panel. Names are kept
per tab, and the last one entered is the default for new tabs.

### On other devices

Trystero encrypts its handshakes with the browser's `crypto.subtle`, which only works on secure
pages: https, or `http://localhost`. A phone opening `http://192.168.x.x:8092` will not work. Instead:

- **Quest or an Android phone over adb:** `adb reverse tcp:8092 tcp:8092`, then open
  `http://localhost:8092/?room=…` on the device. Only the page loads that way; the WebRTC
  connection still goes over the network, as it would for anyone else. On Windows, start the
  server with `npm start -- --host 127.0.0.1`: `localhost` there can mean IPv6 only, which the
  headset can't reach.
- **Anywhere:** use the published copy, https://ariamokr.github.io/layersharedsession/. Every push
  to `main` publishes `public/` there, through `.github/workflows/pages.yml`, after `npm ci` and
  `npm test`.

Test across real networks too, for example a phone on mobile data and a PC on home Wi-Fi. A local
page and the published one can be in the same room: Trystero finds peers by the app id and the
room alone, and both use the same app id, so the same relays.

### Watching a site's session

Hallway, vrlbry, Outside and Breadboard use the test page's app id (`ariamokr-layersharedsession-test`). So
the test page, opened with a hallway room
(`https://ariamokr.github.io/layersharedsession/?room=<the room>`), joins that session. It lists everyone in it with their round trips and the page they are on ("on hallway"),
and logs who comes and goes. It counts as a visitor on another page, so hallway shows it as
"elsewhere".

## Moving about

| | Look | Move | Select (switch, door, floor) |
|---|---|---|---|
| Desktop | drag | WASD or arrows (Shift runs), Q/E turn | click |
| Phone | drag | tap the floor | tap |
| Headset (**Enter VR**) | your head | left stick walks, right stick turns 30° | trigger: the floor teleports |

The grip button in VR, or **Wave** in the panel, makes your avatar bob on the other screens.

## The layer

Seven modules in `public/js/`, each with its types beside it (`.d.ts`). Only `session.js` needs
Trystero. `avatars.js` needs three, which the site supplies (a peer dependency, three r152 or
later), and so does `together.js`, the session controller, which uses the others. The other four
are pure. All seven are tested in Node.

### `session.js`

```js
import { joinSession } from 'layersharedsession/session.js';

const session = joinSession({
  appId,     // the same for every site that shares rooms
  room,      // from the address: roomFromUrl(location.href)
  page,      // this page's id in the session, a–z, 0–9 and '-', e.g. 'hallway'
  identity,  // loadIdentity(sessionStorage, localStorage)
  storage,   // sessionStorage, for a member id replaced after a clash (optional)
  pageName,  // page id → words, for the log (optional)
});
```

| Member | |
|---|---|
| `self` | `{ selfId, memberId, name, color, page }`: this visitor. |
| `peers` | A `Map` from Trystero peer id to each other visitor (below). |
| `relays` | `{ open, total }`: the Nostr relays connected. |
| `firstPeerAt` | When the first visitor said hello, in ms since the page began loading. |
| `on(type, fn)` | Listens; returns a function that stops listening. |
| `setPose(pose)`, `tick()` | Every frame: this visitor's pose (`pose.js`), sent when it changed, at most 15 times a second. |
| `setName(name)` | Renames this visitor for everyone. |
| `set(key, value)`, `get(key, fallback)` | A shared value: the last one written wins, for everyone in the room. |
| `channel(name)` | Named messages: `send(data, peerId?)` to all (or one), `on(fn(data, peer))`. |
| `leave()` | Leaves the room, so the others see it at once rather than after a timeout. |

Events: `join` and `leave` (a peer), `update` (a peer renamed, moved page, or has a new round
trip), `pose` (a peer's pose arrived), `shared` (`{ key, value, by, from, initial }`; `initial`
is true for the values a newcomer receives on arrival), `self` (this visitor's name or member id
changed), `relays`, and `log` (`{ t, kind, text }`; a listener added late gets the log so far).

A peer is `{ peerId, memberId, name, color, page, rtt, connectedAt, helloAt, backAfter, poses,
buffer }`. Until its hello arrives, `memberId`, `name` and `page` are null and `color` is grey.
`backAfter` is set when it came back after leaving, and `buffer` holds its recent poses for
`samplePose`.

### `avatars.js`

The other visitors as every site draws them: a head with a dark visor on its front, a hand per
tracked controller, a ring on the floor and the name in a pill of their colour. A wave bobs the
head and lifts the name for 1.2 s. The materials are unlit with the faces shaded in, so the
avatars look the same with real-time lights or baked ones.

```js
import { createAvatars, readPose } from 'layersharedsession/avatars.js';

const avatars = createAvatars({
  parent: scene,
  font,      // the labels' font family (optional; LABEL_FONT, a system sans-serif, by default)
  ground,    // (x, z) => the ground's height, for the rings (optional; level at 0 by default)
});
session.on('join', (p) => avatars.show(p));
session.on('update', (p) => avatars.show(p));        // renamed or recoloured
session.on('leave', (p) => avatars.drop(p.peerId));
session.channel('wave').on((_, p) => avatars.wave(p.peerId, performance.now()));

const pose = emptyPose();
const isHere = (peer) => peer.page === 'hallway';   // made once, not every frame
function frame(now) {
  session.setPose(readPose(camera, renderer.xr.isPresenting ? hands : null, pose));
  session.tick();
  avatars.place(now, session.peers, isHere);
}
```

| | |
|---|---|
| `show(peer)` | Makes the peer's avatar, or relabels and recolours it; returns it. |
| `drop(peerId)`, `clear()` | Removes one avatar, or all, and frees their materials and labels. |
| `wave(peerId, now)` | Starts the bob; false when there is no such avatar. |
| `place(now, peers, isHere)` | Every frame: puts each avatar where its peer was 100 ms ago (`samplePose`), and hides those for which `isHere(peer, avatar)` is false. |
| `get(peerId)`, `list`, `group` | An avatar, all of them, and the group they're in (`visitors`). |
| `readPose(camera, hands, out)` | This visitor's pose: the head from the camera, and in VR each of `hands` (`{ controller, source }`, as `renderer.xr.getController` gives them) by its handedness. |

An avatar is `{ peerId, group, head, hands, ring, label, material, ringMaterial, name, color, page,
waveAt }`. `show` sets `page` only when it makes the avatar, so a site can compare it with the
peer's to tell when someone came onto its page; a site may keep its own fields on the avatar too.
vrlbry's `isHere` also asks whether the peer is in the same room of the library, by a key it keeps
on the avatar. `place` and `readPose` allocate nothing, and the geometry is made with the first
avatar, so a page that never meets anyone builds none.

### `together.js`

A shared session as the sites run one: what each site's own `together.js` did the same way. It
starts a session in a room and leaves it, steps out for a door and back, keeps the room in the
address, sends this visitor's pose and draws the others (`avatars.js`), counts who is here, and
takes waves, at most one a second from each visitor. It loads `session.js`, and Trystero with it,
only when a session starts. It words nothing: the site listens and says things its own way.

```js
import { createTogether } from 'layersharedsession/together.js';

const together = createTogether({
  appId,      // the same for every site that shares rooms
  page,       // this page's id in the session, e.g. 'hallway'
  camera,     // the viewer's head (optional: without it no pose is sent)
  renderer,   // for renderer.xr.isPresenting
  hands,      // () => the XR controllers, { controller, source } (optional)
  avatars: { parent: scene, font, ground },   // createAvatars' options, or null to draw no one
  isHere,     // (peer, avatar) => …, narrows who is here among those on this page (optional)
  pageName,   // page id → words, for the log (optional)
});
together.on('change', () => drawPanel(together.company(), together.condition()));
together.on('notice', ({ kind, peer, from }) => toast(kind, peer, from));
together.start(roomFromUrl(location.href) ?? undefined);   // a new room by default
addEventListener('pagehide', () => together.pause());
addEventListener('pageshow', (e) => e.persisted && together.resume());
// every frame:
together.update(performance.now());
```

| | |
|---|---|
| `start(room?)` | Leaves any session, joins `room` (a new one by default) and puts it in the address. |
| `stop()` | Leaves and takes `?room=` out of the address. Resolves once left. |
| `pause()`, `resume()` | Leaves for now, keeping the room (a door's link carries it on); joins it again (the navigation didn't happen, or Back restored the page). `pause` resolves once left, so a site can wait briefly before it navigates. |
| `active`, `room`, `paused` | In a session (joined or joining); its room, kept while paused; stepped out for a door. |
| `session` | The session joined (`session.js`), or null while loading or out of one. |
| `inviteLink` | This page with only `?room=`; '' out of a session. |
| `self`, `setName(name)` | This visitor, in a session or not; renames them everywhere and keeps the name (`identity.js`). |
| `wave()` | Waves on the `wave` channel, with the data `1`, as the sites do; false out of a session. |
| `company()` | `{ here, nearby, away, connecting }`: on this page and `isHere`; on this page but not `isHere`; on another page; connected, their hello not come yet. |
| `condition()` | `{ online, loaded, relays, slow, failed }`: `navigator.onLine`; the session loaded and joined; the relays open; still none 10 s after joining; handshakes with others that failed (they need TURN). |
| `people()` | The others whose hello has come (`session.js`'s peers). |
| `avatars`, `reduceMotion` | The others' avatars (`avatars.js`), or null; true makes a wave only its notice, without the bob. |
| `update(now)` | Every frame: sends the pose and places the others who are here. Allocates nothing. |

Events: `change` (anything shown may have changed), `notice` (`{ kind, peer, from }`: `join`, a
visitor said hello, on this page or another; `arrive`, one came onto this page `from` another;
`leave`; `wave`) and `session` (a session was joined, after `start` or `resume`: for a site's own
shared values and listeners). `on(type, fn)` returns a function that stops listening.

`isHere` decides both who is drawn and whom `company()` counts as here. It is called every frame
for each avatar on this page, so it must not allocate. Without it, everyone on this page is here.

### Types

Each module has a `.d.ts` beside it, made by TypeScript from the module's JSDoc and committed:
`npm run types` (`tools/types.mjs`) writes them, and `npm test` fails when they are out of step. A
TypeScript site finds them through package.json's `exports` (`moduleResolution` `bundler` or
`node16`). They name the layer's shapes: `Session`, `Peer`, `SessionEvents`, `Channel`,
`Identity`, `PoseBuffer`, `Avatar`, `Hand`, `Together`, `Notice`, `Company`, `Condition` and so
on. `avatars.d.ts` refers to three's types, so a
site in TypeScript also needs `@types/three`.

### The pure modules

- `pose.js`: a pose is a `Float32Array` of 21 numbers: the head, then the left and right hands,
  each a position and a quaternion, with NaN for a hand that isn't tracked. `emptyPose`, `setPart`
  (from three's `Vector3` and `Quaternion`), `hasPart` and `PART` build and read one.
  `samplePose(peer.buffer, now - INTERP_DELAY_MS, out)` gives the pose to draw.
- `identity.js`: `loadIdentity` gives `{ memberId, name, color }`. The member id lasts as long as
  the tab (`sessionStorage`). The name is kept for the tab and as the default for new tabs
  (`localStorage`). `saveName` keeps a new one. The keys start with `lss.`; every site on
  `ariamokr.github.io` shares them, so a visitor keeps the same identity from one site to the next.
- `room.js`: `roomFromUrl`, `newRoom` (like `k3vd-q8hn`), `withRoom` and `linkInRoom` (a link to
  another page in the same room).
- `shared.js`: the shared values: last write wins by a Lamport clock, then by member id.

## Using the layer in another site

As hallway does (its `together.js`, `tools/vendor.mjs` and `index.html`):

1. **Install it** from GitHub at a tagged version (or a commit), with Trystero and three:

   ```json
   "dependencies": {
     "layersharedsession": "github:AriaMoKr/layersharedsession#v0.3.0",
     "three": "0.186.1",
     "trystero": "0.26.0"
   }
   ```

   The package holds only the layer's seven modules and their types. In Node they import as
   `layersharedsession/room.js` and so on, for tests. `npm ci` fetches it over https, so a CI
   runner needs no SSH key (checked with SSH disabled and an empty npm cache). npm 11 warns that
   the package has an install script not covered by `allowScripts`; it is harmless, since the
   script does nothing when installed as a dependency.

2. **Vendor it** like three.js: copy `layersharedsession/public/js/*.js`,
   `@trystero-p2p/core/dist/*.mjs`, `@trystero-p2p/nostr/dist/index.mjs` and
   `@noble/secp256k1/index.js` into the site's vendor folder. Then map the bare names in its
   import map (`avatars.js` imports `three`, which the import map already has):

   ```json
   {"imports":{
     "trystero": "./vendor/trystero-nostr/index.mjs",
     "@trystero-p2p/core": "./vendor/trystero-core/index.mjs",
     "@noble/secp256k1": "./vendor/noble-secp256k1/index.js",
     "layersharedsession/": "./vendor/layersharedsession/"
   }}
   ```

3. **Load Trystero only when needed.** Import `session.js` with `import()` when a session starts.
   The rest of the layer is small and has no dependencies, but Trystero is about 360 kB.

4. **Use the same app id** as the other sites (`ariamokr-layersharedsession-test` for now), so
   rooms are shared between them. Give the page its own `page` id.

5. **Keep the room in the address.** Join the room `?room=` names. Put a new room in the address
   with `history.replaceState`, so the address is the invitation. Put `room` on every link to
   another site in the session, including the way back.

6. **Leave before going.** Call `leave()` before navigating away, and on `pagehide`. Rejoin if the
   page comes back from the back/forward cache.

7. **Send and draw every frame:** `readPose`, `setPose` and `tick`, then `avatars.place`. Draw only
   the peers whose `page` is this page.

`together.js` does steps 3, 5 and 7, and the leaving in step 6 (`pause` and `resume`); the site
still calls them at the right moments, and words everything.

When the layer changes, push it and tag a version (`v0.3.0`), then move each site's pin to it and
run `npm install` there. Visitors on sites pinned at different versions meet in the same rooms, so
the messages between them have to stay compatible.

## Coming from a site's own `together.js`

Each site had its own `together.js` (breadboard's `together.ts`), copied from the hallway's. With
`createTogether` in its place, the site keeps its words, its page id and what is particular to it:

- **hallway:** where the controller came from. `new Together({ scene, camera, renderer, hands })`
  becomes `createTogether({ appId: APP_ID, page: 'hallway', camera, renderer, hands, avatars:
  { parent: scene, font: SANS } })`. `onChange` is `on('change')`; `onNotice` is `on('notice')`,
  worded by `presence.js` as now. `status` is `statusText({ ...together.condition(),
  ...together.company() })`. `people()` and `panelPeople()` stay, as words over `together.people()`.
- **outside:** as hallway, with `avatars: { parent: scene, ground }`, so the rings sit on the
  terrain.
- **vrlbry and music:** `isHere(peer, avatar)` is their `_isHere`: whether the peer is in the same
  room of the library as this visitor, by the `space` key kept on the avatar and made again when
  the peer's member id changes, so a frame allocates nothing. On `session` they write their own
  space (`s.set(spaceKey(s.self.memberId), space)`), and again on its `self` event; a `shared`
  change to a space key redraws. `company()`'s `nearby` is their "elsewhere in the library". They
  import it as `../vendor/layersharedsession/together.js`, which finds `session.js` beside it.
- **breadboard:** in TypeScript (`import { createTogether, type Together } from
  'layersharedsession/together.js'`). Its `sessionStatus` reads `condition()` (whose `loaded` is
  its `joined`) and `company()`, and `condition().slow` replaces its `startedAt` check.

One thing changes for all of them: `arrive` comes from the controller's own record of each peer's
page, so a round trip measured before someone's hello no longer makes a "came in" later.

## How the test page fits together

- `main.js` runs both pages (`<body data-page>`): the room and the session through `together.js`,
  the switch, the door and the frame loop.
- `world.js` builds the scene, `controls.js` moves the viewer, `ui.js` is the panel, and
  `pages.js` defines the two pages and the app id (`APP_ID`). The other visitors are the layer's
  `avatars.js`, as on the sites.
- Each page's import map points `three`, `trystero`, `@trystero-p2p/core` and `@noble/secp256k1`
  at `public/vendor/`, which `tools/vendor.mjs` fills on `npm install`. There is no bundler.
- `window.__lss` gives scripts the controller (`together`), the session, the scene and `tick(dt, n)`
  to drive frames in a hidden browser.

## Limits

- **Room size:** every visitor connects to every other, so this suits a handful of people.
- **Blocked connections:** some networks block direct connections. Those visitors need a TURN
  relay, which Trystero's `turnConfig` takes. A static page can't keep TURN credentials secret, so
  short-lived ones would need a small server function.
- **Trust:** there is no authority. Any visitor can send anything, claim any name, and set any
  shared value.
- **Persistence:** nothing persists. When everyone leaves, the shared values are forgotten.
- **Privacy:** visitors see each other's IP addresses, which is inherent to direct connections.
  The Nostr relays see that someone is in the room, but not the content.
- **Relays:** the public relays are community-run; any of them may be down on a given day. Trystero
  uses five of them at a time.

## License

[MIT](LICENSE).
