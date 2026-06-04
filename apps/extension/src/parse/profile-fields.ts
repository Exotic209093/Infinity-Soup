export interface ProfileFields {
  fullName: string;
  headline: string;
  location: string;
  about: string;
  currentCompany: string;
  currentTitle: string;
}

// Mirrors the regex used in wait.ts — authoritative title parse.
const TITLE_NAME_RE = /^(?:\(\d+\)\s*)?(.+?)\s*[|–-]\s*LinkedIn\b/;

function nameFromTitle(doc: Document): string {
  const m = doc.title.match(TITLE_NAME_RE);
  const name = m?.[1]?.trim();
  if (!name || /^linkedin$/i.test(name)) return '';
  return name;
}

/** Finds a section whose nearest h2 or h3 heading text matches `re`. */
function sectionByHeading(doc: Document, re: RegExp): Element | null {
  const h = [...doc.querySelectorAll('h2,h3')].find((el) =>
    re.test((el.textContent || '').trim()),
  );
  return h ? h.closest('section') : null;
}

/** Collapse whitespace, strip trailing "… more" / "see more". */
function cleanText(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*…?\s*(see more|more)\s*$/i, '')
    .trim();
}

/**
 * Resolves the "top card" section: the <section> that contains the name <h2>.
 * Falls back to doc.body so callers never receive null.
 */
function resolveTopCard(doc: Document, titleName: string): Element {
  if (titleName) {
    const nameH2 = [...doc.querySelectorAll('h2')].find(
      (el) => (el.textContent || '').trim() === titleName,
    );
    if (nameH2) {
      const section = nameH2.closest('section');
      if (section) return section;
    }
  }
  return doc.body;
}

/**
 * Collect all non-empty <p> text nodes from `root`, not inside <a> tags,
 * in document order.
 */
function topCardParagraphs(root: Element): { text: string; inAnchor: boolean }[] {
  return [...root.querySelectorAll('p')].map((p) => ({
    text: cleanText(p.textContent || ''),
    inAnchor: !!p.closest('a'),
  }));
}

export function parseProfileFields(doc: Document): ProfileFields {
  const fullName = nameFromTitle(doc);
  const topCard = resolveTopCard(doc, fullName);
  const paragraphs = topCardParagraphs(topCard);

  // ── headline ────────────────────────────────────────────────────────────────
  // First sizeable <p> that is not the name, not a "company · school" line,
  // not a location (has comma, no digits), and not a connections/followers line.
  const headline =
    paragraphs.find(
      ({ text, inAnchor }) =>
        !inAnchor &&
        text.length > 10 &&
        text !== fullName &&
        !text.includes(' · ') &&
        !/connections?|followers?|contact info/i.test(text) &&
        text !== '·' &&
        // Location lines contain commas but no digits — exclude them here.
        // Headline won't have a comma-only structure from a city/region.
        // Actually: headline CAN have commas, so only exclude location pattern:
        // location = "City, Region, Country" with no digits.
        !(text.includes(',') && !/\d/.test(text) && text.split(',').length >= 2),
    )?.text ?? '';

  // ── location ────────────────────────────────────────────────────────────────
  // A <p> in the top card: comma-separated place, no digits, not in an <a>,
  // not a connections/followers/contact-info line, not a "·"-only separator.
  const location =
    paragraphs.find(
      ({ text, inAnchor }) =>
        !inAnchor &&
        text.includes(',') &&
        !/\d/.test(text) &&
        !/connections?|followers?|contact info/i.test(text) &&
        !text.includes(' · '),
    )?.text ?? '';

  // ── currentCompany ──────────────────────────────────────────────────────────
  // Top card has a secondary <p> of the form "Company · School". Split on " · ".
  const companyLine = paragraphs.find(({ text, inAnchor }) => !inAnchor && text.includes(' · '));
  const currentCompany = companyLine ? companyLine.text.split(' · ')[0].trim() : '';

  // ── about ───────────────────────────────────────────────────────────────────
  // Anchor on the About *section* (durable h2 heading), NOT a bare document-wide
  // [data-testid="expandable-text-box"] query — that attribute is reused by ~10
  // unrelated blocks (activity posts, Experience entries) and document order is
  // not a reliable way to pick the About one.
  //
  // Within the About section:
  //   Primary  — its own [data-testid="expandable-text-box"] (durable, scoped).
  //   Fallback — its first <p> (the About body). NEVER cleanText the whole
  //              section.textContent: that scoops up the trailing "Top skills"
  //              sub-block (yielding ~915 chars ending in the skills list) and
  //              pollutes About. Strip a leading "About" only as a safety net.
  let about = '';
  const aboutSection = sectionByHeading(doc, /^About\b/i);
  if (aboutSection) {
    const expandable = aboutSection.querySelector('[data-testid="expandable-text-box"]');
    const aboutBody = expandable ?? aboutSection.querySelector('p');
    if (aboutBody) {
      about = cleanText(aboutBody.textContent || '').replace(/^About\s*/i, '').trim();
    }
  }

  return {
    fullName,
    headline,
    location,
    about,
    currentCompany,
    currentTitle: '', // Composed from experience/headline by the caller.
  };
}
