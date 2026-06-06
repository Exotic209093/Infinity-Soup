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
const OPEN: GovernorConfig = {
  caps: { ...DEFAULT_GOVERNOR_CONFIG.caps },
  workingHours: { enabled: false, startHour: 0, endHour: 24, days: [0, 1, 2, 3, 4, 5, 6] },
  warmup: { enabled: false, rampDays: 21, minFraction: 0.25 },
  pacing: { enabled: false, minGapMs: 0, maxGapMs: 0, dailyJitter: 0 },
};

function harness(cfg: GovernorConfig = OPEN) {
  const db = freshDb();
  db.insert(account).values({ id: 'a1', name: 'Me', liProfileUrl: null, createdAt: 1 }).run();
  db.insert(lead).values({ id: 'l1', profileUrl: 'u1', fullName: 'Lead One', status: 'new', createdAt: 1 }).run();
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

// Visit → Wait(1000ms) → Visit → End
function seedLinear(h: ReturnType<typeof harness>) {
  const cid = h.campaigns.createCampaign('a1', 'Warm-up', 'running', 0);
  const n1 = h.campaigns.addNode(cid, 'visit', {}, 0);
  const n2 = h.campaigns.addNode(cid, 'wait', { waitMs: 1000 }, 0);
  const n3 = h.campaigns.addNode(cid, 'visit', {}, 0);
  const n4 = h.campaigns.addNode(cid, 'end', {}, 0);
  h.campaigns.addEdge(cid, n1, n2, 'default', 0);
  h.campaigns.addEdge(cid, n2, n3, 'default', 0);
  h.campaigns.addEdge(cid, n3, n4, 'default', 0);
  return { cid, n1, n2, n3, n4 };
}

describe('Engine', () => {
  it('dispatches the first action on tick; waits for the Result before advancing', () => {
    const h = harness(); const g = seedLinear(h);
    const eid = h.enrollments.enroll(g.cid, 'l1', g.n1, 0);
    h.engine.tick(0);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toMatchObject({ type: 'visit', target: 'u1' });
    expect(h.enrollments.get(eid)).toMatchObject({ state: 'dispatched', pendingJobId: 'job1', currentNodeId: g.n1 });
    h.engine.tick(0); // still dispatched → no new job
    expect(h.sent).toHaveLength(1);
  });

  it('on ok Result advances to the Wait node and schedules nextRunAt', () => {
    const h = harness(); const g = seedLinear(h);
    const eid = h.enrollments.enroll(g.cid, 'l1', g.n1, 0);
    h.engine.tick(0);
    h.engine.onResult({ jobId: 'job1', status: 'ok' } as Result);
    expect(h.enrollments.get(eid)).toMatchObject({ state: 'active', currentNodeId: g.n2, nextRunAt: 1000 });
    h.engine.tick(0); expect(h.sent).toHaveLength(1); // wait not elapsed
  });

  it('full run: two visits then End', () => {
    const h = harness(); const g = seedLinear(h);
    const eid = h.enrollments.enroll(g.cid, 'l1', g.n1, 0);
    h.engine.tick(0);
    h.engine.onResult({ jobId: 'job1', status: 'ok' } as Result);
    h.engine.tick(1000); // wait elapses → advance to n3 (visit) scheduled now
    h.engine.tick(1000); // n3 action → dispatch visit #2
    expect(h.sent).toHaveLength(2);
    h.engine.onResult({ jobId: 'job2', status: 'ok' } as Result);
    expect(h.enrollments.get(eid)).toMatchObject({ state: 'done', currentNodeId: g.n4 });
  });

  it('governor defer reschedules without dispatching', () => {
    const capped: GovernorConfig = { caps: { ...OPEN.caps, visit: 0 }, workingHours: OPEN.workingHours };
    const h = harness(capped); const g = seedLinear(h);
    const eid = h.enrollments.enroll(g.cid, 'l1', g.n1, 0);
    h.engine.tick(0);
    expect(h.sent).toHaveLength(0);
    const e = h.enrollments.get(eid)!;
    expect(e.state).toBe('active'); expect(e.nextRunAt!).toBeGreaterThan(0);
  });

  it('advances without dispatching when the governor returns skip', () => {
    const h = harness();
    const skipGov = { canDispatch: () => ({ kind: 'skip', reason: 'stub' }) } as unknown as Governor;
    const engine2 = new Engine(h.campaigns, h.enrollments, h.leads, skipGov, h.dispatcher, () => 'jobX', () => 0);
    const g = seedLinear(h);
    const eid = h.enrollments.enroll(g.cid, 'l1', g.n1, 0);
    engine2.tick(0);
    expect(h.sent).toHaveLength(0);
    expect(h.enrollments.get(eid)).toMatchObject({ currentNodeId: g.n2 }); // advanced past the action node
  });

  it('does NOT dispatch (stays active) when hands are offline; retries next tick', () => {
    const h = harness();
    // rebuild engine with an offline dispatcher over the same stores
    const offline = new Dispatcher(h.jobsStore, () => false, () => 0);
    const engine2 = new Engine(h.campaigns, h.enrollments, h.leads, h.governor, offline, () => 'jobX', () => 0);
    const g = seedLinear(h);
    const eid = h.enrollments.enroll(g.cid, 'l1', g.n1, 0);
    engine2.tick(0);
    const e = h.enrollments.get(eid)!;
    expect(e.state).toBe('active');            // NOT 'dispatched'
    expect(e.pendingJobId).toBeNull();
    expect(e.nextRunAt).toBe(60000);           // rescheduled now+DELIVERY_RETRY_MS
  });

  it('reconcile re-activates a dispatched enrollment (and fails it after MAX_ATTEMPTS)', () => {
    const h = harness(); const g = seedLinear(h);
    const eid = h.enrollments.enroll(g.cid, 'l1', g.n1, 0);
    h.engine.tick(0);                                   // delivered → state 'dispatched'
    expect(h.enrollments.get(eid)!.state).toBe('dispatched');
    h.engine.reconcile(0);                              // attempt 1 → back to active
    expect(h.enrollments.get(eid)).toMatchObject({ state: 'active', attempts: 1, nextRunAt: 0 });
    // drive to the attempt ceiling
    h.engine.tick(0); h.engine.reconcile(0);            // attempt 2
    h.engine.tick(0); h.engine.reconcile(0);            // attempt 3 == MAX → failed
    expect(h.enrollments.get(eid)!.state).toBe('failed');
  });

  it('failed Result retries up to 3 attempts then fails', () => {
    const h = harness(); const g = seedLinear(h);
    const eid = h.enrollments.enroll(g.cid, 'l1', g.n1, 0);
    h.engine.tick(0);                                        // dispatch job1
    h.engine.onResult({ jobId: 'job1', status: 'failed' } as Result); // attempts=1, retry @300000
    h.engine.tick(300000);                                   // due → dispatch job2
    h.engine.onResult({ jobId: 'job2', status: 'failed' } as Result); // attempts=2, retry @300000
    h.engine.tick(300000);                                   // due → dispatch job3
    h.engine.onResult({ jobId: 'job3', status: 'failed' } as Result); // attempts=3 == MAX → failed
    expect(h.sent).toHaveLength(3);
    expect(h.enrollments.get(eid)!.state).toBe('failed');
    expect(h.enrollments.get(eid)!.currentNodeId).toBe(g.n1);
  });
});
