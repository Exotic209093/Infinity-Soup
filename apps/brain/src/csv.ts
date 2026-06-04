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
