import { statusLabel, statusTone, type AuraStatus } from '../../src/popup-status.js';

const dot = document.getElementById('dot') as HTMLSpanElement;
const label = document.getElementById('label') as HTMLSpanElement;
const sub = document.getElementById('sub') as HTMLSpanElement;
const stopBtn = document.getElementById('stop') as HTMLButtonElement;
const resumeBtn = document.getElementById('resume') as HTMLButtonElement;

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

// Initial paint on open.
ask('aura:status').then(render);
