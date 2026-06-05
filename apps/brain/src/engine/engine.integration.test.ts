import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Job, Result } from '@aura/contract';
import { account, lead } from '../db/schema.js';
import { JobStore } from '../db/store.js';
import { LeadStore } from '../db/lead-store.js';
import { CampaignStore } from '../db/campaign-store.js';
import { EnrollmentStore } from '../db/enrollment-store.js';
import { Dispatcher } from '../dispatcher.js';
import { Governor, DEFAULT_GOVERNOR_CONFIG, type GovernorConfig } from './governor.js';
import { Engine } from './engine.js';

function freshDb(): BetterSQLite3Database {
  const sqlite = new Database(':memory:'); sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle') });
  return db;
}
const OPEN: GovernorConfig = { caps: { ...DEFAULT_GOVERNOR_CONFIG.caps }, workingHours: { enabled: false, startHour: 0, endHour: 24, days: [0, 1, 2, 3, 4, 5, 6] } };

function harness(cfg: GovernorConfig = OPEN) {
  const db = freshDb();
  db.insert(account).values({ id: 'a1', name: 'Me', liProfileUrl: null, createdAt: 1 }).run();
  db.insert(lead).values({ id: 'l1', profileUrl: 'u1', fullName: 'Lead One', status: 'new', createdAt: 1 }).run();
  db.insert(lead).values({ id: 'l2', profileUrl: 'u2', fullName: 'Lead Two', status: 'new', createdAt: 1 }).run();
  const jobsStore = new JobStore(db);
  const leads = new LeadStore(db);
  const campaigns = new CampaignStore(db);
  const enrollments = new EnrollmentStore(db);
  const sent: Job[] = [];
  const dispatcher = new Dispatcher(jobsStore, (j) => { sent.push(j); return true; }, () => 0);
  const governor = new Governor(jobsStore, cfg);
  let seq = 0;
  const engine = new Engine(campaigns, enrollments, leads, governor, dispatcher, () => `job${++seq}`, () => 0);
  return { db, jobsStore, leads, campaigns, enrollments, dispatcher, governor, engine, sent };
}

// Mirrors examples/visit-warmup.json: Visit → Wait(60000) → Visit → End
function seedWarmup(h: ReturnType<typeof harness>) {
  const cid = h.campaigns.createCampaign('a1', 'Visit warm-up', 'running', 0);
  const v1 = h.campaigns.addNode(cid, 'visit', {}, 0);
  const w1 = h.campaigns.addNode(cid, 'wait', { waitMs: 60000 }, 0);
  const v2 = h.campaigns.addNode(cid, 'visit', {}, 0);
  const end = h.campaigns.addNode(cid, 'end', {}, 0);
  h.campaigns.addEdge(cid, v1, w1, 'default', 0);
  h.campaigns.addEdge(cid, w1, v2, 'default', 0);
  h.campaigns.addEdge(cid, v2, end, 'default', 0);
  return { cid, v1, w1, v2, end };
}

describe('Engine integration — two leads through a warm-up sequence', () => {
  it('runs both leads Visit → Wait → Visit → End to done, dispatching 4 visits', () => {
    const h = harness(); const g = seedWarmup(h);
    const e1 = h.enrollments.enroll(g.cid, 'l1', g.v1, 0);
    const e2 = h.enrollments.enroll(g.cid, 'l2', g.v1, 0);

    h.engine.tick(0);                                   // both dispatch visit #1
    expect(h.sent).toHaveLength(2);
    expect(h.sent.map((j) => j.target).sort()).toEqual(['u1', 'u2']);

    h.engine.onResult({ jobId: 'job1', status: 'ok' } as Result);
    h.engine.onResult({ jobId: 'job2', status: 'ok' } as Result);
    expect(h.enrollments.get(e1)).toMatchObject({ currentNodeId: g.w1, nextRunAt: 60000 });
    expect(h.enrollments.get(e2)).toMatchObject({ currentNodeId: g.w1, nextRunAt: 60000 });

    h.engine.tick(0);                                   // wait not elapsed → nothing
    expect(h.sent).toHaveLength(2);

    h.engine.tick(60000);                               // wait elapses → both advance past wait to v2 (scheduled now)
    h.engine.tick(60000);                               // v2 due → both dispatch visit #2
    expect(h.sent).toHaveLength(4);

    h.engine.onResult({ jobId: 'job3', status: 'ok' } as Result);
    h.engine.onResult({ jobId: 'job4', status: 'ok' } as Result);
    expect(h.enrollments.get(e1)).toMatchObject({ state: 'done', currentNodeId: g.end });
    expect(h.enrollments.get(e2)).toMatchObject({ state: 'done', currentNodeId: g.end });
  });

  it('enforces the daily visit cap across leads (cap 1 → only one dispatches in a tick)', () => {
    const capped: GovernorConfig = { caps: { ...OPEN.caps, visit: 1 }, workingHours: OPEN.workingHours };
    const h = harness(capped); const g = seedWarmup(h);
    h.enrollments.enroll(g.cid, 'l1', g.v1, 0);
    h.enrollments.enroll(g.cid, 'l2', g.v1, 0);
    h.engine.tick(0);
    expect(h.sent).toHaveLength(1); // first allowed (count→1), second deferred (1 >= cap 1)
  });
});
