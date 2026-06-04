import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrapeProfile } from './scrape-profile.js';
import { ScrapedProfileSchema } from '@aura/contract';

const here = dirname(fileURLToPath(import.meta.url));
const doc = new DOMParser().parseFromString(
  readFileSync(join(here, '__fixtures__/real-profile.html'), 'utf8'),
  'text/html',
);

describe('scrapeProfile (real fixture)', () => {
  const p = scrapeProfile(doc, 'https://www.linkedin.com/in/example');

  it('produces a contract-valid ScrapedProfile', () => {
    expect(() => ScrapedProfileSchema.parse(p)).not.toThrow();
  });

  it('carries through the provided profileUrl and the parsed name', () => {
    expect(p.profileUrl).toBe('https://www.linkedin.com/in/example');
    expect(p.fullName).toBe('James Collard');
  });

  it('composes experience (2) and education (>=1)', () => {
    expect(p.experience.length).toBe(2);
    expect(p.education.length).toBeGreaterThanOrEqual(1);
  });

  it('derives current title + company from the present-dated experience / top card', () => {
    expect(p.experience.some((e) => e.isCurrent)).toBe(true);
    expect(p.currentTitle).toBe('Solutions Engineer');
    expect(p.currentCompany).toBe('Apex Infinity Solutions');
  });

  it('carries headline and location through from the top card', () => {
    expect(p.headline).toContain('Solutions Engineer');
    expect(p.location).toBe('Chatham, England, United Kingdom');
  });
});
