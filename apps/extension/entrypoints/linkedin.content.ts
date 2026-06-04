import { defineContentScript } from 'wxt/utils/define-content-script';
import { parseProfileConfirmation } from '../src/parse/profile.js';

export default defineContentScript({
  matches: ['https://www.linkedin.com/*'],
  main() {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.kind === 'readProfile') {
        sendResponse(parseProfileConfirmation(document));
      }
      return true;
    });
  },
});
