export interface CsvLead {
  fullName: string; headline: string | null; location: string | null;
  currentCompany: string | null; currentTitle: string | null; profileUrl: string;
}
const COLS: (keyof CsvLead)[] = ['fullName', 'headline', 'location', 'currentCompany', 'currentTitle', 'profileUrl'];

function cell(v: unknown): string {
  const s = v == null ? '' : String(v);
  // Neutralize spreadsheet formula-injection: a leading =/+/-/@ (or tab/CR) can be
  // executed as a formula when the CSV is opened in Excel/Sheets. Lead fields are
  // scraped from external profiles, so prefix risky values with ' and force-quote.
  const risky = /^[=+\-@\t\r]/.test(s);
  const safe = risky ? `'${s}` : s;
  return risky || /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function leadsToCsv(rows: CsvLead[]): string {
  const header = COLS.join(',');
  const body = rows.map((r) => COLS.map((c) => cell(r[c])).join(',')).join('\n');
  return body ? `${header}\n${body}\n` : `${header}\n`;
}
