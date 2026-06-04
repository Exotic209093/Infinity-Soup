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
});
