import { parseProfileConfirmation } from './profile.js';
import type { ProfileConfirmation } from './profile.js';

export interface ProfileDiagnostics {
  url: string;
  title: string;
  h1Count: number;
  h1Texts: string[];
  authWall: boolean;
  authWallSignals: string[];
  readyState: string;
  waitedMs: number;
}

export interface ProfileReadResult extends ProfileConfirmation {
  diagnostics?: ProfileDiagnostics;
}

// Auth-wall detection uses high-precision signals (URL, title, login-form fields) —
// NOT a full body-text scan: a logged-in profile's nav/footer contains "Sign in",
// which would false-flag a slow render as an auth wall and mislead diagnosis.
const AUTH_WALL_TITLE_RE = /sign in|sign up|join linkedin|security verification/i;
const AUTH_WALL_URL_RE = /\/(authwall|login|checkpoint|signup|uas\/login)/i;
const LOGIN_FIELD_SEL =
  'input[type="password"], input[name="session_key"], input[name="session_password"], form[action*="login"], #username';

function detectAuthWall(doc: Document): { authWall: boolean; signals: string[] } {
  const signals: string[] = [];
  const url = doc.defaultView?.location?.href ?? '';
  if (AUTH_WALL_URL_RE.test(url)) signals.push('url');
  if (AUTH_WALL_TITLE_RE.test(doc.title)) signals.push('title');
  if (doc.querySelector(LOGIN_FIELD_SEL)) signals.push('login-form');
  return { authWall: signals.length > 0, signals };
}

function collectDiagnostics(doc: Document, waitedMs: number): ProfileDiagnostics {
  const h1s = Array.from(doc.querySelectorAll('h1'));
  const h1Texts = h1s.map((h) => h.textContent?.trim() ?? '').filter(Boolean);
  const { authWall, signals } = detectAuthWall(doc);
  return {
    url: doc.defaultView?.location?.href ?? '',
    title: doc.title,
    h1Count: h1s.length,
    h1Texts,
    authWall,
    authWallSignals: signals,
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
