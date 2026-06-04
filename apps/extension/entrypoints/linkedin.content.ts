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
async function loadFullProfile(timeoutMs: number): Promise<void> {
  const start = Date.now();
  let y = 0;
  // Step DOWN incrementally (not a jump to the bottom): each section must pass through the
  // viewport for its intersection-observer to fire and lazy-render. Keep going until we've
  // reached the bottom with the sections present, or we run out of time.
  while (Date.now() - start < timeoutMs) {
    y += Math.round(window.innerHeight * 0.8);
    window.scrollTo(0, y);
    await sleep(450);
    const atBottom = y >= document.body.scrollHeight - window.innerHeight;
    if (atBottom) {
      if (profileSectionsReady(document)) {
        await sleep(900); // let the last section's entries finish rendering
        break;
      }
      await sleep(450); // bottom reached but sections not in yet — give them a beat
      y = document.body.scrollHeight; // re-anchor in case the page grew
    }
  }
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
        const timeoutMs = typeof msg.timeoutMs === 'number' ? msg.timeoutMs : 20000;
        loadFullProfile(timeoutMs)
          .then(() => sendResponse(scrapeProfile(document, location.href)))
          .catch((e) => sendResponse({ fullName: '', error: String(e) }));
        return true; // async response — keep the channel open
      }
      return; // do NOT keep the channel open for unrelated messages
    });
  },
});
