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
    expect(toLeadSummary(full)).toMatchObject({ id: 'l1', fullName: 'Jane Doe', currentCompany: 'Acme', expCount: 2, eduCount: 1, skillCount: 2 });
  });
  it('toLeadDetail formats dates/years + flattens skills', () => {
    const d = toLeadDetail(full);
    expect(d.experience[0]).toEqual({ title: 'CEO', company: 'Acme', dates: '2020 – Present', isCurrent: true });
    expect(d.education[0]).toEqual({ school: 'MIT', years: '2012 – 2016' });
    expect(d.skills).toEqual(['TS', 'Lead']);
    expect(d.about).toBe('about me');
  });
});
