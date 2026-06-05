import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SettingStore } from './setting-store.js';
import { loadGovernorConfig, DEFAULT_GOVERNOR_CONFIG } from '../engine/governor.js';

function freshDb(): BetterSQLite3Database {
  const sqlite = new Database(':memory:'); sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle') });
  return db;
}

describe('SettingStore', () => {
  let db: BetterSQLite3Database; let ss: SettingStore;
  beforeEach(() => { db = freshDb(); ss = new SettingStore(db); });

  it('get returns undefined for missing keys', () => {
    expect(ss.get('nope')).toBeUndefined();
  });

  it('set then get round-trips, and set upserts (no duplicate key error)', () => {
    ss.set('x', 'one');
    expect(ss.get('x')).toBe('one');
    ss.set('x', 'two');           // must UPSERT, not throw on PK conflict
    expect(ss.get('x')).toBe('two');
  });

  it('loadGovernorConfig: defaults when unset, deep-merge override when set', () => {
    expect(loadGovernorConfig(ss)).toEqual(DEFAULT_GOVERNOR_CONFIG);
    ss.set('governor', JSON.stringify({ caps: { visit: 2 } }));
    expect(loadGovernorConfig(ss).caps.visit).toBe(2);
    expect(loadGovernorConfig(ss).caps.connect).toBe(DEFAULT_GOVERNOR_CONFIG.caps.connect); // merged, not replaced
  });
});
