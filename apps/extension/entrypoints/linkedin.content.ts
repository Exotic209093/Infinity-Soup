import { defineContentScript } from 'wxt/utils/define-content-script';
import { waitForProfile } from '../src/parse/wait.js';
import { scrapeProfile } from '../src/parse/scrape-profile.js';
import { profileSectionsReady } from '../src/parse/sections-ready.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Trigger LinkedIn's lazy-loaded sections (Experience/Education/Skills only render once
 * scrolled near the viewport — confirmed live), then settle so entries fully paint.
 * Resolves when the sections are present or the timeout elapses (the scrape then takes
 * whatever rendered — the top card alone is still a usable lead).
 */
// LinkedIn renders the profile inside an INNER scroll container (document.body height ==
// viewport height), so window.scrollTo alone triggers nothing. Find every scrollable element
// under <main> (durable tag); the tallest is the profile content container.
function findScrollers(): Element[] {
  const set = new Set<Element>();
  set.add(document.scrollingElement || document.documentElement);
  const main = document.querySelector('main') || document.body;
  set.add(main);
  for (const el of main.querySelectorAll('div,section,ul')) {
    if (el.scrollHeight > el.clientHeight + 200) set.add(el);
  }
  return [...set];
}
function mainScroller(): Element {
  let best: Element = document.scrollingElement || document.documentElement;
  for (const el of findScrollers()) if (el.scrollHeight > best.scrollHeight) best = el;
  return best;
}

async function loadFullProfile(timeoutMs: number): Promise<void> {
  const start = Date.now();
  await sleep(800); // initial settle so the SPA mounts the main column before we scroll
  let pos = 0;
  // Step GRADUALLY through the main scroll container (instant jumps to the bottom don't reliably
  // trip LinkedIn's lazy-load sentinels). Dispatch a bubbling 'scroll' on the container itself.
  while (Date.now() - start < timeoutMs) {
    const el = mainScroller();
    pos += Math.max(400, Math.round(el.clientHeight * 0.6));
    if (pos >= el.scrollHeight) pos = el.scrollHeight;
    el.scrollTop = pos;
    window.scrollTo(0, document.documentElement.scrollHeight);
    el.dispatchEvent(new Event('scroll', { bubbles: true }));
    window.dispatchEvent(new Event('scroll'));
    await sleep(350);
    if (profileSectionsReady(document)) {
      // Sections appeared — keep scrolling to the very bottom so later ones (Skills renders
      // LAST) load before we scrape.
      for (let k = 0; k < 14; k++) {
        const e2 = mainScroller();
        e2.scrollTop = e2.scrollHeight;
        e2.dispatchEvent(new Event('scroll', { bubbles: true }));
        await sleep(300);
      }
      break;
    }
    // Reached the bottom of currently-rendered content without the sections — bounce to the
    // top and sweep down again to re-fire observers that need the element to enter the viewport.
    if (pos >= el.scrollHeight) {
      el.scrollTop = 0;
      await sleep(350);
      pos = 0;
    }
  }
  mainScroller().scrollTop = 0;
  window.scrollTo(0, 0);
  await sleep(200);
}

export default defineContentScript({
  matches: ['https://www.linkedin.com/*'],
  main() {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      // M0: lightweight name-only confirmation.
      if (msg?.kind === 'readProfile') {
        const timeoutMs = typeof msg.timeoutMs === 'number' ? msg.timeoutMs : 15000;
        waitForProfile(document, timeoutMs).then(sendResponse);
        return true; // async response
      }
      // M1: rich scrape — scroll to load lazy sections, then parse the hydrated DOM.
      if (msg?.kind === 'scrapeProfile') {
        const timeoutMs = typeof msg.timeoutMs === 'number' ? msg.timeoutMs : 40000;
        loadFullProfile(timeoutMs)
          .then(() => sendResponse(scrapeProfile(document, location.href)))
          .catch((e) => sendResponse({ fullName: '', error: String(e) }));
        return true; // async response — keep the channel open
      }
      return; // do NOT keep the channel open for unrelated messages
    });
  },
});
