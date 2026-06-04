import { parseProfileConfirmation } from './profile.js';
import type { ProfileConfirmation } from './profile.js';

export interface ProfileDiagnostics {
  url: string;
  title: string;
  h1Count: number;
  h1Texts: string[];
  headings: string[];
  bodyTextLength: number;
  authWall: boolean;
  authWallSignals: string[];
  readyState: string;
  waitedMs: number;
}

export interface ProfileReadResult extends ProfileConfirmation {
  source?: 'dom' | 'title';
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

// LinkedIn profile tabs are titled "<Full Name> | LinkedIn" (sometimes "(3) <Name> | LinkedIn").
// The name is reliably in the <title> even when the profile body no longer exposes it as an <h1>,
// so it's a robust confirmation that we reached the right person.
const TITLE_NAME_RE = /^(?:\(\d+\)\s*)?(.+?)\s*[|–-]\s*LinkedIn\b/;
function nameFromTitle(doc: Document): string | null {
  const m = doc.title.match(TITLE_NAME_RE);
  const name = m?.[1]?.trim();
  if (!name || /^linkedin$/i.test(name)) return null;
  return name;
}

function collectDiagnostics(doc: Document, waitedMs: number): ProfileDiagnostics {
  const h1s = Array.from(doc.querySelectorAll('h1'));
  const h1Texts = h1s.map((h) => h.textContent?.trim() ?? '').filter(Boolean);
  const headings = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6'))
    .map((h) => `${h.tagName.toLowerCase()}:${(h.textContent ?? '').trim()}`)
    .filter((s) => s.length > 3)
    .slice(0, 15);
  const { authWall, signals } = detectAuthWall(doc);
  return {
    url: doc.defaultView?.location?.href ?? '',
    title: doc.title,
    h1Count: h1s.length,
    h1Texts,
    headings,
    bodyTextLength: (doc.body?.textContent ?? '').length,
    authWall,
    authWallSignals: signals,
    readyState: doc.readyState,
    waitedMs,
  };
}

/**
 * Resolve once the LinkedIn profile name is readable, attaching DOM diagnostics to every result.
 *
 * Strategy:
 *  - Prefer the name from the live DOM (parseProfileConfirmation), watched via a MutationObserver
 *    (microtask-based, immune to background-tab timer throttling) + a setInterval backup.
 *  - On timeout, fall back to the page <title> ("<Name> | LinkedIn"). Live evidence showed LinkedIn
 *    no longer puts the profile name in an <h1> (a real, complete profile reported h1Count:0), so the
 *    DOM selectors can miss while the title stays reliable. This keeps a successful visit a success;
 *    `source` records where the name came from ('dom' | 'title').
 *  - Diagnostics (headings, bodyTextLength, auth-wall signals, …) are ALWAYS attached so a miss is
 *    never opaque and M1 can see the real top-card structure to build proper selectors.
 */
export function waitForProfile(doc: Document, timeoutMs = 15000): Promise<ProfileReadResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const finish = (partial: ProfileReadResult) =>
      resolve({ ...partial, diagnostics: collectDiagnostics(doc, Date.now() - start) });

    // Fast path: the name is already in the DOM.
    const immediate = parseProfileConfirmation(doc);
    if (immediate.loaded) {
      finish({ ...immediate, source: 'dom' });
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
    const settle = (partial: ProfileReadResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      finish(partial);
    };
    const check = () => {
      const hit = parseProfileConfirmation(doc);
      if (hit.loaded) settle({ ...hit, source: 'dom' });
    };
    const onTimeout = () => {
      // DOM never exposed the name. Fall back to the <title> — unless this is an auth wall,
      // where the title would yield a bogus "name".
      const titleName = detectAuthWall(doc).authWall ? null : nameFromTitle(doc);
      if (titleName) {
        settle({ loaded: true, fullName: titleName, matchedSelector: 'title', source: 'title' });
      } else {
        settle({ loaded: false, fullName: '', matchedSelector: null });
      }
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
    // Hard timeout — falls back to the title and always settles with diagnostics.
    timeoutId = setTimeout(onTimeout, timeoutMs);
    // Re-check once synchronously in case the DOM changed during listener registration.
    check();
  });
}
