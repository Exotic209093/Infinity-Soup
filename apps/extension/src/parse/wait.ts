import { parseProfileConfirmation } from './profile.js';
import type { ProfileConfirmation } from './profile.js';

export interface ProfileDiagnostics {
  url: string;
  title: string;
  h1Count: number;
  h1Texts: string[];
  authWall: boolean;
  readyState: string;
  waitedMs: number;
}

export interface ProfileReadResult extends ProfileConfirmation {
  diagnostics?: ProfileDiagnostics;
}

const AUTH_WALL_RE = /sign in|join now|join linkedin|new to linkedin|sign in to/i;

function collectDiagnostics(doc: Document, waitedMs: number): ProfileDiagnostics {
  const h1s = Array.from(doc.querySelectorAll('h1'));
  const h1Texts = h1s.map((h) => h.textContent?.trim() ?? '').filter(Boolean);
  const view = doc.defaultView;
  const url = view?.location?.href ?? '';
  const bodyText = doc.body?.textContent ?? '';
  return {
    url,
    title: doc.title,
    h1Count: h1s.length,
    h1Texts,
    authWall: AUTH_WALL_RE.test(bodyText),
    readyState: doc.readyState,
    waitedMs,
  };
}

/**
 * Wait until the LinkedIn profile name <h1> is rendered, then resolve.
 *
 * `tabs.onUpdated status==='complete'` fires when the app-shell document settles,
 * NOT when LinkedIn's SPA has fetched profile data and injected the top-card name.
 * A fixed delay after 'complete' is a guess; this watches the live DOM instead.
 *
 * Resolution is condition-based via a MutationObserver (fires as microtasks, immune
 * to background-tab timer throttling) plus a setInterval backup for any batched
 * mutation the observer misses. On timeout it resolves loaded:false with diagnostics
 * so a failure is never an opaque empty payload.
 */
export function waitForProfile(doc: Document, timeoutMs = 15000): Promise<ProfileReadResult> {
  return new Promise((resolve) => {
    const start = Date.now();

    // Fast path: the name is already present when we are asked to read.
    const immediate = parseProfileConfirmation(doc);
    if (immediate.loaded) {
      resolve(immediate);
      return;
    }

    let settled = false;
    let observer: MutationObserver | null = null;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (observer) observer.disconnect();
      if (intervalId !== undefined) clearInterval(intervalId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };

    const settle = (result: ProfileReadResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const check = () => {
      const hit = parseProfileConfirmation(doc);
      if (hit.loaded) settle(hit);
    };

    const onTimeout = () => {
      settle({
        loaded: false,
        fullName: '',
        matchedSelector: null,
        diagnostics: collectDiagnostics(doc, Date.now() - start),
      });
    };

    // MutationObserver — primary, throttle-immune signal.
    const view = doc.defaultView;
    const MO = view?.MutationObserver ?? (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
    if (MO) {
      observer = new MO(() => check());
      observer.observe(doc.documentElement, { childList: true, subtree: true });
    }

    // Interval backup — degrades to ~1/s under background throttling, still a safety net.
    intervalId = setInterval(check, 250);

    // Hard timeout — always settles with diagnostics even if callbacks are throttled.
    timeoutId = setTimeout(onTimeout, timeoutMs);

    // Re-check once more synchronously in case the DOM changed between the fast
    // path and listener registration.
    check();
  });
}
