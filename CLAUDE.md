# CLAUDE.md

Guidance for Claude Code in this repository.

## What this is

A shared-session layer for three.js WebXR sites, and a page that tests it (plain ES modules, no
bundler or build step). Visitors who open the same `?room=` see each other, peer to peer over
WebRTC with Trystero 0.26, which finds them through public Nostr relays: there is no server of its
own. `README.md` covers what has been found on real devices, running the test page, the layer's
API, and how a site takes it up.

The repo is two things:

- **The layer:** seven modules in `public/js/` (`session.js`, `pose.js`, `shared.js`,
  `identity.js`, `room.js`, `avatars.js`, `together.js`), each with a `.d.ts` beside it. With `tools/vendor.mjs`
  they are the whole npm package (`files` and `exports` in package.json). Sites install it from
  GitHub pinned to a tag or commit (`github:AriaMoKr/layersharedsession#v0.2.0`): the Hallway
  (https://ariamokr.github.io/hallway/, AriaMoKr/hallway, `together.js`, page `hallway`), and
  behind its doors vrlbry (page `vrlbry`; music is a fork of it), Outside (page `outside`) and
  Breadboard (in TypeScript, `src/vr/together.ts`). Each site's package.json names its pin.
- **The test page:** two pages in one room (`index.html` is `page-a`, `b.html` is `page-b`) with a
  door between them, a shared switch, a wave and a log.

Published at https://ariamokr.github.io/layersharedsession/ from `main` of
AriaMoKr/layersharedsession by `.github/workflows/pages.yml` (`npm ci`, `npm test`, then `public/`).

## Commands

```bash
npm install   # postinstall: tools/vendor.mjs copies three and Trystero (@trystero-p2p/core, @trystero-p2p/nostr, @noble/secp256k1) into public/vendor/ (gitignored); does nothing when installed as a dependency
npm start     # tools/serve.mjs: public/ on http://localhost:8092/ (IPv6 only on Windows; for a Quest or phone over adb reverse: npm start -- --host 127.0.0.1)
npm test      # node --test "test/*.test.js"
npm run types # tools/types.mjs: the .d.ts beside each exported module, from its JSDoc (tsconfig.json); commit them
```

`.claude/launch.json` serves it on 8092. The sibling repos use 8088 to 8091 (hallway and its Quest
server, outside and its Quest server), so they can all run side by side.

## Layout

- `session.js`: the only module that needs Trystero; sites `import()` it when a session starts.
  `joinSession({ appId, room, page, identity, storage, now, pageName, config })` returns the session
  (members and events in README, "The layer"). Its messages are Trystero actions, listed at the top
  of the file: `hello` (member id, name, colour, page), `pose` (84 bytes), `state` (shared values: a
  snapshot to a newcomer, then each write) and `x:<name>` for `channel(name)`. Trystero allows
  action names of 1 to 32 bytes. It pings every 2 s (`rtt`), counts open relays every 1 s, and sends
  the pose at most 15 times a second, only when it changed. Two tabs with one member id (a
  duplicated tab copies `sessionStorage`) are told apart by Trystero's `selfId`: the higher one takes
  a new member id.
- `pose.js`: pure. A pose is a `Float32Array(21)`: head, left hand, right hand, each a position and a
  quaternion, NaN for a hand that isn't tracked. Each peer's poses go into a buffer by the
  receiver's clock (`pushSample`); `samplePose(buffer, now - INTERP_DELAY_MS, out)` blends them
  100 ms behind, without allocating.
- `identity.js`: pure. The member id is in `sessionStorage` (`lss.member`, one per tab). The name is
  in `sessionStorage`, then `localStorage` as the default for new tabs (`lss.name`). Every site on
  ariamokr.github.io shares these keys. `colorFor` turns a member id into a colour through `hash`
  (FNV-1a).
- `avatars.js`: the sites' avatars (three, unlit, shaded faces): `createAvatars({ parent, font,
  ground })` gives `show`, `drop`, `wave`, `place(now, peers, isHere)`, `clear`, `get`, `list` and
  `group`; `readPose(camera, hands, out)` is this visitor's pose from the camera and the XR
  controllers. The geometry is made with the first avatar. It came from the hallway's
  `together.js`, which the sites had copied; keep it what they draw.
- `together.js`: the session controller, the shared part of the sites' own `together.js` (the
  hallway's at 3a3a8ef). `createTogether({ appId, page, camera, renderer, hands, avatars, isHere,
  pageName })`: `start`, `stop`, `pause`, `resume`, the room in the address by
  `history.replaceState(history.state, …)` (vrlbry's and outside's Back keep fields in
  `history.state`), `import('./session.js')` lazily with a ticket so a stale join is dropped, the
  relay wait (`RELAY_WAIT_MS`), failed handshakes counted from the log, waves at most once a second
  per visitor, `company()`, `condition()`, `update(now)`. Events `change`, `notice` (`join`,
  `arrive`, `leave`, `wave`) and `session`. It words nothing; the sites do. `joinSession` and `now`
  options are for tests.
- `room.js`: pure. Room ids like `k3vd-q8hn` (`isRoom`, `newRoom`), `roomFromUrl`, `withRoom`, and
  `linkInRoom` for a link to another page in the same room.
- `shared.js`: pure. The last write wins by a Lamport clock, then by member id; `snapshot` and
  `mergeSnapshot` for a newcomer.
- The test page: `main.js` runs both pages (`<body data-page>`) through `together.js`: the session
  started at load (the room in `?room=`, or a new one), Start/Stop, the switch (shared key
  `switch`, through the `session` event), the wave, the door (`pause`, then `location.assign`;
  `pause` on `pagehide` too, and `resume` when the back/forward cache restores it), and the frame
  loop. `pages.js` has the two pages and `APP_ID`
  (`ariamokr-layersharedsession-test`), which the sites use too, so the test page can watch their
  rooms. `world.js` builds the scene, the layer's `avatars.js` draws the others, `controls.js`
  moves the viewer (desktop, touch, XR; `hands` for readPose), and `ui.js` is the panel and the
  log.
- `tools/types.mjs` makes the `.d.ts` with TypeScript's API rather than `tsc`, which would take
  the last ones as inputs. `test/types.test.js` checks they're in step, and type-checks
  `test/types/site.ts`, a strict TypeScript site written as breadboard uses the layer, against
  them through the package's own `exports`.

## Conventions

- **The layer is an API that other sites pin.** A site at an older commit can meet one at a newer
  commit in the same room, so a change to the messages must still read and answer the old ones.
  Keep exports and option names compatible, or change every site with them. After the layer
  changes, push, then move each site's pinned commit and run `npm install` there (README, "Using the
  layer in another site"). Tag each version the sites take (`v0.3.0`, with package.json's
  `version`). Only the seven modules, their `.d.ts`, `tools/vendor.mjs` and package.json ship to the
  sites; README, the test page and the other tools don't.
- The JSDoc is the source of the types. After changing an exported module's signatures or
  typedefs, run `npm run types` and commit the `.d.ts` with it. Typedefs go before a statement
  that isn't exported, or TypeScript repeats them as comments above the next export.
- `three` is a peer dependency (r152 or later), for `avatars.js` and so `together.js`; the site
  supplies it. The pure modules import neither three nor Trystero. `test/` covers them in Node, and
  `avatars.js` too (three runs in Node; a stand-in canvas takes the labels), and `together.js` with a
  stand-in `joinSession`, address, history and storage.
  `test/site.test.js` checks the pages, the import maps, the vendored modules' imports, and that
  client URLs stay relative (the site lives under `/layersharedsession/`). `session.js` has no Node
  test; check it in the browser.
- Quest 3 is the sites' performance target. Nothing on the per-frame path (`update`, `readPose`,
  `setPose`, `tick`, `place`, `samplePose`, a site's `isHere`) allocates except `tick`, which copies the pose when it sends one
  (at most 15 times a second).
- Trystero needs `crypto.subtle`, so a secure context: `http://localhost` or https. A LAN address
  over plain http will not connect.
- Scripted testing: `window.__lss` (together, session, renderer, scene, camera, rig, controls, avatars, world,
  `goThroughDoor`, `tick(dt, n)`). Each tab is its own visitor, so open the same `?room=` in two
  tabs. A hidden browser pane gets no animation frames, so drive it with `tick()`. The published
  page and a local one share the app id, so they can be in one room.
