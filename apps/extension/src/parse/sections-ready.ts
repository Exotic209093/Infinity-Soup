/**
 * True once LinkedIn's lazy-loaded profile sections have rendered into the DOM.
 *
 * The top card (name/headline/location) is server-rendered immediately, but Experience,
 * Education and Skills are injected client-side only after they scroll near the viewport.
 * The content script scrolls to trigger them, then polls this predicate before scraping —
 * anchored on durable heading TEXT (the obfuscated classes/ids are useless).
 */
export function profileSectionsReady(doc: Document): boolean {
  const headings = [...doc.querySelectorAll('h2,h3')].map((h) => (h.textContent || '').trim());
  const has = (re: RegExp) => headings.some((t) => re.test(t));
  // Experience or Education is enough to know the lazy body has rendered. (A profile may
  // legitimately lack one, so require either — not both.)
  return has(/^Experience\b/) || has(/^Education\b/);
}
