# Shared session test

**https://ariamokr.github.io/layersharedsession/**

A test of a shared-session layer for three.js WebXR sites such as
[hallway](https://ariamokr.github.io/hallway/), [vrlbry](https://ariamokr.github.io/vrlbry/) and
[breadboard](https://ariamokr.github.io/breadboard/). Everyone who opens the same link sees everyone
else: where they are, which way they look, and their hands in VR. They can flip a shared switch and
wave at each other.

It runs peer to peer over WebRTC with [Trystero](https://github.com/dmotz/trystero). Trystero's
default strategy finds the other visitors through public Nostr relays, so there is no server to
run. `public/` is the whole site and any static host can serve it, GitHub Pages included.

There is no voice or video yet.

## What it tests

- **Connecting.** How long until visitors see each other, on which networks and devices, and
  whether some pairs never connect. Those pairs need a TURN relay (see [Limits](#limits)).
- **Round trip.** The ping time to each visitor, every 2 seconds.
- **Poses.** The head (and hands in VR) as 84-byte messages, at most 15 a second and only when
  they change. The receiving page draws each pose 100 ms late, blended between the poses received
  around it, so visitors glide instead of jerking.
- **Shared values.** The switch is the last value written. "Last" is decided by a counter, not by
  the time of day, so devices with different clocks still agree. A visitor who arrives later gets
  every value.
- **Changing page.** The door goes to the other page in the same room, as one of hallway's doors
  goes to another site. The page leaves the room before it unloads. The next page joins again, and
  the others recognise the visitor coming back by a member id kept in the tab's `sessionStorage`.
  Both sides log how long that took.

Times in the log are seconds since the page began loading. Measurements are in yellow.

## Running it

```bash
npm install     # three.js and Trystero, copied into public/vendor/
npm start       # http://localhost:8090/
npm test
```

Open http://localhost:8090/. The page makes up a room (`?room=k3vd-q8hn`) and puts it in the
address. **Copy invite link** copies that address; open it anywhere to join the same room.

### On one PC

Open the link in two windows side by side, not two tabs. A tab in the background gets no animation
frames, so it stops sending its pose. Give each window its own name in the panel. Names are kept
per tab, and the last one entered is the default for new tabs.

### On other devices

Trystero encrypts its handshakes with the browser's `crypto.subtle`, which only works on secure
pages: https, or `http://localhost`. A phone opening `http://192.168.x.x:8090` will not work. Instead:

- **Quest or an Android phone over USB:** `adb reverse tcp:8090 tcp:8090`, then open
  `http://localhost:8090/?room=…` on the device. Only the page loads over USB; the WebRTC
  connection still goes over the network, as it would for anyone else.
- **Anywhere:** use the published copy, https://ariamokr.github.io/layersharedsession/. Every push
  to `main` publishes `public/` there, through `.github/workflows/pages.yml`, after `npm ci` and
  `npm test`.

Test across real networks too, for example a phone on mobile data and a PC on home Wi-Fi. A local
page and the published one can be in the same room: Trystero finds peers by the app id and the
room alone, and both use the same app id, so the same relays.

## Moving about

| | Look | Move | Select (switch, door, floor) |
|---|---|---|---|
| Desktop | drag | WASD or arrows (Shift runs), Q/E turn | click |
| Phone | drag | tap the floor | tap |
| Headset (**Enter VR**) | your head | left stick walks, right stick turns 30° | trigger: the floor teleports |

The grip button in VR, or **Wave** in the panel, makes your avatar bob on the other screens.

## How it fits together

- `public/js/session.js` is the layer: `joinSession({ appId, room, page, identity })` returns a
  session with events (`join`, `leave`, `update`, `pose`, `shared`, `log`, …), `setPose` and
  `tick` for the pose, `set` and `get` for shared values, and `channel(name)` for named messages.
  It is the part meant to move into the real sites.
- Pure helpers, tested in Node:
  - `room.js`: the room in the URL, and links that carry it;
  - `identity.js`: member id, name and colour;
  - `pose.js`: the pose format, change detection and interpolation;
  - `shared.js`: the shared values.
- The test page:
  - `main.js` runs both pages (`<body data-page>`);
  - `world.js` builds the scene;
  - `avatars.js` draws the other visitors;
  - `controls.js` handles movement;
  - `ui.js` is the panel;
  - `pages.js` defines the two pages.
- Each page's import map points `three`, `trystero`, `@trystero-p2p/core` and `@noble/secp256k1`
  at `public/vendor/`, which `tools/vendor.mjs` fills on `npm install`. There is no bundler.
- `window.__lss` gives scripts the session, the scene and `tick(dt, n)` to drive frames in a hidden
  browser.

## Using the layer in another site

A site installs this repository from GitHub at a pinned commit, along with Trystero:

```json
"dependencies": {
  "layersharedsession": "github:AriaMoKr/layersharedsession#<commit>",
  "trystero": "0.26.0"
}
```

The package holds only the layer: `session.js`, `pose.js`, `shared.js`, `identity.js` and
`room.js`. They are also importable in Node as `layersharedsession/room.js` and so on, for
tests. The site copies them into its own vendor folder, as it does three.js, and maps the bare
names in its import map:

```json
{"imports":{
  "trystero": "./vendor/trystero-nostr/index.mjs",
  "@trystero-p2p/core": "./vendor/trystero-core/index.mjs",
  "@noble/secp256k1": "./vendor/noble-secp256k1/index.js",
  "layersharedsession/": "./vendor/layersharedsession/"
}}
```

The member id and name live in `sessionStorage` and `localStorage` under `lss.`. Every site on
`ariamokr.github.io` shares them, so a visitor keeps the same identity going from one site to the
next in the same tab.

## Limits

- **Room size:** every visitor connects to every other, so this suits a handful of people.
- **Blocked connections:** some networks block direct connections. Those visitors need a TURN
  relay, which Trystero's `turnConfig` takes. A static page can't keep TURN credentials secret, so
  short-lived ones would need a small server function.
- **Trust:** there is no authority. Any visitor can send anything, and the switch takes whatever
  arrives.
- **Persistence:** nothing persists. When everyone leaves, the switch is forgotten.
- **Privacy:** visitors see each other's IP addresses, which is inherent to direct connections.
  The Nostr relays see that someone is in the room, but not the content.
- **Relays:** the public relays are community-run; any of them may be down on a given day. Trystero
  uses five of them at a time.

## License

[MIT](LICENSE).
