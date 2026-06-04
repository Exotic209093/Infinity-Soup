/**
 * Render a LinkedIn profile in a NON-INTRUSIVE unfocused popup window, scrape it via the
 * content script, then always close the window.
 *
 * Why a window and not a background tab: LinkedIn does not commit the React-rendered profile
 * body in a never-visible tab (M0 evidence: readyState 'complete' but the body never paints).
 * `chrome.windows.create({type:'popup', focused:false})` makes the page genuinely visible to
 * the renderer so React + the lazy sections paint, while keyboard focus stays with the user.
 *
 * No new manifest permission is required: there is no `windows` permission in MV3; the
 * declared content script + `chrome.tabs.sendMessage` only need the existing `tabs` permission
 * + `host_permissions` for linkedin.com.
 */
export async function scrapeViaWindow(url: string, timeoutMs = 30000): Promise<unknown> {
  const win = await chrome.windows.create({
    url,
    type: 'popup',
    focused: false,
    state: 'normal',
    width: 1100,
    height: 900,
    top: 0,
    left: 0,
  });
  const tabId = win.tabs?.[0]?.id;
  if (tabId == null) {
    if (win.id != null) await chrome.windows.remove(win.id).catch(() => {});
    throw new Error('no tab in popup window');
  }
  try {
    await waitForComplete(tabId, timeoutMs);
    return await sendMessageWithRetry(tabId, { kind: 'scrapeProfile' });
  } finally {
    if (win.id != null) await chrome.windows.remove(win.id).catch(() => {});
  }
}

/**
 * The content script may not have registered its onMessage listener the instant the tab
 * reaches 'complete'; retry on "Receiving end does not exist" with a short backoff.
 */
async function sendMessageWithRetry(tabId: number, msg: unknown, tries = 10): Promise<unknown> {
  for (let i = 0; i < tries; i++) {
    try {
      return await chrome.tabs.sendMessage(tabId, msg);
    } catch (e) {
      if (i === tries - 1 || !/Receiving end does not exist|Could not establish connection/.test(String(e))) throw e;
      await new Promise((r) => setTimeout(r, 350));
    }
  }
}

/** Resolve once navigation settles ('complete'), with a hard cap so we always proceed. */
function waitForComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(cap);
      resolve();
    };
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') finish();
    };
    const cap = setTimeout(finish, timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
  });
}
