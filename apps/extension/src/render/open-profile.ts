/**
 * Render a LinkedIn profile in a popup window, scrape it via the content script, then always
 * close the window (focus returns to the user's previous window on close).
 *
 * Why a window and not a background tab: LinkedIn does not commit the React-rendered profile
 * body in a never-visible tab. We originally tried a NON-INTRUSIVE `focused:false` popup, but
 * live testing proved that gives `document.visibilityState === 'hidden'` — and LinkedIn gates
 * its LAZY sections (Experience/Education/Skills) on `visibilityState === 'visible'`, so an
 * unfocused window only ever paints the top card. The window must therefore be FOCUSED (hence
 * briefly visible/foreground) for the full profile to render. The interruption is short: the
 * scrape breaks as soon as the sections appear (~a few seconds) and the window then closes.
 *
 * No new manifest permission is required: there is no `windows` permission in MV3; the
 * declared content script + `chrome.tabs.sendMessage` only need the existing `tabs` permission
 * + `host_permissions` for linkedin.com.
 */
export async function scrapeViaWindow(url: string, timeoutMs = 30000): Promise<unknown> {
  const win = await chrome.windows.create({
    url,
    type: 'popup',
    focused: true, // MUST be focused: an unfocused window is visibilityState 'hidden' and
    // LinkedIn won't lazy-render Experience/Education/Skills into a hidden document.
    state: 'normal',
    // Tall viewport: more sections render eagerly (less reliance on flaky scroll triggers).
    width: 1280,
    height: 1600,
    top: 0,
    left: 0,
  });
  const tabId = win.tabs?.[0]?.id;
  if (tabId == null) {
    if (win.id != null) await chrome.windows.remove(win.id).catch(() => {});
    throw new Error('no tab in popup window');
  }
  // Keep the scrape window in the foreground for the whole scrape. `focused:true` once is not
  // enough: the moment the user clicks back to another window the popup is occluded and
  // document.visibilityState flips to 'hidden', at which point LinkedIn FREEZES its lazy
  // rendering (Experience/Education/Skills never paint). Re-asserting focus keeps it 'visible'.
  const keepVisible = setInterval(() => {
    if (win.id != null) chrome.windows.update(win.id, { focused: true }).catch(() => {});
  }, 1000);
  try {
    await waitForComplete(tabId, timeoutMs);
    return await sendMessageWithRetry(tabId, { kind: 'scrapeProfile' });
  } finally {
    clearInterval(keepVisible);
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
