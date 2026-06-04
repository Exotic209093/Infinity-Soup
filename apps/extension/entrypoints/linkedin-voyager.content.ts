import { defineContentScript } from 'wxt/utils/define-content-script';
import { isVoyagerUrl } from '../src/voyager/targets.js';
import { extractEmbeddedVoyagerJson } from '../src/voyager/embedded.js';
import { VOYAGER_MSG, VOYAGER_REPLAY_REQUEST, type VoyagerEnvelope } from '../src/voyager/capture.js';

/**
 * MAIN-world, document_start interceptor (DuxSoup-style Voyager harvest).
 *
 * Runs in the PAGE's JS context BEFORE LinkedIn's bundle, so it can patch window.fetch +
 * XMLHttpRequest and observe every /voyager/api/ response the SPA makes — immune to the
 * obfuscated, hashed-class DOM. Each captured body (and the server-rendered <code> JSON) is
 * forwarded to the ISOLATED content script via window.postMessage; the ISOLATED side
 * (src/voyager/capture.ts) accumulates them and the entity-graph mapper reads fields out.
 *
 * Also exposes window.__AURA_VOYAGER__ so a captured corpus can be grabbed manually for a
 * test fixture:  copy(JSON.stringify(window.__AURA_VOYAGER__))
 */
export default defineContentScript({
  matches: ['https://www.linkedin.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    const captured: VoyagerEnvelope[] = [];
    (window as unknown as { __AURA_VOYAGER__?: VoyagerEnvelope[] }).__AURA_VOYAGER__ = captured;

    const emit = (env: VoyagerEnvelope) => {
      try {
        window.postMessage({ source: VOYAGER_MSG, url: env.url, body: env.body }, '*');
      } catch {
        /* postMessage can throw on exotic payloads — never break the page */
      }
    };
    const post = (url: string, body: string) => {
      if (!body) return;
      const env = { url, body };
      captured.push(env);
      emit(env);
    };

    // Replay everything captured before the ISOLATED side started listening.
    window.addEventListener('message', (e: MessageEvent) => {
      if (e.data && (e.data as { source?: unknown }).source === VOYAGER_REPLAY_REQUEST) {
        for (const env of captured) emit(env);
      }
    });

    // ── patch fetch ──────────────────────────────────────────────────────────────
    const origFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
    if (origFetch) {
      window.fetch = (...args: Parameters<typeof fetch>): Promise<Response> => {
        return origFetch(...args).then((res) => {
          try {
            const input = args[0];
            const url =
              typeof input === 'string'
                ? input
                : input instanceof URL
                  ? input.href
                  : (input as Request)?.url ?? '';
            if (isVoyagerUrl(url)) {
              res
                .clone()
                .text()
                .then((t) => post(url, t))
                .catch(() => {});
            }
          } catch {
            /* observation must never affect the page's fetch */
          }
          return res;
        });
      };
    }

    // ── patch XMLHttpRequest ──────────────────────────────────────────────────────
    const xhrProto = XMLHttpRequest.prototype;
    const origOpen = xhrProto.open as (...a: unknown[]) => void;
    const origSend = xhrProto.send as (...a: unknown[]) => void;
    xhrProto.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
      (this as unknown as { __auraUrl?: string }).__auraUrl = typeof url === 'string' ? url : url.href;
      return origOpen.apply(this, [method, url, ...rest]);
    } as typeof xhrProto.open;
    xhrProto.send = function (this: XMLHttpRequest, ...sendArgs: unknown[]) {
      this.addEventListener('load', () => {
        try {
          const url = (this as unknown as { __auraUrl?: string }).__auraUrl ?? '';
          // responseText is only readable for '' | 'text' response types.
          if (isVoyagerUrl(url) && (this.responseType === '' || this.responseType === 'text')) {
            post(url, this.responseText);
          }
        } catch {
          /* never break the page */
        }
      });
      return origSend.apply(this, sendArgs);
    } as typeof xhrProto.send;

    // ── server-rendered embedded JSON (capture early; the SPA removes it after hydration) ──
    const grabEmbedded = () => {
      try {
        for (const s of extractEmbeddedVoyagerJson(document)) post('embedded', s);
      } catch {
        /* noop */
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', grabEmbedded, { once: true });
    } else {
      grabEmbedded();
    }
    // LinkedIn injects some <code> blocks during hydration (after DOMContentLoaded); a couple
    // of delayed re-grabs catch those before the SPA strips them. Duplicates are harmless —
    // the entity graph dedupes by URN. (fetch/XHR interception remains the primary source.)
    setTimeout(grabEmbedded, 3000);
    setTimeout(grabEmbedded, 8000);
  },
});
