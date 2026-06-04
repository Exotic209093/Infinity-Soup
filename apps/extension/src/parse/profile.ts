export interface ProfileConfirmation { loaded: boolean; fullName: string; }

// Ordered fallbacks — LinkedIn changes class names; the bare h1 is the resilient backstop.
const NAME_SELECTORS = ['main h1', 'h1.text-heading-xlarge', 'h1'];

export function parseProfileConfirmation(doc: Document): ProfileConfirmation {
  for (const sel of NAME_SELECTORS) {
    const el = doc.querySelector(sel);
    const text = el?.textContent?.trim();
    if (text) return { loaded: true, fullName: text };
  }
  return { loaded: false, fullName: '' };
}
