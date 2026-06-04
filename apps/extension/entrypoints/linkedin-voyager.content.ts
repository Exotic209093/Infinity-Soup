import { defineContentScript } from 'wxt/utils/define-content-script';
import { isVoyagerUrl } from '../src/voyager/targets.js';
import { extractEmbeddedVoyagerJson, looksLikeVoyager } from '../src/voyager/embedded.js';
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
 *
 * Safety (this runs on the user's real, logged-in session): postMessage is scoped to the
 * page origin and replays only honour same-window requests (no PII broadcast to other
 * frames); the in-memory buffer is byte-bounded so a long-lived tab cannot leak unboundedly.
 */
export default defineContentScript({
  matches: ['https://www.linkedin.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    const ORIGIN = window.location.origin; // scope postMessage to the page; never '*'
    const MAX_BYTES = 8 * 1024 * 1024; // bound the replay buffer on long-lived tabs

    const captured: VoyagerEnvelope[] = [];
    let bufferedBytes = 0;
    (window as unknown as { __AURA_VOYAGER__?: VoyagerEnvelope[] }).__AURA_VOYAGER__ = captured;

    const emit = (env: VoyagerEnvelope) => {
      try {
        window.postMessage({ source: VOYAGER_MSG, url: env.url, body: env.body }, ORIGIN);
      } catch {
        /* postMessage can throw on exotic payloads — never break the page */
      }
    };
    const post = (url: string, body: string) => {
      if (!body) return;
      const env = { url, body };
      captured.push(env);
      bufferedBytes += body.length;
      while (captured.length > 1 && bufferedBytes > MAX_BYTES) {
        const dropped = captured.shift();
        if (dropped) bufferedBytes -= dropped.body.length;
      }
      emit(env);
    };

    // Replay everything captured before the ISOLATED side started listening. Only honour
    // requests from THIS window at the page origin — ignore other frames/scripts.
    window.addEventListener('message', (e: MessageEvent) => {
      if (e.source !== window || e.origin !== ORIGIN) return;
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
              // Only buffer text/JSON bodies (Voyager is JSON); skip binary so a matched
              // streaming/binary response is never fully buffered by our clone.
              const ct = res.headers.get('content-type') ?? '';
              if (!ct || /json|text/i.test(ct)) {
                res
                  .clone()
                  .text()
                  .then((t) => post(url, t))
                  .catch(() => {});
              }
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
          if (!isVoyagerUrl(url)) return;
          const rt = this.responseType;
          // responseText is only readable for '' | 'text'; for 'json' read the parsed object.
          if (rt === '' || rt === 'text') {
            post(url, this.responseText);
          } else if (rt === 'json' && this.response != null) {
            post(url, JSON.stringify(this.response));
          }
          // 'arraybuffer' | 'blob' | 'document' are not Voyager JSON — skip.
        } catch {
          /* never break the page */
        }
      });
      return origSend.apply(this, sendArgs);
    } as typeof xhrProto.send;

    // ── server-rendered embedded JSON ────────────────────────────────────────────
    // LinkedIn server-renders the profile and ships the data in <code> blocks that it
    // STRIPS during hydration. The reliable capture is a MutationObserver from
    // document_start that grabs each <code> the instant it's inserted — before removal.
    const seenCode = new WeakSet<Element>();
    const grabCodeNode = (el: Element) => {
      if (el.tagName !== 'CODE' || seenCode.has(el)) return;
      seenCode.add(el);
      const t = (el.textContent ?? '').trim();
      if (looksLikeVoyager(t)) post('embedded-code', t);
    };
    const codeObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          const el = node as Element;
          if (el.tagName === 'CODE') grabCodeNode(el);
          else el.querySelectorAll?.('code').forEach(grabCodeNode);
        }
      }
    });
    codeObserver.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => codeObserver.disconnect(), 25000); // stop once the page has settled

    // Belt-and-suspenders: also sweep the live DOM a few times (catches any <code> already
    // present, plus the older script#rehydrate-data). Duplicates are harmless (graph dedupes).
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
    setTimeout(grabEmbedded, 3000);
    setTimeout(grabEmbedded, 8000);
  },
});
