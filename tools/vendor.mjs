// common's tools/vendor.mjs, but not where this package is installed under someone's node_modules:
// common is not there, and nothing is served there. It copies what vendor.json lists into
// public/vendor/ for the pages' import maps: three, and Trystero (`trystero` re-exports
// @trystero-p2p/nostr, which imports @trystero-p2p/core and @noble/secp256k1).
import { sep } from 'node:path';
if (!process.cwd().split(sep).includes('node_modules')) (await import('common/tools/vendor.mjs')).run();
