# AURA M0 — Skeleton & Contract — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AURA "walking skeleton" — a local **brain** that dispatches a `visit` job over an authenticated localhost WebSocket to the MV3 extension **hands**, which navigates the real LinkedIn tab to a profile, confirms the load, and returns a `Result` the brain persists to SQLite.

**Architecture:** A pnpm monorepo. A shared `@aura/contract` package defines zod-validated `Job`/`Result`/WS-frame types reused by both sides. The **brain** (Fastify HTTP for enqueue + `ws` server for hands, Drizzle/SQLite for storage) owns dispatch and persistence. The **extension** (WXT, MV3) connects as the single "hands" client, authenticates with a token, executes `visit`, and reports back. This proves the full contract path end-to-end with the simplest possible job.

**Tech Stack:** TypeScript · pnpm workspaces · Vitest · zod · Fastify · `ws` · Drizzle ORM + better-sqlite3 · WXT. *(Package manager/test framework are swappable — say so before execution if you'd prefer npm/Jest.)*

**Prereqs:** Node ≥ 22 (you have 24), pnpm (`npm i -g pnpm`), and MSVC Build Tools (you have VS 2022 BuildTools — needed for better-sqlite3's native build). Chrome for loading the unpacked extension.

**Known M0 limitation (by design):** MV3 service workers can be suspended when idle, dropping the WS. M0 accepts manual reconnect; keepalive/reconnect hardening is M4. Fixed dev port `51899` is used so the extension can default to it; random-port discovery is a later refinement.

---

## File Structure

```
Infinity Soup/
├─ pnpm-workspace.yaml          # workspace globs
├─ package.json                 # root scripts + shared devDeps
├─ tsconfig.base.json           # shared TS config
├─ packages/
│  └─ contract/                 # @aura/contract — shared types (zod)
│     ├─ package.json
│     ├─ tsconfig.json
│     └─ src/
│        ├─ index.ts            # Job, Result, JobType, WS frames + zod schemas
│        └─ contract.test.ts    # schema validation tests
└─ apps/
   ├─ brain/                    # @aura/brain — local Node service
   │  ├─ package.json
   │  ├─ tsconfig.json
   │  ├─ drizzle.config.ts
   │  └─ src/
   │     ├─ db/schema.ts        # Drizzle `jobs` table (M0 subset)
   │     ├─ db/store.ts         # JobStore: create/get/markDispatched/saveResult
   │     ├─ db/store.test.ts
   │     ├─ ws/server.ts        # HandsServer: token-authed WS, single hands client
   │     ├─ ws/server.test.ts
   │     ├─ dispatcher.ts       # Dispatcher: enqueue→push→await result
   │     ├─ dispatcher.test.ts
   │     ├─ http.ts             # Fastify app: POST /jobs, GET /jobs/:id
   │     ├─ http.test.ts
   │     ├─ config.ts           # load/generate token + port (.aura/config.json)
   │     ├─ index.ts            # wire it all together; start server
   │     └─ enqueue.ts          # dev CLI: POST a visit job to the running brain
   └─ extension/                # @aura/extension — WXT MV3
      ├─ package.json
      ├─ tsconfig.json
      ├─ wxt.config.ts
      ├─ src/
      │  ├─ connection.ts       # HandsConnection: pure frame/handshake logic
      │  ├─ connection.test.ts
      │  ├─ parse/profile.ts    # parseProfileConfirmation(doc) → {fullName}
      │  ├─ parse/profile.test.ts
      │  └─ parse/__fixtures__/profile.html   # captured real LinkedIn profile DOM
      └─ entrypoints/
         ├─ background.ts       # SW: open WS, wire HandsConnection to executor
         ├─ linkedin.content.ts # content script: read confirmation from page
         └─ options/            # minimal token/port options page
            ├─ index.html
            └─ main.ts
```

---

## Task 1: Monorepo scaffold & tooling

**Files:**
- Create: `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`

- [ ] **Step 1: Create the workspace manifest**

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "aura",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "pnpm -r test",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 4: Install and verify the toolchain**

Run: `pnpm install`
Expected: completes; `node_modules/` created (already gitignored).

- [ ] **Step 5: Commit**

```bash
git add pnpm-workspace.yaml package.json tsconfig.base.json pnpm-lock.yaml
git commit -m "chore: scaffold pnpm monorepo for AURA"
```

---

## Task 2: `@aura/contract` — shared Job/Result/frame schemas

**Files:**
- Create: `packages/contract/package.json`, `packages/contract/tsconfig.json`, `packages/contract/src/index.ts`
- Test: `packages/contract/src/contract.test.ts`

- [ ] **Step 1: Create the package manifest**

`packages/contract/package.json`:
```json
{
  "name": "@aura/contract",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "zod": "^3.23.0" }
}
```

`packages/contract/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

- [ ] **Step 2: Write the failing test**

`packages/contract/src/contract.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { JobSchema, ResultSchema, ClientHelloSchema, ServerJobSchema } from './index.js';

describe('contract schemas', () => {
  it('accepts a valid visit job', () => {
    const job = { id: 'j1', type: 'visit', target: 'https://www.linkedin.com/in/jane', payload: {} };
    expect(JobSchema.parse(job)).toEqual(job);
  });

  it('defaults payload to {}', () => {
    const parsed = JobSchema.parse({ id: 'j1', type: 'visit', target: 'https://x' });
    expect(parsed.payload).toEqual({});
  });

  it('rejects an unknown job type', () => {
    expect(() => JobSchema.parse({ id: 'j1', type: 'teleport', target: 'x' })).toThrow();
  });

  it('accepts a valid result', () => {
    const r = { jobId: 'j1', status: 'ok', data: { fullName: 'Jane Doe' } };
    expect(ResultSchema.parse(r)).toMatchObject({ jobId: 'j1', status: 'ok' });
  });

  it('round-trips a hello and a job frame', () => {
    expect(ClientHelloSchema.parse({ kind: 'hello', token: 't' }).token).toBe('t');
    const f = { kind: 'job', job: { id: 'j1', type: 'visit', target: 'x', payload: {} } };
    expect(ServerJobSchema.parse(f).job.id).toBe('j1');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @aura/contract test`
Expected: FAIL — cannot import from `./index.js` (module/exports missing).

- [ ] **Step 4: Implement the schemas**

`packages/contract/src/index.ts`:
```ts
import { z } from 'zod';

export const JobTypeSchema = z.enum([
  'visit', 'connect', 'message', 'follow', 'endorse', 'scrapeProfile', 'scrapeSearch',
]);
export type JobType = z.infer<typeof JobTypeSchema>;

export const JobSchema = z.object({
  id: z.string(),
  type: JobTypeSchema,
  target: z.string(),
  payload: z.record(z.unknown()).default({}),
});
export type Job = z.infer<typeof JobSchema>;

export const ResultSchema = z.object({
  jobId: z.string(),
  status: z.enum(['ok', 'failed', 'skipped']),
  data: z.record(z.unknown()).optional(),
  observed: z.record(z.unknown()).optional(),
  error: z.string().optional(),
});
export type Result = z.infer<typeof ResultSchema>;

// WS frames: hands (client) <-> brain (server)
export const ClientHelloSchema = z.object({ kind: z.literal('hello'), token: z.string() });
export const ServerWelcomeSchema = z.object({ kind: z.literal('welcome') });
export const ServerJobSchema = z.object({ kind: z.literal('job'), job: JobSchema });
export const ClientResultSchema = z.object({ kind: z.literal('result'), result: ResultSchema });

export const ClientFrameSchema = z.union([ClientHelloSchema, ClientResultSchema]);
export const ServerFrameSchema = z.union([ServerWelcomeSchema, ServerJobSchema]);
export type ClientFrame = z.infer<typeof ClientFrameSchema>;
export type ServerFrame = z.infer<typeof ServerFrameSchema>;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @aura/contract test`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/contract
git commit -m "feat(contract): zod-validated Job/Result/WS-frame schemas"
```

---

## Task 3: Brain — SQLite `jobs` table + JobStore

**Files:**
- Create: `apps/brain/package.json`, `apps/brain/tsconfig.json`, `apps/brain/src/db/schema.ts`, `apps/brain/src/db/store.ts`
- Test: `apps/brain/src/db/store.test.ts`

- [ ] **Step 1: Create the brain package manifest**

`apps/brain/package.json`:
```json
{
  "name": "@aura/brain",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "enqueue": "tsx src/enqueue.ts"
  },
  "dependencies": {
    "@aura/contract": "workspace:*",
    "better-sqlite3": "^11.3.0",
    "drizzle-orm": "^0.36.0",
    "fastify": "^5.0.0",
    "ws": "^8.18.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/ws": "^8.5.0",
    "drizzle-kit": "^0.28.0",
    "tsx": "^4.19.0"
  }
}
```

`apps/brain/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

Run: `pnpm install`
Expected: better-sqlite3 builds natively (uses your VS BuildTools). If it fails, ensure `npm config get msvs_version` resolves and re-run.

- [ ] **Step 2: Write the failing test**

`apps/brain/src/db/store.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { JobStore } from './store.js';

function freshStore() {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite);
  // M0: create table inline (migrations introduced when schema grows)
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @aura/brain test`
Expected: FAIL — `./store.js` has no `JobStore`.

- [ ] **Step 4: Write the schema and store**

`apps/brain/src/db/schema.ts`:
```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  target: text('target').notNull(),
  payload: text('payload').notNull().default('{}'),
  status: text('status').notNull().default('queued'),
  result: text('result'),
  createdAt: integer('created_at').notNull(),
  dispatchedAt: integer('dispatched_at'),
  completedAt: integer('completed_at'),
});
export type JobRow = typeof jobs.$inferSelect;
```

`apps/brain/src/db/store.ts`:
```ts
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Job, Result } from '@aura/contract';
import { jobs, type JobRow } from './schema.js';

export class JobStore {
  constructor(private db: BetterSQLite3Database) {}

  create(job: Job, now: number): void {
    this.db.insert(jobs).values({
      id: job.id, type: job.type, target: job.target,
      payload: JSON.stringify(job.payload ?? {}), status: 'queued', createdAt: now,
    }).run();
  }

  markDispatched(id: string, now: number): void {
    this.db.update(jobs).set({ status: 'dispatched', dispatchedAt: now }).where(eq(jobs.id, id)).run();
  }

  saveResult(result: Result, now: number): void {
    this.db.update(jobs)
      .set({ status: result.status, result: JSON.stringify(result), completedAt: now })
      .where(eq(jobs.id, result.jobId)).run();
  }

  get(id: string): JobRow | undefined {
    return this.db.select().from(jobs).where(eq(jobs.id, id)).get();
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @aura/brain test`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/brain
git commit -m "feat(brain): jobs table + JobStore (create/get/dispatch/saveResult)"
```

---

## Task 4: Brain — token-authenticated WS server (HandsServer)

**Files:**
- Create: `apps/brain/src/ws/server.ts`
- Test: `apps/brain/src/ws/server.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/brain/src/ws/server.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { WebSocketServer } from 'ws';
import WebSocket from 'ws';
import { HandsServer } from './server.js';

let srv: HandsServer | undefined;
afterEach(() => srv?.close());

function connect(port: number): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}/ws`);
}

describe('HandsServer auth', () => {
  it('welcomes a client with the correct token', async () => {
    srv = new HandsServer({ wss: new WebSocketServer({ port: 0 }), token: 'secret' });
    const port = (srv.address() as any).port;
    const ws = connect(port);
    const welcome = await new Promise<string>((resolve) => {
      ws.on('open', () => ws.send(JSON.stringify({ kind: 'hello', token: 'secret' })));
      ws.on('message', (d) => resolve(JSON.parse(d.toString()).kind));
    });
    expect(welcome).toBe('welcome');
    expect(srv.hasHands()).toBe(true);
    ws.close();
  });

  it('closes a client with the wrong token', async () => {
    srv = new HandsServer({ wss: new WebSocketServer({ port: 0 }), token: 'secret' });
    const port = (srv.address() as any).port;
    const ws = connect(port);
    const closed = await new Promise<boolean>((resolve) => {
      ws.on('open', () => ws.send(JSON.stringify({ kind: 'hello', token: 'WRONG' })));
      ws.on('close', () => resolve(true));
    });
    expect(closed).toBe(true);
    expect(srv.hasHands()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aura/brain test src/ws/server.test.ts`
Expected: FAIL — no `HandsServer`.

- [ ] **Step 3: Implement HandsServer**

`apps/brain/src/ws/server.ts`:
```ts
import type { WebSocketServer, WebSocket } from 'ws';
import { ClientFrameSchema, type Result } from '@aura/contract';

export interface HandsServerOpts {
  wss: WebSocketServer;
  token: string;
  onResult?: (result: Result) => void;
}

export class HandsServer {
  private hands: WebSocket | null = null;
  constructor(private opts: HandsServerOpts) {
    opts.wss.on('connection', (ws) => this.onConnection(ws));
  }

  private onConnection(ws: WebSocket) {
    let authed = false;
    ws.on('message', (raw) => {
      const parsed = ClientFrameSchema.safeParse(JSON.parse(raw.toString()));
      if (!parsed.success) return;
      const frame = parsed.data;
      if (!authed) {
        if (frame.kind === 'hello' && frame.token === this.opts.token) {
          authed = true; this.hands = ws;
          ws.send(JSON.stringify({ kind: 'welcome' }));
        } else { ws.close(); }
        return;
      }
      if (frame.kind === 'result') this.opts.onResult?.(frame.result);
    });
    ws.on('close', () => { if (this.hands === ws) this.hands = null; });
  }

  hasHands(): boolean { return this.hands !== null; }

  sendJob(job: unknown): boolean {
    if (!this.hands) return false;
    this.hands.send(JSON.stringify({ kind: 'job', job }));
    return true;
  }

  address() { return this.opts.wss.address(); }
  close() { this.opts.wss.close(); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aura/brain test src/ws/server.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/brain/src/ws
git commit -m "feat(brain): token-authed WS HandsServer (single hands client)"
```

---

## Task 5: Brain — Dispatcher (enqueue → push → await result)

**Files:**
- Create: `apps/brain/src/dispatcher.ts`
- Test: `apps/brain/src/dispatcher.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/brain/src/dispatcher.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { Dispatcher } from './dispatcher.js';
import type { Job, Result } from '@aura/contract';

function fakeStore() {
  return { create: vi.fn(), markDispatched: vi.fn(), saveResult: vi.fn(), get: vi.fn() };
}

describe('Dispatcher', () => {
  it('persists, marks dispatched, and pushes the job to hands', () => {
    const store = fakeStore();
    const send = vi.fn().mockReturnValue(true);
    const d = new Dispatcher(store as any, send, () => 1000);
    const job: Job = { id: 'j1', type: 'visit', target: 'x', payload: {} };
    d.enqueue(job);
    expect(store.create).toHaveBeenCalledWith(job, 1000);
    expect(store.markDispatched).toHaveBeenCalledWith('j1', 1000);
    expect(send).toHaveBeenCalledWith(job);
  });

  it('stores the job as queued when no hands are connected', () => {
    const store = fakeStore();
    const send = vi.fn().mockReturnValue(false);
    const d = new Dispatcher(store as any, send, () => 1000);
    d.enqueue({ id: 'j1', type: 'visit', target: 'x', payload: {} });
    expect(store.create).toHaveBeenCalled();
    expect(store.markDispatched).not.toHaveBeenCalled();
  });

  it('saves an incoming result', () => {
    const store = fakeStore();
    const d = new Dispatcher(store as any, vi.fn(), () => 2000);
    const result: Result = { jobId: 'j1', status: 'ok', data: { fullName: 'Jane' } };
    d.handleResult(result);
    expect(store.saveResult).toHaveBeenCalledWith(result, 2000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aura/brain test src/dispatcher.test.ts`
Expected: FAIL — no `Dispatcher`.

- [ ] **Step 3: Implement Dispatcher**

`apps/brain/src/dispatcher.ts`:
```ts
import type { Job, Result } from '@aura/contract';
import type { JobStore } from './db/store.js';

/** sendJob returns true if a hands client received the job. */
export type SendJob = (job: Job) => boolean;
export type Now = () => number;

export class Dispatcher {
  constructor(private store: JobStore, private sendJob: SendJob, private now: Now = Date.now) {}

  enqueue(job: Job): void {
    this.store.create(job, this.now());
    const delivered = this.sendJob(job);
    if (delivered) this.store.markDispatched(job.id, this.now());
  }

  handleResult(result: Result): void {
    this.store.saveResult(result, this.now());
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aura/brain test src/dispatcher.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/brain/src/dispatcher.ts apps/brain/src/dispatcher.test.ts
git commit -m "feat(brain): Dispatcher wires store + hands send + result handling"
```

---

## Task 6: Brain — HTTP enqueue API (Fastify)

**Files:**
- Create: `apps/brain/src/http.ts`
- Test: `apps/brain/src/http.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/brain/src/http.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { buildHttp } from './http.js';

describe('HTTP enqueue API', () => {
  it('POST /jobs enqueues a visit job and returns its id', async () => {
    const enqueue = vi.fn();
    const app = buildHttp({ enqueue, genId: () => 'generated-id' });
    const res = await app.inject({
      method: 'POST', url: '/jobs',
      payload: { type: 'visit', target: 'https://www.linkedin.com/in/jane' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: 'generated-id' });
    expect(enqueue).toHaveBeenCalledWith({
      id: 'generated-id', type: 'visit', target: 'https://www.linkedin.com/in/jane', payload: {},
    });
    await app.close();
  });

  it('rejects an invalid job body', async () => {
    const app = buildHttp({ enqueue: vi.fn(), genId: () => 'x' });
    const res = await app.inject({ method: 'POST', url: '/jobs', payload: { type: 'nope' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aura/brain test src/http.test.ts`
Expected: FAIL — no `buildHttp`.

- [ ] **Step 3: Implement the Fastify app**

`apps/brain/src/http.ts`:
```ts
import Fastify, { type FastifyInstance } from 'fastify';
import { JobSchema, type Job } from '@aura/contract';
import { z } from 'zod';

const NewJobSchema = z.object({
  type: JobSchema.shape.type,
  target: z.string(),
  payload: z.record(z.unknown()).optional(),
});

export interface HttpDeps {
  enqueue: (job: Job) => void;
  genId: () => string;
}

export function buildHttp(deps: HttpDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  app.post('/jobs', async (req, reply) => {
    const parsed = NewJobSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid job' });
    const job = JobSchema.parse({ id: deps.genId(), ...parsed.data });
    deps.enqueue(job);
    return { id: job.id };
  });
  return app;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aura/brain test src/http.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/brain/src/http.ts apps/brain/src/http.test.ts
git commit -m "feat(brain): Fastify POST /jobs enqueue endpoint with validation"
```

---

## Task 7: Brain — config (token/port) + entry point + enqueue CLI

**Files:**
- Create: `apps/brain/src/config.ts`, `apps/brain/src/index.ts`, `apps/brain/src/enqueue.ts`
- Test: `apps/brain/src/config.test.ts`

- [ ] **Step 1: Write the failing test (config token generation/persistence)**

`apps/brain/src/config.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('generates a token on first run and reuses it on the second', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aura-'));
    try {
      const a = loadConfig(dir);
      const b = loadConfig(dir);
      expect(a.token).toMatch(/^[a-f0-9]{32,}$/);
      expect(b.token).toBe(a.token);
      expect(a.port).toBe(51899);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aura/brain test src/config.test.ts`
Expected: FAIL — no `loadConfig`.

- [ ] **Step 3: Implement config**

`apps/brain/src/config.ts`:
```ts
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface AuraConfig { token: string; port: number; }

export function loadConfig(dir = '.aura'): AuraConfig {
  const file = join(dir, 'config.json');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as AuraConfig;
  const config: AuraConfig = { token: randomBytes(24).toString('hex'), port: 51899 };
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(config, null, 2));
  return config;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aura/brain test src/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the entry point (no test — verified by running in Task 10)**

`apps/brain/src/index.ts`:
```ts
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { WebSocketServer } from 'ws';
import { loadConfig } from './config.js';
import { JobStore } from './db/store.js';
import { HandsServer } from './ws/server.js';
import { Dispatcher } from './dispatcher.js';
import { buildHttp } from './http.js';

const config = loadConfig();

const sqlite = new Database('.aura/aura.sqlite');
sqlite.exec(`CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, target TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'queued',
  result TEXT, created_at INTEGER NOT NULL, dispatched_at INTEGER, completed_at INTEGER
);`);
const db = drizzle(sqlite);
const store = new JobStore(db);

const wss = new WebSocketServer({ port: config.port, path: '/ws' });
const hands = new HandsServer({ wss, token: config.token, onResult: (r) => {
  dispatcher.handleResult(r);
  console.log('[result]', r.jobId, r.status, JSON.stringify(r.data ?? {}));
}});
const dispatcher = new Dispatcher(store, (job) => hands.sendJob(job));

const app = buildHttp({ enqueue: (job) => dispatcher.enqueue(job), genId: () => randomUUID() });
await app.listen({ port: config.port + 1, host: '127.0.0.1' });

console.log(`AURA brain up.
  WS  (hands):  ws://127.0.0.1:${config.port}/ws
  HTTP (api):   http://127.0.0.1:${config.port + 1}
  TOKEN:        ${config.token}
Paste the token + WS port into the extension options.`);
```

- [ ] **Step 6: Write the dev enqueue CLI**

`apps/brain/src/enqueue.ts`:
```ts
import { loadConfig } from './config.js';

const target = process.argv[2];
if (!target) { console.error('usage: pnpm --filter @aura/brain enqueue <profileUrl>'); process.exit(1); }

const { port } = loadConfig();
const res = await fetch(`http://127.0.0.1:${port + 1}/jobs`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ type: 'visit', target }),
});
console.log(res.status, await res.text());
```

- [ ] **Step 7: Commit**

```bash
git add apps/brain/src/config.ts apps/brain/src/config.test.ts apps/brain/src/index.ts apps/brain/src/enqueue.ts
git commit -m "feat(brain): config token/port, entry point, dev enqueue CLI"
```

---

## Task 8: Extension — pure HandsConnection (frame/handshake logic)

**Files:**
- Create: `apps/extension/package.json`, `apps/extension/tsconfig.json`, `apps/extension/wxt.config.ts`, `apps/extension/src/connection.ts`
- Test: `apps/extension/src/connection.test.ts`

- [ ] **Step 1: Scaffold the WXT package**

`apps/extension/package.json`:
```json
{
  "name": "@aura/extension",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "@aura/contract": "workspace:*", "zod": "^3.23.0" },
  "devDependencies": { "wxt": "^0.19.0", "happy-dom": "^15.0.0", "vitest": "^2.1.0" }
}
```

`apps/extension/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "entrypoints", "wxt.config.ts"] }
```

`apps/extension/wxt.config.ts`:
```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'AURA',
    permissions: ['storage', 'tabs', 'scripting'],
    host_permissions: ['https://www.linkedin.com/*', 'ws://127.0.0.1/*', 'http://127.0.0.1/*'],
  },
});
```

Run: `pnpm install`
Expected: WXT installed.

- [ ] **Step 2: Write the failing test**

`apps/extension/src/connection.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { HandsConnection } from './connection.js';
import type { Result } from '@aura/contract';

describe('HandsConnection', () => {
  it('sends hello on open', () => {
    const sent: string[] = [];
    const conn = new HandsConnection({ token: 't', send: (s) => sent.push(s), execute: async () => ({} as Result) });
    conn.onOpen();
    expect(JSON.parse(sent[0])).toEqual({ kind: 'hello', token: 't' });
  });

  it('executes a job on receiving a job frame and sends back the result', async () => {
    const sent: string[] = [];
    const execute = vi.fn(async () => ({ jobId: 'j1', status: 'ok', data: { fullName: 'Jane' } } as Result));
    const conn = new HandsConnection({ token: 't', send: (s) => sent.push(s), execute });
    await conn.onMessage(JSON.stringify({ kind: 'job', job: { id: 'j1', type: 'visit', target: 'x', payload: {} } }));
    expect(execute).toHaveBeenCalledWith({ id: 'j1', type: 'visit', target: 'x', payload: {} });
    expect(JSON.parse(sent[0])).toEqual({ kind: 'result', result: { jobId: 'j1', status: 'ok', data: { fullName: 'Jane' } } });
  });

  it('ignores malformed frames', async () => {
    const sent: string[] = [];
    const conn = new HandsConnection({ token: 't', send: (s) => sent.push(s), execute: async () => ({} as Result) });
    await conn.onMessage('not json');
    await conn.onMessage(JSON.stringify({ kind: 'bogus' }));
    expect(sent).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @aura/extension test`
Expected: FAIL — no `HandsConnection`.

- [ ] **Step 4: Implement HandsConnection**

`apps/extension/src/connection.ts`:
```ts
import { ServerFrameSchema, type Job, type Result } from '@aura/contract';

export interface HandsConnectionDeps {
  token: string;
  send: (data: string) => void;
  execute: (job: Job) => Promise<Result>;
}

export class HandsConnection {
  constructor(private deps: HandsConnectionDeps) {}

  onOpen(): void {
    this.deps.send(JSON.stringify({ kind: 'hello', token: this.deps.token }));
  }

  async onMessage(raw: string): Promise<void> {
    let json: unknown;
    try { json = JSON.parse(raw); } catch { return; }
    const parsed = ServerFrameSchema.safeParse(json);
    if (!parsed.success) return;
    const frame = parsed.data;
    if (frame.kind === 'job') {
      const result = await this.deps.execute(frame.job);
      this.deps.send(JSON.stringify({ kind: 'result', result }));
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @aura/extension test`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/extension/package.json apps/extension/tsconfig.json apps/extension/wxt.config.ts apps/extension/src/connection.ts apps/extension/src/connection.test.ts
git commit -m "feat(extension): pure HandsConnection handshake + job/result routing"
```

---

## Task 9: Extension — profile confirmation parser (fixture-tested)

**Files:**
- Create: `apps/extension/src/parse/profile.ts`, `apps/extension/src/parse/__fixtures__/profile.html`
- Test: `apps/extension/src/parse/profile.test.ts`
- Modify: `apps/extension/package.json` (vitest happy-dom env)

> The real LinkedIn DOM is discovered manually here — this is open question #3 from the spec. You capture one real profile's HTML as a fixture, then TDD the parser against it. The parser stays pure (takes a `Document`), so it's unit-testable; the live page-reading shell is verified manually in Task 10.

- [ ] **Step 1: Capture a real fixture (manual)**

In Chrome, log into LinkedIn, open any profile (`https://www.linkedin.com/in/<someone>`), open DevTools console, run `copy(document.documentElement.outerHTML)`, and paste into `apps/extension/src/parse/__fixtures__/profile.html`. Note in the file's first comment which selector holds the name (inspect the `<h1>` in the top card).

- [ ] **Step 2: Configure happy-dom for this package**

Create `apps/extension/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { environment: 'happy-dom' } });
```

- [ ] **Step 3: Write the failing test**

`apps/extension/src/parse/profile.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseProfileConfirmation } from './profile.js';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '__fixtures__/profile.html'), 'utf8');

describe('parseProfileConfirmation', () => {
  it('extracts the full name from a real profile fixture', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = parseProfileConfirmation(doc);
    expect(out.fullName).toBeTruthy();
    expect(out.fullName.length).toBeGreaterThan(1);
  });

  it('returns loaded=false for an empty document', () => {
    const doc = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
    expect(parseProfileConfirmation(doc).loaded).toBe(false);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @aura/extension test src/parse/profile.test.ts`
Expected: FAIL — no `parseProfileConfirmation`.

- [ ] **Step 5: Implement the parser**

`apps/extension/src/parse/profile.ts`. Set `NAME_SELECTOR` from what you observed in Step 1 (commonly the top-card `<h1>`):
```ts
export interface ProfileConfirmation { loaded: boolean; fullName: string; }

// Ordered fallbacks — LinkedIn changes class names; the bare h1 is the resilient backstop.
const NAME_SELECTORS = ['main h1', 'h1.text-heading-xlarge', 'h1'];

export function parseProfileConfirmation(doc: Document): ProfileConfirmation {
  for (const sel of NAME_SELECTORS) {
    const el = doc.querySelector(sel);
    const text = el?.textContent?.trim();
    if (text) return { loaded: true, fullName: text };
  }
  return { loaded: false, fullName: '' };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @aura/extension test src/parse/profile.test.ts`
Expected: PASS (2 tests). If the name test fails, adjust `NAME_SELECTORS[0]` to match your fixture.

- [ ] **Step 7: Commit**

```bash
git add apps/extension/src/parse apps/extension/package.json
git commit -m "feat(extension): fixture-tested profile confirmation parser"
```

---

## Task 10: Extension shell (background + content + options) and live end-to-end verification

**Files:**
- Create: `apps/extension/entrypoints/background.ts`, `apps/extension/entrypoints/linkedin.content.ts`, `apps/extension/entrypoints/options/index.html`, `apps/extension/entrypoints/options/main.ts`

> These entrypoints are the browser "glue" that can't be meaningfully unit-tested (real SW lifecycle, real tabs, live DOM). They reuse the already-tested `HandsConnection` and `parseProfileConfirmation`. Verification is a documented live run.

- [ ] **Step 1: Options page — store token + WS port**

`apps/extension/entrypoints/options/index.html`:
```html
<!doctype html><meta charset="utf-8"><title>AURA settings</title>
<body style="font-family:system-ui;padding:16px;max-width:360px">
  <h3>AURA — brain connection</h3>
  <label>WS port<br><input id="port" value="51899"></label><br><br>
  <label>Token<br><input id="token" style="width:100%"></label><br><br>
  <button id="save">Save</button> <span id="status"></span>
  <script type="module" src="./main.ts"></script>
</body>
```

`apps/extension/entrypoints/options/main.ts`:
```ts
const $ = (id: string) => document.getElementById(id) as HTMLInputElement;
(async () => {
  const cfg = await chrome.storage.local.get(['port', 'token']);
  if (cfg.port) $('port').value = String(cfg.port);
  if (cfg.token) $('token').value = String(cfg.token);
})();
document.getElementById('save')!.addEventListener('click', async () => {
  await chrome.storage.local.set({ port: Number($('port').value), token: $('token').value.trim() });
  document.getElementById('status')!.textContent = 'saved — reload the extension';
});
```

- [ ] **Step 2: Content script — read confirmation on demand**

`apps/extension/entrypoints/linkedin.content.ts`:
```ts
import { defineContentScript } from 'wxt/sandbox';
import { parseProfileConfirmation } from '../src/parse/profile.js';

export default defineContentScript({
  matches: ['https://www.linkedin.com/*'],
  main() {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.kind === 'readProfile') {
        sendResponse(parseProfileConfirmation(document));
      }
      return true;
    });
  },
});
```

- [ ] **Step 3: Background — connect WS, execute visit via tab navigation**

`apps/extension/entrypoints/background.ts`:
```ts
import { defineBackground } from 'wxt/sandbox';
import { HandsConnection } from '../src/connection.js';
import type { Job, Result } from '@aura/contract';

export default defineBackground(() => {
  let socket: WebSocket | null = null;

  async function connect() {
    const { port, token } = await chrome.storage.local.get(['port', 'token']);
    if (!port || !token) { console.warn('AURA: set port+token in options'); return; }
    socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const conn = new HandsConnection({
      token,
      send: (s) => socket!.send(s),
      execute: executeJob,
    });
    socket.addEventListener('open', () => conn.onOpen());
    socket.addEventListener('message', (e) => conn.onMessage(String(e.data)));
    socket.addEventListener('close', () => { socket = null; });
  }

  async function executeJob(job: Job): Promise<Result> {
    if (job.type !== 'visit') return { jobId: job.id, status: 'skipped', error: 'M0 supports visit only' };
    try {
      const tab = await chrome.tabs.create({ url: job.target, active: false });
      await waitForComplete(tab.id!);
      const confirmation = await chrome.tabs.sendMessage(tab.id!, { kind: 'readProfile' });
      return { jobId: job.id, status: confirmation.loaded ? 'ok' : 'failed', data: confirmation };
    } catch (err) {
      return { jobId: job.id, status: 'failed', error: String(err) };
    }
  }

  function waitForComplete(tabId: number): Promise<void> {
    return new Promise((resolve) => {
      const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
        if (id === tabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(resolve, 1500); // let the SPA hydrate the top card
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  connect();
  chrome.storage.onChanged.addListener(() => { socket?.close(); connect(); });
});
```

- [ ] **Step 4: Typecheck and build the extension**

Run: `pnpm --filter @aura/extension typecheck && pnpm --filter @aura/extension build`
Expected: builds to `apps/extension/.output/chrome-mv3/`.

- [ ] **Step 5: Live end-to-end verification (manual)**

1. Start the brain: `pnpm --filter @aura/brain start` → copy the printed **TOKEN** and WS port (51899).
2. Load the extension: Chrome → `chrome://extensions` → enable Developer mode → **Load unpacked** → select `apps/extension/.output/chrome-mv3/`.
3. Open the extension's **Options**, paste the token, confirm port `51899`, Save.
4. Confirm you are logged into LinkedIn in that Chrome profile.
5. In the extension's service-worker console (`chrome://extensions` → AURA → "service worker"), confirm a `welcome` was received (no errors).
6. Enqueue a visit: `pnpm --filter @aura/brain enqueue https://www.linkedin.com/in/<a-real-profile>`
7. **Observe:** a background tab opens to that profile; the brain console logs `[result] <id> ok {"loaded":true,"fullName":"..."}`.
8. Confirm persistence: the row is stored —
   ```bash
   node -e "const d=require('better-sqlite3')('apps/brain/.aura/aura.sqlite');console.log(d.prepare('select id,status,result from jobs').all())"
   ```
   Expected: one row, `status='ok'`, `result` JSON containing the scraped `fullName`.

- [ ] **Step 6: Document the result + commit**

Create `apps/extension/entrypoints/README.md` with a one-paragraph "how to run M0 end-to-end" (steps above, condensed). Then:
```bash
git add apps/extension/entrypoints
git commit -m "feat(extension): MV3 shell (bg WS client + content reader + options) — M0 e2e works"
```

---

## M0 Done — Definition of Done

- [ ] `pnpm -r test` is green (contract + brain + extension unit tests).
- [ ] `pnpm -r typecheck` passes.
- [ ] The live e2e (Task 10, Step 5) produces a stored `ok` result with a real scraped `fullName`.
- [ ] A real LinkedIn profile-page fixture is committed (the seed for M1's richer scraper).

## What M0 deliberately defers
- Reconnect/keepalive for the MV3 SW → **M4**.
- Random-port discovery / no manual token paste → later refinement.
- Drizzle migrations (M0 creates the table inline) → introduced in **M1** when `lead` + child tables arrive.
- All other job types (`connect`, `message`, scraping, …) → **M1+**.

---

## Next plan
After M0 verifies, write `docs/superpowers/plans/<date>-aura-m1-leads.md`: `scrapeProfile`/`scrapeSearch` jobs, the rich `lead` + child tables (Drizzle migrations begin), the Leads dashboard table, and CSV export — using the real profile fixture captured here as the parser's test bed.
