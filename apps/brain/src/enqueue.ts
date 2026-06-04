import { loadConfig } from './config.js';

const target = process.argv[2];
if (!target) { console.error('usage: pnpm --filter @aura/brain enqueue <profileUrl>'); process.exit(1); }

const { port } = loadConfig();
const res = await fetch(`http://127.0.0.1:${port + 1}/jobs`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ type: 'visit', target }),
});
console.log(res.status, await res.text());
