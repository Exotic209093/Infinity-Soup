/**
 * LinkedIn duplicates visible text into an aria-hidden span and a `.visually-hidden`
 * sibling. Reading `.textContent` yields the value twice ("XX"). oneText reads exactly
 * one copy: prefer the visible `[aria-hidden="true"]` node, else the element's own text.
 */
export function oneText(el: Element | null): string {
  if (!el) return '';
  const visible = el.querySelector('[aria-hidden="true"]');
  return (visible?.textContent ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
}
