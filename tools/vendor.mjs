// Copies the browser modules the pages import from node_modules into public/vendor/, so public/ is
// the whole site: served as it is by tools/serve.mjs, or by any static host such as GitHub Pages.
// Runs after `npm install` (postinstall). The import map in each page maps the bare names
// (three, trystero, @trystero-p2p/core, @noble/secp256k1) to these copies.
import { copyFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modules = join(root, 'node_modules');
const out = join(root, 'public', 'vendor');

// `trystero` itself only re-exports @trystero-p2p/nostr (the Nostr signalling strategy), which
// imports @trystero-p2p/core and @noble/secp256k1 (Nostr event signatures).
const FILES = [
  // three.module.js imports three.core.js.
  { from: 'three/build/three.module.js', to: 'three/three.module.js' },
  { from: 'three/build/three.core.js', to: 'three/three.core.js' },
  { from: 'three/LICENSE', to: 'three/LICENSE' },
  { dir: '@trystero-p2p/core/dist', to: 'trystero-core' },
  { from: '@trystero-p2p/core/LICENSE', to: 'trystero-core/LICENSE', optional: true },
  { from: '@trystero-p2p/nostr/dist/index.mjs', to: 'trystero-nostr/index.mjs' },
  { from: '@trystero-p2p/nostr/LICENSE', to: 'trystero-nostr/LICENSE', optional: true },
  { from: 'trystero/LICENSE', to: 'trystero-nostr/LICENSE.trystero', optional: true },
  { from: '@noble/secp256k1/index.js', to: 'noble-secp256k1/index.js' },
  { from: '@noble/secp256k1/LICENSE', to: 'noble-secp256k1/LICENSE', optional: true },
];

function copy(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

rmSync(out, { recursive: true, force: true });
for (const f of FILES) {
  const src = join(modules, f.dir || f.from);
  if (!existsSync(src)) {
    if (f.optional) continue;
    throw new Error(`vendor: ${f.dir || f.from} is missing; run npm install`);
  }
  if (f.dir) {
    // Every module of the package (they import each other by relative path), without the maps.
    for (const name of readdirSync(src)) {
      if (name.endsWith('.mjs')) copy(join(src, name), join(out, f.to, name));
    }
  } else {
    copy(src, join(out, f.to));
  }
}
console.log(`vendor: copied into ${out}`);
