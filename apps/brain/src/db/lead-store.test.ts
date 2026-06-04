import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LeadStore } from './lead-store.js';
import type { ScrapedProfile } from '@aura/contract';

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle');
function fresh() {
  const sqlite = new Database(':memory:'); sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite); migrate(db, { migrationsFolder: MIGRATIONS });
  return new LeadStore(db);
}
const sample: ScrapedProfile = {
  profileUrl: 'https://www.linkedin.com/in/jane', fullName: 'Jane Doe', headline: 'Founder', location: 'London',
  about: 'about', currentCompany: 'Acme', currentTitle: 'CEO',
  experience: [{ title: 'CEO', company: 'Acme', employmentType: '', startDate: '2020', endDate: 'Present', isCurrent: true, location: '', companyUrl: '', description: '' }],
  education: [{ school: 'MIT', degree: 'BSc', field: 'CS', startYear: 2012, endYear: 2016 }],
  skills: [{ name: 'TypeScript' }, { name: 'Leadership' }],
  certifications: [{ name: 'PMP', issuer: 'PMI', issuedDate: '2019' }],
};

describe('LeadStore', () => {
  let store: LeadStore;
  beforeEach(() => { store = fresh(); });

  it('inserts a lead with all child rows', () => {
    const id = store.upsertProfile(sample, 1000);
    expect(store.get(id)!.fullName).toBe('Jane Doe');
    const full = store.getFull(id)!;
    expect(full.experience).toHaveLength(1);
    expect(full.education).toHaveLength(1);
    expect(full.skills).toHaveLength(2);
    expect(full.certifications).toHaveLength(1);
  });

  it('re-scraping the same profileUrl updates in place (no duplicate, children replaced)', () => {
    const id1 = store.upsertProfile(sample, 1000);
    const id2 = store.upsertProfile({ ...sample, headline: 'Updated', skills: [{ name: 'Rust' }] }, 2000);
    expect(id2).toBe(id1);
    expect(store.all()).toHaveLength(1);
    expect(store.getFull(id1)!.skills.map((s: any) => s.name)).toEqual(['Rust']);
  });
});
