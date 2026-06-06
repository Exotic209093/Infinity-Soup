import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JobStore } from './db/store.js';
import { LeadStore } from './db/lead-store.js';
import { CampaignStore } from './db/campaign-store.js';
import { EnrollmentStore } from './db/enrollment-store.js';
import { SettingStore } from './db/setting-store.js';
import { ensureAccount } from './db/account.js';
import { Dispatcher } from './dispatcher.js';
import { Governor, loadGovernorConfig } from './engine/governor.js';
import { loadBreaker } from './engine/breaker.js';
import { Engine } from './engine/engine.js';

const sqlite = new Database(join('.aura', 'aura.sqlite')); sqlite.pragma('foreign_keys = ON');
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle') });

const settingStore = new SettingStore(db);
const account = ensureAccount(db, Date.now());
const jobs = new JobStore(db);
const engine = new Engine(
  new CampaignStore(db), new EnrollmentStore(db), new LeadStore(db),
  new Governor(jobs, loadGovernorConfig(settingStore), {
    accountCreatedAt: account.createdAt,
    breakerTripped: () => loadBreaker(settingStore).tripped,
  }),
  new Dispatcher(jobs, () => false), // CLI has no live hands → enqueue returns false, the engine reschedules the enrollment (no dispatch, no stranding)
  () => randomUUID(),
);
engine.tick(Date.now());
console.log('tick complete.');
