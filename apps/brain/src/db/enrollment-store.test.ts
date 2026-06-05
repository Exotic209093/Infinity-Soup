import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { account, campaign, lead, node } from './schema.js';
import { EnrollmentStore } from './enrollment-store.js';

function freshDb(): BetterSQLite3Database {
  const sqlite = new Database(':memory:'); sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle') });
  db.insert(account).values({ id: 'a1', name: 'Me', liProfileUrl: null, createdAt: 1 }).run();
  db.insert(campaign).values({ id: 'c1', accountId: 'a1', name: 'C', status: 'running', createdAt: 1, updatedAt: 1 }).run();
  db.insert(lead).values({ id: 'l1', profileUrl: 'u1', fullName: 'Lead One', status: 'new', createdAt: 1 }).run();
  db.insert(node).values({ id: 'n1', campaignId: 'c1', type: 'visit', config: {}, x: 0, y: 0 }).run();
  db.insert(node).values({ id: 'n2', campaignId: 'c1', type: 'end', config: {}, x: 0, y: 0 }).run();
  return db;
}

describe('EnrollmentStore', () => {
  let db: BetterSQLite3Database; let es: EnrollmentStore;
  beforeEach(() => { db = freshDb(); es = new EnrollmentStore(db); });

  it('enroll creates an active, due enrollment at the start node', () => {
    const id = es.enroll('c1', 'l1', 'n1', 100);
    const e = es.get(id)!;
    expect(e).toMatchObject({ campaignId: 'c1', leadId: 'l1', currentNodeId: 'n1', state: 'active', nextRunAt: 100 });
    expect(es.due(150).map((x) => x.id)).toEqual([id]);
    expect(es.due(50)).toHaveLength(0);
  });

  it('due excludes paused campaigns and dispatched/finished enrollments', () => {
    const id = es.enroll('c1', 'l1', 'n1', 100);
    es.markDispatched(id, 'job1', 120);
    expect(es.get(id)).toMatchObject({ state: 'dispatched', pendingJobId: 'job1', nextRunAt: null });
    expect(es.due(200)).toHaveLength(0);
    expect(es.findByPendingJob('job1')?.id).toBe(id);
  });

  it('due requires the campaign to be running', () => {
    const id = es.enroll('c1', 'l1', 'n1', 100);
    db.update(campaign).set({ status: 'paused' }).where(eq(campaign.id, 'c1')).run();
    expect(es.due(200)).toHaveLength(0);
  });

  it('transitions: moveTo / reschedule / retry / finish / connectionState', () => {
    const id = es.enroll('c1', 'l1', 'n1', 100);
    es.markDispatched(id, 'job1', 120);
    es.clearPending(id, 130);
    es.moveTo(id, 'n2', 200, 130);
    expect(es.get(id)).toMatchObject({ state: 'active', currentNodeId: 'n2', nextRunAt: 200, pendingJobId: null });
    es.reschedule(id, 500, 140);
    expect(es.get(id)!.nextRunAt).toBe(500);
    es.setConnectionState(id, 'connected', 150);
    expect(es.get(id)!.connectionState).toBe('connected');
    es.retry(id, 1, 600, 160);
    expect(es.get(id)).toMatchObject({ state: 'active', attempts: 1, nextRunAt: 600, pendingJobId: null });
    es.finish(id, 'done', 170);
    expect(es.get(id)).toMatchObject({ state: 'done', nextRunAt: null });
    expect(es.due(9999)).toHaveLength(0);
  });
});
