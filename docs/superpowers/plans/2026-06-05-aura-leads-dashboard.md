# AURA Leads Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local React dashboard (served by the brain) that lists the leads M1 scraped — a leads table with a per-lead detail drawer (experience/education/skills), search, and CSV export — per the approved design in `docs/superpowers/ui/leads-dashboard.md`.

**Architecture:** Add read-only JSON endpoints to the brain's existing Fastify app (`GET /leads`, `GET /leads/:id`, `GET /leads.csv`) backed by the existing `LeadStore`. A new `apps/dashboard` (React + Vite + TS) renders the UI, fetching those endpoints. In dev, Vite proxies `/leads*` → the brain (`127.0.0.1:51900`); for the demo, the brain serves the built dashboard via `@fastify/static` so everything is one origin at `http://127.0.0.1:51900`. Shared response types live in `@aura/contract` (DRY across brain + dashboard).

**Tech Stack:** (existing) TypeScript · pnpm workspaces · Fastify · Drizzle/better-sqlite3 · Vitest. (new) `@fastify/static` · React 18 · Vite 6 · `@vitejs/plugin-react`.

**Context for the implementer (current `main`, M1 done):**
- Brain HTTP is built in `apps/brain/src/http.ts` via `buildHttp(deps)` — currently only `POST /jobs`. It listens on `config.port + 1` (51900) in `apps/brain/src/index.ts`.
- `apps/brain/src/db/lead-store.ts` exposes `LeadStore.all(): LeadRow[]`, `get(id): LeadRow | undefined`, `getFull(id): FullLead | undefined` where `FullLead = { lead, experience[], education[], skills[], certifications[] }` (the arrays are raw Drizzle rows).
- DB lead row fields: `id, profileUrl, fullName, headline, location, about, currentCompany, currentTitle, status, createdAt, updatedAt`. Experience row: `title, company, employmentType, startDate, endDate, isCurrent(0/1), location, companyUrl, description`. Education row: `school, degree, field, startYear, endYear`. Skill row: `name`.
- `@aura/contract` (`packages/contract/src/index.ts`) already exports `ExperienceSchema`, `EducationSchema`, `SkillSchema`, `CertificationSchema`, `ScrapedProfileSchema`. CSV: `apps/brain/src/csv.ts` exports `leadsToCsv(rows)`.
- The DB already has real leads (James Collard, Josh Dolby) from M1, so the live check has data.

---

## File Structure

```
packages/contract/src/index.ts        MODIFY: add LeadSummary + LeadDetail (+ ExperienceView/EducationView) schemas
apps/brain/
  src/leads-view.ts                    CREATE: toLeadSummary(full) + toLeadDetail(full) — pure mappers
  src/leads-view.test.ts               CREATE
  src/http.ts                          MODIFY: add GET /leads, GET /leads/:id, GET /leads.csv; extend HttpDeps
  src/http.test.ts                     MODIFY: add tests for the new routes
  src/index.ts                         MODIFY: wire leadStore queries into buildHttp; serve dashboard build via @fastify/static
  package.json                         MODIFY: add @fastify/static dep
apps/dashboard/                        CREATE: React+Vite app
  package.json, tsconfig.json, vite.config.ts, index.html
  src/main.tsx                         CREATE: React root
  src/api.ts                           CREATE: typed fetch client (+ test)
  src/api.test.ts                      CREATE
  src/App.tsx                          CREATE: shell + state (leads, selection, search)
  src/components/Sidebar.tsx           CREATE
  src/components/TopBar.tsx            CREATE (search + Export CSV)
  src/components/LeadsTable.tsx        CREATE
  src/components/LeadDrawer.tsx        CREATE
  src/styles.css                       CREATE (from the approved mockup)
```

---

## Task 1: Shared view types + brain mappers (pure, TDD)

**Files:**
- Modify: `packages/contract/src/index.ts`
- Create: `apps/brain/src/leads-view.ts`, `apps/brain/src/leads-view.test.ts`

- [ ] **Step 1: Add view schemas to the contract**

Append to `packages/contract/src/index.ts`:
```ts
export const ExperienceViewSchema = z.object({ title: z.string(), company: z.string(), dates: z.string(), isCurrent: z.boolean() });
export const EducationViewSchema = z.object({ school: z.string(), years: z.string() });

export const LeadSummarySchema = z.object({
  id: z.string(), fullName: z.string(), currentTitle: z.string(), currentCompany: z.string(),
  location: z.string(), expCount: z.number(), eduCount: z.number(), skillCount: z.number(),
  updatedAt: z.number().nullable(),
});
export type LeadSummary = z.infer<typeof LeadSummarySchema>;

export const LeadDetailSchema = z.object({
  id: z.string(), fullName: z.string(), headline: z.string(), location: z.string(),
  currentTitle: z.string(), currentCompany: z.string(), about: z.string(), profileUrl: z.string(),
  updatedAt: z.number().nullable(),
  experience: z.array(ExperienceViewSchema), education: z.array(EducationViewSchema), skills: z.array(z.string()),
});
export type LeadDetail = z.infer<typeof LeadDetailSchema>;
```
Run `pnpm --filter @aura/contract test` → existing 5 tests still PASS; `pnpm --filter @aura/contract typecheck` clean.

- [ ] **Step 2: Write the failing mapper test**

`apps/brain/src/leads-view.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { toLeadSummary, toLeadDetail } from './leads-view.js';
import type { FullLead } from './db/lead-store.js';

const full: FullLead = {
  lead: { id: 'l1', profileUrl: 'u', fullName: 'Jane Doe', headline: 'Founder', location: 'London', about: 'about me',
          currentCompany: 'Acme', currentTitle: 'CEO', status: 'new', createdAt: 1, updatedAt: 2 } as any,
  experience: [{ title: 'CEO', company: 'Acme', startDate: '2020', endDate: 'Present', isCurrent: 1 },
               { title: 'Eng', company: 'Beta', startDate: '2016', endDate: '2020', isCurrent: 0 }] as any,
  education: [{ school: 'MIT', startYear: 2012, endYear: 2016 }] as any,
  skills: [{ name: 'TS' }, { name: 'Lead' }] as any,
  certifications: [],
};

describe('leads-view mappers', () => {
  it('toLeadSummary counts children', () => {
    const s = toLeadSummary(full);
    expect(s).toMatchObject({ id: 'l1', fullName: 'Jane Doe', currentCompany: 'Acme', expCount: 2, eduCount: 1, skillCount: 2 });
  });
  it('toLeadDetail formats dates/years + flattens skills', () => {
    const d = toLeadDetail(full);
    expect(d.experience[0]).toEqual({ title: 'CEO', company: 'Acme', dates: '2020 – Present', isCurrent: true });
    expect(d.education[0]).toEqual({ school: 'MIT', years: '2012 – 2016' });
    expect(d.skills).toEqual(['TS', 'Lead']);
    expect(d.about).toBe('about me');
  });
});
```

- [ ] **Step 3: Run → fail**

Run: `pnpm --filter @aura/brain test src/leads-view.test.ts`
Expected: FAIL — no `leads-view.js`.

- [ ] **Step 4: Implement the mappers**

`apps/brain/src/leads-view.ts`:
```ts
import type { LeadSummary, LeadDetail } from '@aura/contract';
import type { FullLead } from './db/lead-store.js';

const join = (a: unknown, b: unknown, sep = ' – ') => [a, b].filter(Boolean).map(String).join(sep);

export function toLeadSummary(f: FullLead): LeadSummary {
  return {
    id: f.lead.id, fullName: f.lead.fullName, currentTitle: f.lead.currentTitle ?? '',
    currentCompany: f.lead.currentCompany ?? '', location: f.lead.location ?? '',
    expCount: f.experience.length, eduCount: f.education.length, skillCount: f.skills.length,
    updatedAt: f.lead.updatedAt ?? null,
  };
}

export function toLeadDetail(f: FullLead): LeadDetail {
  return {
    id: f.lead.id, fullName: f.lead.fullName, headline: f.lead.headline ?? '', location: f.lead.location ?? '',
    currentTitle: f.lead.currentTitle ?? '', currentCompany: f.lead.currentCompany ?? '', about: f.lead.about ?? '',
    profileUrl: f.lead.profileUrl, updatedAt: f.lead.updatedAt ?? null,
    experience: (f.experience as any[]).map((e) => ({ title: e.title ?? '', company: e.company ?? '', dates: join(e.startDate, e.endDate), isCurrent: !!e.isCurrent })),
    education: (f.education as any[]).map((e) => ({ school: e.school ?? '', years: join(e.startYear, e.endYear) })),
    skills: (f.skills as any[]).map((s) => s.name ?? '').filter(Boolean),
  };
}
```

- [ ] **Step 5: Run → pass; commit**

Run: `pnpm --filter @aura/brain test src/leads-view.test.ts` (2 pass) + `pnpm --filter @aura/brain typecheck`.
```bash
git add packages/contract/src/index.ts apps/brain/src/leads-view.ts apps/brain/src/leads-view.test.ts
git commit -m "feat: LeadSummary/LeadDetail view types + brain mappers"
```

---

## Task 2: Brain leads API — `GET /leads`, `GET /leads/:id`, `GET /leads.csv` (TDD)

**Files:**
- Modify: `apps/brain/src/http.ts`, `apps/brain/src/http.test.ts`

- [ ] **Step 1: Add failing tests for the new routes**

Add to `apps/brain/src/http.test.ts` (keep the existing `POST /jobs` tests):
```ts
import { vi } from 'vitest';
// inside the existing describe (or a new one):
const summary = { id: 'l1', fullName: 'Jane Doe', currentTitle: 'CEO', currentCompany: 'Acme', location: 'London', expCount: 2, eduCount: 1, skillCount: 2, updatedAt: 2 };
const detail = { id: 'l1', fullName: 'Jane Doe', headline: 'Founder', location: 'London', currentTitle: 'CEO', currentCompany: 'Acme', about: 'a', profileUrl: 'u', updatedAt: 2, experience: [], education: [], skills: [] };

it('GET /leads returns the summary list', async () => {
  const app = buildHttp({ enqueue: vi.fn(), genId: () => 'x', listLeads: () => [summary], getLead: () => null, leadsCsv: () => 'h\n' });
  const res = await app.inject({ method: 'GET', url: '/leads' });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual([summary]);
  await app.close();
});
it('GET /leads/:id returns the detail, 404 when missing', async () => {
  const app = buildHttp({ enqueue: vi.fn(), genId: () => 'x', listLeads: () => [], getLead: (id) => (id === 'l1' ? detail : null), leadsCsv: () => 'h\n' });
  expect((await app.inject({ method: 'GET', url: '/leads/l1' })).json()).toMatchObject({ id: 'l1' });
  expect((await app.inject({ method: 'GET', url: '/leads/nope' })).statusCode).toBe(404);
  await app.close();
});
it('GET /leads.csv returns text/csv', async () => {
  const app = buildHttp({ enqueue: vi.fn(), genId: () => 'x', listLeads: () => [], getLead: () => null, leadsCsv: () => 'fullName\nJane\n' });
  const res = await app.inject({ method: 'GET', url: '/leads.csv' });
  expect(res.headers['content-type']).toMatch(/text\/csv/);
  expect(res.body).toContain('Jane');
  await app.close();
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter @aura/brain test src/http.test.ts`
Expected: FAIL — `buildHttp` doesn't accept `listLeads`/`getLead`/`leadsCsv` and routes 404.

- [ ] **Step 3: Implement the routes**

In `apps/brain/src/http.ts`, extend `HttpDeps` and add the routes:
```ts
import type { LeadSummary, LeadDetail } from '@aura/contract';

export interface HttpDeps {
  enqueue: (job: Job) => void;
  genId: () => string;
  listLeads: () => LeadSummary[];
  getLead: (id: string) => LeadDetail | null;
  leadsCsv: () => string;
}
```
Inside `buildHttp`, after the `POST /jobs` route:
```ts
  app.get('/leads', async () => deps.listLeads());
  app.get('/leads.csv', async (_req, reply) => {
    reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="leads.csv"');
    return deps.leadsCsv();
  });
  app.get<{ Params: { id: string } }>('/leads/:id', async (req, reply) => {
    const lead = deps.getLead(req.params.id);
    if (!lead) return reply.code(404).send({ error: 'not found' });
    return lead;
  });
```
(Register `/leads.csv` BEFORE `/leads/:id` so it isn't captured as an id.)

- [ ] **Step 4: Run → pass; commit**

Run: `pnpm --filter @aura/brain test src/http.test.ts` (all pass) + `pnpm --filter @aura/brain typecheck`.
```bash
git add apps/brain/src/http.ts apps/brain/src/http.test.ts
git commit -m "feat(brain): GET /leads, /leads/:id, /leads.csv endpoints"
```

---

## Task 3: Wire the API + serve the dashboard build (`@fastify/static`)

**Files:**
- Modify: `apps/brain/src/index.ts`, `apps/brain/package.json`

- [ ] **Step 1: Add the dependency**

Add `"@fastify/static": "^8.0.0"` to `apps/brain/package.json` dependencies. Run `pnpm install`.

- [ ] **Step 2: Wire leadStore + static serving into index.ts**

In `apps/brain/src/index.ts`: import the mappers + csv + static plugin, and build the HTTP app with the lead query deps. Replace the `buildHttp({...})` construction:
```ts
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import { toLeadSummary, toLeadDetail } from './leads-view.js';
import { leadsToCsv } from './csv.js';
// ...
const app = buildHttp({
  enqueue: (job) => dispatcher.enqueue(job),
  genId: () => randomUUID(),
  listLeads: () => leadStore.all().map((l) => toLeadSummary(leadStore.getFull(l.id)!)),
  getLead: (id) => { const f = leadStore.getFull(id); return f ? toLeadDetail(f) : null; },
  leadsCsv: () => leadsToCsv(leadStore.all().map((l) => ({ fullName: l.fullName, headline: l.headline, location: l.location, currentCompany: l.currentCompany, currentTitle: l.currentTitle, profileUrl: l.profileUrl }))),
});

// Serve the built dashboard (if present) as a SPA at '/'.
const dashDist = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dashboard', 'dist');
if (existsSync(dashDist)) {
  await app.register(fastifyStatic, { root: dashDist });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/leads') || req.url.startsWith('/jobs')) return reply.code(404).send({ error: 'not found' });
    return reply.sendFile('index.html');
  });
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter @aura/brain typecheck` (clean). (No new unit test — covered by Task 2 + the live check in Task 7.)
```bash
git add apps/brain/src/index.ts apps/brain/package.json pnpm-lock.yaml
git commit -m "feat(brain): serve leads via API + static dashboard build"
```

---

## Task 4: Dashboard scaffold (Vite + React + TS)

**Files:**
- Create: `apps/dashboard/package.json`, `apps/dashboard/tsconfig.json`, `apps/dashboard/vite.config.ts`, `apps/dashboard/index.html`, `apps/dashboard/src/main.tsx`, `apps/dashboard/src/App.tsx` (stub)

- [ ] **Step 1: Create the package + config**

`apps/dashboard/package.json`:
```json
{
  "name": "@aura/dashboard",
  "version": "0.0.0",
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "typecheck": "tsc --noEmit", "test": "vitest run" },
  "dependencies": { "@aura/contract": "workspace:*", "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": { "@vitejs/plugin-react": "^4.3.0", "vite": "^6.3.4", "typescript": "^5.6.0", "vitest": "^2.1.0", "@types/react": "^18.3.0", "@types/react-dom": "^18.3.0" }
}
```
`apps/dashboard/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "jsx": "react-jsx", "lib": ["ES2022", "DOM", "DOM.Iterable"] }, "include": ["src"] }
```
`apps/dashboard/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/leads': 'http://127.0.0.1:51900', '/jobs': 'http://127.0.0.1:51900' } },
  build: { outDir: 'dist' },
});
```
`apps/dashboard/index.html`:
```html
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>AURA</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
```
`apps/dashboard/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
```
`apps/dashboard/src/App.tsx` (stub for now):
```tsx
export function App() { return <div>AURA dashboard</div>; }
```
Create an empty `apps/dashboard/src/styles.css` (filled in Task 6).

- [ ] **Step 2: Install + build**

Run: `pnpm install` then `pnpm --filter @aura/dashboard build`
Expected: builds to `apps/dashboard/dist/` (index.html + assets).

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard pnpm-lock.yaml
git commit -m "feat(dashboard): Vite + React scaffold"
```

---

## Task 5: API client (TDD)

**Files:**
- Create: `apps/dashboard/src/api.ts`, `apps/dashboard/src/api.test.ts`

- [ ] **Step 1: Failing test (mock fetch)**

`apps/dashboard/src/api.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchLeads, fetchLead } from './api.js';

afterEach(() => vi.restoreAllMocks());

describe('api client', () => {
  it('fetchLeads GETs /leads and returns the array', async () => {
    const data = [{ id: 'l1', fullName: 'Jane' }];
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => data })));
    expect(await fetchLeads()).toEqual(data);
    expect(fetch).toHaveBeenCalledWith('/leads');
  });
  it('fetchLead GETs /leads/:id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ id: 'l1' }) })));
    expect(await fetchLead('l1')).toMatchObject({ id: 'l1' });
    expect(fetch).toHaveBeenCalledWith('/leads/l1');
  });
});
```
Add `{ "test": { "environment": "node" } }` via `apps/dashboard/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node' } });
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter @aura/dashboard test src/api.test.ts`
Expected: FAIL — no `api.ts`.

- [ ] **Step 3: Implement**

`apps/dashboard/src/api.ts`:
```ts
import type { LeadSummary, LeadDetail } from '@aura/contract';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const fetchLeads = () => getJson<LeadSummary[]>('/leads');
export const fetchLead = (id: string) => getJson<LeadDetail>(`/leads/${id}`);
```

- [ ] **Step 4: Run → pass; commit**

Run: `pnpm --filter @aura/dashboard test src/api.test.ts` (2 pass) + `pnpm --filter @aura/dashboard typecheck`.
```bash
git add apps/dashboard/src/api.ts apps/dashboard/src/api.test.ts apps/dashboard/vitest.config.ts
git commit -m "feat(dashboard): typed leads API client"
```

---

## Task 6: Dashboard UI — shell, table, drawer, search (per mockup)

**Files:**
- Create: `apps/dashboard/src/components/Sidebar.tsx`, `TopBar.tsx`, `LeadsTable.tsx`, `LeadDrawer.tsx`; rewrite `src/App.tsx`; fill `src/styles.css`

> Use the `frontend-design:frontend-design` skill for polish; match `docs/superpowers/ui/dashboard-leads-mockup.html` (dark sidebar, light main, leads table left, detail drawer right). No unit tests for presentational components — verified by the live check (Task 7).

- [ ] **Step 1: `src/styles.css`** — port the mockup's CSS (the `.aura-shell`/`.aura-side`/`.aura-nav`/`table.leads`/`.drawer`/`.chips` rules from `docs/superpowers/ui/dashboard-leads-mockup.html`), adapting class names to the components below. (Copy the `<style>` block from the mockup verbatim as the starting point.)

- [ ] **Step 2: `src/components/Sidebar.tsx`**
```tsx
const NAV = ['Overview', 'Leads', 'Campaigns', 'Sequences', 'Settings'];
export function Sidebar() {
  return (
    <aside className="aura-side">
      <div className="aura-logo">◆ AURA</div>
      <div className="aura-pill">● Brain connected</div>
      <nav className="aura-nav">{NAV.map((n) => <a key={n} className={n === 'Leads' ? 'active' : ''}>{n}</a>)}</nav>
    </aside>
  );
}
```

- [ ] **Step 3: `src/components/TopBar.tsx`**
```tsx
export function TopBar({ count, query, onQuery }: { count: number; query: string; onQuery: (q: string) => void }) {
  return (
    <div className="aura-top">
      <h3>Leads · {count}</h3>
      <div className="tools">
        <input className="aura-input" placeholder="Search name, company…" value={query} onChange={(e) => onQuery(e.target.value)} />
        <a className="aura-btn" href="/leads.csv" download>Export CSV</a>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `src/components/LeadsTable.tsx`**
```tsx
import type { LeadSummary } from '@aura/contract';
export function LeadsTable({ leads, selectedId, onSelect }: { leads: LeadSummary[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <table className="leads">
      <thead><tr><th>Name</th><th>Company</th><th>Location</th><th>Sections</th></tr></thead>
      <tbody>
        {leads.map((l) => (
          <tr key={l.id} className={l.id === selectedId ? 'sel' : ''} onClick={() => onSelect(l.id)}>
            <td><div className="nm">{l.fullName}</div><div className="muted">{l.currentTitle}</div></td>
            <td>{l.currentCompany}</td>
            <td>{l.location}</td>
            <td className="chips"><span>{l.expCount} exp</span><span>{l.eduCount} edu</span><span>{l.skillCount} skills</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: `src/components/LeadDrawer.tsx`**
```tsx
import type { LeadDetail } from '@aura/contract';
export function LeadDrawer({ lead }: { lead: LeadDetail | null }) {
  if (!lead) return <div className="drawer"><p className="muted">Select a lead to see details.</p></div>;
  return (
    <div className="drawer">
      <h4>{lead.fullName}</h4>
      <div className="sub">{[lead.currentTitle, lead.currentCompany].filter(Boolean).join(' @ ')}</div>
      <div className="loc">{lead.location}</div>
      {lead.about && (<><div className="lbl">About</div><div className="row">{lead.about}</div></>)}
      <div className="lbl">Experience</div>
      {lead.experience.map((e, i) => <div className="row" key={i}><b>{e.title}</b>{e.company ? ` · ${e.company}` : ''} <span className="muted">{e.dates}</span></div>)}
      <div className="lbl">Education</div>
      {lead.education.map((e, i) => <div className="row" key={i}>{e.school} <span className="muted">{e.years}</span></div>)}
      {lead.skills.length > 0 && (<><div className="lbl">Skills</div><div className="row">{lead.skills.join(' · ')}</div></>)}
    </div>
  );
}
```

- [ ] **Step 6: `src/App.tsx`** — compose + state
```tsx
import { useEffect, useMemo, useState } from 'react';
import type { LeadSummary, LeadDetail } from '@aura/contract';
import { fetchLeads, fetchLead } from './api.js';
import { Sidebar } from './components/Sidebar.js';
import { TopBar } from './components/TopBar.js';
import { LeadsTable } from './components/LeadsTable.js';
import { LeadDrawer } from './components/LeadDrawer.js';

export function App() {
  const [leads, setLeads] = useState<LeadSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => { fetchLeads().then((ls) => { setLeads(ls); if (ls[0]) setSelectedId(ls[0].id); }).catch(console.error); }, []);
  useEffect(() => { if (selectedId) fetchLead(selectedId).then(setDetail).catch(console.error); }, [selectedId]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return leads.filter((l) => !q || l.fullName.toLowerCase().includes(q) || l.currentCompany.toLowerCase().includes(q));
  }, [leads, query]);

  return (
    <div className="aura-shell">
      <Sidebar />
      <div className="aura-main">
        <TopBar count={filtered.length} query={query} onQuery={setQuery} />
        <div className="aura-body">
          <LeadsTable leads={filtered} selectedId={selectedId} onSelect={setSelectedId} />
          <LeadDrawer lead={detail} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Build + typecheck + commit**

Run: `pnpm --filter @aura/dashboard typecheck` (clean) + `pnpm --filter @aura/dashboard build` (succeeds → `dist/`).
```bash
git add apps/dashboard/src
git commit -m "feat(dashboard): leads table + detail drawer + search + CSV (per mockup)"
```

---

## Task 7: Live verification (manual)

- [ ] **Step 1: Run it**

1. `pnpm --filter @aura/brain start` (the DB already has James + Josh from M1).
2. Dev: `pnpm --filter @aura/dashboard dev` → open the Vite URL (e.g. `http://localhost:5173`). The `/leads` proxy hits the brain.
3. Confirm: the leads **table** lists the scraped people with section chips; clicking a row fills the **drawer** (experience/education/skills); **search** filters; **Export CSV** downloads `leads.csv`.

- [ ] **Step 2: Demo build (single origin)**

`pnpm --filter @aura/dashboard build`, then restart the brain → open `http://127.0.0.1:51900`; the brain serves the built dashboard at one URL with the same data.

- [ ] **Step 3: Full-suite gate + commit a note**

Run `pnpm -r test` (all green) + `pnpm -r typecheck`. Append a one-line "dashboard verified live" note to this plan and commit.

---

## Definition of Done
- [ ] `pnpm -r test` green; `pnpm -r typecheck` clean.
- [ ] `GET /leads` / `/leads/:id` / `/leads.csv` serve real lead data.
- [ ] Dashboard renders the leads table + detail drawer + search + CSV export against the live brain (dev proxy AND brain-served build).

## Deferred (later)
- Overview tab (caps/safety/activity — spec §7), Campaigns, Sequences (branching canvas) tabs.
- Live refresh / websocket push of new leads. Pagination/virtualization for large lead counts (the `listLeads` N+1 `getFull` is fine for demo scale).
