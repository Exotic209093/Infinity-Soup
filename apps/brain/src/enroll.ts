import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CampaignStore } from './db/campaign-store.js';
import { EnrollmentStore } from './db/enrollment-store.js';
import { LeadStore } from './db/lead-store.js';

const campaignId = process.argv[2];
const leadArgs = process.argv.slice(3);
if (!campaignId) { console.error('usage: pnpm --filter @aura/brain enroll <campaignId> [leadId...]  (no leadIds = all leads)'); process.exit(1); }

const sqlite = new Database(join('.aura', 'aura.sqlite')); sqlite.pragma('foreign_keys = ON');
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle') });

const cs = new CampaignStore(db); const es = new EnrollmentStore(db); const ls = new LeadStore(db);
const start = cs.startNode(campaignId);
if (!start) { console.error('no start node — is the campaignId correct + does it have nodes?'); process.exit(1); }
const leadIds = leadArgs.length ? leadArgs : ls.all().map((l) => l.id);
const now = Date.now();
for (const id of leadIds) es.enroll(campaignId, id, start.id, now);
console.log(`enrolled ${leadIds.length} lead(s) into ${campaignId} at start node ${start.id} (${start.type})`);
