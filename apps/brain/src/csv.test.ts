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
  it('neutralizes spreadsheet formula-injection (leading =/+/-/@)', () => {
    const csv = leadsToCsv([{ fullName: '=1+1', headline: '+1', location: '-2', currentCompany: '@x', currentTitle: 'ok', profileUrl: 'u' }]);
    expect(csv.split('\n')[1]).toBe(`"'=1+1","'+1","'-2","'@x",ok,u`);
  });
});
