import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { profileSectionsReady } from './sections-ready.js';

const here = dirname(fileURLToPath(import.meta.url));
const fullHtml = readFileSync(join(here, '__fixtures__/real-profile.html'), 'utf8');

describe('profileSectionsReady', () => {
  it('is true for a fully-rendered profile (has Experience/Education headings)', () => {
    const doc = new DOMParser().parseFromString(fullHtml, 'text/html');
    expect(profileSectionsReady(doc)).toBe(true);
  });

  it('is false for a top-card-only page (no section headings yet)', () => {
    const doc = new DOMParser().parseFromString(
      '<html><body><main><section><h2>Jane Doe</h2><p>Headline</p></section>' +
        '<section><h2>Profile language</h2></section></main></body></html>',
      'text/html',
    );
    expect(profileSectionsReady(doc)).toBe(false);
  });

  it('is true when only Education is present (profiles may lack Experience)', () => {
    const doc = new DOMParser().parseFromString(
      '<html><body><section><h2>Education</h2><div><p>A University</p></div></section></body></html>',
      'text/html',
    );
    expect(profileSectionsReady(doc)).toBe(true);
  });
});
