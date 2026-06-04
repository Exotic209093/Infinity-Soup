# AURA — Self-Hosted LinkedIn Outreach Automation — Design Spec

**Date:** 2026-06-04
**Status:** Approved (brainstorming) → ready for implementation planning
**Working name:** AURA *(folder is currently "Infinity Soup" — see Open Questions)*

---

## 1. Overview & Goals

AURA is a LinkedIn outreach automation tool — the same product category as DuxSoup / Waalaxy / Expandi, built as an **original implementation** (DuxSoup is used only as a *reference product* for feature ideas; none of its code is copied).

**Primary goal:** a tool the owner runs on their own LinkedIn account for personal / in-house lead-gen.

**Secondary goal (architectural, not v1 scope):** structure the system so it can grow into a commercial, multi-tenant SaaS **without a rewrite**. This single constraint drives the core architecture decision (§3).

### Non-goals for v1
- Multi-account / multi-tenant UI and billing
- Cloud hosting (runs locally on the owner's machine)
- Deep Salesforce / CRM sync (CSV export only)
- Full multichannel email outreach (Phase 2 — designed *for*, not built)

---

## 2. Constraints & Risks (eyes-open)

These are real and shape the design; they are documented rather than hidden.

- **Intellectual property.** AURA is an original build. DuxSoup's extension source is proprietary/copyrighted and is **not** reused. Studying *what* it does is fine; shipping its code is not — and practically, cloning it would also inherit DuxSoup's known automation fingerprint.
- **LinkedIn Terms of Service.** Automating LinkedIn violates its User Agreement. LinkedIn bans accounts and has litigated against scrapers (*hiQ v. LinkedIn*). The safety governor (§6) **reduces** ban risk; it does not eliminate it. Conservative defaults are the deliberate posture.
- **Data protection.** AURA stores rich personal data about real people (GDPR/CCPA relevant, especially once commercialized). Mitigation is designed in from day one: every `lead` carries `scrapedAt`, and a one-call "forget this person" purge is a first-class operation.

---

## 3. Architecture — "Hands & Brain"

The guiding insight: **the code that touches LinkedIn must be tiny, dumb, and run inside the owner's real browser session** (lowest ban risk); **everything heavy lives in a normal local service** where it is easy to build, test, and later host.

### Components
1. **AURA Extension — the "hands"** (Manifest V3, TypeScript)
   A stateless executor. Acts only inside the owner's logged-in LinkedIn tab: navigate, read DOM, click Connect/Follow/Endorse, type & send a message, scrape a profile or search page. Holds no campaign logic, schedule, or secrets. Receives a **Job**, returns a **Result**.

2. **AURA Brain — the "brain"** (local Node/TypeScript service)
   Owns everything that thinks: campaigns, the sequence engine, the scheduler/queue, the **safety governor**, AI personalization (the Claude key lives here, never in the extension), the lead database, CSV export, and — Phase 2 — the email channel. Serves the dashboard.

3. **AURA Dashboard** — local web UI served by the brain at `localhost:<port>`. Where campaigns are built, targets imported, live activity watched, and leads reviewed/exported. (A small extension popup shows connected/running/paused + an emergency stop.)

### The Job/Result contract (the portability seam)
```
Brain ──Job──▶ Extension              Extension ──Result──▶ Brain
{ id,                                  { jobId,
  type: 'visit'|'connect'|'message'      status: 'ok'|'failed'|'skipped',
       |'follow'|'endorse'               data?:     { ...scraped fields },
       |'scrapeProfile'|'scrapeSearch',  observed?: { connectionState, warnings },
  target: <profileUrl|urn>,              error? }
  payload: { note?, text?, ... } }
```
Transport: **WebSocket to `localhost`**, with the extension holding a local auth token so no arbitrary web page can drive the hands. The brain *pushes* jobs on its own schedule; the hands never act autonomously.

**Why no rewrite later:** the contract is transport-agnostic. Local now (WS→localhost); commercial later = the *same* hands speaking the *same* contract to a *hosted* brain. A URL change, not an architecture change.

### Stack (recommended, all approved)
- TypeScript end-to-end (shared Job/Result types across hands and brain)
- Extension: **WXT** (modern MV3 tooling, HMR)
- Brain: **Node + Fastify**, in-process persisted queue (no Redis at this scale)
- Storage: **SQLite via Drizzle** (typed schema doubles as the data model)
- AI: **Claude** via the Anthropic SDK
- Dashboard: **React + Vite**

---

## 4. Feature Scope

### v1 (build now)
- Auto **connection requests** (bulk, from search/list/CSV, throttled)
- **Sequences** as a **branching canvas** (see §5/§7) with waits and conditions
- **Profile visits / follows / endorsements** (warm-up actions)
- **Lead scraping → CSV export** with rich profile capture (§5)
- **AI-personalized** notes & messages (the differentiator)
- **Safety / anti-ban governor** (§6)

### Phase 2 (designed for, not built)
- **Multichannel email** (email-finding + sending + deliverability)
- `lead_snapshot` history (job-change detection triggers)
- Commercial path: multi-tenant brain, hosted, billing

### Out of scope (revisit only if priorities change)
- Deep Salesforce/CRM two-way sync

---

## 5. Data Model

SQLite/Drizzle. Each table has one clear job. The `account` table is a deliberate **multi-tenant seam** (one row in v1).

### Core tables
| Table | Purpose | Key fields |
|---|---|---|
| `account` | One row in v1 — the LinkedIn identity + tunables. Future tenant boundary. | id, name, liProfileUrl, settings |
| `campaign` | A named outreach effort. | id, accountId, name, status (draft/running/paused/done), settings |
| `lead` | A person + scraped profile (structured columns). Unique by profileUrl. | see below |
| `node` | A node in a campaign's sequence graph (replaces flat "step"). | id, campaignId, type, config, x, y |
| `edge` | A branch between nodes, with the condition that selects it. | id, campaignId, fromNodeId, toNodeId, condition |
| `enrollment` | Per-lead state machine — the heart of execution. | id, campaignId, leadId, currentNodeId, state, connectionState, nextRunAt, repliedAt |
| `job` | Queue **and** audit log **and** safety-accounting source. | id, type, target, payload, status, scheduledFor, attempts, result, timestamps |
| `setting` | Tunables (caps, hours, warm-up curve). Secrets (Claude key) live in `.env`, not the DB. | key, value |

### `lead` — rich profile storage (three layers, so nothing is lost)
**Layer 1 — structured columns:** id, accountId, profileUrl (unique), publicId, urn, firstName, lastName, fullName, headline, about, currentTitle, currentCompany, currentCompanyUrl, location, country, connectionDegree, isOpenToWork, isHiring, followerCount, connectionCount, photoUrl, bannerUrl, pronouns, languages, contactEmail, contactPhone, websites, twitter, **scrapedAt**, createdAt, updatedAt.

**Layer 2 — child tables (queryable rich sections):**
- `lead_experience` — title, company, companyUrl, dates, isCurrent, location, description
- `lead_education` — school, degree, field, years
- `lead_skill` — name, endorsementCount
- `lead_certification` — name, issuer, date

**Layer 3 — `lead.profileRaw` (JSON):** complete snapshot of everything scraped (recommendations, volunteering, honors, featured, recent activity). Safety net + resilience to LinkedIn DOM changes.

**Deferred:** `lead_snapshot` history (overwrite-latest in v1; additive table later for job-change triggers).

---

## 6. Sequence Engine & Safety Governor

### Engine (graph traversal)
A once-a-minute **ticker** in the brain:
1. **Find due work** — enrollments where `state=active` and `nextRunAt ≤ now`.
2. **Resolve current node** — read `enrollment.currentNodeId`; if the node gates on a condition (e.g. `message` requires `connectionState=connected`), wait or check.
3. **Render with AI at dispatch time** — if the node uses AI, call Claude *now* with the lead's scraped profile + the node's instruction (lazy, uses freshest data). Fallback template if AI unavailable.
4. **Ask the governor** `canDispatch(job)` — the single chokepoint. If denied, reschedule `nextRunAt` to the next legal slot.
5. **Dispatch** the Job over WebSocket; mark `dispatched`.
6. **On Result** — record outcome, update `connectionState` from `observed`, then **evaluate outgoing edges** of the current node against the outcome (`accepted` / `replied` / `timeout` / default) and set `currentNodeId` to the chosen target; set `nextRunAt` from the edge/node wait. Failures → a few backed-off retries, then route to a failure/End.
7. **Reply sweep** — a periodic job scans threads for replies from enrolled leads; a reply fires the `replied` branch (typically → "Notify me · End"). This is what keeps it outreach, not spam.

Properties: **restart-safe** (queue + state in SQLite), **idempotent** (every Job has an id + confirmed Result; reconcile dispatched-but-unconfirmed on reconnect), **single source of timing** (nothing acts except via ticker → governor).

### Safety governor (the anti-ban layer)
One module the ticker must consult: `canDispatch(job) → { allow, reason, nextEligibleAt }`. Six layers:

1. **Hard daily caps** per account per action type (counted from the `job` log). Conservative configurable defaults:
   | Action | Default/day |
   |---|---|
   | Connection requests | 20 |
   | Messages | 40 |
   | Profile visits | 60 |
   | Follows / endorsements | 15 |
2. **Warm-up ramp** — scale caps by account age (e.g. ~5 connects/day week 1 → target over ~3 weeks).
3. **Working-hours window** — only act during plausible human hours in the account timezone (default 8am–6pm, weekdays).
4. **Human-like pacing** — randomized gaps (not fixed intervals), occasional longer pauses, randomized daily target (don't hit the cap exactly every day).
5. **Circuit breaker (most important)** — `observed` signals (checkpoint/CAPTCHA, "invitation limit reached", account-restriction interstitial, repeated unexpected DOM) **trip it: pause all campaigns instantly + alert.** Stopping early beats a real restriction.
6. **Dedupe + state gates** — never act twice on a person; respect already-connected/pending; require-accepted-before-message; stop-on-reply.

**Honest caveat:** no layer makes automation zero-risk. Conservative caps + the circuit breaker are the highest-value pieces.

---

## 7. UI

### Dashboard (overview-first — approved)
- **Sidebar:** Dashboard · Campaigns · Leads · Sequences · Settings + a live status pill (Running / breaker state).
- **Overview (home):** today's caps usage (connects/messages), acceptance & replies, a **safety strip** (warm-up week, working hours, circuit-breaker status), a live-activity feed, and a per-campaign mini-list.

### Sequence builder (branching canvas — approved, option B)
- **Node/edge canvas** with drag-from-palette.
- **Palette (v1, confirmed):** Visit · Connect · Message · Endorse · Follow · Wait · Condition · End — plus **Email (Phase 2)**.
- **Branch outcomes:** `accepted` / `replied` / `timeout` (+ default). Example flow: Connect → (not accepted 14d) Withdraw·End / (accepted) Message #1 → (replied) Notify·End / (no reply) Message #2 → …
- **Node config panel:** AI instruction + `{{firstName}}`-style fallback template + **live preview** generating a real note from a sample lead's actual history. (This is the concrete differentiator over template-only tools.)

### Extension popup
- Connection status, running/paused, and an emergency **Stop all**.

---

## 8. Node → Job mapping

Canvas nodes compile to contract Jobs at dispatch:

| Node | Job type(s) |
|---|---|
| Visit | `visit` |
| Connect | `connect` (payload.note, AI-rendered) |
| Message | `message` (payload.text, AI-rendered) |
| Endorse | `endorse` |
| Follow | `follow` |
| Wait | none (sets `nextRunAt`) |
| Condition | none (branch evaluation only) |
| Email (P2) | brain-side send (no extension Job) |
| End | terminal (sets enrollment state) |

Scraping (`scrapeProfile` / `scrapeSearch`) is driven by the Leads import flow, not sequence nodes.

---

## 9. Build Milestones (feeds the implementation plan)

*Numbered M0–M4 to avoid confusion with the "Phase 2" feature set in §4.*

- **M0 — Skeleton & contract.** WXT extension + Fastify brain + WS handshake + local auth token. Prove one `visit` job end-to-end (brain dispatches → hands act in the real LinkedIn tab → Result stored).
- **M1 — Leads.** `scrapeProfile`/`scrapeSearch` → rich `lead` + child tables + `profileRaw` → Leads table in dashboard → CSV export.
- **M2 — Outreach core.** `connect` + `message` jobs; the governor (caps + dedupe + working hours first); the **node/edge model + graph-traversal engine** executing a straight-line (un-branched) sequence seeded as JSON — no visual editor yet.
- **M3 — Canvas & AI.** The **canvas editor** (drag/drop) + branch conditions on edges; AI personalization (Claude) with live preview; reply sweep / stop-on-reply.
- **M4 — Safety hardening & polish.** Warm-up ramp, circuit breaker, human pacing; dashboard overview polish; extension popup.
- **Later.** Email multichannel; `lead_snapshot` history; multi-tenant/cloud path.

---

## 10. Open Questions

1. **Project/repo name & location.** Build under the current "Infinity Soup" folder, or rename to `AURA`? (Note: the folder lives under OneDrive — `node_modules`/build output should be git-ignored *and* OneDrive can be slow to sync a working repo; consider moving the repo outside OneDrive before scaffolding.)
2. **Email provider** (Phase 2): email-finding source + sending transport (own SMTP/Gmail vs provider).
3. **LinkedIn DOM selectors** are a discovery task during Phase 1 (they change; the scraper must be resilient — hence `profileRaw`).
4. Confirm **single-account** assumption for all of v1 (the `account` seam supports more later).
