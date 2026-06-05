import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CampaignStore } from './db/campaign-store.js';
import { ensureAccount } from './db/account.js';

const file = process.argv[2];
if (!file) { console.error('usage: pnpm --filter @aura/brain campaign:seed <campaign.json>'); process.exit(1); }

const sqlite = new Database(join('.aura', 'aura.sqlite')); sqlite.pragma('foreign_keys = ON');
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle') });

const now = Date.now();
const acct = ensureAccount(db, now);
const spec = JSON.parse(readFileSync(file, 'utf8')) as {
  name: string; nodes: { key: string; type: string; config?: Record<string, unknown> }[];
  edges: { from: string; to: string; condition?: string }[];
};
const cs = new CampaignStore(db);
const cid = cs.createCampaign(acct.id, spec.name, 'running', now);
const byKey = new Map<string, string>();
for (const n of spec.nodes) byKey.set(n.key, cs.addNode(cid, n.type, n.config ?? {}, now));
for (const e of spec.edges) cs.addEdge(cid, byKey.get(e.from)!, byKey.get(e.to)!, e.condition ?? 'default', now);
console.log(`campaign ${cid} "${spec.name}" seeded: ${spec.nodes.length} nodes, ${spec.edges.length} edges (status=running)`);
