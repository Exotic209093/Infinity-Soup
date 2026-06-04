import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseProfileConfirmation } from './profile.js';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '__fixtures__/profile.html'), 'utf8');

describe('parseProfileConfirmation', () => {
  it('extracts the full name from a profile fixture', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = parseProfileConfirmation(doc);
    expect(out.loaded).toBe(true);
    expect(out.fullName).toBe('Jane Doe');
  });

  it('returns loaded=false for an empty document', () => {
    const doc = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
    expect(parseProfileConfirmation(doc).loaded).toBe(false);
  });
});
