import { loadConfig } from './config.js';

// Enqueue a job for the connected extension. Defaults to the M1 rich scrape.
//   pnpm --filter @aura/brain enqueue <profileUrl> [scrapeProfile|visit]
const target = process.argv[2];
const type = process.argv[3] ?? 'scrapeProfile';
if (!target) {
  console.error('usage: pnpm --filter @aura/brain enqueue <profileUrl> [scrapeProfile|visit]');
  process.exit(1);
}

const { port } = loadConfig();
const res = await fetch(`http://127.0.0.1:${port + 1}/jobs`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ type, target }),
});
console.log(res.status, await res.text());
console.log(`Enqueued ${type} for ${target} — watch the brain log for [lead].`);
