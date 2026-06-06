import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SettingStore } from './db/setting-store.js';
import { resetBreaker, loadBreaker } from './engine/breaker.js';

const sqlite = new Database(join('.aura', 'aura.sqlite')); sqlite.pragma('foreign_keys = ON');
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle') });

const settingStore = new SettingStore(db);
const before = loadBreaker(settingStore);
if (!before.tripped) {
  console.log('Breaker was not tripped — nothing to reset.');
} else {
  resetBreaker(settingStore);
  console.log(`Breaker reset. Was: reason="${before.reason}" at=${before.at ? new Date(before.at).toISOString() : 'unknown'}`);
  console.log('Dispatch will resume on the next engine tick.');
}
