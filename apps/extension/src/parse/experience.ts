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

// Matches a date row: contains a 4-digit year AND either "Present", " - ", " – ", or "·"
const DATE_ROW_RE = /\b(19|20)\d{2}\b/;
const DATE_DELIMITERS_RE = /present|\s[-–]\s|·/i;

// Skip rows that are skill association badges: "X, Y and +N skills"
const SKILLS_ROW_RE = /(^|\s)\+\d+\s+skill|\band \+\d+ skills?$/i;

function sectionByHeading(doc: Document, re: RegExp): Element | null {
  const h = [...doc.querySelectorAll('h2,h3')].find((el) =>
    re.test((el.textContent || '').trim()),
  );
  return h ? h.closest('section') : null;
}

function rows(el: Element): string[] {
  return [...el.querySelectorAll('p')]
    .map((p) => (p.textContent || '').replace(/\s+/g, ' ').trim())
    .map((t) => t.replace(/\s*…?\s*(see more|more)\s*$/i, '').trim())
    .filter(Boolean);
}

function isDateRow(row: string): boolean {
  return DATE_ROW_RE.test(row) && DATE_DELIMITERS_RE.test(row);
}

function parseDateRow(row: string): { startDate: string; endDate: string; isCurrent: boolean } {
  // Strip duration suffix after "·" e.g. "May 2026 - Present · 2 mos"
  const main = row.split('·')[0].trim();
  const parts = main.split(/\s[–-]\s/);
  const startDate = parts[0]?.trim() ?? '';
  const endDate = parts[1]?.trim() ?? '';
  const isCurrent = /present/i.test(endDate);
  return { startDate, endDate, isCurrent };
}

function entryFromLi(li: Element): ExperienceEntry {
  const r = rows(li);
  if (r.length === 0) {
    return {
      title: '',
      company: '',
      employmentType: '',
      startDate: '',
      endDate: '',
      isCurrent: false,
      location: '',
      companyUrl: '',
      description: '',
    };
  }

  const title = r[0];
  const dateRow = r.find(isDateRow) ?? '';
  const { startDate, endDate, isCurrent } = dateRow
    ? parseDateRow(dateRow)
    : { startDate: '', endDate: '', isCurrent: false };

  // Description: longest row that is not title, not date row, not skills badge row
  const candidates = r.filter(
    (row) => row !== title && row !== dateRow && !SKILLS_ROW_RE.test(row),
  );
  const description = candidates.reduce(
    (best, row) => (row.length > best.length ? row : best),
    '',
  );

  return {
    title,
    company: '',
    employmentType: '',
    startDate,
    endDate,
    isCurrent,
    location: '',
    companyUrl: '',
    description,
  };
}

export function parseExperience(doc: Document): ExperienceEntry[] {
  const section = sectionByHeading(doc, /^Experience\b/);
  if (!section) return [];

  // Find the <ul> with the most direct <li> children
  const uls = [...section.querySelectorAll('ul')];
  if (uls.length === 0) return [];

  const mainUl = uls.reduce((best, ul) => {
    const count = [...ul.children].filter((c) => c.tagName === 'LI').length;
    const bestCount = [...best.children].filter((c) => c.tagName === 'LI').length;
    return count > bestCount ? ul : best;
  }, uls[0]);

  const directLis = [...mainUl.children].filter((c) => c.tagName === 'LI');
  const entries: ExperienceEntry[] = [];

  for (const li of directLis) {
    // Guard: grouped multi-role entry — a <li> whose nested <ul> holds sub-role <li>s.
    // In that case, the outer header row is just the company name; emit each inner <li> instead.
    const nestedUl = li.querySelector('ul');
    if (nestedUl) {
      const innerLis = [...nestedUl.children].filter((c) => c.tagName === 'LI');
      if (innerLis.length > 0) {
        for (const inner of innerLis) {
          entries.push(entryFromLi(inner));
        }
        continue;
      }
    }
    entries.push(entryFromLi(li));
  }

  return entries;
}
