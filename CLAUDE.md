# CLAUDE.md

Guidance for Claude Code in this repository.

## What this is

A shared-session layer for three.js WebXR sites, and a page that tests it (plain ES modules, no
bundler or build step). Visitors who open the same `?room=` see each other, peer to peer over
WebRTC with Trystero 0.26, which finds them through public Nostr relays: there is no server of its
own. `README.md` covers what has been found on real devices, running the test page, the layer's
API, and how a site takes it up.

The repo is two things:

- **The layer:** five modules in `public/js/` (`session.js`, `pose.js`, `shared.js`,
  `identity.js`, `room.js`). With `tools/vendor.mjs` they are the whole npm package (`files` and
  `exports` in package.json). Sites install it from GitHub pinned to a commit
  (`github:AriaMoKr/layersharedsession#<commit>`): the Hallway (https://ariamokr.github.io/hallway/,
  AriaMoKr/hallway, `together.js`, page `hallway`), and behind its doors vrlbry (page `vrlbry`) and
  Outside (page `outside`). Each site's package.json names its commit.
- **The test page:** two pages in one room (`index.html` is `page-a`, `b.html` is `page-b`) with a
  door between them, a shared switch, a wave and a log.

Published at https://ariamokr.github.io/layersharedsession/ from `main` of
AriaMoKr/layersharedsession by `.github/workflows/pages.yml` (`npm ci`, `npm test`, then `public/`).

## Commands

```bash
npm install   # postinstall: tools/vendor.mjs copies three and Trystero (@trystero-p2p/core, @trystero-p2p/nostr, @noble/secp256k1) into public/vendor/ (gitignored); does nothing when installed as a dependency
npm start     # tools/serve.mjs: public/ on http://localhost:8092/ (IPv6 only on Windows; for a Quest or phone over adb reverse: npm start -- --host 127.0.0.1)
npm test      # node --test "test/*.test.js"
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
- `room.js`: pure. Room ids like `k3vd-q8hn` (`isRoom`, `newRoom`), `roomFromUrl`, `withRoom`, and
  `linkInRoom` for a link to another page in the same room.
- `shared.js`: pure. The last write wins by a Lamport clock, then by member id; `snapshot` and
  `mergeSnapshot` for a newcomer.
- The test page: `main.js` runs both pages (`<body data-page>`): the room, the session, the
  switch (shared key `switch`), the wave (`channel('wave')`, data `1`), the door (leave, then
  `location.assign`; leave on `pagehide` too, and reload when the back/forward cache restores it),
  and the frame loop. `pages.js` has the two pages and `APP_ID`
  (`ariamokr-layersharedsession-test`), which the sites use too, so the test page can watch their
  rooms. `world.js` builds the scene, `avatars.js` draws the others (head, hands, name label, the
  wave's bob), `controls.js` moves the viewer (desktop, touch, XR), and `ui.js` is the panel and
  the log.

## Conventions

- **The layer is an API that other sites pin.** A site at an older commit can meet one at a newer
  commit in the same room, so a change to the messages must still read and answer the old ones.
  Keep exports and option names compatible, or change every site with them. After the layer
  changes, push, then move each site's pinned commit and run `npm install` there (README, "Using the
  layer in another site"). Only the five modules, `tools/vendor.mjs` and package.json ship to the
  sites; README, the test page and `tools/serve.mjs` don't.
- The pure modules import neither three nor Trystero, and `test/` covers them in Node.
  `test/site.test.js` checks the pages, the import maps, the vendored modules' imports, and that
  client URLs stay relative (the site lives under `/layersharedsession/`). `session.js` has no Node
  test; check it in the browser.
- Quest 3 is the sites' performance target. Nothing on the per-frame path allocates except
  `tick`, which copies the pose when it sends one (at most 15 times a second).
- Trystero needs `crypto.subtle`, so a secure context: `http://localhost` or https. A LAN address
  over plain http will not connect.
- Scripted testing: `window.__lss` (session, renderer, scene, camera, rig, controls, avatars, world,
  `goThroughDoor`, `tick(dt, n)`). Each tab is its own visitor, so open the same `?room=` in two
  tabs. A hidden browser pane gets no animation frames, so drive it with `tick()`. The published
  page and a local one share the app id, so they can be in one room.
