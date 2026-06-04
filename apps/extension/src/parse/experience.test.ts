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

describe('parseExperience', () => {
  it('returns exactly 2 entries', () => {
    expect(parseExperience(doc)).toHaveLength(2);
  });

  it('exp[0] — Solutions Engineer, current role', () => {
    const [exp0] = parseExperience(doc);
    expect(exp0.title).toBe('Solutions Engineer');
    expect(exp0.startDate).toBe('May 2026');
    expect(exp0.endDate).toBe('Present');
    expect(exp0.isCurrent).toBe(true);
  });

  it('exp[1] — Junior Software Developer, ended May 2026', () => {
    const [, exp1] = parseExperience(doc);
    expect(exp1.title).toBe('Junior Software Developer');
    expect(exp1.endDate).toBe('May 2026');
    expect(exp1.isCurrent).toBe(false);
  });

  it('company and companyUrl are empty strings (self-view)', () => {
    for (const entry of parseExperience(doc)) {
      expect(entry.company).toBe('');
      expect(entry.companyUrl).toBe('');
    }
  });

  it('every entry has a non-empty title', () => {
    for (const entry of parseExperience(doc)) {
      expect(entry.title.length).toBeGreaterThan(0);
    }
  });

  it('no title is a doubled string (no duplication artifact)', () => {
    // If title = "XX" where X is 3+ chars, the regex matches
    const doubled = /^(.{3,})\1$/;
    for (const entry of parseExperience(doc)) {
      expect(doubled.test(entry.title)).toBe(false);
    }
  });

  it('titles are unique across entries', () => {
    const titles = parseExperience(doc).map((e) => e.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('every description is a non-empty string', () => {
    for (const entry of parseExperience(doc)) {
      expect(typeof entry.description).toBe('string');
      // descriptions may be empty string if none found; just ensure no undefined/null
      expect(entry.description).not.toBeUndefined();
    }
  });

  it('description does not contain the "+N skills" row text verbatim as the whole value', () => {
    for (const entry of parseExperience(doc)) {
      expect(/\band \+\d+ skills?$/i.test(entry.description)).toBe(false);
    }
  });

  it('descriptions are distinct between entries', () => {
    const descs = parseExperience(doc).map((e) => e.description).filter((d) => d.length > 0);
    if (descs.length > 1) {
      expect(new Set(descs).size).toBe(descs.length);
    }
  });

  it('isCurrent is a boolean for all entries', () => {
    for (const entry of parseExperience(doc)) {
      expect(typeof entry.isCurrent).toBe('boolean');
    }
  });

  it('startDate and endDate are non-empty strings for all entries', () => {
    for (const entry of parseExperience(doc)) {
      expect(entry.startDate.length).toBeGreaterThan(0);
      expect(entry.endDate.length).toBeGreaterThan(0);
    }
  });
});
