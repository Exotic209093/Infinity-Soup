export interface ProfileConfirmation { loaded: boolean; fullName: string; matchedSelector: string | null; }

// Ordered fallbacks — specific-first so we can detect selector drift; the bare h1 is the resilient backstop.
// LinkedIn changes class names frequently, so keep the additive list broad.
const NAME_SELECTORS = [
  'main h1.text-heading-xlarge',
  'main section h1',
  'main h1',
  'h1.text-heading-xlarge',
  'div.ph5 h1',
  '.pv-text-details__left-panel h1',
  'h1[class*="heading-xlarge"]',
  'h1',
];

export function parseProfileConfirmation(doc: Document): ProfileConfirmation {
  for (const sel of NAME_SELECTORS) {
    const el = doc.querySelector(sel);
    const text = el?.textContent?.trim();
    if (text) return { loaded: true, fullName: text, matchedSelector: sel };
  }
  return { loaded: false, fullName: '', matchedSelector: null };
}
