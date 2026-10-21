// The layer's types: the committed .d.ts are what TypeScript makes from the modules' JSDoc now
// (npm run types), and a site in strict TypeScript finds them through package.json's exports and
// type-checks against them (test/types/site.ts, written as breadboard uses the layer).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { declarations, root } from '../tools/types.mjs';

test('the committed .d.ts are in step with the modules (npm run types)', () => {
  const made = declarations();
  const exported = Object.values(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).exports)
    .filter((e) => typeof e === 'object')
    .map((e) => e.types.replace(/^\.\//, ''));
  assert.deepEqual([...made.keys()].sort(), exported.sort(), 'a .d.ts for each module exported, and no more');
  for (const [path, text] of made) assert.equal(readFileSync(join(root, path), 'utf8'), text, `${path} is out of date: npm run types`);
});

test('a strict TypeScript site type-checks against them, through the exports', () => {
  const program = ts.createProgram([join(root, 'test', 'types', 'site.ts')], {
    strict: true,
    noEmit: true,
    noUnusedLocals: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    types: [],
    skipLibCheck: false,
  });
  const problems = ts.getPreEmitDiagnostics(program).filter((d) => !d.file || !d.file.fileName.includes('/node_modules/'));
  const text = ts.formatDiagnostics(problems, { getCanonicalFileName: (f) => f, getCurrentDirectory: () => root, getNewLine: () => '\n' });
  assert.equal(problems.length, 0, text);
  const layer = program.getSourceFiles().map((f) => f.fileName).filter((f) => /\/public\/js\/[a-z]+\.d\.ts$/.test(f));
  assert.equal(layer.length, 6, `the layer's declarations, not its .js: ${layer.join(', ')}`);
});
