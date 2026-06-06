/**
 * Branching integration tests: Connect → Wait(1000) → {accepted: Message→End, timeout: End}
 *
 * Verifies that chooseCondition is actually wired through the engine for real branch selection.
 */
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

/**
 * Build: Connect → Wait(1000) → (accepted) Message → End
 *                              → (timeout)  End
 *
 * Returns node ids and the campaign id.
 */
function seedBranching(h: ReturnType<typeof harness>) {
  const cid = h.campaigns.createCampaign('a1', 'Branch-test', 'running', 0);
  const nConnect  = h.campaigns.addNode(cid, 'connect',  {}, 0);
  const nWait     = h.campaigns.addNode(cid, 'wait',     { waitMs: 1000 }, 0);
  const nMessage  = h.campaigns.addNode(cid, 'message',  { text: 'Hi' }, 0);
  const nEnd      = h.campaigns.addNode(cid, 'end',      {}, 0);
  // Connect → Wait (default)
  h.campaigns.addEdge(cid, nConnect, nWait, 'default', 0);
  // Wait → Message (accepted path)
  h.campaigns.addEdge(cid, nWait, nMessage, 'accepted', 0);
  // Wait → End (timeout path — no 'default' edge from Wait)
  h.campaigns.addEdge(cid, nWait, nEnd, 'timeout', 0);
  // Message → End
  h.campaigns.addEdge(cid, nMessage, nEnd, 'default', 0);
  return { cid, nConnect, nWait, nMessage, nEnd };
}

describe('Engine branching — Connect → Wait → {accepted: Message, timeout: End}', () => {
  it('timeout path: pending connectionState after connect → routes to End (no message dispatched)', () => {
    const h = harness();
    const g = seedBranching(h);
    const eid = h.enrollments.enroll(g.cid, 'l1', g.nConnect, 0);

    // tick(0): enroll at nConnect (action) → dispatch connect job
    h.engine.tick(0);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toMatchObject({ type: 'connect', target: 'u1' });
    expect(h.enrollments.get(eid)).toMatchObject({ state: 'dispatched', pendingJobId: 'job1' });

    // onResult ok with connectionState='pending' → advance nConnect → nWait (nextRunAt = 0+1000)
    h.engine.onResult({ jobId: 'job1', status: 'ok', observed: { connectionState: 'pending' } } as Result);
    const afterConnect = h.enrollments.get(eid)!;
    expect(afterConnect).toMatchObject({ state: 'active', currentNodeId: g.nWait, nextRunAt: 1000 });
    expect(afterConnect.connectionState).toBe('pending');

    // tick(500): wait not elapsed → no dispatch
    h.engine.tick(500);
    expect(h.sent).toHaveLength(1);

    // tick(1000): wait elapsed — connectionState still 'pending', no 'default' on Wait, has 'timeout' → routes to End → done
    h.engine.tick(1000);
    const afterWait = h.enrollments.get(eid)!;
    expect(afterWait.state).toBe('done');
    expect(afterWait.currentNodeId).toBe(g.nEnd);

    // No message was ever dispatched
    expect(h.sent).toHaveLength(1);
    expect(h.sent.every((j) => j.type !== 'message')).toBe(true);
  });

  it('accepted path: connected connectionState after connect → routes to Message → dispatches message', () => {
    const h = harness();
    const g = seedBranching(h);
    const eid = h.enrollments.enroll(g.cid, 'l1', g.nConnect, 0);

    // tick(0): dispatch connect
    h.engine.tick(0);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toMatchObject({ type: 'connect' });

    // onResult ok with connectionState='connected' → advance nConnect → nWait (nextRunAt=1000)
    h.engine.onResult({ jobId: 'job1', status: 'ok', observed: { connectionState: 'connected' } } as Result);
    const afterConnect = h.enrollments.get(eid)!;
    expect(afterConnect).toMatchObject({ state: 'active', currentNodeId: g.nWait, nextRunAt: 1000 });
    expect(afterConnect.connectionState).toBe('connected');

    // tick(500): wait not elapsed
    h.engine.tick(500);
    expect(h.sent).toHaveLength(1);

    // tick(1000): wait elapsed — connectionState='connected', 'accepted' edge available → routes to nMessage
    h.engine.tick(1000);
    const atMessage = h.enrollments.get(eid)!;
    expect(atMessage.state).toBe('active');
    expect(atMessage.currentNodeId).toBe(g.nMessage);

    // tick(1000) again: dispatch message job
    h.engine.tick(1000);
    expect(h.sent).toHaveLength(2);
    expect(h.sent[1]).toMatchObject({ type: 'message', target: 'u1' });

    // onResult ok for message → advances nMessage → nEnd → done
    h.engine.onResult({ jobId: 'job2', status: 'ok' } as Result);
    expect(h.enrollments.get(eid)).toMatchObject({ state: 'done', currentNodeId: g.nEnd });
  });
});
