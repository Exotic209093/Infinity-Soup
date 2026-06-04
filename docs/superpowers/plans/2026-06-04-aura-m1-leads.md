# AURA M1 — Leads (rich profile scrape → DB → CSV) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visit a LinkedIn profile, richly scrape it (name, headline, location, about, experience, education, skills, certifications), persist it into a proper migration-managed leads database, and export leads to CSV.

**Architecture:** Builds directly on M0. The extension "hands" render the profile in a **non-intrusive unfocused popup window** (`chrome.windows.create({type:'popup', focused:false})` → `visibilityState:'visible'` → React renders, no focus theft), then a content-script scraper (pure functions over a `Document`, TDD'd against a **real captured fixture**) returns a structured `ScrapedProfile`. The brain persists it via a `LeadStore` into Drizzle-migration-managed `lead` + child tables, and a CLI exports leads to CSV.

**Tech Stack:** (unchanged from M0) TypeScript · pnpm · Vitest + happy-dom · Fastify · ws · Drizzle ORM + better-sqlite3 + **drizzle-kit migrations (new in M1)** · WXT 0.20.

**Scope / non-goals:** M1 scrapes **one profile at a time** (URLs enqueued manually, as in M0). **Deferred to later milestones:** bulk `scrapeSearch` (M2), the React dashboard (own milestone), `/details/<section>/` sub-page pagination for *full* education/skills/cert lists (M1 takes what's on the main profile + first expandable set), MV3 SW keepalive (M4), and multichannel email (Phase 2).

**Carried-over context from M0 (read before starting):**
- The profile **name is in an `<h2>`** (zero `<h1>`s); select on the **class** `text-heading-xlarge`, not the tag. `document.title` = `"<Name> | LinkedIn"` is the authoritative name cross-check.
- LinkedIn **duplicates every text value**: `<span aria-hidden="true">X</span><span class="visually-hidden">X</span>`. Reading `.textContent` yields `"XX"`. Always read exactly **one** of the pair (use the `oneText` helper, Task 2).
- `:has()` works in Chrome but **not in happy-dom** (the test env) — in parser code prefer `closest('section')`/manual traversal so fixture tests stay green.
- M0 contract types live in `packages/contract/src/index.ts`; the brain DB/store in `apps/brain/src/db/`; the extension parsers in `apps/extension/src/parse/` (pure functions + ordered-fallback selector arrays + fixture tests — follow this exact pattern).

---

## File Structure

```
packages/contract/src/index.ts          MODIFY: add ScrapedProfile + Experience/Education/Skill/Certification zod schemas
apps/brain/
  drizzle.config.ts                      CREATE: drizzle-kit config (sqlite)
  drizzle/                               CREATE (generated): 0000_*.sql + meta/  (committed)
  src/db/schema.ts                       MODIFY: keep jobs; add lead + lead_experience/education/skill/certification
  src/db/store.ts                        MODIFY: store.test switches to migrate(); JobStore unchanged
  src/db/lead-store.ts                   CREATE: LeadStore.upsertProfile(scraped) — lead + children in a txn
  src/db/lead-store.test.ts              CREATE
  src/index.ts                           MODIFY: migrate() at startup instead of inline CREATE TABLE; wire scrapeProfile→LeadStore
  src/csv.ts                             CREATE: leadsToCsv(rows) pure function
  src/csv.test.ts                        CREATE
  src/export-leads.ts                    CREATE: CLI — write leads.csv
apps/extension/
  src/parse/text.ts                      CREATE: oneText() dedup helper
  src/parse/text.test.ts                 CREATE
  src/parse/profile-fields.ts            CREATE: top-card parser (name/headline/location/about/current)
  src/parse/profile-fields.test.ts       CREATE
  src/parse/experience.ts                CREATE
  src/parse/experience.test.ts           CREATE
  src/parse/education.ts                 CREATE
  src/parse/education.test.ts            CREATE
  src/parse/skills.ts                    CREATE (skills + certifications)
  src/parse/skills.test.ts               CREATE
  src/parse/scrape-profile.ts            CREATE: scrapeProfile(doc): ScrapedProfile (composes the above)
  src/parse/scrape-profile.test.ts       CREATE
  src/parse/__fixtures__/real-profile.html  CREATE (Task 1, user-captured)
  src/render/open-profile.ts             CREATE: openProfileWindow(url) → renders + scrapes via popup window (pure-ish glue, manual-verified)
  entrypoints/linkedin.content.ts        MODIFY: handle {kind:'scrapeProfile'} → scrapeProfile(document)
  entrypoints/background.ts              MODIFY: executeJob 'scrapeProfile' uses the popup-window render
```

---

## Task 1: Capture a real profile fixture (the test bed)

**Files:**
- Create: `apps/extension/src/parse/__fixtures__/real-profile.html`

> Every parser in M1 is TDD'd against this real capture — M0 proved we cannot guess LinkedIn's DOM. This is a **manual** step (only the human is logged into LinkedIn).

- [ ] **Step 1: Capture a content-rich profile (manual)**

In Chrome, logged into LinkedIn, open a profile that has Experience, Education, Skills, and Certifications filled in (your own, or a colleague's). **Scroll slowly to the bottom and back up** so the lazy-loaded sections render into the DOM. Then DevTools (F12) → Console:
```js
copy(document.documentElement.outerHTML)
```
Paste into `apps/extension/src/parse/__fixtures__/real-profile.html` and save. In a comment on line 1, record whose profile it is and the expected values you can eyeball (full name, headline, current company, one school, one skill) — the parser tests assert against these.

- [ ] **Step 2: Sanity-check the capture**

Run: `node -e "const h=require('fs').readFileSync('apps/extension/src/parse/__fixtures__/real-profile.html','utf8'); console.log('bytes',h.length, 'h2s', (h.match(/<h2/g)||[]).length, 'experience-anchor', h.includes('id=\"experience\"'), 'pvs-list', h.includes('pvs-list'))"`
Expected: bytes > 200000, h2s > 0, experience-anchor true, pvs-list true. (If `experience-anchor` is false, you didn't scroll far enough — recapture.)

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/parse/__fixtures__/real-profile.html
git commit -m "test(extension): capture real LinkedIn profile fixture for M1 scraper"
```

---

## Task 2: `oneText` dedup helper

**Files:**
- Create: `apps/extension/src/parse/text.ts`, `apps/extension/src/parse/text.test.ts`

> LinkedIn renders `<span aria-hidden="true">X</span><span class="visually-hidden">X</span>`. `oneText` reads exactly one copy so values are never doubled. Used by every parser.

- [ ] **Step 1: Write the failing test**

`apps/extension/src/parse/text.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { oneText } from './text.js';

describe('oneText', () => {
  it('reads the aria-hidden copy, not both', () => {
    const doc = new DOMParser().parseFromString(
      '<div id="r"><span aria-hidden="true">Senior Engineer</span><span class="visually-hidden">Senior Engineer</span></div>',
      'text/html',
    );
    expect(oneText(doc.getElementById('r'))).toBe('Senior Engineer');
  });

  it('falls back to trimmed textContent when no aria-hidden child', () => {
    const doc = new DOMParser().parseFromString('<div id="r">  Hello  </div>', 'text/html');
    expect(oneText(doc.getElementById('r'))).toBe('Hello');
  });

  it('returns empty string for null', () => {
    expect(oneText(null)).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aura/extension test src/parse/text.test.ts`
Expected: FAIL — no `oneText`.

- [ ] **Step 3: Implement**

`apps/extension/src/parse/text.ts`:
```ts
/**
 * LinkedIn duplicates visible text into an aria-hidden span and a `.visually-hidden`
 * sibling. Reading `.textContent` yields the value twice ("XX"). oneText reads exactly
 * one copy: prefer the visible `[aria-hidden="true"]` node, else the element's own text.
 */
export function oneText(el: Element | null): string {
  if (!el) return '';
  const visible = el.querySelector('[aria-hidden="true"]');
  return (visible?.textContent ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aura/extension test src/parse/text.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/parse/text.ts apps/extension/src/parse/text.test.ts
git commit -m "feat(extension): oneText helper to dedupe LinkedIn aria-hidden/visually-hidden text"
```

---

## Task 3: Top-card parser (name, headline, location, about, current role)

**Files:**
- Create: `apps/extension/src/parse/profile-fields.ts`, `apps/extension/src/parse/profile-fields.test.ts`

> Tag-agnostic, class-based, scoped to the top-card container. Selectors below are research-grounded **candidates** — Step 3 adjusts any that don't match the real fixture (the test asserts non-empty extraction, so a wrong selector fails loudly).

- [ ] **Step 1: Write the failing test (asserts against the real fixture + title cross-check)**

`apps/extension/src/parse/profile-fields.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseProfileFields } from './profile-fields.js';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '__fixtures__/real-profile.html'), 'utf8');
const doc = new DOMParser().parseFromString(html, 'text/html');

describe('parseProfileFields (real fixture)', () => {
  const f = parseProfileFields(doc);

  it('extracts the full name (matching the <title>)', () => {
    const titleName = doc.title.replace(/\s*\|\s*LinkedIn\s*$/, '').trim();
    expect(f.fullName).toBeTruthy();
    expect(f.fullName).toBe(titleName);
  });

  it('extracts a non-empty headline', () => {
    expect(f.headline.length).toBeGreaterThan(2);
  });

  it('extracts a plausible location (no digits, not a link label)', () => {
    expect(f.location).toBeTruthy();
    expect(f.location).not.toMatch(/connections?|followers?|contact info/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aura/extension test src/parse/profile-fields.test.ts`
Expected: FAIL — no `parseProfileFields`.

- [ ] **Step 3: Implement (adjust selectors to the fixture if a test fails)**

`apps/extension/src/parse/profile-fields.ts`:
```ts
import { oneText } from './text.js';

export interface ProfileFields {
  fullName: string;
  headline: string;
  location: string;
  about: string;
  currentCompany: string;
  currentTitle: string;
}

const TOP_CARD = ['section.artdeco-card.pv-top-card', '.pv-top-card', '[data-view-name="profile-card"]', '.pv-text-details__left-panel', 'main'];

function topCard(doc: Document): Element {
  for (const sel of TOP_CARD) { const el = doc.querySelector(sel); if (el) return el; }
  return doc.body;
}

function firstText(root: Element | Document, selectors: string[]): string {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    const t = oneText(el);
    if (t) return t;
  }
  return '';
}

function nameFromTitle(doc: Document): string {
  return doc.title.replace(/\s*\|\s*LinkedIn\s*$/, '').replace(/^\(\d+\)\s*/, '').trim();
}

export function parseProfileFields(doc: Document): ProfileFields {
  const card = topCard(doc);

  // Name: class-based (survives h1->h2); title is the authoritative cross-check/fallback.
  const domName = firstText(card, ['.text-heading-xlarge', 'h2.text-heading-xlarge', 'h1.text-heading-xlarge']);
  const fullName = domName || nameFromTitle(doc);

  // Headline: first .text-body-medium in the top card.
  const headline = firstText(card, ['.text-body-medium.break-words', '.text-body-medium']);

  // Location: a .text-body-small.t-black--light span that is plain text (no link, no digits).
  let location = '';
  const candidates = Array.from(card.querySelectorAll('span.text-body-small.inline.t-black--light, span.text-body-small.t-black--light'));
  for (const el of candidates) {
    const t = oneText(el);
    if (t && !/connections?|followers?|contact info/i.test(t) && !/\d/.test(t) && !el.closest('a')) { location = t; break; }
  }

  // About: prefer the visually-hidden (full, untruncated) copy under #about.
  const aboutSection = doc.querySelector('#about')?.closest('section') ?? null;
  let about = '';
  if (aboutSection) {
    const el = aboutSection.querySelector('.inline-show-more-text span[aria-hidden="true"], .pv-shared-text-with-see-more span[aria-hidden="true"], span.visually-hidden');
    about = (el?.textContent ?? '').replace(/\s*…?\s*see more\s*$/i, '').replace(/\s+/g, ' ').trim();
  }

  // Current role: first Experience entry (filled by experience parser at compose time); leave blank here.
  return { fullName, headline, location, about, currentCompany: '', currentTitle: '' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aura/extension test src/parse/profile-fields.test.ts`
Expected: PASS (3 tests). If a field test fails, open `real-profile.html`, find the actual element/class for that field, and add it to the front of that field's selector list. Re-run.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/parse/profile-fields.ts apps/extension/src/parse/profile-fields.test.ts
git commit -m "feat(extension): top-card profile-fields parser (fixture-tested)"
```

---

## Task 4: Experience parser

**Files:**
- Create: `apps/extension/src/parse/experience.ts`, `apps/extension/src/parse/experience.test.ts`

> Section anchored by `#experience` → climb to `section` → `ul.pvs-list > li`. Per entry: title (`.t-bold`), company (first `.t-14.t-normal`), dates (first `.t-14.t-normal.t-black--light`). Use `closest()` not `:has()` (happy-dom). Selectors are candidates — adjust to the fixture.

- [ ] **Step 1: Write the failing test**

`apps/extension/src/parse/experience.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseExperience } from './experience.js';

const here = dirname(fileURLToPath(import.meta.url));
const doc = new DOMParser().parseFromString(readFileSync(join(here, '__fixtures__/real-profile.html'), 'utf8'), 'text/html');

describe('parseExperience (real fixture)', () => {
  const xs = parseExperience(doc);
  it('finds at least one experience entry', () => {
    expect(xs.length).toBeGreaterThan(0);
  });
  it('each entry has a non-empty title and is not double-read', () => {
    for (const x of xs) {
      expect(x.title.length).toBeGreaterThan(0);
      // not doubled: the title should not be an exact "XX" repeat
      expect(x.title).not.toMatch(/^(.{3,})\1$/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aura/extension test src/parse/experience.test.ts`
Expected: FAIL — no `parseExperience`.

- [ ] **Step 3: Implement**

`apps/extension/src/parse/experience.ts`:
```ts
import { oneText } from './text.js';

export interface ExperienceEntry {
  title: string;
  company: string;
  employmentType: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  location: string;
  companyUrl: string;
  description: string;
}

function experienceSection(doc: Document): Element | null {
  const anchor = doc.querySelector('#experience');
  return anchor ? anchor.closest('section') : null;
}

function splitDot(s: string): string[] {
  return s.split('·').map((p) => p.trim()).filter(Boolean);
}

export function parseExperience(doc: Document): ExperienceEntry[] {
  const section = experienceSection(doc);
  if (!section) return [];
  const items = Array.from(section.querySelectorAll('li.pvs-list__item--padded, li.artdeco-list__item, ul.pvs-list > li'));
  const out: ExperienceEntry[] = [];
  for (const li of items) {
    const title = oneText(li.querySelector('.t-bold'));
    if (!title) continue; // header rows / empty
    const companyRaw = oneText(li.querySelector('span.t-14.t-normal:not(.t-black--light)'));
    const [company, employmentType = ''] = splitDot(companyRaw);
    const dateRaw = oneText(li.querySelector('span.t-14.t-normal.t-black--light'));
    const [dateRange = '', _dur = ''] = splitDot(dateRaw);
    const [startDate = '', endDate = ''] = dateRange.split('-').map((s) => s.trim());
    const companyUrl = li.querySelector('a[href*="/company/"]')?.getAttribute('href') ?? '';
    const description = oneText(li.querySelector('.inline-show-more-text, .pvs-entity__sub-components'));
    out.push({
      title,
      company: company ?? '',
      employmentType,
      startDate,
      endDate,
      isCurrent: /present/i.test(endDate),
      location: '',
      companyUrl,
      description,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aura/extension test src/parse/experience.test.ts`
Expected: PASS. If `xs.length === 0`, inspect the fixture's experience `<li>` classes and adjust the `items` selector. If a title is doubled, the `.t-bold` element lacks an `aria-hidden` child — adjust `oneText`/selector to target the inner `span[aria-hidden="true"]`. **Grouped multi-role entries** (several roles at one company) nest a second `ul` under `.pvs-entity__sub-components` — if the fixture has one, the top selector may emit a spurious "company-as-title" row; add a dedup/branch (the research notes the nested-`ul` shape) only if the fixture reveals it.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/parse/experience.ts apps/extension/src/parse/experience.test.ts
git commit -m "feat(extension): experience-section parser (fixture-tested)"
```

---

## Task 5: Education parser

**Files:**
- Create: `apps/extension/src/parse/education.ts`, `apps/extension/src/parse/education.test.ts`

> `#education` → `section` → entries `div[data-view-name="profile-component-entity"]` / `li`. Per entry, ordered `span[aria-hidden="true"]`: [0]=school, [1]=degree+field (split on first comma), [2]=dates.

- [ ] **Step 1: Write the failing test**

`apps/extension/src/parse/education.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEducation } from './education.js';

const here = dirname(fileURLToPath(import.meta.url));
const doc = new DOMParser().parseFromString(readFileSync(join(here, '__fixtures__/real-profile.html'), 'utf8'), 'text/html');

describe('parseEducation (real fixture)', () => {
  const eds = parseEducation(doc);
  it('finds at least one education entry with a school', () => {
    expect(eds.length).toBeGreaterThan(0);
    expect(eds[0].school.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aura/extension test src/parse/education.test.ts`
Expected: FAIL — no `parseEducation`.

- [ ] **Step 3: Implement**

`apps/extension/src/parse/education.ts`:
```ts
export interface EducationEntry {
  school: string;
  degree: string;
  field: string;
  startYear: number | null;
  endYear: number | null;
}

function section(doc: Document): Element | null {
  const a = doc.querySelector('#education');
  return a ? a.closest('section') : null;
}

function lines(entry: Element): string[] {
  // one canonical line per row: the aria-hidden visible copy
  return Array.from(entry.querySelectorAll('span[aria-hidden="true"]'))
    .map((s) => (s.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function years(s: string): [number | null, number | null] {
  const ys = (s.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number);
  return [ys[0] ?? null, ys[1] ?? null];
}

export function parseEducation(doc: Document): EducationEntry[] {
  const sec = section(doc);
  if (!sec) return [];
  const entries = Array.from(sec.querySelectorAll('div[data-view-name="profile-component-entity"], li.pvs-list__item--padded, ul.pvs-list > li'));
  const out: EducationEntry[] = [];
  for (const e of entries) {
    const ls = lines(e);
    const school = ls[0] ?? '';
    if (!school) continue;
    const degreeLine = ls.find((l, i) => i > 0 && !/\b(19|20)\d{2}\b/.test(l)) ?? '';
    const dateLine = ls.find((l) => /\b(19|20)\d{2}\b/.test(l)) ?? '';
    const [degree, field = ''] = degreeLine.split(',').map((p) => p.trim());
    const [startYear, endYear] = years(dateLine);
    out.push({ school, degree: degree ?? '', field, startYear, endYear });
  }
  // dedupe consecutive identical schools (a11y twin lists can repeat)
  return out.filter((e, i) => i === 0 || e.school !== out[i - 1].school);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aura/extension test src/parse/education.test.ts`
Expected: PASS. Adjust the `entries` selector against the fixture if length is 0.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/parse/education.ts apps/extension/src/parse/education.test.ts
git commit -m "feat(extension): education-section parser (fixture-tested)"
```

---

## Task 6: Skills + certifications parser

**Files:**
- Create: `apps/extension/src/parse/skills.ts`, `apps/extension/src/parse/skills.test.ts`

> Skills: `#skills` section, first `span[aria-hidden="true"]` per entry = skill name. Certifications: `#licenses_and_certifications` section, [0]=name, issuer line, date line.

- [ ] **Step 1: Write the failing test**

`apps/extension/src/parse/skills.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSkills, parseCertifications } from './skills.js';

const here = dirname(fileURLToPath(import.meta.url));
const doc = new DOMParser().parseFromString(readFileSync(join(here, '__fixtures__/real-profile.html'), 'utf8'), 'text/html');

describe('parseSkills / parseCertifications (real fixture)', () => {
  it('skills: returns a deduped list of non-empty names (if the section exists)', () => {
    const skills = parseSkills(doc);
    expect(Array.isArray(skills)).toBe(true);
    for (const s of skills) expect(s.name.length).toBeGreaterThan(0);
    expect(new Set(skills.map((s) => s.name)).size).toBe(skills.length); // deduped
  });

  it('certifications: returns an array (entries have a name)', () => {
    const certs = parseCertifications(doc);
    expect(Array.isArray(certs)).toBe(true);
    for (const c of certs) expect(c.name.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aura/extension test src/parse/skills.test.ts`
Expected: FAIL — no `skills.ts`.

- [ ] **Step 3: Implement**

`apps/extension/src/parse/skills.ts`:
```ts
export interface SkillEntry { name: string; }
export interface CertificationEntry { name: string; issuer: string; issuedDate: string; }

function sectionByAnchor(doc: Document, id: string): Element | null {
  const a = doc.querySelector('#' + id);
  return a ? a.closest('section') : null;
}

function entries(sec: Element): Element[] {
  return Array.from(sec.querySelectorAll('div[data-view-name="profile-component-entity"], li.pvs-list__item--padded, ul.pvs-list > li'));
}

function firstLine(e: Element): string {
  const s = e.querySelector('span[aria-hidden="true"]');
  return (s?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function parseSkills(doc: Document): SkillEntry[] {
  const sec = sectionByAnchor(doc, 'skills');
  if (!sec) return [];
  const names = entries(sec).map(firstLine).filter(Boolean);
  return Array.from(new Set(names)).map((name) => ({ name }));
}

export function parseCertifications(doc: Document): CertificationEntry[] {
  const sec = sectionByAnchor(doc, 'licenses_and_certifications');
  if (!sec) return [];
  const out: CertificationEntry[] = [];
  for (const e of entries(sec)) {
    const lines = Array.from(e.querySelectorAll('span[aria-hidden="true"]'))
      .map((s) => (s.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const name = lines[0] ?? '';
    if (!name) continue;
    const issuer = (lines[1] ?? '').replace(/^Issued by\s*/i, '').split('·')[0].trim();
    const issuedDate = (lines.find((l) => /^Issued\s/i.test(l)) ?? '').replace(/^Issued\s*/i, '').trim();
    out.push({ name, issuer, issuedDate });
  }
  return out.filter((c, i) => i === 0 || c.name !== out[i - 1].name);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aura/extension test src/parse/skills.test.ts`
Expected: PASS. (Skills/certs may legitimately be empty if the captured profile lacks them — the test allows empty arrays but enforces shape. If you expected skills and got none, the `#skills` anchor or entry selector needs fixture adjustment.)

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/parse/skills.ts apps/extension/src/parse/skills.test.ts
git commit -m "feat(extension): skills + certifications parsers (fixture-tested)"
```

---

## Task 7: `ScrapedProfile` contract schema + `scrapeProfile(doc)` compose

**Files:**
- Modify: `packages/contract/src/index.ts`
- Create: `apps/extension/src/parse/scrape-profile.ts`, `apps/extension/src/parse/scrape-profile.test.ts`

- [ ] **Step 1: Add the contract schema (and run contract tests to confirm no regression)**

Append to `packages/contract/src/index.ts`:
```ts
export const ExperienceSchema = z.object({
  title: z.string(), company: z.string().default(''), employmentType: z.string().default(''),
  startDate: z.string().default(''), endDate: z.string().default(''), isCurrent: z.boolean().default(false),
  location: z.string().default(''), companyUrl: z.string().default(''), description: z.string().default(''),
});
export const EducationSchema = z.object({
  school: z.string(), degree: z.string().default(''), field: z.string().default(''),
  startYear: z.number().nullable().default(null), endYear: z.number().nullable().default(null),
});
export const SkillSchema = z.object({ name: z.string() });
export const CertificationSchema = z.object({ name: z.string(), issuer: z.string().default(''), issuedDate: z.string().default('') });

export const ScrapedProfileSchema = z.object({
  profileUrl: z.string(),
  fullName: z.string(),
  headline: z.string().default(''),
  location: z.string().default(''),
  about: z.string().default(''),
  currentCompany: z.string().default(''),
  currentTitle: z.string().default(''),
  experience: z.array(ExperienceSchema).default([]),
  education: z.array(EducationSchema).default([]),
  skills: z.array(SkillSchema).default([]),
  certifications: z.array(CertificationSchema).default([]),
});
export type ScrapedProfile = z.infer<typeof ScrapedProfileSchema>;
```

Run: `pnpm --filter @aura/contract test` → expected PASS (existing 5 tests unaffected).

- [ ] **Step 2: Write the failing compose test**

`apps/extension/src/parse/scrape-profile.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrapeProfile } from './scrape-profile.js';
import { ScrapedProfileSchema } from '@aura/contract';

const here = dirname(fileURLToPath(import.meta.url));
const doc = new DOMParser().parseFromString(readFileSync(join(here, '__fixtures__/real-profile.html'), 'utf8'), 'text/html');

describe('scrapeProfile (real fixture)', () => {
  const p = scrapeProfile(doc, 'https://www.linkedin.com/in/example');
  it('produces a contract-valid ScrapedProfile', () => {
    expect(() => ScrapedProfileSchema.parse(p)).not.toThrow();
  });
  it('has a name and at least one experience entry', () => {
    expect(p.fullName).toBeTruthy();
    expect(p.experience.length).toBeGreaterThan(0);
  });
  it('derives current company/title from the present-dated experience', () => {
    if (p.experience.some((e) => e.isCurrent)) {
      expect(p.currentCompany || p.currentTitle).toBeTruthy();
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @aura/extension test src/parse/scrape-profile.test.ts`
Expected: FAIL — no `scrapeProfile`.

- [ ] **Step 4: Implement the compose**

`apps/extension/src/parse/scrape-profile.ts`:
```ts
import type { ScrapedProfile } from '@aura/contract';
import { parseProfileFields } from './profile-fields.js';
import { parseExperience } from './experience.js';
import { parseEducation } from './education.js';
import { parseSkills, parseCertifications } from './skills.js';

export function scrapeProfile(doc: Document, profileUrl: string): ScrapedProfile {
  const fields = parseProfileFields(doc);
  const experience = parseExperience(doc);
  const current = experience.find((e) => e.isCurrent) ?? experience[0];
  return {
    profileUrl,
    fullName: fields.fullName,
    headline: fields.headline,
    location: fields.location,
    about: fields.about,
    currentCompany: current?.company ?? '',
    currentTitle: current?.title ?? '',
    experience,
    education: parseEducation(doc),
    skills: parseSkills(doc),
    certifications: parseCertifications(doc),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @aura/extension test src/parse/scrape-profile.test.ts && pnpm --filter @aura/extension typecheck`
Expected: PASS + clean typecheck.

- [ ] **Step 6: Commit**

```bash
git add packages/contract/src/index.ts apps/extension/src/parse/scrape-profile.ts apps/extension/src/parse/scrape-profile.test.ts
git commit -m "feat: ScrapedProfile contract + scrapeProfile compose (fixture-tested)"
```

---

## Task 8: Drizzle migrations + lead schema

**Files:**
- Create: `apps/brain/drizzle.config.ts`, `apps/brain/drizzle/*` (generated)
- Modify: `apps/brain/src/db/schema.ts`, `apps/brain/package.json`, `apps/brain/src/index.ts`, `apps/brain/src/db/store.test.ts`

> Replace M0's inline `CREATE TABLE` with proper migrations and add the lead tables. (High-confidence, research-verified Drizzle setup.)

- [ ] **Step 1: Create `apps/brain/drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: '.aura/aura.sqlite' },
});
```

- [ ] **Step 2: Extend `apps/brain/src/db/schema.ts` (keep `jobs`, add lead tables)**

Append to `schema.ts` (keep the existing `jobs` export and its `JobRow` type exactly):
```ts
export const lead = sqliteTable('lead', {
  id: text('id').primaryKey(),
  profileUrl: text('profile_url').notNull(),
  fullName: text('full_name').notNull(),
  headline: text('headline'),
  location: text('location'),
  about: text('about'),
  currentCompany: text('current_company'),
  currentTitle: text('current_title'),
  profileRaw: text('profile_raw', { mode: 'json' }).$type<Record<string, unknown>>(),
  status: text('status').notNull().default('new'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at'),
});
export type LeadRow = typeof lead.$inferSelect;

export const leadExperience = sqliteTable('lead_experience', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').notNull().references(() => lead.id, { onDelete: 'cascade' }),
  title: text('title'), company: text('company'), employmentType: text('employment_type'),
  startDate: text('start_date'), endDate: text('end_date'), isCurrent: integer('is_current'),
  location: text('location'), companyUrl: text('company_url'), description: text('description'),
});
export const leadEducation = sqliteTable('lead_education', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').notNull().references(() => lead.id, { onDelete: 'cascade' }),
  school: text('school'), degree: text('degree'), field: text('field'),
  startYear: integer('start_year'), endYear: integer('end_year'),
});
export const leadSkill = sqliteTable('lead_skill', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').notNull().references(() => lead.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
});
export const leadCertification = sqliteTable('lead_certification', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').notNull().references(() => lead.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), issuer: text('issuer'), issuedDate: text('issued_date'),
});
```

- [ ] **Step 3: Add scripts + generate the first migration**

Add to `apps/brain/package.json` scripts: `"db:generate": "drizzle-kit generate"`, `"db:migrate": "drizzle-kit migrate"`.

Ensure deps are installed first: `pnpm install` (drizzle-kit ^0.28 is already an `apps/brain` devDependency from M0, but install if a fresh checkout).

Run (from `apps/brain`): `pnpm drizzle-kit generate --name init`
Expected: creates `apps/brain/drizzle/0000_init.sql` (+ `drizzle/meta/`). **Open `0000_init.sql` and confirm it contains `CREATE TABLE \`jobs\`` AND all five lead tables.** (Because `jobs` now lives in `schema.ts`, a fresh DB is fully migration-managed.)

- [ ] **Step 4: Switch the store test to `migrate()` (failing first)**

Replace the inline `sqlite.exec('CREATE TABLE jobs ...')` in `apps/brain/src/db/store.test.ts`'s `freshStore()` with:
```ts
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle');
function freshStore() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: MIGRATIONS });
  return new JobStore(db);
}
```

Run: `pnpm --filter @aura/brain test src/db/store.test.ts`
Expected: PASS (the migration creates `jobs`; the 3 JobStore tests are unchanged behavior). If it fails to find migrations, verify the `MIGRATIONS` path resolves to `apps/brain/drizzle`.

- [ ] **Step 5: Apply migrations at brain startup**

In `apps/brain/src/index.ts`, replace the inline `sqlite.exec(\`CREATE TABLE IF NOT EXISTS jobs ...\`)` block with:
```ts
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
// ...
const sqlite = new Database(join(DATA_DIR, 'aura.sqlite'));
sqlite.pragma('foreign_keys = ON');
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle') });
```
Delete the stale dev DB so it regenerates: `Remove-Item "apps/brain/.aura/aura.sqlite*" -Force` (PowerShell) — it's gitignored dev data.

Run: `pnpm --filter @aura/brain typecheck` → clean.

- [ ] **Step 6: Commit (include the generated `drizzle/` dir)**

```bash
git add apps/brain/drizzle.config.ts apps/brain/drizzle apps/brain/src/db/schema.ts apps/brain/package.json apps/brain/src/index.ts apps/brain/src/db/store.test.ts pnpm-lock.yaml
git commit -m "feat(brain): drizzle-kit migrations + lead/child schema (replaces inline DDL)"
```

---

## Task 9: `LeadStore.upsertProfile`

**Files:**
- Create: `apps/brain/src/db/lead-store.ts`, `apps/brain/src/db/lead-store.test.ts`

> Persists a `ScrapedProfile` into `lead` + child tables in one transaction (delete-then-insert children for idempotent re-scrapes). Upsert by `profileUrl`.

- [ ] **Step 1: Write the failing test**

`apps/brain/src/db/lead-store.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LeadStore } from './lead-store.js';
import type { ScrapedProfile } from '@aura/contract';

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle');
function fresh() {
  const sqlite = new Database(':memory:'); sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite); migrate(db, { migrationsFolder: MIGRATIONS });
  return new LeadStore(db);
}
const sample: ScrapedProfile = {
  profileUrl: 'https://www.linkedin.com/in/jane', fullName: 'Jane Doe', headline: 'Founder', location: 'London',
  about: 'about', currentCompany: 'Acme', currentTitle: 'CEO',
  experience: [{ title: 'CEO', company: 'Acme', employmentType: '', startDate: '2020', endDate: 'Present', isCurrent: true, location: '', companyUrl: '', description: '' }],
  education: [{ school: 'MIT', degree: 'BSc', field: 'CS', startYear: 2012, endYear: 2016 }],
  skills: [{ name: 'TypeScript' }, { name: 'Leadership' }],
  certifications: [{ name: 'PMP', issuer: 'PMI', issuedDate: '2019' }],
};

describe('LeadStore', () => {
  let store: LeadStore;
  beforeEach(() => { store = fresh(); });

  it('inserts a lead with all child rows', () => {
    const id = store.upsertProfile(sample, 1000);
    const lead = store.get(id)!;
    expect(lead.fullName).toBe('Jane Doe');
    const full = store.getFull(id)!;
    expect(full.experience).toHaveLength(1);
    expect(full.education).toHaveLength(1);
    expect(full.skills).toHaveLength(2);
    expect(full.certifications).toHaveLength(1);
  });

  it('re-scraping the same profileUrl updates in place (no duplicate, children replaced)', () => {
    const id1 = store.upsertProfile(sample, 1000);
    const id2 = store.upsertProfile({ ...sample, headline: 'Updated', skills: [{ name: 'Rust' }] }, 2000);
    expect(id2).toBe(id1);
    expect(store.all()).toHaveLength(1);
    expect(store.getFull(id1)!.skills.map((s) => s.name)).toEqual(['Rust']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aura/brain test src/db/lead-store.test.ts`
Expected: FAIL — no `LeadStore`.

- [ ] **Step 3: Implement**

`apps/brain/src/db/lead-store.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { ScrapedProfile } from '@aura/contract';
import { lead, leadExperience, leadEducation, leadSkill, leadCertification, type LeadRow } from './schema.js';

export interface FullLead {
  lead: LeadRow;
  experience: unknown[]; education: unknown[]; skills: unknown[]; certifications: unknown[];
}

export class LeadStore {
  constructor(private db: BetterSQLite3Database) {}

  upsertProfile(p: ScrapedProfile, now: number): string {
    return this.db.transaction((tx) => {
      const existing = tx.select().from(lead).where(eq(lead.profileUrl, p.profileUrl)).get();
      const id = existing?.id ?? randomUUID();
      const row = {
        id, profileUrl: p.profileUrl, fullName: p.fullName, headline: p.headline, location: p.location,
        about: p.about, currentCompany: p.currentCompany, currentTitle: p.currentTitle,
        profileRaw: p as unknown as Record<string, unknown>,
        status: existing?.status ?? 'new', createdAt: existing?.createdAt ?? now, updatedAt: now,
      };
      if (existing) tx.update(lead).set(row).where(eq(lead.id, id)).run();
      else tx.insert(lead).values(row).run();

      // children: delete-then-insert for idempotent re-scrape
      for (const t of [leadExperience, leadEducation, leadSkill, leadCertification]) {
        tx.delete(t).where(eq(t.leadId, id)).run();
      }
      for (const e of p.experience) tx.insert(leadExperience).values({ id: randomUUID(), leadId: id, ...e, isCurrent: e.isCurrent ? 1 : 0 }).run();
      for (const e of p.education) tx.insert(leadEducation).values({ id: randomUUID(), leadId: id, ...e }).run();
      for (const s of p.skills) tx.insert(leadSkill).values({ id: randomUUID(), leadId: id, name: s.name }).run();
      for (const c of p.certifications) tx.insert(leadCertification).values({ id: randomUUID(), leadId: id, ...c }).run();
      return id;
    });
  }

  get(id: string): LeadRow | undefined {
    return this.db.select().from(lead).where(eq(lead.id, id)).get();
  }
  all(): LeadRow[] { return this.db.select().from(lead).all(); }

  getFull(id: string): FullLead | undefined {
    const row = this.get(id); if (!row) return undefined;
    return {
      lead: row,
      experience: this.db.select().from(leadExperience).where(eq(leadExperience.leadId, id)).all(),
      education: this.db.select().from(leadEducation).where(eq(leadEducation.leadId, id)).all(),
      skills: this.db.select().from(leadSkill).where(eq(leadSkill.leadId, id)).all(),
      certifications: this.db.select().from(leadCertification).where(eq(leadCertification.leadId, id)).all(),
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aura/brain test src/db/lead-store.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/brain/src/db/lead-store.ts apps/brain/src/db/lead-store.test.ts
git commit -m "feat(brain): LeadStore.upsertProfile — lead + child tables, idempotent re-scrape"
```

---

## Task 10: CSV export

**Files:**
- Create: `apps/brain/src/csv.ts`, `apps/brain/src/csv.test.ts`, `apps/brain/src/export-leads.ts`

- [ ] **Step 1: Write the failing test**

`apps/brain/src/csv.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { leadsToCsv } from './csv.js';

describe('leadsToCsv', () => {
  it('produces a header + one row per lead, quoting commas/quotes', () => {
    const csv = leadsToCsv([
      { fullName: 'Jane Doe', headline: 'Founder, CEO', location: 'London', currentCompany: 'Acme', currentTitle: 'CEO', profileUrl: 'u1' },
    ]);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('fullName,headline,location,currentCompany,currentTitle,profileUrl');
    expect(lines[1]).toBe('Jane Doe,"Founder, CEO",London,Acme,CEO,u1');
  });
  it('escapes embedded double-quotes', () => {
    const csv = leadsToCsv([{ fullName: 'A "B" C', headline: '', location: '', currentCompany: '', currentTitle: '', profileUrl: '' }]);
    expect(csv.split('\n')[1]).toBe('"A ""B"" C",,,,,');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aura/brain test src/csv.test.ts`
Expected: FAIL — no `leadsToCsv`.

- [ ] **Step 3: Implement**

`apps/brain/src/csv.ts`:
```ts
export interface CsvLead {
  fullName: string; headline: string | null; location: string | null;
  currentCompany: string | null; currentTitle: string | null; profileUrl: string;
}
const COLS: (keyof CsvLead)[] = ['fullName', 'headline', 'location', 'currentCompany', 'currentTitle', 'profileUrl'];

function cell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function leadsToCsv(rows: CsvLead[]): string {
  const header = COLS.join(',');
  const body = rows.map((r) => COLS.map((c) => cell(r[c])).join(',')).join('\n');
  return body ? `${header}\n${body}\n` : `${header}\n`;
}
```

`apps/brain/src/export-leads.ts`:
```ts
import { writeFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { join } from 'node:path';
import { lead } from './db/schema.js';
import { leadsToCsv } from './csv.js';

const DATA_DIR = '.aura';
const sqlite = new Database(join(DATA_DIR, 'aura.sqlite'), { readonly: true });
const db = drizzle(sqlite);
const rows = db.select().from(lead).all();
const out = process.argv[2] ?? 'leads.csv';
writeFileSync(out, leadsToCsv(rows));
console.log(`Wrote ${rows.length} leads to ${out}`);
```

Add to `apps/brain/package.json` scripts: `"export-leads": "tsx src/export-leads.ts"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aura/brain test src/csv.test.ts && pnpm --filter @aura/brain typecheck`
Expected: PASS + clean.

- [ ] **Step 5: Commit**

```bash
git add apps/brain/src/csv.ts apps/brain/src/csv.test.ts apps/brain/src/export-leads.ts apps/brain/package.json
git commit -m "feat(brain): leadsToCsv + export-leads CLI"
```

---

## Task 11: Wire the `scrapeProfile` job end-to-end (extension render + content + brain persist)

**Files:**
- Create: `apps/extension/src/render/open-profile.ts`
- Modify: `apps/extension/entrypoints/linkedin.content.ts`, `apps/extension/entrypoints/background.ts`, `apps/brain/src/index.ts`

> This is browser/integration glue — verified live in Task 12. The pure logic (parsers, store, csv) is already unit-tested.

- [ ] **Step 1: Content script handles `scrapeProfile`**

In `apps/extension/entrypoints/linkedin.content.ts`, add a `scrapeProfile` branch alongside the existing `readProfile` handler. Use a **Promise-based wait** (MutationObserver + timeout) and call `sendResponse` from `.then()` — never from a recursive `setTimeout` (the setTimeout-returns-true pattern is confusing and the callback's return value is ignored). Minimal addition:
```ts
import { scrapeProfile } from '../src/parse/scrape-profile.js';

function waitForBody(doc: Document, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const ready = () => doc.querySelector('#experience, #education, .pvs-list');
    if (ready()) { resolve(); return; }
    const obs = new MutationObserver(() => { if (ready()) { obs.disconnect(); clearTimeout(t); resolve(); } });
    obs.observe(doc.documentElement, { childList: true, subtree: true });
    const t = setTimeout(() => { obs.disconnect(); resolve(); }, timeoutMs);
  });
}

// inside the onMessage listener, as a sibling branch to readProfile:
if (msg?.kind === 'scrapeProfile') {
  waitForBody(document, 15000).then(() => sendResponse(scrapeProfile(document, location.href)));
  return true; // async response — keep the channel open
}
```

- [ ] **Step 2: Background uses the non-intrusive popup window for `scrapeProfile`**

Create `apps/extension/src/render/open-profile.ts`:
```ts
/**
 * Render a profile in a NON-INTRUSIVE unfocused popup window (visibilityState 'visible'
 * so React renders, but keyboard focus stays with the user — see M1 research), message
 * the content script to scrape, then always close the window.
 */
export async function scrapeViaWindow(url: string, timeoutMs = 25000): Promise<unknown> {
  const win = await chrome.windows.create({ url, type: 'popup', focused: false, state: 'normal', width: 1100, height: 900, top: 0, left: 0 });
  const tabId = win.tabs?.[0]?.id;
  if (tabId == null) { if (win.id != null) await chrome.windows.remove(win.id).catch(() => {}); throw new Error('no tab in popup window'); }
  try {
    await waitForComplete(tabId, timeoutMs);
    return await sendMessageWithRetry(tabId, { kind: 'scrapeProfile' });
  } finally {
    if (win.id != null) await chrome.windows.remove(win.id).catch(() => {});
  }
}

// The content script may not have registered its listener the instant the tab hits
// 'complete'; retry on "Receiving end does not exist" with short backoff.
async function sendMessageWithRetry(tabId: number, msg: unknown, tries = 8): Promise<unknown> {
  for (let i = 0; i < tries; i++) {
    try { return await chrome.tabs.sendMessage(tabId, msg); }
    catch (e) {
      if (i === tries - 1 || !/Receiving end does not exist/.test(String(e))) throw e;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}

function waitForComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; chrome.tabs.onUpdated.removeListener(l); clearTimeout(cap); resolve(); };
    const l = (id: number, info: chrome.tabs.TabChangeInfo) => { if (id === tabId && info.status === 'complete') finish(); };
    const cap = setTimeout(finish, timeoutMs);
    chrome.tabs.onUpdated.addListener(l);
  });
}
```

In `apps/extension/entrypoints/background.ts` `executeJob`, add a `scrapeProfile` branch (before the visit branch), guarded by the same `PROFILE_URL_RE`:
```ts
import { scrapeViaWindow } from '../src/render/open-profile.js';
// ...
if (job.type === 'scrapeProfile') {
  if (!PROFILE_URL_RE.test(job.target)) return { jobId: job.id, status: 'skipped', error: 'invalid LinkedIn profile URL' };
  try {
    const data = await scrapeViaWindow(job.target);
    const ok = !!(data && typeof data === 'object' && (data as any).fullName);
    return { jobId: job.id, status: ok ? 'ok' : 'failed', data: data as Record<string, unknown> };
  } catch (err) {
    return { jobId: job.id, status: 'failed', error: String(err) };
  }
}
```

- [ ] **Step 3: Brain persists scrapeProfile results to LeadStore**

In `apps/brain/src/index.ts`, construct a `LeadStore` and, in the `onResult` handler, if the job was a `scrapeProfile` and `status==='ok'`, parse `result.data` with `ScrapedProfileSchema` and call `leadStore.upsertProfile(...)`. (Look up the job's type from the store by `result.jobId`.) Add:
```ts
import { LeadStore } from './db/lead-store.js';
import { ScrapedProfileSchema } from '@aura/contract';
const leadStore = new LeadStore(db);
// in onResult, after dispatcher.handleResult(r):
if (r.status === 'ok' && store.get(r.jobId)?.type === 'scrapeProfile' && r.data) {
  const parsed = ScrapedProfileSchema.safeParse(r.data);
  if (parsed.success) { const id = leadStore.upsertProfile(parsed.data, Date.now()); console.log('[lead]', id, parsed.data.fullName); }
  else console.warn('[lead] invalid ScrapedProfile', parsed.error.issues[0]);
}
```

- [ ] **Step 4: Build + typecheck**

Run: `pnpm --filter @aura/extension build && pnpm -r typecheck`
Expected: extension builds to `.output/chrome-mv3`; both packages typecheck clean. **No new permission is needed:** `chrome.windows.create` requires NO manifest permission (there is no `windows` permission in MV3), and the declarative content script + `chrome.tabs.sendMessage` only need the already-declared `tabs` permission + `host_permissions` for `linkedin.com`. Do NOT add a `windows` permission (Chrome would reject it as unknown).

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/render apps/extension/entrypoints apps/brain/src/index.ts
git commit -m "feat: scrapeProfile job — non-intrusive popup-window render + LeadStore persistence"
```

---

## Task 12: Live end-to-end verification + CSV (manual)

> The whole point of M1: enqueue a `scrapeProfile` job and watch a rich lead land in the DB and CSV — **without a tab stealing your focus**.

- [ ] **Step 1: Rebuild + reload + run**

1. `pnpm --filter @aura/brain start` (note the token/port; reuses `.aura/config.json`).
2. Reload the AURA extension in `chrome://extensions`; open its **service worker** console (keeps the SW awake).
3. Enqueue a scrape — `POST /jobs` with `type:scrapeProfile`:
   ```
   curl -s -X POST http://127.0.0.1:51900/jobs -H "content-type: application/json" -d "{\"type\":\"scrapeProfile\",\"target\":\"https://www.linkedin.com/in/<a-real-profile>\"}"
   ```
4. **Observe:** a small popup window opens **without stealing your keyboard focus**, renders the profile, and closes itself; the brain logs `[lead] <id> <Full Name>`.

- [ ] **Step 2: Confirm the lead + children persisted**

Run:
```
pnpm --filter @aura/brain exec node --input-type=commonjs -e "const D=require('better-sqlite3');const db=new D('.aura/aura.sqlite',{readonly:true});console.log('leads',db.prepare('select full_name,current_company,location from lead').all());console.log('exp',db.prepare('select count(*) c from lead_experience').get(),'edu',db.prepare('select count(*) c from lead_education').get(),'skills',db.prepare('select count(*) c from lead_skill').get());"
```
Expected: the lead row with the real name/company/location, and non-zero experience/education/skill counts.

- [ ] **Step 3: Export CSV**

Run: `pnpm --filter @aura/brain export-leads leads.csv` → open `leads.csv`; expected one row per scraped lead with name/headline/location/company/title/url.

- [ ] **Step 4: Full-suite gate + commit a verification note**

Run: `pnpm -r test` (all green) and `pnpm -r typecheck`. Then append a one-line "M1 verified live (popup-window render, lead persisted, CSV exported)" note to this plan's bottom and commit.

---

## M1 Done — Definition of Done

- [ ] `pnpm -r test` green; `pnpm -r typecheck` clean.
- [ ] A live `scrapeProfile` job persists a rich lead (with experience/education/skills) to the DB **using the non-intrusive popup window** (no focus theft).
- [ ] `export-leads` produces a valid CSV.
- [ ] The real profile fixture is committed and drives the parser tests.

## Deferred (own later milestones)
- Bulk `scrapeSearch` (discover many profiles from a search) → **M2**.
- `/details/<section>/` sub-page pagination for *complete* skills/education/cert lists → **M2**.
- React leads dashboard → its own milestone.
- MV3 SW keepalive / reconnect → **M4**.
- Salesforce sync, multichannel email → Phase 2.
- **Intentionally lean schema:** spec §5 columns `lead.scrapedAt`, `lead_skill.endorsementCount`, and the `lead_experience`/`lead_education` columns not modelled here are *deliberately* omitted from M1 to keep it focused — the complete scrape is preserved in `lead.profileRaw` (JSON), so nothing is lost and these become additive columns later. Not an oversight.
