import { defineBackground } from 'wxt/utils/define-background';
import { HandsConnection } from '../src/connection.js';
import { scrapeViaWindow } from '../src/render/open-profile.js';
import type { Job, Result } from '@aura/contract';

export default defineBackground(() => {
  let socket: WebSocket | null = null;
  let connecting = false;

  async function connect() {
    if (connecting) return;
    connecting = true;
    try {
      const { port, token } = await chrome.storage.local.get(['port', 'token']);
      if (!port || !token) { console.warn('AURA: set port+token in the extension options'); return; }
      socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const conn = new HandsConnection({
        token,
        send: (s) => {
          if (socket?.readyState === WebSocket.OPEN) socket.send(s);
          else console.warn('AURA: send attempted on a closed socket — result dropped');
        },
        execute: executeJob,
      });
      socket.addEventListener('open', () => conn.onOpen());
      socket.addEventListener('message', (e) => conn.onMessage(String(e.data)));
      socket.addEventListener('close', () => { socket = null; });
    } finally {
      connecting = false;
    }
  }

  // Only act on real /in/<slug> profile URLs — short-circuits invalid targets (e.g. '.../in/'
  // with no slug) without burning a tab.
  const PROFILE_URL_RE = /^https:\/\/www\.linkedin\.com\/in\/[^/?#]+/;

  async function executeJob(job: Job): Promise<Result> {
    if (job.type !== 'visit' && job.type !== 'scrapeProfile') {
      return { jobId: job.id, status: 'skipped', error: `unsupported job type: ${job.type}` };
    }
    if (!PROFILE_URL_RE.test(job.target)) {
      return { jobId: job.id, status: 'skipped', error: 'invalid LinkedIn profile URL' };
    }

    // M1: rich scrape — render in a non-intrusive popup window, scroll to load the lazy
    // sections, parse the hydrated DOM, and return a ScrapedProfile. The window steals no focus.
    if (job.type === 'scrapeProfile') {
      try {
        const data = await scrapeViaWindow(job.target);
        const ok = !!(data && typeof data === 'object' && (data as { fullName?: string }).fullName);
        return { jobId: job.id, status: ok ? 'ok' : 'failed', data: data as Record<string, unknown> };
      } catch (err) {
        return { jobId: job.id, status: 'failed', error: String(err) };
      }
    }

    // M0: lightweight 'visit' — confirm we reached the right person (name only).
    let tabId: number | undefined;
    try {
      // active:true (visible tab): LinkedIn does NOT render the profile body (the name <h1>)
      // in a hidden/background tab — evidence: a correct, readyState:'complete' profile page
      // still reported h1Count:0 after a full 15s wait. A never-visible tab never commits the
      // React-rendered profile. The tab is closed again in finally.
      // M-later: a less intrusive renderer (unfocused window / offscreen) to avoid the focus flash.
      const tab = await chrome.tabs.create({ url: job.target, active: true });
      if (tab.id == null) throw new Error('chrome.tabs.create returned a tab with no id');
      tabId = tab.id;
      await waitForComplete(tabId);
      const c = await chrome.tabs.sendMessage(tabId, { kind: 'readProfile' });
      return {
        jobId: job.id,
        status: c.loaded ? 'ok' : 'failed',
        data: { loaded: c.loaded, fullName: c.fullName, source: c.source },
        observed: c.diagnostics,
      };
    } catch (err) {
      return { jobId: job.id, status: 'failed', error: String(err) };
    } finally {
      if (tabId !== undefined) chrome.tabs.remove(tabId).catch(() => {});
    }
  }

  // Resolve as soon as navigation settles ('complete'). Readiness of the profile name is now
  // owned by the content script's condition-based wait (MutationObserver on the top-card <h1>),
  // so the old fixed 1500ms guess is gone. A safety cap guarantees sendMessage still runs even
  // if 'complete' never fires, letting the content script's own timeout produce diagnostics.
  function waitForComplete(tabId: number, capMs = 15000): Promise<void> {
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
      const cap = setTimeout(finish, capMs);
      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  connect();
  chrome.storage.onChanged.addListener((changes) => {
    if ('port' in changes || 'token' in changes) {
      socket?.close();
      connect();
    }
  });
});
