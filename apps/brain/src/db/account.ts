import { randomUUID } from 'node:crypto';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { account, type AccountRow } from './schema.js';

/** Return the single v1 account, creating it on first run. */
export function ensureAccount(db: BetterSQLite3Database, now: number): AccountRow {
  const existing = db.select().from(account).get();
  if (existing) return existing;
  const row: AccountRow = { id: randomUUID(), name: 'Default', liProfileUrl: null, createdAt: now };
  db.insert(account).values(row).run();
  return row;
}
