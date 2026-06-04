export interface SkillEntry {
  name: string;
}

export interface CertificationEntry {
  name: string;
  issuer: string;
  issuedDate: string;
}

/** Find the first section whose h2/h3 heading matches re. */
function sectionByHeading(doc: Document, re: RegExp): Element | null {
  const h = [...doc.querySelectorAll('h2,h3')].find((el) =>
    re.test((el.textContent ?? '').trim()),
  );
  return h ? h.closest('section') : null;
}

/** All non-empty trimmed paragraph texts within el. */
function rows(el: Element): string[] {
  return [...el.querySelectorAll('p')]
    .map((p) =>
      (p.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\s*…?\s*(see more|more)\s*$/i, '')
        .trim(),
    )
    .filter(Boolean);
}

/**
 * Extract skills from the "Skills" section of a LinkedIn profile page.
 * Only the first two skills render on the main card; the full list is behind
 * /details/skills/ (deferred to M2).
 *
 * Anchor: elements with componentkey matching "profile.skill(…)" but not
 * ending in "-divider". Each skill entry appears twice in the DOM; dedup by name.
 */
export function parseSkills(doc: Document): SkillEntry[] {
  const section = sectionByHeading(doc, /^Skills\b/);
  if (!section) return [];

  const seen = new Set<string>();
  const results: SkillEntry[] = [];

  for (const el of section.querySelectorAll('[componentkey]')) {
    const key = el.getAttribute('componentkey') ?? '';
    if (!/profile\.skill\(/.test(key) || key.endsWith('-divider')) continue;

    const firstP = el.querySelector('p');
    if (!firstP) continue;

    const name = (firstP.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!name || seen.has(name)) continue;

    seen.add(name);
    results.push({ name });
  }

  return results;
}

/**
 * Extract certifications from the "Licenses & Certifications" section.
 * Returns [] when the section is absent (most profiles before M2 data load).
 *
 * Per-entry row layout (from LinkedIn):
 *   rows[0] = certification name
 *   rows[1] = issuer line  ("Issued by <Org>" or just "<Org>")
 *   rows[2] = date line    ("Issued <date>" or just "<date>")
 *
 * Consecutive entries with the same name are deduplicated.
 */
export function parseCertifications(doc: Document): CertificationEntry[] {
  const section = sectionByHeading(doc, /Licenses|Certifications?/i);
  if (!section) return [];

  const results: CertificationEntry[] = [];
  let lastName = '';

  // Each direct child <div> of the section is a certification entry.
  // We look at all <div>s that have at least one <p> child.
  for (const div of section.querySelectorAll('div')) {
    const r = rows(div);
    if (r.length < 1) continue;

    const name = r[0];
    // Skip if same as last emitted entry (dedup consecutive duplicates).
    if (name === lastName) continue;

    const rawIssuer = r[1] ?? '';
    const rawDate = r[2] ?? '';

    const issuer = rawIssuer.replace(/^Issued\s+by\s+/i, '').trim();
    const issuedDate = rawDate.replace(/^Issued\s+/i, '').trim();

    results.push({ name, issuer, issuedDate });
    lastName = name;
  }

  return results;
}
