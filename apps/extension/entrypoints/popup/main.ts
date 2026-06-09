import { statusLabel, statusTone, type AuraStatus } from '../../src/popup-status.js';

const dot = document.getElementById('dot') as HTMLSpanElement;
const label = document.getElementById('label') as HTMLSpanElement;
const sub = document.getElementById('sub') as HTMLSpanElement;
const stopBtn = document.getElementById('stop') as HTMLButtonElement;
const resumeBtn = document.getElementById('resume') as HTMLButtonElement;
const scrapeBtn = document.getElementById('scrape') as HTMLButtonElement;
const scrapeMsg = document.getElementById('scrapeMsg') as HTMLDivElement;

// Same gate the hands uses: only act on real /in/<slug> profile URLs.
const PROFILE_URL_RE = /^https:\/\/www\.linkedin\.com\/in\/[^/?#]+/;

function setMsg(text: string, tone: '' | 'ok' | 'err' = ''): void {
  scrapeMsg.textContent = text;
  scrapeMsg.className = `msg ${tone}`.trim();
  scrapeMsg.hidden = !text;
}

/** Paint the popup from a status snapshot. */
function render(status: AuraStatus): void {
  const tone = statusTone(status.connected, status.paused);
  dot.className = `dot ${tone}`;
  label.textContent = statusLabel(status.connected, status.paused);
  sub.textContent = status.connected ? 'brain online' : 'brain offline';
  // While paused, swap the destructive Stop for a Resume affordance.
  stopBtn.hidden = status.paused;
  resumeBtn.hidden = !status.paused;
}

/**
 * Ask the background for status, or send it a command. The background's onMessage listener
 * replies synchronously with the latest {connected, paused}. If the SW is unreachable we fall
 * back to a disconnected snapshot rather than throwing.
 */
async function ask(type: 'aura:status' | 'aura:stopAll' | 'aura:resume'): Promise<AuraStatus> {
  try {
    const res = (await chrome.runtime.sendMessage({ type })) as Partial<AuraStatus> | undefined;
    return { connected: !!res?.connected, paused: !!res?.paused };
  } catch {
    return { connected: false, paused: false };
  }
}

stopBtn.addEventListener('click', async () => {
  render(await ask('aura:stopAll'));
});

resumeBtn.addEventListener('click', async () => {
  render(await ask('aura:resume'));
});

// "Scrape this profile": read the active tab, and if it's a LinkedIn profile, enqueue a
// scrapeProfile job on the brain (which dispatches it back to this extension's hands → lead).
scrapeBtn.addEventListener('click', async () => {
  setMsg('');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url ?? '';
  if (!PROFILE_URL_RE.test(url)) { setMsg('Open a linkedin.com/in/… profile tab first', 'err'); return; }

  const status = await ask('aura:status');
  render(status);
  if (status.paused) { setMsg('Paused — hit Resume first', 'err'); return; }
  if (!status.connected) { setMsg('Brain not connected — wait for the green dot, then retry', 'err'); return; }

  const { port } = await chrome.storage.local.get('port');
  if (!port) { setMsg('Set the brain port in Options first', 'err'); return; }

  scrapeBtn.disabled = true;
  setMsg('Queuing…');
  try {
    // HTTP API is the WS port + 1 (see the brain's index.ts).
    const res = await fetch(`http://127.0.0.1:${Number(port) + 1}/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'scrapeProfile', target: url }),
    });
    if (!res.ok) throw new Error(`brain responded ${res.status}`);
    setMsg('Queued ✓ — scraping now, watch the dashboard', 'ok');
  } catch (e) {
    setMsg(`Failed: ${e instanceof Error ? e.message : String(e)} (is the brain running?)`, 'err');
  } finally {
    scrapeBtn.disabled = false;
  }
});

// Initial paint on open.
ask('aura:status').then(render);
