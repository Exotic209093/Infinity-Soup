import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEducation } from './education.js';
import type { EducationEntry } from './education.js';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '__fixtures__/real-profile.html'), 'utf8');

describe('parseEducation', () => {
  let doc: Document;
  let eds: EducationEntry[];

  // Parse once for the whole suite
  doc = new DOMParser().parseFromString(html, 'text/html');
  eds = parseEducation(doc);

  // --- Ground-truth assertions ---

  it('returns at least 1 entry', () => {
    expect(eds.length).toBeGreaterThanOrEqual(1);
  });

  it('eds[0].school is "Waterfront UTC"', () => {
    expect(eds[0].school).toBe('Waterfront UTC');
  });

  it('eds[0].startYear is 2022', () => {
    expect(eds[0].startYear).toBe(2022);
  });

  it('eds[0].endYear is 2024', () => {
    expect(eds[0].endYear).toBe(2024);
  });

  // --- Defensive / structural assertions ---

  it('no entry has an empty school name', () => {
    for (const e of eds) {
      expect(e.school.length).toBeGreaterThan(0);
    }
  });

  it('no value is doubled (school does not repeat itself)', () => {
    for (const e of eds) {
      // A doubled string would be "Waterfront UTCWaterfront UTC"
      const half = e.school.slice(0, Math.floor(e.school.length / 2));
      expect(e.school).not.toBe(half + half);
    }
  });

  it('school entries are unique (no consecutive duplicates)', () => {
    for (let i = 1; i < eds.length; i++) {
      expect(eds[i].school).not.toBe(eds[i - 1].school);
    }
  });

  it('startYear and endYear are either null or 4-digit years', () => {
    for (const e of eds) {
      if (e.startYear !== null) {
        expect(e.startYear).toBeGreaterThanOrEqual(1900);
        expect(e.startYear).toBeLessThanOrEqual(2100);
      }
      if (e.endYear !== null) {
        expect(e.endYear).toBeGreaterThanOrEqual(1900);
        expect(e.endYear).toBeLessThanOrEqual(2100);
      }
    }
  });

  it('degree and field are strings (may be empty)', () => {
    for (const e of eds) {
      expect(typeof e.degree).toBe('string');
      expect(typeof e.field).toBe('string');
    }
  });

  it('returns empty array for a document with no education section', () => {
    const empty = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
    expect(parseEducation(empty)).toEqual([]);
  });
});
