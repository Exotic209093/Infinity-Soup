import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSkills, parseCertifications } from './skills.js';

const here = dirname(fileURLToPath(import.meta.url));
const doc = new DOMParser().parseFromString(
  readFileSync(join(here, '__fixtures__/real-profile.html'), 'utf8'),
  'text/html',
);

describe('parseSkills', () => {
  it('returns exactly the two ground-truth skills', () => {
    const skills = parseSkills(doc);
    const names = skills.map((s) => s.name);
    expect(names).toContain('Business Solution Delivery');
    expect(names).toContain('System Architecture');
    expect(skills).toHaveLength(2);
  });

  it('returns no entry with an empty name', () => {
    const skills = parseSkills(doc);
    expect(skills.every((s) => s.name.length > 0)).toBe(true);
  });

  it('returns unique skill names (no duplicates)', () => {
    const skills = parseSkills(doc);
    const names = skills.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('returns an empty array when the document has no Skills section', () => {
    const empty = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
    expect(parseSkills(empty)).toEqual([]);
  });
});

describe('parseCertifications', () => {
  it('returns an empty array for this profile (no certifications section)', () => {
    const certs = parseCertifications(doc);
    expect(Array.isArray(certs)).toBe(true);
    expect(certs).toHaveLength(0);
  });

  it('returns an empty array when the document has no Certifications section', () => {
    const empty = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
    expect(parseCertifications(empty)).toEqual([]);
  });

  it('parses name/issuer/issuedDate from a synthetic certifications section', () => {
    const synth = new DOMParser().parseFromString(
      `<html><body>
        <section>
          <h2>Licenses &amp; Certifications</h2>
          <div>
            <p>AWS Certified Developer</p>
            <p>Issued by Amazon Web Services</p>
            <p>Issued Jan 2024</p>
          </div>
          <div>
            <p>Google Cloud Professional</p>
            <p>Issued by Google</p>
            <p>Issued Mar 2023</p>
          </div>
        </section>
      </body></html>`,
      'text/html',
    );
    const certs = parseCertifications(synth);
    expect(certs).toHaveLength(2);
    expect(certs[0]).toEqual({
      name: 'AWS Certified Developer',
      issuer: 'Amazon Web Services',
      issuedDate: 'Jan 2024',
    });
    expect(certs[1]).toEqual({
      name: 'Google Cloud Professional',
      issuer: 'Google',
      issuedDate: 'Mar 2023',
    });
  });

  it('deduplicates consecutive entries with the same name', () => {
    const synth = new DOMParser().parseFromString(
      `<html><body>
        <section>
          <h2>Certifications</h2>
          <div>
            <p>AWS Certified Developer</p>
            <p>Issued by Amazon Web Services</p>
            <p>Issued Jan 2024</p>
          </div>
          <div>
            <p>AWS Certified Developer</p>
            <p>Issued by Amazon Web Services</p>
            <p>Issued Jan 2024</p>
          </div>
        </section>
      </body></html>`,
      'text/html',
    );
    const certs = parseCertifications(synth);
    expect(certs).toHaveLength(1);
    expect(certs[0].name).toBe('AWS Certified Developer');
  });
});
