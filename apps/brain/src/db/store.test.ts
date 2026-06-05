import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JobStore } from './store.js';

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle'); // src/db/ -> apps/brain/drizzle

function freshStore() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: MIGRATIONS });
  return new JobStore(db);
}

describe('JobStore', () => {
  let store: JobStore;
  beforeEach(() => { store = freshStore(); });

  it('creates and gets a job', () => {
    store.create({ id: 'j1', type: 'visit', target: 'https://x', payload: {} }, 1000);
    expect(store.get('j1')).toMatchObject({ id: 'j1', type: 'visit', status: 'queued' });
  });

  it('marks a job dispatched', () => {
    store.create({ id: 'j1', type: 'visit', target: 'x', payload: {} }, 1000);
    store.markDispatched('j1', 2000);
    expect(store.get('j1')).toMatchObject({ status: 'dispatched', dispatchedAt: 2000 });
  });

  it('saves a result and completes the job', () => {
    store.create({ id: 'j1', type: 'visit', target: 'x', payload: {} }, 1000);
    store.saveResult({ jobId: 'j1', status: 'ok', data: { fullName: 'Jane Doe' } }, 3000);
    const j = store.get('j1')!;
    expect(j.status).toBe('ok');
    expect(j.completedAt).toBe(3000);
    expect(JSON.parse(j.result!).data.fullName).toBe('Jane Doe');
  });

  it('countByTypeSince counts sent (non-queued) jobs of a type at/after a timestamp', () => {
    const store = freshStore();
    store.create({ id: 'j1', type: 'visit', target: 'u1', payload: {} }, 1000);
    store.markDispatched('j1', 1000);
    store.create({ id: 'j2', type: 'visit', target: 'u2', payload: {} }, 2000);
    store.markDispatched('j2', 2000);
    store.create({ id: 'j3', type: 'connect', target: 'u3', payload: {} }, 2000);
    store.markDispatched('j3', 2000);
    store.create({ id: 'j4', type: 'visit', target: 'u4', payload: {} }, 3000); // left 'queued'
    expect(store.countByTypeSince('visit', 1500)).toBe(1); // only j2 (j1 before window, j4 still queued)
    expect(store.countByTypeSince('visit', 500)).toBe(2);  // j1 + j2 (j4 queued, excluded)
    expect(store.countByTypeSince('connect', 0)).toBe(1);
  });

  it('countByTypeSince counts only dispatched/ok, excluding failed + skipped', () => {
    const store = freshStore();
    store.create({ id: 'f1', type: 'visit', target: 'u1', payload: {} }, 1000); store.saveResult({ jobId: 'f1', status: 'failed' }, 1000);
    store.create({ id: 's1', type: 'visit', target: 'u2', payload: {} }, 1000); store.saveResult({ jobId: 's1', status: 'skipped' }, 1000);
    store.create({ id: 'd1', type: 'visit', target: 'u3', payload: {} }, 1000); store.markDispatched('d1', 1000);
    store.create({ id: 'o1', type: 'visit', target: 'u4', payload: {} }, 1000); store.markDispatched('o1', 1000); store.saveResult({ jobId: 'o1', status: 'ok' }, 1000);
    expect(store.countByTypeSince('visit', 0)).toBe(2); // d1 (dispatched) + o1 (ok); f1/s1 excluded
  });

  it('hasSucceeded is true only after an ok result for that type+target', () => {
    const store = freshStore();
    store.create({ id: 'j1', type: 'visit', target: 'u1', payload: {} }, 1);
    expect(store.hasSucceeded('visit', 'u1')).toBe(false);
    store.saveResult({ jobId: 'j1', status: 'ok' }, 2);
    expect(store.hasSucceeded('visit', 'u1')).toBe(true);
    expect(store.hasSucceeded('visit', 'other')).toBe(false);
    expect(store.hasSucceeded('connect', 'u1')).toBe(false);
  });
});
