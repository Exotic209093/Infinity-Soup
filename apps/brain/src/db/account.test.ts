import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureAccount } from './account.js';

describe('ensureAccount', () => {
  it('creates once, returns same row thereafter', () => {
    const sqlite = new Database(':memory:'); sqlite.pragma('foreign_keys = ON');
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle') });
    const a = ensureAccount(db, 1);
    const b = ensureAccount(db, 2);
    expect(b.id).toBe(a.id);
  });
});
