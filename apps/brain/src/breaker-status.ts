import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SettingStore } from './db/setting-store.js';
import { loadBreaker } from './engine/breaker.js';

const sqlite = new Database(join('.aura', 'aura.sqlite')); sqlite.pragma('foreign_keys = ON');
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle') });

const state = loadBreaker(new SettingStore(db));
if (state.tripped) {
  console.log(`TRIPPED  reason="${state.reason}"  at=${state.at ? new Date(state.at).toISOString() : 'unknown'}`);
  console.log('Run pnpm --filter @aura/brain breaker:reset to resume dispatch.');
} else {
  console.log('OK  (breaker not tripped — dispatch active)');
}
