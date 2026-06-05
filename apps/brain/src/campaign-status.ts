import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { CampaignStore } from './db/campaign-store.js';
import { enrollment } from './db/schema.js';

const campaignId = process.argv[2];
if (!campaignId) { console.error('usage: pnpm --filter @aura/brain campaign:status <campaignId>'); process.exit(1); }

const sqlite = new Database(join('.aura', 'aura.sqlite')); sqlite.pragma('foreign_keys = ON');
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle') });

const cs = new CampaignStore(db);
const c = cs.getCampaign(campaignId);
if (!c) { console.error('no such campaign'); process.exit(1); }
console.log(`campaign ${c.id} "${c.name}" status=${c.status} nodes=${cs.listNodes(campaignId).length}`);
const rows = db.select().from(enrollment).where(eq(enrollment.campaignId, campaignId)).all();
for (const e of rows) {
  const n = e.currentNodeId ? cs.getNode(e.currentNodeId) : undefined;
  console.log(`  enrollment ${e.id.slice(0, 8)} lead=${e.leadId.slice(0, 8)} state=${e.state} node=${n?.type ?? '-'} nextRunAt=${e.nextRunAt ?? '-'} attempts=${e.attempts}`);
}
