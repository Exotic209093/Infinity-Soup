export interface EducationEntry {
  school: string;
  degree: string;
  field: string;
  startYear: number | null;
  endYear: number | null;
}

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

const YEAR_RE = /\b(19|20)\d{2}\b/g;

function years(s: string): { startYear: number | null; endYear: number | null } {
  const ys = (s.match(YEAR_RE) || []).map(Number);
  return { startYear: ys[0] ?? null, endYear: ys[1] ?? null };
}

function isYearRow(s: string): boolean {
  return /\b(19|20)\d{2}\b/.test(s);
}

function schoolNameFromAnchor(a: Element): string {
  // The anchor's own textContent is empty; get name from img alt
  const img = a.querySelector('img');
  if (img) {
    const alt = (img.getAttribute('alt') || '').replace(/\s*logo\s*$/i, '').trim();
    if (alt) return alt;
  }
  return '';
}

function parseEntry(el: Element, anchorSchoolName: string): EducationEntry {
  const allRows = rows(el);

  // School: first non-year row, or fall back to anchor img alt
  const schoolRow = allRows.find((r) => !isYearRow(r)) ?? anchorSchoolName;
  const school = schoolRow || anchorSchoolName;

  // Date row
  const dateRow = allRows.find((r) => isYearRow(r)) ?? '';
  const { startYear, endYear } = years(dateRow);

  // Degree/field: non-year rows after the school row
  const nonYearRows = allRows.filter((r) => !isYearRow(r));
  const degreeRow = nonYearRows.length > 1 ? nonYearRows[1] : '';
  const commaIdx = degreeRow.indexOf(',');
  const degree = commaIdx >= 0 ? degreeRow.slice(0, commaIdx).trim() : degreeRow.trim();
  const field = commaIdx >= 0 ? degreeRow.slice(commaIdx + 1).trim() : '';

  return { school, degree, field, startYear, endYear };
}

export function parseEducation(doc: Document): EducationEntry[] {
  const section = sectionByHeading(doc, /^Education\b/);
  if (!section) return [];

  const schoolAnchors = [...section.querySelectorAll('a[href*="/school/"]')];

  if (schoolAnchors.length === 0) {
    // Fallback: treat all p rows in the section as a single entry if there's a year
    const allRows = rows(section);
    if (allRows.length === 0) return [];
    const school = allRows.find((r) => !isYearRow(r)) ?? '';
    if (!school) return [];
    const dateRow = allRows.find((r) => isYearRow(r)) ?? '';
    const { startYear, endYear } = years(dateRow);
    return [{ school, degree: '', field: '', startYear, endYear }];
  }

  const entries: EducationEntry[] = [];
  let lastSchool = '';

  for (const anchor of schoolAnchors) {
    // Find the smallest ancestor div of the anchor that also contains school <p> rows
    let el: Element | null = anchor.parentElement;
    while (el && el !== section) {
      if (el.tagName === 'DIV' && el.querySelectorAll('p').length >= 1) {
        break;
      }
      el = el.parentElement;
    }
    if (!el || el === section) {
      el = anchor.parentElement ?? section;
    }

    const anchorSchoolName = schoolNameFromAnchor(anchor);
    const entry = parseEntry(el, anchorSchoolName);

    // Deduplicate consecutive identical schools
    if (entry.school && entry.school !== lastSchool) {
      entries.push(entry);
      lastSchool = entry.school;
    }
  }

  return entries;
}
