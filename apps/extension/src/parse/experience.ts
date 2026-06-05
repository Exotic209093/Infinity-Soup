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

// A date row holds a 4-digit year + a delimiter ("Present", a dash, or a middot) and is SHORT
// (so a long description that happens to contain a year isn't mistaken for one).
const DATE_ROW_RE = /\b(19|20)\d{2}\b/;
const DATE_DELIMITERS_RE = /present|\s[-–]\s|·/i;
const SKILLS_ROW_RE = /(^|\s)\+\d+\s+skill|\band \+\d+ skills?$/i;

function sectionByHeading(doc: Document, re: RegExp): Element | null {
  const h = [...doc.querySelectorAll('h2,h3')].find((el) => re.test((el.textContent || '').trim()));
  return h ? h.closest('section') : null;
}

function rows(el: Element): string[] {
  return [...el.querySelectorAll('p')]
    .map((p) => (p.textContent || '').replace(/\s+/g, ' ').trim())
    .map((t) => t.replace(/\s*…?\s*(see more|more)\s*$/i, '').trim())
    .filter(Boolean);
}

function isDateRow(s: string): boolean {
  return s.length < 50 && DATE_ROW_RE.test(s) && DATE_DELIMITERS_RE.test(s);
}

function parseDateRow(row: string): { startDate: string; endDate: string; isCurrent: boolean } {
  const main = row.split('·')[0].trim(); // drop the "· N mos" duration suffix
  const parts = main.split(/\s[–-]\s/);
  const startDate = parts[0]?.trim() ?? '';
  const endDate = parts[1]?.trim() ?? '';
  return { startDate, endDate, isCurrent: /present/i.test(endDate) };
}

function isLocation(s: string): boolean {
  return s.includes(',') && s.length < 80 && !isDateRow(s) && !SKILLS_ROW_RE.test(s);
}

/**
 * Experience entries are elements with `componentkey="entity-collection-item-…"` (durable on
 * both self-view and other profiles). Keep top-level ones; fall back to legacy <ul><li>.
 */
function experienceEntries(section: Element): Element[] {
  const all = [...section.querySelectorAll('[componentkey^="entity-collection-item"]')];
  const topLevel = all.filter((el) => !all.some((o) => o !== el && o.contains(el)));
  if (topLevel.length > 0) return topLevel;
  const uls = [...section.querySelectorAll('ul')];
  if (uls.length === 0) return [];
  const liCount = (u: Element) => [...u.children].filter((c) => c.tagName === 'LI').length;
  const mainUl = uls.reduce((best, u) => (liCount(u) > liCount(best) ? u : best), uls[0]);
  return [...mainUl.children].filter((c) => c.tagName === 'LI');
}

function cleanDesc(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/\s*…?\s*(see more|more)\s*$/i, '').trim();
}

/**
 * Parse one entry element into one OR MORE roles:
 *  - GROUPED (several roles at one company): row0 = company, row1 ~ "Type · tenure", then each
 *    date row defines a sub-role whose title is the row just before it. (≥ 2 date rows.)
 *  - SINGLE: title = row0, "Company · Type" = the middot row before the (single) date row.
 */
function rolesFrom(el: Element): ExperienceEntry[] {
  const r = rows(el);
  if (r.length === 0) return [];
  const companyUrl = el.querySelector('a[href*="/company/"]')?.getAttribute('href') ?? '';
  const dateIdxs = r.map((row, i) => (isDateRow(row) ? i : -1)).filter((i) => i >= 0);

  if (dateIdxs.length > 1) {
    const company = r[0] ?? '';
    const typeRow = r[1] ?? '';
    const employmentType = typeRow.includes(' · ') ? typeRow.split(' · ')[0].trim() : '';
    const headerLoc = r.slice(2, dateIdxs[0]).find(isLocation);
    const location = headerLoc ? headerLoc.split(' · ')[0].trim() : '';
    return dateIdxs.map((di) => {
      const { startDate, endDate, isCurrent } = parseDateRow(r[di]);
      const next = r[di + 1] ?? '';
      const description = next && !isDateRow(next) && !SKILLS_ROW_RE.test(next) && next.length > 30 ? cleanDesc(next) : '';
      return {
        title: r[di - 1] ?? '',
        company,
        employmentType,
        startDate,
        endDate,
        isCurrent,
        location,
        companyUrl,
        description,
      };
    });
  }

  const title = r[0] ?? '';
  const dateIdx = dateIdxs[0] ?? -1;
  const dateRow = dateIdx >= 0 ? r[dateIdx] : '';
  const { startDate, endDate, isCurrent } = dateRow
    ? parseDateRow(dateRow)
    : { startDate: '', endDate: '', isCurrent: false };
  const compRow = (dateIdx > 0 ? r.slice(1, dateIdx) : []).find((x) => x.includes(' · '));
  let company = '';
  let employmentType = '';
  if (compRow) {
    const [c, t = ''] = compRow.split(' · ');
    company = c.trim();
    employmentType = t.trim();
  }
  const after = dateIdx >= 0 ? r.slice(dateIdx + 1) : r.slice(1);
  const locRow = after.find(isLocation);
  const location = locRow ? locRow.split(' · ')[0].trim() : '';

  const expandable = el.querySelector('[data-testid="expandable-text-box"]');
  let description = expandable ? cleanDesc(expandable.textContent || '') : '';
  if (!description) {
    const used = new Set([title, compRow, dateRow, locRow].filter(Boolean) as string[]);
    description = r.filter((x) => !used.has(x) && !SKILLS_ROW_RE.test(x)).reduce((b, x) => (x.length > b.length ? x : b), '');
  }
  return [{ title, company, employmentType, startDate, endDate, isCurrent, location, companyUrl, description }];
}

export function parseExperience(doc: Document): ExperienceEntry[] {
  const section = sectionByHeading(doc, /^Experience\b/);
  if (!section) return [];
  return experienceEntries(section)
    .flatMap(rolesFrom)
    .filter((e) => e.title.length > 0);
}
