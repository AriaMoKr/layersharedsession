// The pages and how they load their modules: each page names a known page id, every import-map
// entry points at a file tools/vendor.mjs copies, and every URL is relative (the site may be served
// under a path such as /layersharedsession/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES } from '../public/js/pages.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const read = (p) => readFileSync(join(pub, p), 'utf8');

test('every page in PAGES exists, says which it is and links to a known page', () => {
  for (const page of Object.values(PAGES)) {
    const html = read(page.file);
    assert.match(html, new RegExp(`<body data-page="${page.id}">`), page.file);
    assert.match(html, new RegExp(`<title>[^<]*${page.title}</title>`), page.file);
    assert.ok(PAGES[page.other], `${page.id}: other page ${page.other}`);
  }
});

test('the import maps are the same on every page and point at the vendored files', () => {
  const maps = Object.values(PAGES).map((p) => read(p.file).match(/<script type="importmap">(.*?)<\/script>/s)[1]);
  for (const m of maps) assert.equal(m, maps[0]);
  const { imports } = JSON.parse(maps[0]);
  assert.deepEqual(Object.keys(imports).sort(), ['@noble/secp256k1', '@trystero-p2p/core', 'three', 'trystero']);
  const vendored = existsSync(join(pub, 'vendor'));
  for (const url of Object.values(imports)) {
    assert.match(url, /^\.\/vendor\//);
    if (vendored) assert.ok(existsSync(join(pub, url)), `${url} (run npm install)`);
  }
});

test('the client code uses no absolute URLs of the site', () => {
  for (const name of readdirSync(join(pub, 'js'))) {
    const src = read(join('js', name));
    assert.doesNotMatch(src, /(?:src|href)=["']\//, name);
    assert.doesNotMatch(src, /from ['"]\//, name);
  }
  for (const page of Object.values(PAGES)) {
    assert.doesNotMatch(read(page.file), /(?:src|href)="\/(?!\/)/, page.file);
  }
});

test('the vendored modules only import each other, by the names the import map knows', { skip: !existsSync(join(pub, 'vendor')) && 'no vendor/ yet' }, () => {
  const known = new Set(['three', 'trystero', '@trystero-p2p/core', '@noble/secp256k1']);
  const dirs = ['trystero-core', 'trystero-nostr', 'noble-secp256k1'];
  for (const d of dirs) {
    for (const name of readdirSync(join(pub, 'vendor', d))) {
      if (!/\.m?js$/.test(name)) continue;
      const src = read(join('vendor', d, name));
      for (const [, spec] of src.matchAll(/(?:^|\n)\s*(?:import|export)[^'"\n;]*?from\s*['"]([^'"]+)['"]/g)) {
        if (spec.startsWith('./')) assert.ok(existsSync(join(pub, 'vendor', d, spec)), `${d}/${name}: ${spec}`);
        else assert.ok(known.has(spec), `${d}/${name} imports ${spec}, which the import map doesn't map`);
      }
    }
  }
});
