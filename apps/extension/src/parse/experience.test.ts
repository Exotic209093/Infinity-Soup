import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseExperience } from './experience.js';

const here = dirname(fileURLToPath(import.meta.url));
const doc = new DOMParser().parseFromString(
  readFileSync(join(here, '__fixtures__/real-profile.html'), 'utf8'),
  'text/html',
);

describe('parseExperience (self-view fixture — includes a grouped multi-role company)', () => {
  const xs = parseExperience(doc);

  it('extracts all 5 roles (2 grouped Apex roles + Co-op + Freelance + Uniper)', () => {
    expect(xs).toHaveLength(5);
  });

  it('grouped Apex roles both carry the company; the current one is flagged', () => {
    const se = xs.find((e) => e.title === 'Solutions Engineer');
    const jd = xs.find((e) => e.title === 'Junior Software Developer');
    expect(se).toBeTruthy();
    expect(jd).toBeTruthy();
    expect(se!.company).toBe('Apex Infinity Solutions');
    expect(jd!.company).toBe('Apex Infinity Solutions');
    expect(se!.startDate).toBe('May 2026');
    expect(se!.endDate).toBe('Present');
    expect(se!.isCurrent).toBe(true);
    expect(jd!.endDate).toBe('May 2026');
    expect(jd!.isCurrent).toBe(false);
  });

  it('single roles parse company from the "Company · Type" row', () => {
    expect(xs.find((e) => e.title === 'Customer Service Associate')!.company).toBe('Co-op');
    expect(xs.find((e) => e.title === 'Infrastructure Maintenance Engineer')!.company).toBe('Uniper');
    expect(xs.some((e) => e.title === 'Freelance')).toBe(true);
  });

  it('every entry has a non-empty, non-doubled title; titles are unique', () => {
    const doubled = /^(.{3,})\1$/;
    for (const e of xs) {
      expect(e.title.length).toBeGreaterThan(0);
      expect(doubled.test(e.title)).toBe(false);
    }
    const titles = xs.map((e) => e.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('isCurrent is boolean; description never the "+N skills" badge', () => {
    for (const e of xs) {
      expect(typeof e.isCurrent).toBe('boolean');
      expect(/\band \+\d+ skills?$/i.test(e.description)).toBe(false);
    }
  });

  it('start/end dates are non-empty for every role', () => {
    for (const e of xs) {
      expect(e.startDate.length).toBeGreaterThan(0);
      expect(e.endDate.length).toBeGreaterThan(0);
    }
  });
});

// A real OTHER person's Experience section (Josh Dolby), captured live. Other-people's profiles
// expose the company row + a real /company/ link that the self-view collapses — this fixture
// guards the parser against the structure that 0-experience'd the first live scrape.
const otherDoc = new DOMParser().parseFromString(
  readFileSync(join(here, '__fixtures__/experience-other.html'), 'utf8'),
  'text/html',
);

describe('parseExperience (other-person fixture — company + /company/ link present)', () => {
  const xs = parseExperience(otherDoc);

  it('finds the entity-collection-item entries (≥ 2)', () => {
    expect(xs.length).toBeGreaterThanOrEqual(2);
  });

  it('current role: title, company, employmentType, dates, real /company/ link', () => {
    const se = xs.find((e) => e.title === 'Solutions Engineer');
    expect(se).toBeTruthy();
    expect(se!.company).toBe('Apex Infinity Solutions');
    expect(se!.employmentType).toBe('Full-time');
    expect(se!.startDate).toBe('Jul 2025');
    expect(se!.endDate).toBe('Present');
    expect(se!.isCurrent).toBe(true);
    expect(se!.companyUrl).toContain('/company/98492367');
  });

  it('past role: company + ended date', () => {
    const sd = xs.find((e) => e.title === 'Software Developer');
    expect(sd).toBeTruthy();
    expect(sd!.company).toBe('Harbour Rock Capital');
    expect(sd!.endDate).toBe('Jul 2025');
    expect(sd!.isCurrent).toBe(false);
  });

  it('does not leak the "+N skills" badge into company or description', () => {
    for (const e of xs) {
      expect(/\+\d+ skills?$/i.test(e.company)).toBe(false);
      expect(/\band \+\d+ skills?$/i.test(e.description)).toBe(false);
    }
  });
});
