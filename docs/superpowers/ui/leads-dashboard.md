# AURA — Leads Dashboard (agreed UI)

**Status:** Approved in a visual-brainstorm session (2026-06-05). The "demo centerpiece" — the first real screen, built on the leads M1 already scrapes into the DB. This is the **Leads view** of the broader overview-first dashboard described in the design spec §7.

**Visual reference:** [`dashboard-leads-mockup.html`](dashboard-leads-mockup.html) (the approved wireframe; open in a browser).

> Captured here durably because the original lived only in the gitignored `.superpowers/brainstorm/` companion folder (ephemeral). Not yet built — this is the natural next milestone now that M1 scraping is done + merged to `main`.

## Layout

A local React app served by the brain at `localhost:<httpPort>` (reads the `lead` + `lead_experience`/`lead_education`/`lead_skill` tables from M1).

```
┌─ Sidebar ──┐┌─ Main ───────────────────────────────────────────────┐
│ ◆ AURA     ││ Leads · N            [search name/company]  [Export CSV]│
│ ● Brain    │├──────────────────────────────────────────────────────┤
│   connected││  Leads TABLE (≈54%)        │  Detail DRAWER (selected) │
│ · idle     ││  Name | Company | Location │  James Collard            │
│            ││       | Sections           │  Solutions Engineer @ Apex│
│ Overview   ││  ─────────────────────────  │  Chatham, UK · scraped …  │
│ Leads ◀    ││  James Collard  Apex  …    │  EXPERIENCE               │
│ Campaigns  ││   Solutions Eng  5exp 1edu │   Solutions Engineer · …  │
│ Sequences  ││  Josh Dolby     Apex  …    │   Junior Software Dev · …  │
│ Settings   ││   Solutions Eng  4exp 2edu │  EDUCATION  Waterfront UTC │
└────────────┘│                            │  SKILLS  Business Sol… ·…  │
              └────────────────────────────────────────────────────────┘
```

### Components
- **Sidebar:** `◆ AURA` logo · a **"Brain connected · idle"** status pill · nav: **Overview · Leads (active) · Campaigns · Sequences · Settings**. (Matches spec §7's sidebar.)
- **Top bar:** `Leads · <count>` title · a **search** input (name / company) · an **Export CSV** button (wraps the existing `export-leads` CLI / a brain endpoint).
- **Leads table** (left, ~54%): columns **Name** (with current-title subtitle) · **Company** · **Location** · **Sections** (chips: `N exp` / `N edu` / `N skills`). Rows are selectable (selected row highlighted).
- **Detail drawer** (right): for the selected lead — header (name, `role @ company`, location + "scraped <when>"), then **Experience** (title · company · dates, newest first), **Education** (school · years), **Skills** (comma list). Sourced from the lead's child tables + `profileRaw`.

### Notes / next steps
- New app: likely `apps/dashboard` (React + Vite, per spec stack), served by the brain (add a static-serve + a `GET /leads` / `GET /leads/:id` JSON API to the Fastify app).
- This is the **Leads** tab; the **Overview** tab (caps usage, safety strip, live activity — spec §7) and **Sequences** (the branching node-canvas, spec §7) are later tabs of the same shell.
- Build it as its own milestone (spec §9 lists the dashboard as deferred from M0/M1).
