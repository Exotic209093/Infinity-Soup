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
  let lastHeight = 0;
  while (Date.now() - start < timeoutMs) {
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(500);
    if (profileSectionsReady(document)) {
      await sleep(900); // let the section entries finish rendering
      break;
    }
    const h = document.body.scrollHeight;
    if (h === lastHeight) await sleep(400); // page stopped growing; give it a beat
    lastHeight = h;
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
