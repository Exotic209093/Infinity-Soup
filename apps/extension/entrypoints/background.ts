import { defineBackground } from 'wxt/utils/define-background';
import { HandsConnection } from '../src/connection.js';
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

  async function executeJob(job: Job): Promise<Result> {
    if (job.type !== 'visit') return { jobId: job.id, status: 'skipped', error: 'M0 supports visit only' };
    let tabId: number | undefined;
    try {
      const tab = await chrome.tabs.create({ url: job.target, active: false });
      if (tab.id == null) throw new Error('chrome.tabs.create returned a tab with no id');
      tabId = tab.id;
      await waitForComplete(tabId);
      const confirmation = await chrome.tabs.sendMessage(tabId, { kind: 'readProfile' });
      return { jobId: job.id, status: confirmation.loaded ? 'ok' : 'failed', data: confirmation };
    } catch (err) {
      return { jobId: job.id, status: 'failed', error: String(err) };
    } finally {
      if (tabId !== undefined) chrome.tabs.remove(tabId).catch(() => {});
    }
  }

  // M0: fixed delay after load to let LinkedIn's SPA hydrate the top card.
  // Phase 1B: replace with a MutationObserver on the profile <h1> for reliability on slow machines.
  function waitForComplete(tabId: number): Promise<void> {
    return new Promise((resolve) => {
      const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
        if (id === tabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(resolve, 1500);
        }
      };
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
