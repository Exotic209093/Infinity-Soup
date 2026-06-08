import { defineBackground } from 'wxt/utils/define-background';
import { HandsConnection } from '../src/connection.js';
import { scrapeViaWindow } from '../src/render/open-profile.js';
import type { Job, Result } from '@aura/contract';

export default defineBackground(() => {
  // < Chrome's ~30s service-worker idle-kill. Sending WS traffic on this interval resets that
  // timer, so the worker (and the socket) survives the gaps between jobs instead of dying after one.
  const HEARTBEAT_MS = 20_000;
  // Reconnect with exponential backoff so a brain that's briefly down (e.g. a restart) produces a
  // handful of "connection refused" console lines, not one every 1.5s. Resets on a successful open.
  const RECONNECT_BASE_MS = 1_500;
  const RECONNECT_MAX_MS = 30_000;

  let socket: WebSocket | null = null;
  let connecting = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectDelay = RECONNECT_BASE_MS;

  // In-memory hard-stop guard for the hands. The brain is the real scheduler, but this local
  // flag is the safety valve: when paused, executeJob refuses to run anything. It is mirrored
  // to chrome.storage.local ('paused') so it survives a service-worker restart and so the popup
  // can read it. The in-memory copy is the source of truth for the fast path in executeJob.
  let paused = false;

  /** Is the WS to the brain currently OPEN? Mirrored to storage for the popup to read. */
  function isConnected(): boolean {
    return socket?.readyState === WebSocket.OPEN;
  }

  /** Persist the live connection flag so the popup (a separate document) can observe it. */
  function publishConnected(): void {
    chrome.storage.local.set({ connected: isConnected() }).catch(() => {});
  }

  function stopHeartbeat(): void {
    if (heartbeat !== undefined) { clearInterval(heartbeat); heartbeat = undefined; }
  }

  /** Ping the brain on a timer to keep the worker alive; the brain answers pong (both ignored). */
  function startHeartbeat(): void {
    stopHeartbeat();
    heartbeat = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ kind: 'ping' }));
      else stopHeartbeat();
    }, HEARTBEAT_MS);
  }

  /** Queue one reconnect after the current backoff delay, then grow the delay (capped). */
  function scheduleReconnect(): void {
    if (reconnectTimer !== undefined) return; // a reconnect is already pending
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      void connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
  }

  async function connect() {
    // Idempotent: never stack a second socket on top of one that's already open or forming.
    if (connecting || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
    connecting = true;
    try {
      const { port, token } = await chrome.storage.local.get(['port', 'token']);
      if (!port || !token) { console.warn('AURA: set port+token in the extension options'); return; }
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      socket = ws;
      const conn = new HandsConnection({
        token,
        send: (s) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(s);
          else console.warn('AURA: send attempted on a closed socket — result dropped');
        },
        execute: executeJob,
      });
      ws.addEventListener('open', () => {
        conn.onOpen();
        publishConnected();
        startHeartbeat();
        // Connected — reset backoff and drop any pending retry so the next drop starts fresh.
        reconnectDelay = RECONNECT_BASE_MS;
        if (reconnectTimer !== undefined) { clearTimeout(reconnectTimer); reconnectTimer = undefined; }
      });
      ws.addEventListener('message', (e) => conn.onMessage(String(e.data)));
      // Guard with `socket === ws` so a stale socket's late close event can't null out a newer one.
      ws.addEventListener('close', () => {
        if (socket === ws) { socket = null; stopHeartbeat(); publishConnected(); }
        // Reconnect with backoff while the worker is alive; the keepalive alarm revives it otherwise.
        scheduleReconnect();
      });
      ws.addEventListener('error', () => { if (socket === ws) publishConnected(); });
    } finally {
      connecting = false;
    }
  }

  // Only act on real /in/<slug> profile URLs — short-circuits invalid targets (e.g. '.../in/'
  // with no slug) without burning a tab.
  const PROFILE_URL_RE = /^https:\/\/www\.linkedin\.com\/in\/[^/?#]+/;

  // Serialize the hands: run at most ONE scrape/visit at a time, however many job frames arrive.
  // The brain dispatches from uncoordinated sources (dashboard, popup, CLI) with no wait-for-result,
  // so two near-simultaneous scrapeProfile jobs would otherwise open two focused windows that fight
  // for focus — and an occluded window goes visibilityState 'hidden', which freezes LinkedIn's lazy
  // rendering and yields a top-card-only partial scrape. One slot keeps every scrape complete.
  let jobChain: Promise<unknown> = Promise.resolve();
  function executeJob(job: Job): Promise<Result> {
    const run = jobChain.then(() => doJob(job));
    jobChain = run.catch(() => {}); // keep the chain alive even if a job rejects
    return run;
  }

  async function doJob(job: Job): Promise<Result> {
    // Emergency hard-stop (hands side). If the user pulled "Stop all" in the popup, refuse to
    // act on any job — no tab/window is opened — and report it back so the brain sees the skip.
    if (paused) {
      return { jobId: job.id, status: 'skipped', error: 'paused: AURA emergency stop is active' };
    }
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

  // Restore the persisted pause state on service-worker startup so a "Stop all" survives the SW
  // being torn down and respawned. Then publish the (disconnected) connection flag immediately so
  // the popup has a value to read even before the socket opens.
  chrome.storage.local.get(['paused']).then(({ paused: p }) => { paused = !!p; }).catch(() => {});
  publishConnected();

  // Keepalive backstop: if MV3 still tears the worker down (taking the socket + heartbeat with it),
  // this alarm wakes it every 30s (Chrome's minimum period) and reconnects when the socket is down.
  // The listener is registered at top level so the alarm can revive a terminated worker.
  chrome.alarms.create('aura-keepalive', { periodInMinutes: 0.5 });
  chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'aura-keepalive') void connect(); });

  connect();
  chrome.storage.onChanged.addListener((changes) => {
    if ('port' in changes || 'token' in changes) {
      socket?.close();
      connect();
    }
  });

  // Popup <-> background channel. Returning `true` from a listener keeps the sendResponse channel
  // open for the async reply.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return;
    const type = (msg as { type?: unknown }).type;

    // Popup asks for current status on open.
    if (type === 'aura:status') {
      sendResponse({ connected: isConnected(), paused });
      return; // synchronous reply; no need to keep the channel open
    }

    // Emergency Stop-all from the popup: pull the local guard and persist it. Any in-flight job
    // finishes, but no new job will run (executeJob short-circuits on `paused`).
    if (type === 'aura:stopAll') {
      paused = true;
      chrome.storage.local.set({ paused: true }).catch(() => {});
      sendResponse({ connected: isConnected(), paused });
      return;
    }

    // Resume from the popup: clear the guard so the hands act on jobs again.
    if (type === 'aura:resume') {
      paused = false;
      chrome.storage.local.set({ paused: false }).catch(() => {});
      sendResponse({ connected: isConnected(), paused });
      return;
    }
  });
});
