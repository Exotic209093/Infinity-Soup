import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { JobStore } from './store.js';

function freshStore() {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite);
  sqlite.exec(`CREATE TABLE jobs (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, target TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'queued',
    result TEXT, created_at INTEGER NOT NULL,
    dispatched_at INTEGER, completed_at INTEGER
  );`);
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
});
