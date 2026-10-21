// The layer's types: a .d.ts beside each module the package exports, made by TypeScript from the
// modules' JSDoc (the options and modules are in tsconfig.json). The files are committed, so the
// sites get them with the package: `npm run types` writes them, and test/types.test.js fails when
// they are out of step with the modules.
//
// Not plain `tsc`: it would take the .d.ts it wrote last time as inputs (an import of './pose.js'
// finds pose.d.ts first) and refuse to overwrite them. Here they are hidden from the compiler.
import ts from 'typescript';
import { writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The declarations TypeScript makes from the modules as they are now: path from root → text. */
export function declarations() {
  const { config, error } = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile);
  if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  const { options, fileNames } = ts.parseJsonConfigFileContent(config, ts.sys, root);
  const previous = new Set(fileNames.map((f) => resolve(f.replace(/\.js$/, '.d.ts'))));
  const host = ts.createCompilerHost(options);
  const exists = host.fileExists;
  host.fileExists = (f) => !previous.has(resolve(f)) && exists(f);
  const out = new Map();
  host.writeFile = (f, text) => out.set(relative(root, f).split('\\').join('/'), text);
  const program = ts.createProgram(fileNames, options, host);
  const result = program.emit();
  const problems = [...ts.getPreEmitDiagnostics(program), ...result.diagnostics];
  if (problems.length) {
    throw new Error(ts.formatDiagnostics(problems, { getCanonicalFileName: (f) => f, getCurrentDirectory: () => root, getNewLine: () => '\n' }));
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const [path, text] of declarations()) {
    writeFileSync(join(root, path), text);
    console.log(`types: ${path}`);
  }
}
