/**
 * Extract Voyager JSON that LinkedIn server-renders into the initial HTML.
 *
 * LinkedIn ships normalized data inside <code> elements (and, on older renders, a
 * `script#rehydrate-data` block) for first-paint hydration. DuxSoup reads these at
 * document_start. We do the same: an element's `textContent` auto-decodes HTML entities,
 * so the returned strings are ready for `JSON.parse`.
 *
 * The SPA often removes these blocks after hydration — capture them as early as possible.
 */

/** Cheap shape check: a JSON object/array that smells like a Voyager normalized graph. */
export function looksLikeVoyager(text: string): boolean {
  const t = text.trimStart();
  if (!t.startsWith('{') && !t.startsWith('[')) return false;
  return t.includes('"included"') || t.includes('urn:li:') || t.includes('"data"');
}

export function extractEmbeddedVoyagerJson(doc: Document): string[] {
  const out: string[] = [];
  for (const code of doc.querySelectorAll('code')) {
    const t = (code.textContent ?? '').trim();
    if (looksLikeVoyager(t)) out.push(t);
  }
  const rehydrate = doc.querySelector('#rehydrate-data');
  const rt = (rehydrate?.textContent ?? '').trim();
  if (rt && looksLikeVoyager(rt)) out.push(rt);
  return out;
}
