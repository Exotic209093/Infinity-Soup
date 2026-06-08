import type { Post } from '@aura/contract';

/**
 * Best-effort DOM parser for the profile "recent-activity" feed.
 *
 * Every field defaults so a partial parse still yields a usable post — `text` is what actually
 * matters for personalization. Selectors target LinkedIn's semantic component classes
 * (feed-shared-*, update-components-*, social-details-*) which are far more stable than the
 * hashed profile-section classes, but they DO drift — keep this list easy to extend, and lean
 * on the captured Voyager JSON (window.__AURA_VOYAGER__) when the DOM shape changes.
 */

const CONTAINER_SELECTORS = [
  'div.feed-shared-update-v2',
  'div.profile-creator-shared-feed-update__container',
  'div[data-urn^="urn:li:activity"]',
];

const TEXT_SELECTORS = [
  '.update-components-text',
  '.feed-shared-inline-show-more-text',
  '.update-components-update-v2__commentary',
  '.feed-shared-update-v2__description',
];

const TIME_SELECTORS = [
  '.update-components-actor__sub-description',
  '.update-components-actor__sub-description-link',
  'time',
];

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** "1,234" → 1234, "1.2K" → 1200, "3K" → 3000, "2M" → 2_000_000, "5 comments" → 5, "" → 0. */
export function parseCount(raw: string | null | undefined): number {
  if (!raw) return 0;
  const m = collapse(raw).match(/([\d,.]+)\s*([KkMm]?)/);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(/,/g, ''));
  if (!isFinite(n)) return 0;
  const mult = /k/i.test(m[2]) ? 1_000 : /m/i.test(m[2]) ? 1_000_000 : 1;
  return Math.round(n * mult);
}

/** Pull a LinkedIn-style relative age ("2w", "3mo", "1yr") out of a noisy sub-description. */
export function parseAge(raw: string): string {
  const m = collapse(raw).match(/\b(\d+)\s?(yr|mo|w|d|h|m|s)\b/i);
  return m ? `${m[1]}${m[2].toLowerCase()}` : '';
}

function firstText(root: Element, selectors: string[]): string {
  for (const sel of selectors) {
    const t = collapse(root.querySelector(sel)?.textContent ?? '');
    if (t) return t;
  }
  return '';
}

function activityUrn(el: Element): string {
  const direct = el.getAttribute('data-urn') ?? '';
  if (direct.includes('urn:li:activity')) return direct;
  return el.querySelector('[data-urn^="urn:li:activity"]')?.getAttribute('data-urn') ?? '';
}

/**
 * Reactions/likes count. LinkedIn renders it as a BARE number (no "likes" label) next to the
 * reaction icons, so a single class selector is fragile — try, in order: the dedicated element,
 * an aria-label that names reactions, then any bare number in the counts bar that isn't the
 * comments/reposts tally.
 */
function parseLikes(el: Element, counts: Element | null): number {
  const direct = parseCount(el.querySelector('.social-details-social-counts__reactions-count, [data-test-social-counts-reactions]')?.textContent);
  if (direct) return direct;
  for (const a of el.querySelectorAll('[aria-label]')) {
    const label = a.getAttribute('aria-label') ?? '';
    if (/reaction|like/i.test(label) && !/comment|repost|share/i.test(label)) {
      const n = parseCount(label);
      if (n) return n;
    }
  }
  if (counts) {
    for (const item of counts.querySelectorAll('button, span, li')) {
      const t = collapse(item.textContent ?? '');
      if (!t || /comment|repost|share/i.test(t)) continue;
      if (/^[\d,.\s]+[KkMm]?$/.test(t)) { const n = parseCount(t); if (n) return n; }
    }
  }
  return 0;
}

export function parsePosts(doc: Document, max = 25): Post[] {
  const containers: Element[] = [];
  const seenEls = new Set<Element>();
  for (const sel of CONTAINER_SELECTORS) {
    for (const el of doc.querySelectorAll(sel)) {
      if (!seenEls.has(el)) { seenEls.add(el); containers.push(el); }
    }
  }

  const out: Post[] = [];
  const seenUrns = new Set<string>();
  for (const el of containers) {
    if (out.length >= max) break;
    // A repost wraps another update card — only take the outermost so we don't double-count.
    if (containers.some((other) => other !== el && other.contains(el))) continue;

    const text = firstText(el, TEXT_SELECTORS);
    const urn = activityUrn(el);
    if (!text && !urn) continue;             // skip chrome/placeholder cards
    if (urn && seenUrns.has(urn)) continue;  // dedupe reposts of the same activity
    if (urn) seenUrns.add(urn);

    const postedAt = parseAge(firstText(el, TIME_SELECTORS));
    const url = urn.includes('urn:li:activity') ? `https://www.linkedin.com/feed/update/${urn}/` : '';
    const counts = el.querySelector('.social-details-social-counts');
    const likes = parseLikes(el, counts);
    let comments = 0;
    let reposts = 0;
    if (counts) {
      for (const item of counts.querySelectorAll('li, button, span')) {
        const t = collapse(item.textContent ?? '');
        if (!comments && /comment/i.test(t)) comments = parseCount(t);
        if (!reposts && /repost|share/i.test(t)) reposts = parseCount(t);
      }
    }
    const isRepost = /reposted|shared this/i.test(
      collapse(el.querySelector('.update-components-header')?.textContent ?? ''),
    );

    out.push({ urn, text, postedAt, url, likes, comments, reposts, isRepost });
  }
  return out;
}
