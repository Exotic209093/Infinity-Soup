import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseProfileFields } from './profile-fields.js';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '__fixtures__/real-profile.html'), 'utf8');

describe('parseProfileFields', () => {
  // ── ground-truth assertions against the real-profile fixture ─────────────────

  it('derives fullName from document.title', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.title).toBe('James Collard | LinkedIn');
    const out = parseProfileFields(doc);
    expect(out.fullName).toBe('James Collard');
  });

  it('extracts headline from top card', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = parseProfileFields(doc);
    expect(out.headline).toBe(
      'Solutions Engineer @ Apex Infinity Solutions | Building Scalable Salesforce Solutions',
    );
  });

  it('extracts location from top card', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = parseProfileFields(doc);
    expect(out.location).toBe('Chatham, England, United Kingdom');
  });

  it('extracts about text starting with correct prefix', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = parseProfileFields(doc);
    expect(out.about).toMatch(/^Software engineer focused on Salesforce ecosystems/);
  });

  it('about text has ~794 characters and no trailing "…more"', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = parseProfileFields(doc);
    expect(out.about.length).toBeGreaterThan(700);
    expect(out.about.length).toBeLessThan(900);
    expect(out.about).not.toMatch(/…\s*more\s*$/i);
    expect(out.about).not.toMatch(/\bsee more\s*$/i);
  });

  it('extracts currentCompany from the "company · school" top-card line', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = parseProfileFields(doc);
    expect(out.currentCompany).toBe('Apex Infinity Solutions');
  });

  it('returns empty string for currentTitle (composed later)', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = parseProfileFields(doc);
    expect(out.currentTitle).toBe('');
  });

  // ── defensive / shape assertions that should hold for any profile ─────────────

  it('no field value is duplicated (fullName !== headline, etc)', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = parseProfileFields(doc);
    const values = [out.fullName, out.headline, out.location, out.about].filter(Boolean);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('fullName is non-empty and does not contain " | LinkedIn"', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = parseProfileFields(doc);
    expect(out.fullName).toBeTruthy();
    expect(out.fullName).not.toMatch(/\|\s*LinkedIn/i);
  });

  it('headline does not contain the raw name h2 text verbatim as a substring of its own prefix', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = parseProfileFields(doc);
    // Headline should be different from fullName
    expect(out.headline).not.toBe(out.fullName);
  });

  it('location contains a comma (place, region format)', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = parseProfileFields(doc);
    expect(out.location).toContain(',');
  });

  it('about does not start with "About" (section heading stripped)', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = parseProfileFields(doc);
    expect(out.about).not.toMatch(/^About\b/i);
  });

  it('returns empty strings gracefully on a bare document', () => {
    const doc = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
    const out = parseProfileFields(doc);
    expect(out.fullName).toBe('');
    expect(out.headline).toBe('');
    expect(out.location).toBe('');
    expect(out.about).toBe('');
    expect(out.currentCompany).toBe('');
    expect(out.currentTitle).toBe('');
  });

  // ── About FALLBACK path (other-profile case: no expandable-text-box) ──────────
  // On other people's profiles the [data-testid="expandable-text-box"] attribute
  // may be absent. Simulate that by stripping the attribute, then assert the
  // fallback still yields ONLY the About body — never the trailing "Top skills"
  // sub-block, and never violating the < 900 char bound.

  it('about fallback (no expandable-text-box) yields only the About body, not skills', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // Locate the About section's OWN expandable box and strip its data-testid to
    // force the <p> fallback — exactly the "other profile" case the fallback exists
    // for. (NB: the fixture has ~10 expandable-text-box elements across activity /
    // experience blocks, so a document-wide query is not a reliable About anchor —
    // we scope to the About section heading.)
    const aboutHeading = [...doc.querySelectorAll('h2,h3')].find((el) =>
      /^About\b/i.test((el.textContent || '').trim()),
    );
    const aboutSection = aboutHeading?.closest('section');
    expect(aboutSection).toBeTruthy();
    const box = aboutSection!.querySelector('[data-testid="expandable-text-box"]');
    expect(box).not.toBeNull();
    box!.removeAttribute('data-testid');
    // Sanity: the About section's primary hook is gone, forcing the <p> fallback.
    expect(aboutSection!.querySelector('[data-testid="expandable-text-box"]')).toBeNull();

    const out = parseProfileFields(doc);
    expect(out.about).toMatch(/^Software engineer focused on Salesforce ecosystems/);
    expect(out.about.length).toBeGreaterThan(700);
    expect(out.about.length).toBeLessThan(900);
    // Must NOT scoop up the trailing "Top skills" sub-block.
    expect(out.about).not.toMatch(/Top skills/i);
    expect(out.about).not.toMatch(/Strategic Planning • Software Documentation/i);
    expect(out.about).not.toMatch(/…\s*more\s*$/i);
    expect(out.about).not.toMatch(/^About\b/i);
  });
});
