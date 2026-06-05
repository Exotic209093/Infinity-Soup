# AURA M2 — Outreach Engine Spine + Safety Governor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the brain-side execution spine for AURA outreach: a campaign/node/edge/enrollment data model, a once-a-minute graph-traversal engine that runs a straight-line sequence (seeded as JSON) by dispatching jobs through the existing dispatcher, all gated by a safety governor (hard daily caps + working-hours window + dedupe).

**Architecture:** New Drizzle tables (`account`, `campaign`, `node`, `edge`, `enrollment`, `setting`) + a migration. Three new stores (`CampaignStore`, `EnrollmentStore`, `SettingStore`) and two `JobStore` helpers. A pure-logic `Governor` (`canDispatch → allow | defer | skip`) and an `Engine` (`tick(now)` + `onResult(result)`) that drive enrollments through their campaign graph. The engine dispatches via the **existing** `Dispatcher`/`HandsServer` using the already-working `visit` job — no extension changes and no live-LinkedIn dependency: the whole spine is unit/integration-testable with a fake `sendJob` and synthetic `Result`s. CLIs seed a campaign, enroll leads, run one tick, and print state. A 60s `setInterval` ticker is wired into `index.ts`.

**Tech Stack:** (existing) TypeScript ESM · pnpm workspaces · Fastify · **Drizzle + better-sqlite3** · drizzle-kit migrations · ws · Vitest. No new dependencies.

**Context for the implementer (current `main` after the Leads dashboard merge):**
- `@aura/contract` (`packages/contract/src/index.ts`) already exports `JobTypeSchema` (enum incl. `visit`/`connect`/`message`/`follow`/`endorse`/`scrapeProfile`/`scrapeSearch`), `JobSchema` (`{ id, type, target, payload }`), `ResultSchema` (`{ jobId, status: 'ok'|'failed'|'skipped', data?, observed?, error? }`), and `Job`/`Result`/`JobType` types. **Do not change the contract in this milestone.**
- `apps/brain/src/db/schema.ts` currently defines only `jobs` + `lead`/`lead_experience`/`lead_education`/`lead_skill`/`lead_certification`.
- `apps/brain/src/db/store.ts` = `JobStore`: `create(job, now)`, `markDispatched(id, now)`, `saveResult(result, now)`, `get(id)`. Job rows: `{ id, type, target, payload, status('queued'|'dispatched'|'ok'|'failed'|'skipped'), result, createdAt, dispatchedAt, completedAt }`.
- `apps/brain/src/db/lead-store.ts` = `LeadStore`: `get(id): LeadRow | undefined`, `all(): LeadRow[]`, `getFull(id)`, `upsertProfile(...)`. `LeadRow.profileUrl` is the unique person key and the `Job.target`.
- `apps/brain/src/dispatcher.ts` = `Dispatcher(store, sendJob, now=Date.now)`: `enqueue(job)` (store.create → sendJob → markDispatched if delivered), `handleResult(result)` (store.saveResult). `SendJob = (job) => boolean`, `Now = () => number`.
- `apps/brain/src/ws/server.ts` = `HandsServer`: single hands socket; `sendJob(job): boolean`; constructor opt `onResult?(result)`.
- `apps/brain/src/index.ts` wires `JobStore`, `LeadStore`, `HandsServer` (its `onResult` → `dispatcher.handleResult` + lead-persist), `Dispatcher`, `buildHttp(...)`, static dashboard. HTTP listens on `config.port + 1`; WS on `config.port` (default 51899). `DATA_DIR = '.aura'` (cwd-relative). Migrations run on boot via `migrate(db, { migrationsFolder: <brain>/drizzle })`.
- Migrations: drizzle-kit, config at `apps/brain/drizzle.config.ts` (`schema: ./src/db/schema.ts`, `out: ./drizzle`). Existing `apps/brain/drizzle/0000_init.sql` + `meta/`. Generate with `pnpm --filter @aura/brain db:generate`.
- Test setup pattern (existing, e.g. `apps/brain/src/db/store.test.ts`): create an in-memory DB and apply the schema, then exercise the store. **Follow the existing test's exact DB-bootstrapping pattern** — read `apps/brain/src/db/store.test.ts` and `apps/brain/src/db/lead-store.test.ts` first and mirror how they build a `BetterSQLite3Database` and create tables for tests.
- Existing CLIs to mirror for new ones: `apps/brain/src/enqueue.ts`, `apps/brain/src/list-leads.ts`, `apps/brain/src/export-leads.ts` (all `tsx` scripts run via `package.json` scripts; they open the same `.aura/aura.sqlite`).

**Design decisions locked for this milestone (MVP spine — keep scope tight):**
- **Straight-line sequences only.** Edges carry a `condition` column (`default`/`accepted`/`replied`/`timeout`) for forward-compat, but the engine follows the `default` edge. Real branch evaluation + the visual canvas are **M3** (out of scope here).
- **Governor layers = caps + working-hours + dedupe only** (spec §6 "caps + dedupe + working hours first"). Warm-up ramp, human pacing, and the circuit breaker are **M4** (out of scope).
- **AI personalization is M3.** Action node payloads come straight from `node.config` (e.g. a static `note`/`text`); no Claude calls here.
- **No extension changes.** The demo/verification path uses the `visit` job; connect/message *hands* are a later slice.
- Time handling uses local server time via `new Date(now)`; working-hours is configurable and can be disabled for tests/demo.

---

## File Structure

```
apps/brain/
  src/db/schema.ts                MODIFY: add account, campaign, node, edge, enrollment, setting tables + Row types
  drizzle/0001_*.sql + meta/      CREATE (generated): new migration for the M2 tables
  src/db/store.ts                 MODIFY: add JobStore.countByTypeSince + hasSucceeded
  src/db/store.test.ts            MODIFY: tests for the two new JobStore methods
  src/db/campaign-store.ts        CREATE: CampaignStore (campaign/node/edge CRUD + graph helpers)
  src/db/campaign-store.test.ts   CREATE
  src/db/enrollment-store.ts      CREATE: EnrollmentStore (enroll + state machine transitions)
  src/db/enrollment-store.test.ts CREATE
  src/db/setting-store.ts         CREATE: SettingStore (key/value) + GovernorConfig load
  src/db/setting-store.test.ts    CREATE
  src/engine/governor.ts          CREATE: Governor.canDispatch + time helpers + DEFAULT_GOVERNOR_CONFIG + GovernorDecision
  src/engine/governor.test.ts     CREATE
  src/engine/engine.ts            CREATE: Engine.tick(now) + onResult(result)
  src/engine/engine.test.ts       CREATE (the integration-level engine tests)
  src/engine/payload.ts           CREATE: jobPayload(node) + waitMs(node) + outcomeFor(node,result) (pure helpers)
  src/db/account.ts               CREATE: ensureAccount(db, genId, now) helper (seeds the single v1 account)
  src/campaign-seed.ts            CREATE: CLI — seed a campaign graph from a JSON file
  src/enroll.ts                   CREATE: CLI — enroll leads into a campaign
  src/campaign-tick.ts            CREATE: CLI — run exactly one engine tick now
  src/campaign-status.ts          CREATE: CLI — print campaign + enrollment state
  src/index.ts                    MODIFY: build stores+governor+engine, ensure account, route results to engine, start 60s ticker
  package.json                    MODIFY: add scripts campaign:seed / enroll / campaign:tick / campaign:status
  examples/visit-warmup.json      CREATE: a sample straight-line campaign (Visit → Wait → Visit → End)
```

---

## Task 1: Data model — new tables + migration

**Files:**
- Modify: `apps/brain/src/db/schema.ts`
- Create (generated): `apps/brain/drizzle/0001_*.sql` + `apps/brain/drizzle/meta/*`
- Test: `apps/brain/src/db/schema.test.ts`

- [ ] **Step 1: Add the tables to `schema.ts`**

Append to `apps/brain/src/db/schema.ts` (keep all existing tables):
```ts
export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  liProfileUrl: text('li_profile_url'),
  createdAt: integer('created_at').notNull(),
});
export type AccountRow = typeof account.$inferSelect;

export const campaign = sqliteTable('campaign', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => account.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  status: text('status').notNull().default('draft'), // draft | running | paused | done
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at'),
});
export type CampaignRow = typeof campaign.$inferSelect;

export const node = sqliteTable('node', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull().references(() => campaign.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // visit|connect|message|follow|endorse|wait|condition|end
  config: text('config', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  x: integer('x').notNull().default(0),
  y: integer('y').notNull().default(0),
});
export type NodeRow = typeof node.$inferSelect;

export const edge = sqliteTable('edge', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull().references(() => campaign.id, { onDelete: 'cascade' }),
  fromNodeId: text('from_node_id').notNull().references(() => node.id, { onDelete: 'cascade' }),
  toNodeId: text('to_node_id').notNull().references(() => node.id, { onDelete: 'cascade' }),
  condition: text('condition').notNull().default('default'), // default|accepted|replied|timeout
});
export type EdgeRow = typeof edge.$inferSelect;

export const enrollment = sqliteTable('enrollment', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull().references(() => campaign.id, { onDelete: 'cascade' }),
  leadId: text('lead_id').notNull().references(() => lead.id, { onDelete: 'cascade' }),
  currentNodeId: text('current_node_id'),
  state: text('state').notNull().default('active'), // active|dispatched|paused|done|failed
  connectionState: text('connection_state').notNull().default('none'), // none|pending|connected
  nextRunAt: integer('next_run_at'),
  pendingJobId: text('pending_job_id'),
  attempts: integer('attempts').notNull().default(0),
  repliedAt: integer('replied_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at'),
});
export type EnrollmentRow = typeof enrollment.$inferSelect;

export const setting = sqliteTable('setting', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
export type SettingRow = typeof setting.$inferSelect;
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @aura/brain db:generate`
Expected: drizzle-kit emits a new `apps/brain/drizzle/0001_<word>.sql` containing `CREATE TABLE account/campaign/node/edge/enrollment/setting`, and updates `apps/brain/drizzle/meta/`. (The exact filename suffix is random — that's fine.) Open the generated `.sql` and confirm it creates exactly those six tables and references existing `account`/`campaign`/`node`/`lead` correctly. Do not hand-edit it.

- [ ] **Step 3: Write the schema test**

First read `apps/brain/src/db/store.test.ts` to copy its exact in-memory DB bootstrap (how it constructs a `BetterSQLite3Database` and creates tables — likely it runs the migrations folder or `push`es the schema). Then create `apps/brain/src/db/schema.test.ts` that mirrors that bootstrap and proves the new tables round-trip:
```ts
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { account, campaign, node, edge, enrollment, setting } from './schema.js';

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
    db.insert(node).values({ id: 'n1', campaignId: 'c1', type: 'visit', config: {}, x: 0, y: 0 }).run();
    db.insert(node).values({ id: 'n2', campaignId: 'c1', type: 'end', config: {}, x: 0, y: 0 }).run();
    db.insert(edge).values({ id: 'e1', campaignId: 'c1', fromNodeId: 'n1', toNodeId: 'n2', condition: 'default' }).run();
    db.insert(enrollment).values({ id: 'en1', campaignId: 'c1', leadId: 'l1', currentNodeId: 'n1', state: 'active', connectionState: 'none', nextRunAt: 5, pendingJobId: null, attempts: 0, repliedAt: null, createdAt: 1, updatedAt: 1 }).run();
    db.insert(setting).values({ key: 'k', value: 'v' }).run();
    expect(db.select().from(node).all()).toHaveLength(2);
    expect(db.select().from(enrollment).all()[0].currentNodeId).toBe('n1');
  });
});
```
Note: the enrollment insert uses `leadId: 'l1'` with no matching `lead` row. If the test DB has `foreign_keys = ON`, either insert a `lead` row first (mirror `lead-store.test.ts` for the lead shape) or assert with FKs off. Prefer inserting a real `lead` row so the FK holds — copy the minimal lead insert from `lead-store.test.ts`.

- [ ] **Step 4: Run → pass; commit**

Run: `pnpm --filter @aura/brain test src/db/schema.test.ts` (pass) + `pnpm --filter @aura/brain typecheck` (clean).
```bash
git add apps/brain/src/db/schema.ts apps/brain/src/db/schema.test.ts apps/brain/drizzle
git commit -m "feat(brain): M2 data model — account/campaign/node/edge/enrollment/setting tables + migration"
```

---

## Task 2: `JobStore` cap-counting + dedupe helpers (TDD)

**Files:**
- Modify: `apps/brain/src/db/store.ts`, `apps/brain/src/db/store.test.ts`

- [ ] **Step 1: Add failing tests**

Add to `apps/brain/src/db/store.test.ts` (keep existing tests; mirror its DB bootstrap):
```ts
it('countByTypeSince counts sent (non-queued) jobs of a type at/after a timestamp', () => {
  const store = freshStore(); // however the existing test builds a JobStore
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
it('hasSucceeded is true only after an ok result for that type+target', () => {
  const store = freshStore();
  store.create({ id: 'j1', type: 'visit', target: 'u1', payload: {} }, 1);
  expect(store.hasSucceeded('visit', 'u1')).toBe(false);
  store.saveResult({ jobId: 'j1', status: 'ok' }, 2);
  expect(store.hasSucceeded('visit', 'u1')).toBe(true);
  expect(store.hasSucceeded('visit', 'other')).toBe(false);
  expect(store.hasSucceeded('connect', 'u1')).toBe(false);
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter @aura/brain test src/db/store.test.ts` → FAIL (methods undefined).

- [ ] **Step 3: Implement**

In `apps/brain/src/db/store.ts` add imports `and`, `gte`, `ne`, `count` from `drizzle-orm`, then add methods to `JobStore`:
```ts
  /** Count jobs of a type that were actually sent (status != 'queued') with createdAt >= since. Used for daily caps. */
  countByTypeSince(type: string, since: number): number {
    const row = this.db.select({ n: count() }).from(jobs)
      .where(and(eq(jobs.type, type), gte(jobs.createdAt, since), ne(jobs.status, 'queued'))).get();
    return row?.n ?? 0;
  }

  /** True if a job of (type, target) has an 'ok' result. Used for dedupe ("never act twice on a person"). */
  hasSucceeded(type: string, target: string): boolean {
    return this.db.select({ id: jobs.id }).from(jobs)
      .where(and(eq(jobs.type, type), eq(jobs.target, target), eq(jobs.status, 'ok'))).get() !== undefined;
  }
```

- [ ] **Step 4: Run → pass; commit**

Run: `pnpm --filter @aura/brain test src/db/store.test.ts` (pass) + typecheck.
```bash
git add apps/brain/src/db/store.ts apps/brain/src/db/store.test.ts
git commit -m "feat(brain): JobStore.countByTypeSince + hasSucceeded (caps + dedupe support)"
```

---

## Task 3: `CampaignStore` — graph CRUD + helpers (TDD)

**Files:**
- Create: `apps/brain/src/db/campaign-store.ts`, `apps/brain/src/db/campaign-store.test.ts`

- [ ] **Step 1: Failing test**

`apps/brain/src/db/campaign-store.test.ts` (mirror the in-memory `migrate` bootstrap from Task 1's test):
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { account } from './schema.js';
import { CampaignStore } from './campaign-store.js';

function freshDb(): BetterSQLite3Database {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle') });
  db.insert(account).values({ id: 'a1', name: 'Me', liProfileUrl: null, createdAt: 1 }).run();
  return db;
}

describe('CampaignStore', () => {
  let db: BetterSQLite3Database; let cs: CampaignStore;
  beforeEach(() => { db = freshDb(); cs = new CampaignStore(db); });

  it('creates a campaign + nodes + edges and resolves the graph', () => {
    const cid = cs.createCampaign('a1', 'Warm-up', 'running', 1);
    const n1 = cs.addNode(cid, 'visit', {}, 1);
    const n2 = cs.addNode(cid, 'wait', { waitMs: 60000 }, 1);
    const n3 = cs.addNode(cid, 'end', {}, 1);
    cs.addEdge(cid, n1, n2, 'default', 1);
    cs.addEdge(cid, n2, n3, 'default', 1);

    expect(cs.getCampaign(cid)?.status).toBe('running');
    expect(cs.listNodes(cid)).toHaveLength(3);
    expect(cs.getNode(n1)?.type).toBe('visit');
    expect(cs.outgoingEdge(n1, 'default')?.toNodeId).toBe(n2);
    expect(cs.outgoingEdge(n3, 'default')).toBeUndefined();
    expect(cs.startNode(cid)?.id).toBe(n1); // n1 has no incoming edge
  });

  it('setStatus updates status', () => {
    const cid = cs.createCampaign('a1', 'C', 'draft', 1);
    cs.setStatus(cid, 'running', 2);
    expect(cs.getCampaign(cid)?.status).toBe('running');
  });
});
```

- [ ] **Step 2: Run → fail** (`pnpm --filter @aura/brain test src/db/campaign-store.test.ts`) → no module.

- [ ] **Step 3: Implement**

`apps/brain/src/db/campaign-store.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { campaign, node, edge, type CampaignRow, type NodeRow, type EdgeRow } from './schema.js';

export class CampaignStore {
  constructor(private db: BetterSQLite3Database) {}

  createCampaign(accountId: string, name: string, status: string, now: number): string {
    const id = randomUUID();
    this.db.insert(campaign).values({ id, accountId, name, status, createdAt: now, updatedAt: now }).run();
    return id;
  }
  setStatus(id: string, status: string, now: number): void {
    this.db.update(campaign).set({ status, updatedAt: now }).where(eq(campaign.id, id)).run();
  }
  getCampaign(id: string): CampaignRow | undefined {
    return this.db.select().from(campaign).where(eq(campaign.id, id)).get();
  }

  addNode(campaignId: string, type: string, config: Record<string, unknown>, now: number, x = 0, y = 0): string {
    const id = randomUUID();
    this.db.insert(node).values({ id, campaignId, type, config, x, y }).run();
    return id;
  }
  addEdge(campaignId: string, fromNodeId: string, toNodeId: string, condition: string, now: number): string {
    const id = randomUUID();
    this.db.insert(edge).values({ id, campaignId, fromNodeId, toNodeId, condition }).run();
    return id;
  }

  getNode(id: string): NodeRow | undefined {
    return this.db.select().from(node).where(eq(node.id, id)).get();
  }
  listNodes(campaignId: string): NodeRow[] {
    return this.db.select().from(node).where(eq(node.campaignId, campaignId)).all();
  }
  listEdges(campaignId: string): EdgeRow[] {
    return this.db.select().from(edge).where(eq(edge.campaignId, campaignId)).all();
  }

  /** The outgoing edge matching `condition`, falling back to a 'default' edge. */
  outgoingEdge(nodeId: string, condition: string): EdgeRow | undefined {
    return this.db.select().from(edge).where(and(eq(edge.fromNodeId, nodeId), eq(edge.condition, condition))).get()
      ?? this.db.select().from(edge).where(and(eq(edge.fromNodeId, nodeId), eq(edge.condition, 'default'))).get();
  }

  /** The start node = a node in the campaign with no incoming edge. */
  startNode(campaignId: string): NodeRow | undefined {
    const nodes = this.listNodes(campaignId);
    const targets = new Set(this.listEdges(campaignId).map((e) => e.toNodeId));
    return nodes.find((n) => !targets.has(n.id));
  }
}
```
Note `addNode`/`addEdge` take `now` for signature symmetry even though `node`/`edge` have no timestamp columns — keep it (callers pass `now`); do not add timestamp columns.

- [ ] **Step 4: Run → pass; commit**
```bash
git add apps/brain/src/db/campaign-store.ts apps/brain/src/db/campaign-store.test.ts
git commit -m "feat(brain): CampaignStore — campaign/node/edge CRUD + graph helpers"
```

---

## Task 4: `EnrollmentStore` — state machine transitions (TDD)

**Files:**
- Create: `apps/brain/src/db/enrollment-store.ts`, `apps/brain/src/db/enrollment-store.test.ts`

- [ ] **Step 1: Failing test**

`apps/brain/src/db/enrollment-store.test.ts` (mirror the bootstrap; seed `account` + a `campaign` (status running) + a `lead` + a couple of `node`s so FKs hold):
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
    expect(es.due(150).map((x) => x.id)).toEqual([id]);   // due at/after nextRunAt
    expect(es.due(50)).toHaveLength(0);                    // not yet due
  });

  it('due excludes paused campaigns and dispatched/finished enrollments', () => {
    const id = es.enroll('c1', 'l1', 'n1', 100);
    es.markDispatched(id, 'job1', 120);
    expect(es.get(id)).toMatchObject({ state: 'dispatched', pendingJobId: 'job1', nextRunAt: null });
    expect(es.due(200)).toHaveLength(0);                  // dispatched is not due
    expect(es.findByPendingJob('job1')?.id).toBe(id);
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
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement**

`apps/brain/src/db/enrollment-store.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { and, eq, isNotNull, lte } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { enrollment, campaign, type EnrollmentRow } from './schema.js';

export class EnrollmentStore {
  constructor(private db: BetterSQLite3Database) {}

  enroll(campaignId: string, leadId: string, startNodeId: string, now: number): string {
    const id = randomUUID();
    this.db.insert(enrollment).values({
      id, campaignId, leadId, currentNodeId: startNodeId, state: 'active', connectionState: 'none',
      nextRunAt: now, pendingJobId: null, attempts: 0, repliedAt: null, createdAt: now, updatedAt: now,
    }).run();
    return id;
  }

  get(id: string): EnrollmentRow | undefined {
    return this.db.select().from(enrollment).where(eq(enrollment.id, id)).get();
  }

  /** Active, due (nextRunAt <= now) enrollments whose campaign is running. */
  due(now: number): EnrollmentRow[] {
    return this.db.select({ e: enrollment }).from(enrollment)
      .innerJoin(campaign, eq(enrollment.campaignId, campaign.id))
      .where(and(
        eq(enrollment.state, 'active'),
        eq(campaign.status, 'running'),
        isNotNull(enrollment.nextRunAt),
        lte(enrollment.nextRunAt, now),
      )).all().map((r) => r.e);
  }

  findByPendingJob(jobId: string): EnrollmentRow | undefined {
    return this.db.select().from(enrollment).where(eq(enrollment.pendingJobId, jobId)).get();
  }

  markDispatched(id: string, jobId: string, now: number): void {
    this.set(id, { state: 'dispatched', pendingJobId: jobId, nextRunAt: null }, now);
  }
  clearPending(id: string, now: number): void {
    this.set(id, { pendingJobId: null }, now);
  }
  /** Advance to a node, active and scheduled. Clears any pending job + resets attempts. */
  moveTo(id: string, nodeId: string, nextRunAt: number, now: number): void {
    this.set(id, { state: 'active', currentNodeId: nodeId, nextRunAt, pendingJobId: null, attempts: 0 }, now);
  }
  /** Keep the same node, just push nextRunAt out (governor defer). Stays active. */
  reschedule(id: string, nextRunAt: number, now: number): void {
    this.set(id, { state: 'active', nextRunAt }, now);
  }
  /** Retry same node after a failure: bump attempts, reschedule, clear pending. */
  retry(id: string, attempts: number, nextRunAt: number, now: number): void {
    this.set(id, { state: 'active', attempts, nextRunAt, pendingJobId: null }, now);
  }
  setConnectionState(id: string, connectionState: string, now: number): void {
    this.set(id, { connectionState }, now);
  }
  markReplied(id: string, now: number): void {
    this.set(id, { repliedAt: now }, now);
  }
  finish(id: string, state: 'done' | 'failed', now: number): void {
    this.set(id, { state, nextRunAt: null, pendingJobId: null }, now);
  }

  private set(id: string, patch: Partial<EnrollmentRow>, now: number): void {
    this.db.update(enrollment).set({ ...patch, updatedAt: now }).where(eq(enrollment.id, id)).run();
  }
}
```

- [ ] **Step 4: Run → pass; commit**
```bash
git add apps/brain/src/db/enrollment-store.ts apps/brain/src/db/enrollment-store.test.ts
git commit -m "feat(brain): EnrollmentStore — enroll + due query + state-machine transitions"
```

---

## Task 5: `SettingStore` + `GovernorConfig` (TDD)

**Files:**
- Create: `apps/brain/src/db/setting-store.ts`, `apps/brain/src/db/setting-store.test.ts`

- [ ] **Step 1: Failing test**

`apps/brain/src/db/setting-store.test.ts` (mirror bootstrap; no FK deps for `setting`):
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SettingStore } from './setting-store.js';
import { loadGovernorConfig, DEFAULT_GOVERNOR_CONFIG } from '../engine/governor.js';

function freshDb(): BetterSQLite3Database {
  const sqlite = new Database(':memory:'); sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle') });
  return db;
}

describe('SettingStore', () => {
  let db: BetterSQLite3Database; let ss: SettingStore;
  beforeEach(() => { db = freshDb(); ss = new SettingStore(db); });

  it('get/set round-trips and upserts', () => {
    expect(ss.get('x')).toBeUndefined();
    ss.set('x', 'one'); expect(ss.get('x')).toBe('one');
    ss.set('x', 'two'); expect(ss.get('x')).toBe('two'); // upsert, not duplicate
  });

  it('loadGovernorConfig returns defaults when unset, override when set', () => {
    expect(loadGovernorConfig(ss)).toEqual(DEFAULT_GOVERNOR_CONFIG);
    ss.set('governor', JSON.stringify({ caps: { visit: 2 }, workingHours: { enabled: false, startHour: 0, endHour: 24, days: [0,1,2,3,4,5,6] } }));
    const cfg = loadGovernorConfig(ss);
    expect(cfg.caps.visit).toBe(2);
    expect(cfg.workingHours.enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run → fail** (no `setting-store.js`; `loadGovernorConfig` also comes in Task 6 — this test will fail to import until both exist. Implement `SettingStore` here; `loadGovernorConfig`/`DEFAULT_GOVERNOR_CONFIG` are added in Task 6. To keep this task self-contained, **define `loadGovernorConfig` + `DEFAULT_GOVERNOR_CONFIG` in Task 6's `governor.ts` and run this test at the end of Task 6.** For Task 5, write only the `SettingStore` portion of the test and implementation, then expand in Task 6.)

For Task 5, the test is just:
```ts
it('get/set round-trips and upserts', () => {
  expect(ss.get('x')).toBeUndefined();
  ss.set('x', 'one'); expect(ss.get('x')).toBe('one');
  ss.set('x', 'two'); expect(ss.get('x')).toBe('two');
});
```
(Drop the `loadGovernorConfig` import/test from Task 5; add it in Task 6.)

- [ ] **Step 3: Implement**

`apps/brain/src/db/setting-store.ts`:
```ts
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { setting } from './schema.js';

export class SettingStore {
  constructor(private db: BetterSQLite3Database) {}

  get(key: string): string | undefined {
    return this.db.select().from(setting).where(eq(setting.key, key)).get()?.value;
  }
  set(key: string, value: string): void {
    this.db.insert(setting).values({ key, value })
      .onConflictDoUpdate({ target: setting.key, set: { value } }).run();
  }
}
```

- [ ] **Step 4: Run → pass; commit**
```bash
git add apps/brain/src/db/setting-store.ts apps/brain/src/db/setting-store.test.ts
git commit -m "feat(brain): SettingStore — key/value tunables (upsert)"
```

---

## Task 6: `Governor` — caps + working-hours + dedupe (TDD)

**Files:**
- Create: `apps/brain/src/engine/governor.ts`, `apps/brain/src/engine/governor.test.ts`
- Modify: `apps/brain/src/db/setting-store.test.ts` (add the `loadGovernorConfig` test deferred from Task 5)

- [ ] **Step 1: Failing test**

`apps/brain/src/engine/governor.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Governor, DEFAULT_GOVERNOR_CONFIG, type GovernorConfig } from './governor.js';

// A minimal in-memory fake of the JobStore surface the Governor needs.
class FakeJobs {
  succeeded = new Set<string>();   // `${type} ${target}`
  counts: Record<string, number> = {};
  hasSucceeded(type: string, target: string) { return this.succeeded.has(`${type} ${target}`); }
  countByTypeSince(type: string, _since: number) { return this.counts[type] ?? 0; }
}

// 2026-06-08 is a Monday. 10:00 local within an 8-18 Mon-Fri window.
const monday10 = new Date(2026, 5, 8, 10, 0, 0).getTime();
const monday2am = new Date(2026, 5, 8, 2, 0, 0).getTime();
const saturday10 = new Date(2026, 5, 13, 10, 0, 0).getTime();

function gov(cfg: GovernorConfig = DEFAULT_GOVERNOR_CONFIG, jobs = new FakeJobs()) {
  return { g: new Governor(jobs as any, cfg), jobs };
}

describe('Governor', () => {
  it('allows when in-hours, under cap, not deduped', () => {
    const { g } = gov();
    expect(g.canDispatch('visit', 'u1', monday10)).toEqual({ kind: 'allow' });
  });

  it('skips when already acted (dedupe)', () => {
    const { g, jobs } = gov();
    jobs.succeeded.add(`visit u1`);
    expect(g.canDispatch('visit', 'u1', monday10)).toMatchObject({ kind: 'skip' });
  });

  it('defers outside working hours to the next window open', () => {
    const { g } = gov();
    const d = g.canDispatch('visit', 'u1', monday2am);
    expect(d.kind).toBe('defer');
    if (d.kind === 'defer') expect(new Date(d.nextEligibleAt).getHours()).toBe(8); // 8am same day
  });

  it('defers on weekend to Monday 8am', () => {
    const { g } = gov();
    const d = g.canDispatch('visit', 'u1', saturday10);
    expect(d.kind).toBe('defer');
    if (d.kind === 'defer') { const dt = new Date(d.nextEligibleAt); expect(dt.getDay()).toBe(1); expect(dt.getHours()).toBe(8); }
  });

  it('defers when the daily cap is reached', () => {
    const jobs = new FakeJobs(); jobs.counts.visit = DEFAULT_GOVERNOR_CONFIG.caps.visit;
    const { g } = gov(DEFAULT_GOVERNOR_CONFIG, jobs);
    expect(g.canDispatch('visit', 'u1', monday10).kind).toBe('defer');
  });

  it('honours disabled working hours', () => {
    const cfg: GovernorConfig = { ...DEFAULT_GOVERNOR_CONFIG, workingHours: { ...DEFAULT_GOVERNOR_CONFIG.workingHours, enabled: false } };
    const { g } = gov(cfg);
    expect(g.canDispatch('visit', 'u1', saturday10)).toEqual({ kind: 'allow' });
  });
});
```
Also add to `apps/brain/src/db/setting-store.test.ts` the deferred test:
```ts
import { loadGovernorConfig, DEFAULT_GOVERNOR_CONFIG } from '../engine/governor.js';
// ...
it('loadGovernorConfig: defaults when unset, override when set', () => {
  expect(loadGovernorConfig(ss)).toEqual(DEFAULT_GOVERNOR_CONFIG);
  ss.set('governor', JSON.stringify({ caps: { visit: 2 } }));
  expect(loadGovernorConfig(ss).caps.visit).toBe(2);
  expect(loadGovernorConfig(ss).caps.connect).toBe(DEFAULT_GOVERNOR_CONFIG.caps.connect); // merged, not replaced
});
```

- [ ] **Step 2: Run → fail** (`pnpm --filter @aura/brain test src/engine/governor.test.ts src/db/setting-store.test.ts`).

- [ ] **Step 3: Implement**

`apps/brain/src/engine/governor.ts`:
```ts
import type { SettingStore } from '../db/setting-store.js';

export interface WorkingHours { enabled: boolean; startHour: number; endHour: number; days: number[]; } // days: 0=Sun..6=Sat
export interface GovernorConfig { caps: Record<string, number>; workingHours: WorkingHours; }

export const DEFAULT_GOVERNOR_CONFIG: GovernorConfig = {
  caps: { connect: 20, message: 40, visit: 60, follow: 15, endorse: 15 },
  workingHours: { enabled: true, startHour: 8, endHour: 18, days: [1, 2, 3, 4, 5] },
};

/** Load config from the `governor` setting JSON, deep-merging over defaults (so partial overrides keep the rest). */
export function loadGovernorConfig(settings: SettingStore): GovernorConfig {
  const raw = settings.get('governor');
  if (!raw) return DEFAULT_GOVERNOR_CONFIG;
  let parsed: Partial<GovernorConfig> = {};
  try { parsed = JSON.parse(raw); } catch { return DEFAULT_GOVERNOR_CONFIG; }
  return {
    caps: { ...DEFAULT_GOVERNOR_CONFIG.caps, ...(parsed.caps ?? {}) },
    workingHours: { ...DEFAULT_GOVERNOR_CONFIG.workingHours, ...(parsed.workingHours ?? {}) },
  };
}

export type GovernorDecision =
  | { kind: 'allow' }
  | { kind: 'defer'; nextEligibleAt: number; reason: string }
  | { kind: 'skip'; reason: string };

interface JobCounts {
  hasSucceeded(type: string, target: string): boolean;
  countByTypeSince(type: string, since: number): number;
}

export class Governor {
  constructor(private jobs: JobCounts, private config: GovernorConfig) {}

  canDispatch(action: string, target: string, now: number): GovernorDecision {
    // 1. Dedupe — never act twice on a person for the same action.
    if (this.jobs.hasSucceeded(action, target)) return { kind: 'skip', reason: 'already acted' };

    // 2. Working hours — defer to the next open window.
    const wh = this.config.workingHours;
    if (wh.enabled && !withinHours(now, wh)) {
      return { kind: 'defer', nextEligibleAt: nextWindowOpen(now, wh), reason: 'outside working hours' };
    }

    // 3. Daily cap — defer to the next day's window open.
    const cap = this.config.caps[action] ?? Infinity;
    const used = this.jobs.countByTypeSince(action, startOfDay(now));
    if (used >= cap) {
      const tomorrow = startOfDay(now) + 24 * 60 * 60 * 1000;
      return { kind: 'defer', nextEligibleAt: nextWindowOpen(tomorrow, wh), reason: 'daily cap reached' };
    }

    return { kind: 'allow' };
  }
}

// ── time helpers (local server time) ──
export function startOfDay(now: number): number {
  const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime();
}
export function withinHours(now: number, wh: WorkingHours): boolean {
  const d = new Date(now);
  return wh.days.includes(d.getDay()) && d.getHours() >= wh.startHour && d.getHours() < wh.endHour;
}
/** The next instant at/after `now` that falls inside the working-hours window. */
export function nextWindowOpen(now: number, wh: WorkingHours): number {
  const d = new Date(now);
  for (let i = 0; i < 14; i++) {
    const open = new Date(d); open.setHours(wh.startHour, 0, 0, 0);
    if (wh.days.includes(d.getDay())) {
      if (d.getTime() <= open.getTime()) return open.getTime();           // before today's open → today 8am
      if (d.getHours() < wh.endHour) return Math.max(d.getTime(), open.getTime()); // inside window → now
    }
    d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0);                    // try next day at 00:00
  }
  return now; // safety fallback (shouldn't happen with any working days configured)
}
```

- [ ] **Step 4: Run → pass; commit**

Run: `pnpm --filter @aura/brain test src/engine/governor.test.ts src/db/setting-store.test.ts` (all pass) + typecheck.
```bash
git add apps/brain/src/engine/governor.ts apps/brain/src/engine/governor.test.ts apps/brain/src/db/setting-store.test.ts
git commit -m "feat(brain): Governor — dedupe + working-hours + daily-cap gating (allow/defer/skip)"
```

---

## Task 7: `Engine` — tick + onResult graph traversal (TDD)

**Files:**
- Create: `apps/brain/src/engine/payload.ts`, `apps/brain/src/engine/engine.ts`, `apps/brain/src/engine/engine.test.ts`

- [ ] **Step 1: Pure helpers `payload.ts`**
```ts
import type { Job, JobType, Result } from '@aura/contract';
import type { NodeRow } from '../db/schema.js';

const ACTION_TYPES = new Set<JobType>(['visit', 'connect', 'message', 'follow', 'endorse']);
export const isActionNode = (type: string): type is JobType => ACTION_TYPES.has(type as JobType);

export function waitMs(node: NodeRow): number {
  const v = (node.config as Record<string, unknown>)?.waitMs;
  return typeof v === 'number' && v >= 0 ? v : 0;
}

/** Build a Job payload from an action node's config. AI rendering is M3 — static config for now. */
export function jobPayload(node: NodeRow): Record<string, unknown> {
  const c = (node.config ?? {}) as Record<string, unknown>;
  if (node.type === 'connect') return c.note ? { note: c.note } : {};
  if (node.type === 'message') return c.text ? { text: c.text } : {};
  return {};
}

/** Which outgoing-edge condition to follow given a Result. MVP: always 'default' (branching is M3). */
export function outcomeFor(_node: NodeRow, _result: Result): string {
  return 'default';
}
```

- [ ] **Step 2: Failing engine test**

`apps/brain/src/engine/engine.test.ts` — drives the engine over an in-memory DB with a fake `sendJob`, asserting the full lifecycle. Build the campaign with `CampaignStore`, enroll with `EnrollmentStore`, and inject a `Governor` over the real `JobStore`. Use a **wide-open** governor config (working hours disabled) so tests are time-independent, and a fixed `now`.
```ts
import { describe, it, expect, beforeEach } from 'vitest';
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
const OPEN: GovernorConfig = { caps: { ...DEFAULT_GOVERNOR_CONFIG.caps }, workingHours: { enabled: false, startHour: 0, endHour: 24, days: [0,1,2,3,4,5,6] } };

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
    // advanced to n2 (wait), scheduled 1000ms out, not yet due at now=0
    expect(h.enrollments.get(eid)).toMatchObject({ state: 'active', currentNodeId: g.n2, nextRunAt: 1000 });
    h.engine.tick(0); expect(h.sent).toHaveLength(1); // wait not elapsed
  });

  it('full run: two visits then End', () => {
    const h = harness(); const g = seedLinear(h);
    const eid = h.enrollments.enroll(g.cid, 'l1', g.n1, 0);
    h.engine.tick(0);                                   // dispatch visit #1
    h.engine.onResult({ jobId: 'job1', status: 'ok' }); // → wait n2 @1000
    h.engine.tick(1000);                                // wait elapses → advance to n3 (visit), nextRunAt now
    h.engine.tick(1000);                                // n3 is an action → dispatch visit #2
    expect(h.sent).toHaveLength(2);
    h.engine.onResult({ jobId: 'job2', status: 'ok' }); // → n4 end → done
    expect(h.enrollments.get(eid)).toMatchObject({ state: 'done', currentNodeId: g.n4 });
  });

  it('governor defer reschedules without dispatching', () => {
    const capped: GovernorConfig = { caps: { ...OPEN.caps, visit: 0 }, workingHours: OPEN.workingHours };
    const h = harness(capped); const g = seedLinear(h);
    const eid = h.enrollments.enroll(g.cid, 'l1', g.n1, 0);
    h.engine.tick(0);
    expect(h.sent).toHaveLength(0);
    const e = h.enrollments.get(eid)!;
    expect(e.state).toBe('active'); expect(e.nextRunAt!).toBeGreaterThan(0); // deferred to tomorrow's window
  });

  it('governor skip (already acted) advances without dispatching', () => {
    const h = harness();
    // pre-seed a successful visit on u1 so dedupe trips
    h.jobsStore.create({ id: 'old', type: 'visit', target: 'u1', payload: {} }, 0);
    h.jobsStore.saveResult({ jobId: 'old', status: 'ok' }, 0);
    const g = seedLinear(h);
    const eid = h.enrollments.enroll(g.cid, 'l1', g.n1, 0);
    h.engine.tick(0);
    expect(h.sent).toHaveLength(0);                                 // skipped, not dispatched
    expect(h.enrollments.get(eid)).toMatchObject({ currentNodeId: g.n2 }); // advanced past the visit
  });

  it('failed Result retries up to 3 attempts then fails', () => {
    const h = harness(); const g = seedLinear(h);
    const eid = h.enrollments.enroll(g.cid, 'l1', g.n1, 0);
    // Each failure: engine bumps attempts + reschedules nextRunAt = engineNow(=0) + 5min = 300000,
    // and clears pendingJobId. So a NEW job is dispatched only when we tick AT/after 300000.
    h.engine.tick(0);                                       // dispatch job1
    h.engine.onResult({ jobId: 'job1', status: 'failed' }); // attempts=1, retry @300000
    h.engine.tick(300000);                                  // due → dispatch job2 (same node)
    h.engine.onResult({ jobId: 'job2', status: 'failed' }); // attempts=2, retry @300000
    h.engine.tick(300000);                                  // due → dispatch job3
    h.engine.onResult({ jobId: 'job3', status: 'failed' }); // attempts=3 == MAX → failed
    expect(h.sent).toHaveLength(3);
    expect(h.enrollments.get(eid)!.state).toBe('failed');
    expect(h.enrollments.get(eid)!.currentNodeId).toBe(g.n1); // never advanced past the failing node
  });
});
```
> Why the clock advances: `retry` sets `nextRunAt = engineNow + RETRY_BACKOFF_MS`. The harness pins the engine's internal `now` to `() => 0`, so every retry schedules `nextRunAt = 300000`. `tick(300000)` then finds it due and re-dispatches a fresh job at the same node (`job2`, `job3` from the harness's sequential `genId`). The `visit` cap (60) and disabled working-hours keep the governor allowing each attempt; the failed jobs never set `hasSucceeded`, so dedupe never trips. After the 3rd failure, `attempts (3) >= MAX_ATTEMPTS (3)` → `finish('failed')`.

- [ ] **Step 3: Run → fail.**

- [ ] **Step 4: Implement the engine**

`apps/brain/src/engine/engine.ts`:
```ts
import type { Job, JobType, Result } from '@aura/contract';
import type { CampaignStore } from '../db/campaign-store.js';
import type { EnrollmentStore } from '../db/enrollment-store.js';
import type { LeadStore } from '../db/lead-store.js';
import type { Dispatcher } from '../dispatcher.js';
import type { EnrollmentRow, NodeRow } from '../db/schema.js';
import type { Governor } from './governor.js';
import { isActionNode, jobPayload, outcomeFor, waitMs } from './payload.js';

type Now = () => number;
const RETRY_BACKOFF_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;

export class Engine {
  constructor(
    private campaigns: CampaignStore,
    private enrollments: EnrollmentStore,
    private leads: LeadStore,
    private governor: Governor,
    private dispatcher: Dispatcher,
    private genId: () => string,
    private now: Now = Date.now,
  ) {}

  /** Run all due enrollments once. Called by the 60s ticker and by the campaign:tick CLI. */
  tick(now = this.now()): void {
    for (const e of this.enrollments.due(now)) this.run(e, now);
  }

  private run(e: EnrollmentRow, now: number): void {
    if (!e.currentNodeId) return this.enrollments.finish(e.id, 'failed', now);
    const node = this.campaigns.getNode(e.currentNodeId);
    if (!node) return this.enrollments.finish(e.id, 'failed', now);

    if (node.type === 'end') return this.enrollments.finish(e.id, 'done', now);
    if (node.type === 'wait' || node.type === 'condition') return this.advance(e, node, 'default', now);

    if (!isActionNode(node.type)) return this.enrollments.finish(e.id, 'failed', now);

    const lead = this.leads.get(e.leadId);
    if (!lead) return this.enrollments.finish(e.id, 'failed', now);

    const decision = this.governor.canDispatch(node.type, lead.profileUrl, now);
    if (decision.kind === 'skip') return this.advance(e, node, 'default', now);
    if (decision.kind === 'defer') return this.enrollments.reschedule(e.id, decision.nextEligibleAt, now);

    const job: Job = { id: this.genId(), type: node.type as JobType, target: lead.profileUrl, payload: jobPayload(node) };
    this.enrollments.markDispatched(e.id, job.id, now);
    this.dispatcher.enqueue(job);
  }

  /** Hands Result for a dispatched enrollment. */
  onResult(result: Result): void {
    const now = this.now();
    const e = this.enrollments.findByPendingJob(result.jobId);
    if (!e || !e.currentNodeId) return;
    const node = this.campaigns.getNode(e.currentNodeId);
    if (!node) return;

    const cs = result.observed?.connectionState;
    if (typeof cs === 'string') this.enrollments.setConnectionState(e.id, cs, now);

    if (result.status === 'ok') {
      this.enrollments.clearPending(e.id, now);
      this.advance(e, node, outcomeFor(node, result), now);
      return;
    }
    // failed / skipped → retry a few times, then fail.
    const attempts = e.attempts + 1;
    if (attempts < MAX_ATTEMPTS) this.enrollments.retry(e.id, attempts, now + RETRY_BACKOFF_MS, now);
    else this.enrollments.finish(e.id, 'failed', now);
  }

  /** Follow the outgoing edge for `condition` and schedule the next node. */
  private advance(e: EnrollmentRow, node: NodeRow, condition: string, now: number): void {
    const edge = this.campaigns.outgoingEdge(node.id, condition);
    if (!edge) return this.enrollments.finish(e.id, 'done', now); // terminal node with no edge
    const next = this.campaigns.getNode(edge.toNodeId);
    if (!next) return this.enrollments.finish(e.id, 'failed', now);
    if (next.type === 'end') { this.enrollments.moveTo(e.id, next.id, now, now); return this.enrollments.finish(e.id, 'done', now); }
    const nextRunAt = next.type === 'wait' ? now + waitMs(next) : now;
    this.enrollments.moveTo(e.id, next.id, nextRunAt, now);
  }
}
```
> The `advance`-into-`end` case sets `currentNodeId = end` then immediately finishes `done` (so `currentNodeId` reflects the end node for inspection, matching the "two visits then End" test which asserts `currentNodeId: g.n4` + `state: 'done'`).

- [ ] **Step 5: Run → pass; commit**

Run: `pnpm --filter @aura/brain test src/engine/engine.test.ts` (all pass) + typecheck.
```bash
git add apps/brain/src/engine/payload.ts apps/brain/src/engine/engine.ts apps/brain/src/engine/engine.test.ts
git commit -m "feat(brain): Engine — graph-traversal tick + onResult (governor-gated dispatch)"
```

---

## Task 8: Account helper + seed/enroll/tick/status CLIs

**Files:**
- Create: `apps/brain/src/db/account.ts`, `apps/brain/src/campaign-seed.ts`, `apps/brain/src/enroll.ts`, `apps/brain/src/campaign-tick.ts`, `apps/brain/src/campaign-status.ts`, `apps/brain/examples/visit-warmup.json`
- Modify: `apps/brain/package.json` (scripts)
- Test: `apps/brain/src/db/account.test.ts`

- [ ] **Step 1: `ensureAccount` (TDD)**

`apps/brain/src/db/account.ts`:
```ts
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
```
`apps/brain/src/db/account.test.ts`:
```ts
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
```
Run that test → pass.

- [ ] **Step 2: Sample campaign JSON**

`apps/brain/examples/visit-warmup.json`:
```json
{
  "name": "Visit warm-up",
  "nodes": [
    { "key": "v1", "type": "visit", "config": {} },
    { "key": "w1", "type": "wait", "config": { "waitMs": 60000 } },
    { "key": "v2", "type": "visit", "config": {} },
    { "key": "end", "type": "end", "config": {} }
  ],
  "edges": [
    { "from": "v1", "to": "w1" },
    { "from": "w1", "to": "v2" },
    { "from": "v2", "to": "end" }
  ]
}
```

- [ ] **Step 3: CLIs**

Mirror the existing `apps/brain/src/list-leads.ts` for DB bootstrapping (open `.aura/aura.sqlite`, `drizzle()`, `migrate()`). Each CLI is a standalone `tsx` script.

`apps/brain/src/campaign-seed.ts`:
```ts
import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CampaignStore } from './db/campaign-store.js';
import { ensureAccount } from './db/account.js';

const file = process.argv[2];
if (!file) { console.error('usage: pnpm --filter @aura/brain campaign:seed <campaign.json>'); process.exit(1); }

const sqlite = new Database(join('.aura', 'aura.sqlite')); sqlite.pragma('foreign_keys = ON');
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle') });

const now = Date.now();
const account = ensureAccount(db, now);
const spec = JSON.parse(readFileSync(file, 'utf8')) as {
  name: string; nodes: { key: string; type: string; config?: Record<string, unknown> }[];
  edges: { from: string; to: string; condition?: string }[];
};
const cs = new CampaignStore(db);
const cid = cs.createCampaign(account.id, spec.name, 'running', now);
const byKey = new Map<string, string>();
for (const n of spec.nodes) byKey.set(n.key, cs.addNode(cid, n.type, n.config ?? {}, now));
for (const e of spec.edges) cs.addEdge(cid, byKey.get(e.from)!, byKey.get(e.to)!, e.condition ?? 'default', now);
console.log(`campaign ${cid} "${spec.name}" seeded: ${spec.nodes.length} nodes, ${spec.edges.length} edges (status=running)`);
```

`apps/brain/src/enroll.ts`:
```ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CampaignStore } from './db/campaign-store.js';
import { EnrollmentStore } from './db/enrollment-store.js';
import { LeadStore } from './db/lead-store.js';

const campaignId = process.argv[2];
const leadArgs = process.argv.slice(3);
if (!campaignId) { console.error('usage: pnpm --filter @aura/brain enroll <campaignId> [leadId...]  (no leadIds = all leads)'); process.exit(1); }

const sqlite = new Database(join('.aura', 'aura.sqlite')); sqlite.pragma('foreign_keys = ON');
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle') });

const cs = new CampaignStore(db); const es = new EnrollmentStore(db); const ls = new LeadStore(db);
const start = cs.startNode(campaignId);
if (!start) { console.error('no start node — is the campaignId correct + does it have nodes?'); process.exit(1); }
const leadIds = leadArgs.length ? leadArgs : ls.all().map((l) => l.id);
const now = Date.now();
for (const id of leadIds) { es.enroll(campaignId, id, start.id, now); }
console.log(`enrolled ${leadIds.length} lead(s) into ${campaignId} at start node ${start.id} (${start.type})`);
```

`apps/brain/src/campaign-tick.ts`:
```ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JobStore } from './db/store.js';
import { LeadStore } from './db/lead-store.js';
import { CampaignStore } from './db/campaign-store.js';
import { EnrollmentStore } from './db/enrollment-store.js';
import { SettingStore } from './db/setting-store.js';
import { Dispatcher } from './dispatcher.js';
import { Governor, loadGovernorConfig } from './engine/governor.js';
import { Engine } from './engine/engine.js';
import { randomUUID } from 'node:crypto';

const sqlite = new Database(join('.aura', 'aura.sqlite')); sqlite.pragma('foreign_keys = ON');
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle') });

const jobs = new JobStore(db);
const engine = new Engine(
  new CampaignStore(db), new EnrollmentStore(db), new LeadStore(db),
  new Governor(jobs, loadGovernorConfig(new SettingStore(db))),
  // CLI tick has no live hands → sendJob returns false; jobs persist as 'queued' for inspection.
  new Dispatcher(jobs, () => false),
  () => randomUUID(),
);
engine.tick(Date.now());
console.log('tick complete.');
```
> The CLI tick uses `sendJob: () => false`, so dispatched jobs persist as `queued` (no hands attached). That's fine for inspecting that the engine + governor produced the right jobs; the *running brain* (Task 9) wires the real hands.

`apps/brain/src/campaign-status.ts`:
```ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CampaignStore } from './db/campaign-store.js';
import { enrollment } from './db/schema.js';
import { eq } from 'drizzle-orm';

const campaignId = process.argv[2];
if (!campaignId) { console.error('usage: pnpm --filter @aura/brain campaign:status <campaignId>'); process.exit(1); }

const sqlite = new Database(join('.aura', 'aura.sqlite')); sqlite.pragma('foreign_keys = ON');
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle') });

const cs = new CampaignStore(db);
const c = cs.getCampaign(campaignId);
if (!c) { console.error('no such campaign'); process.exit(1); }
console.log(`campaign ${c.id} "${c.name}" status=${c.status} nodes=${cs.listNodes(campaignId).length}`);
const rows = db.select().from(enrollment).where(eq(enrollment.campaignId, campaignId)).all();
for (const e of rows) {
  const node = e.currentNodeId ? cs.getNode(e.currentNodeId) : undefined;
  console.log(`  enrollment ${e.id.slice(0, 8)} lead=${e.leadId.slice(0, 8)} state=${e.state} node=${node?.type ?? '-'} nextRunAt=${e.nextRunAt ?? '-'} attempts=${e.attempts}`);
}
```

- [ ] **Step 4: Add package scripts**

In `apps/brain/package.json` `scripts`, add:
```json
    "campaign:seed": "tsx src/campaign-seed.ts",
    "enroll": "tsx src/enroll.ts",
    "campaign:tick": "tsx src/campaign-tick.ts",
    "campaign:status": "tsx src/campaign-status.ts"
```

- [ ] **Step 5: Run account test + typecheck; commit**

Run: `pnpm --filter @aura/brain test src/db/account.test.ts` (pass) + `pnpm --filter @aura/brain typecheck` (clean).
```bash
git add apps/brain/src/db/account.ts apps/brain/src/db/account.test.ts apps/brain/src/campaign-seed.ts apps/brain/src/enroll.ts apps/brain/src/campaign-tick.ts apps/brain/src/campaign-status.ts apps/brain/examples/visit-warmup.json apps/brain/package.json
git commit -m "feat(brain): account helper + campaign seed/enroll/tick/status CLIs"
```

---

## Task 9: Wire the engine + 60s ticker into `index.ts`

**Files:**
- Modify: `apps/brain/src/index.ts`

- [ ] **Step 1: Construct stores + governor + engine; ensure account; route results; start ticker**

In `apps/brain/src/index.ts`, after the existing `leadStore` construction and before/around the `HandsServer` wiring, add the imports and construction. The key changes:
1. Import: `CampaignStore`, `EnrollmentStore`, `SettingStore`, `ensureAccount`, `Governor`, `loadGovernorConfig`, `Engine`.
2. Construct `campaignStore`, `enrollmentStore`, `settingStore`; call `ensureAccount(db, Date.now())`.
3. Construct `governor = new Governor(store, loadGovernorConfig(settingStore))` and `engine = new Engine(campaignStore, enrollmentStore, leadStore, governor, dispatcher, () => randomUUID())`.
4. In the `HandsServer` `onResult` handler, **after** `dispatcher.handleResult(r)` and the existing lead-persist block, also call `engine.onResult(r)` so dispatched enrollments advance.
5. After `app.listen(...)`, start the ticker: `const ticker = setInterval(() => { try { engine.tick(Date.now()); } catch (e) { console.error('[engine] tick error', e); } }, 60_000);` and log that the engine is running. (Keep a reference; no shutdown handler needed for v1.)

Concretely, the `onResult` closure becomes (preserve all existing logic, add the engine call):
```ts
const hands = new HandsServer({ wss, token: config.token, onResult: (r) => {
  dispatcher.handleResult(r);
  console.log('[result]', r.jobId, r.status, JSON.stringify(r.observed ?? {}));
  if (r.status === 'ok' && r.data && store.get(r.jobId)?.type === 'scrapeProfile') {
    const parsed = ScrapedProfileSchema.safeParse(r.data);
    if (parsed.success) {
      const id = leadStore.upsertProfile(parsed.data, Date.now());
      console.log('[lead]', id, parsed.data.fullName, '|', parsed.data.experience.length, 'exp', parsed.data.education.length, 'edu', parsed.data.skills.length, 'skills');
    } else {
      console.warn('[lead] invalid ScrapedProfile:', parsed.error.issues[0]);
    }
  }
  engine.onResult(r); // M2: advance any enrollment waiting on this job
}});
```
And the construction block (place after `const leadStore = new LeadStore(db);` and after `dispatcher` exists — note `engine` references `dispatcher`, and the `onResult` closure references `engine`; since `onResult` is only *called* later, declare `engine` with `let`/hoisted `const` before `hands` OR construct `hands` after `engine`. The existing code constructs `hands` before `dispatcher`. **Reorder so the order is: `store`, `leadStore`, new stores, `ensureAccount`, then `hands` (whose onResult references `engine`), then `dispatcher`, then `governor`, then `engine`.** Because `onResult` is a closure invoked only at runtime, `engine` being assigned after `hands` is fine as long as it's in scope. Use `let engine: Engine;` declared before `hands`, then assign `engine = new Engine(...)` after `dispatcher`. Example:
```ts
const campaignStore = new CampaignStore(db);
const enrollmentStore = new EnrollmentStore(db);
const settingStore = new SettingStore(db);
ensureAccount(db, Date.now());

let engine: Engine; // assigned below; referenced by hands.onResult (runtime only)

const wss = new WebSocketServer({ port: config.port, path: '/ws' });
const hands = new HandsServer({ wss, token: config.token, onResult: (r) => { /* ...existing... */ engine.onResult(r); } });
const dispatcher = new Dispatcher(store, (job) => hands.sendJob(job));
const governor = new Governor(store, loadGovernorConfig(settingStore));
engine = new Engine(campaignStore, enrollmentStore, leadStore, governor, dispatcher, () => randomUUID());
```
Keep `randomUUID` already imported. Add the new imports at the top.

After `await app.listen(...)`:
```ts
const ticker = setInterval(() => {
  try { engine.tick(Date.now()); } catch (err) { console.error('[engine] tick error', err); }
}, 60_000);
void ticker;
console.log('  ENGINE:       ticking every 60s (campaigns + governor active)');
```

- [ ] **Step 2: Typecheck + boot smoke**

Run: `pnpm --filter @aura/brain typecheck` (clean).
Boot smoke (no live hands needed): from `apps/brain/`, start the brain briefly and confirm it logs the engine line and stays up, then stop it. (The implementer may verify by reading the startup log; do not require a long-running process in the task.)

- [ ] **Step 3: Commit**
```bash
git add apps/brain/src/index.ts
git commit -m "feat(brain): wire engine + governor + 60s ticker into the brain; route Results to the engine"
```

---

## Task 10: End-to-end integration test + live smoke + finish

**Files:**
- Create: `apps/brain/src/engine/engine.integration.test.ts`

- [ ] **Step 1: Full-lifecycle integration test**

`apps/brain/src/engine/engine.integration.test.ts` — seed the real `examples/visit-warmup.json` shape, enroll two leads, and drive a simulated clock through the whole sequence, asserting jobs are produced under the cap and both enrollments reach `done`. Reuse the `harness`/`seedLinear` pattern from `engine.test.ts` but with **two** leads and an injected-now that advances:
```ts
// build harness with TWO leads (l1/u1, l2/u2); seed Visit→Wait(1000)→Visit→End.
// tick(0): both dispatch visit#1 (cap visit=60 >> 2) → 2 jobs queued, both 'dispatched'.
// onResult ok for both → both advance to wait @1000.
// tick(1000): both advance past wait to visit#2 (action, nextRunAt now) — still need another tick to dispatch.
// tick(1000): both dispatch visit#2 → 4 jobs total.
// onResult ok for both → both End → state 'done'.
// assert: sent.length === 4; both enrollments state 'done'.
// Then a cap test: rebuild with caps.visit = 1; tick(0) for two leads → only 1 dispatched, the other deferred.
```
Write it out fully with concrete assertions (no placeholders) following the `engine.test.ts` style. Keep `now` injected and working-hours disabled.

- [ ] **Step 2: Run → pass; full-suite gate**

Run: `pnpm --filter @aura/brain test` (all brain tests pass) then `pnpm -r test` + `pnpm -r typecheck` (all green).

- [ ] **Step 3: Live smoke (manual, optional hands)**

From `apps/brain/` (the `.aura/aura.sqlite` already has James + Josh):
```
pnpm --filter @aura/brain campaign:seed examples/visit-warmup.json   # prints <campaignId>
pnpm --filter @aura/brain enroll <campaignId>                        # enrolls all leads at the start node
pnpm --filter @aura/brain campaign:tick                              # runs one tick
pnpm --filter @aura/brain campaign:status <campaignId>               # shows each enrollment 'dispatched' on visit, pendingJobId set
```
Confirm: after `campaign:tick`, `campaign:status` shows each enrollment `state=dispatched` on the first `visit` node (or, if outside working hours, `state=active` with a future `nextRunAt` — set the `governor` setting `workingHours.enabled=false` via a quick `SettingStore` to bypass, or run in-hours). With the real extension connected to the running brain, the visits would actually execute and Results would advance the enrollments; without hands, jobs persist as `queued` and that's an acceptable spine smoke.

- [ ] **Step 4: Append a "verified" note + commit; finish branch**

Append a short "M2 spine verified" note to this plan (what was run + outcome) and commit. Then use **superpowers:finishing-a-development-branch**.
```bash
git add apps/brain/src/engine/engine.integration.test.ts docs/superpowers/plans/2026-06-05-aura-m2-engine.md
git commit -m "test(brain): M2 engine end-to-end integration + verified note"
```

---

## Definition of Done
- [ ] `pnpm -r test` green; `pnpm -r typecheck` clean.
- [ ] New tables migrate cleanly on a fresh DB and on the existing `.aura/aura.sqlite` (0001 applies over 0000).
- [ ] A seeded straight-line campaign (Visit → Wait → Visit → End) drives enrolled leads: the engine dispatches `visit` jobs **only** when the governor allows (caps + working-hours), dedupes already-acted targets, and advances each enrollment to `done` on success.
- [ ] Governor enforces per-type daily caps, the working-hours window, and dedupe (unit-tested across in-hours / out-of-hours / weekend / over-cap / already-acted).
- [ ] The 60s ticker is wired into the brain and Results route to `engine.onResult`.

## Deferred (later milestones — do NOT build here)
- **M3:** real branch evaluation on edge conditions (`accepted`/`replied`/`timeout`); the visual node/edge canvas editor; AI personalization (Claude) at dispatch time with live preview; reply-sweep / stop-on-reply.
- **M4:** warm-up ramp, human-like pacing (randomized gaps), the **circuit breaker** (trip on checkpoint/CAPTCHA/limit signals), dashboard Overview tab (caps/safety/activity), extension popup.
- `connect`/`message` *hands* (extension DOM actions) — the engine already dispatches those job types, but the extension executor for them is a separate slice.
- HTTP/dashboard surfacing of campaigns + enrollments (a `GET /campaigns` API + a Campaigns tab).
