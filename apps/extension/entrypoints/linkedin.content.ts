import { defineContentScript } from 'wxt/utils/define-content-script';
import { waitForProfile } from '../src/parse/wait.js';

export default defineContentScript({
  matches: ['https://www.linkedin.com/*'],
  main() {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.kind !== 'readProfile') return; // do NOT keep the channel open for unrelated messages
      const timeoutMs = typeof msg.timeoutMs === 'number' ? msg.timeoutMs : 15000;
      // Condition-based wait for LinkedIn's SPA to inject the top-card name <h1>.
      waitForProfile(document, timeoutMs).then(sendResponse);
      return true; // async response — keep the channel open until waitForProfile settles
    });
  },
});
