// The dev server (common's) on layersharedsession's port: node tools/serve.mjs [--port 8092] [--host 0.0.0.0]
import { start } from 'common/tools/serve.mjs';
await start(process.argv.slice(2), { port: 8092 });
