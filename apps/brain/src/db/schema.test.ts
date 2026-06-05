import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { account, campaign, node, edge, enrollment, setting, lead } from './schema.js';

function freshDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle') });
  return db;
}

describe('M2 schema', () => {
  it('round-trips a campaign graph + enrollment', () => {
    const db = freshDb();
    db.insert(account).values({ id: 'a1', name: 'Me', liProfileUrl: null, createdAt: 1 }).run();
    db.insert(campaign).values({ id: 'c1', accountId: 'a1', name: 'C', status: 'running', createdAt: 1, updatedAt: 1 }).run();
    db.insert(lead).values({ id: 'l1', profileUrl: 'u1', fullName: 'Lead One', status: 'new', createdAt: 1 }).run();
    db.insert(node).values({ id: 'n1', campaignId: 'c1', type: 'visit', config: {}, x: 0, y: 0 }).run();
    db.insert(node).values({ id: 'n2', campaignId: 'c1', type: 'end', config: {}, x: 0, y: 0 }).run();
    db.insert(edge).values({ id: 'e1', campaignId: 'c1', fromNodeId: 'n1', toNodeId: 'n2', condition: 'default' }).run();
    db.insert(enrollment).values({ id: 'en1', campaignId: 'c1', leadId: 'l1', currentNodeId: 'n1', state: 'active', connectionState: 'none', nextRunAt: 5, pendingJobId: null, attempts: 0, repliedAt: null, createdAt: 1, updatedAt: 1 }).run();
    db.insert(setting).values({ key: 'k', value: 'v' }).run();
    expect(db.select().from(node).all()).toHaveLength(2);
    expect(db.select().from(enrollment).all()[0].currentNodeId).toBe('n1');
  });
});
