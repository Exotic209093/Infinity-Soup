import { describe, it, expect } from 'vitest';
import { oneText } from './text.js';

describe('oneText', () => {
  it('reads the aria-hidden copy, not both', () => {
    const doc = new DOMParser().parseFromString(
      '<div id="r"><span aria-hidden="true">Senior Engineer</span><span class="visually-hidden">Senior Engineer</span></div>',
      'text/html',
    );
    expect(oneText(doc.getElementById('r'))).toBe('Senior Engineer');
  });

  it('falls back to trimmed textContent when no aria-hidden child', () => {
    const doc = new DOMParser().parseFromString('<div id="r">  Hello  </div>', 'text/html');
    expect(oneText(doc.getElementById('r'))).toBe('Hello');
  });

  it('returns empty string for null', () => {
    expect(oneText(null)).toBe('');
  });
});
