import { defineBackground } from 'wxt/utils/define-background';
import { HandsConnection } from '../src/connection.js';
import type { Job, Result } from '@aura/contract';

export default defineBackground(() => {
  let socket: WebSocket | null = null;

  async function connect() {
    const { port, token } = await chrome.storage.local.get(['port', 'token']);
    if (!port || !token) { console.warn('AURA: set port+token in the extension options'); return; }
    socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const conn = new HandsConnection({
      token,
      send: (s) => socket!.send(s),
      execute: executeJob,
    });
    socket.addEventListener('open', () => conn.onOpen());
    socket.addEventListener('message', (e) => conn.onMessage(String(e.data)));
    socket.addEventListener('close', () => { socket = null; });
  }

  async function executeJob(job: Job): Promise<Result> {
    if (job.type !== 'visit') return { jobId: job.id, status: 'skipped', error: 'M0 supports visit only' };
    try {
      const tab = await chrome.tabs.create({ url: job.target, active: false });
      await waitForComplete(tab.id!);
      const confirmation = await chrome.tabs.sendMessage(tab.id!, { kind: 'readProfile' });
      return { jobId: job.id, status: confirmation.loaded ? 'ok' : 'failed', data: confirmation };
    } catch (err) {
      return { jobId: job.id, status: 'failed', error: String(err) };
    }
  }

  function waitForComplete(tabId: number): Promise<void> {
    return new Promise((resolve) => {
      const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
        if (id === tabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(resolve, 1500); // let the SPA hydrate the top card
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  connect();
  chrome.storage.onChanged.addListener(() => { socket?.close(); connect(); });
});
