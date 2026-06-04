import { describe, it, expect } from 'vitest';
import { waitForProfile } from './wait.js';

describe('waitForProfile', () => {
  it('resolves loaded=true when the name h1 is inserted AFTER the call', async () => {
    const doc = new DOMParser().parseFromString(
      '<html><head><title>Loading…</title></head><body><main></main></body></html>',
      'text/html',
    );

    const promise = waitForProfile(doc, 5000);

    // Inject the top-card name shortly after, simulating SPA hydration.
    setTimeout(() => {
      const main = doc.querySelector('main')!;
      const h1 = doc.createElement('h1');
      h1.className = 'text-heading-xlarge';
      h1.textContent = 'Ada Lovelace';
      main.appendChild(h1);
    }, 20);

    const out = await promise;
    expect(out.loaded).toBe(true);
    expect(out.fullName).toBe('Ada Lovelace');
    expect(out.diagnostics).toBeUndefined();
  });

  it('resolves immediately when the name is already present', async () => {
    const doc = new DOMParser().parseFromString(
      '<html><body><main><h1 class="text-heading-xlarge">Grace Hopper</h1></main></body></html>',
      'text/html',
    );
    const out = await waitForProfile(doc, 5000);
    expect(out.loaded).toBe(true);
    expect(out.fullName).toBe('Grace Hopper');
  });

  it('resolves loaded=false WITH diagnostics on timeout when no name renders', async () => {
    const doc = new DOMParser().parseFromString(
      '<html><head><title>Sign in to LinkedIn</title></head><body>Sign in to continue. New to LinkedIn? Join now</body></html>',
      'text/html',
    );

    const out = await waitForProfile(doc, 200);
    expect(out.loaded).toBe(false);
    expect(out.fullName).toBe('');
    expect(out.diagnostics).toBeDefined();
    expect(typeof out.diagnostics!.h1Count).toBe('number');
    expect(typeof out.diagnostics!.authWall).toBe('boolean');
    expect(out.diagnostics!.authWall).toBe(true);
    expect(out.diagnostics!.waitedMs).toBeGreaterThanOrEqual(200);
    expect(typeof out.diagnostics!.readyState).toBe('string');
    expect(Array.isArray(out.diagnostics!.h1Texts)).toBe(true);
  });

  it('reports authWall=false and h1 texts when a non-name heading is present but no profile', async () => {
    const doc = new DOMParser().parseFromString(
      '<html><head><title>LinkedIn</title></head><body><div>Some content</div></body></html>',
      'text/html',
    );

    const out = await waitForProfile(doc, 150);
    expect(out.loaded).toBe(false);
    expect(out.diagnostics!.authWall).toBe(false);
    expect(out.diagnostics!.h1Count).toBe(0);
  });
});
