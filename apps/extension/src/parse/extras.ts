/**
 * Top-card "extras" from a profile page: connection + follower counts and the open-to-work flag.
 * LinkedIn renders these as plain inline text ("272 connections", "275 followers"), so a text scan
 * over <main> is more durable than its hashed classes. All fields default to 0 / false.
 */

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** "272" → 272, "1,234" → 1234, "12.3K" → 12300, "500+" → 500. */
function num(raw: string): number {
  const m = raw.match(/([\d,.]+)\s*([KkMm]?)/);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(/,/g, ''));
  if (!isFinite(n)) return 0;
  return Math.round(n * (/k/i.test(m[2]) ? 1_000 : /m/i.test(m[2]) ? 1_000_000 : 1));
}

export interface ProfileExtras {
  connections: number;
  followers: number;
  openToWork: boolean;
}

export function parseProfileExtras(doc: Document): ProfileExtras {
  let connections = 0;
  let followers = 0;
  const main = doc.querySelector('main') ?? doc.body;
  for (const el of main.querySelectorAll('span, li, a')) {
    const t = collapse(el.textContent ?? '');
    let m: RegExpMatchArray | null;
    if (!connections && (m = t.match(/^(\d[\d,.]*\+?)\s*connections?$/i))) connections = num(m[1]);
    if (!followers && (m = t.match(/^(\d[\d,.]*[KkMm]?\+?)\s*followers?$/i))) followers = num(m[1]);
    if (connections && followers) break;
  }
  // "Open to" (the self-view button) must NOT match — only the real "Open to work" badge.
  const openToWork = /open to work/i.test(main.textContent ?? '');
  return { connections, followers, openToWork };
}
