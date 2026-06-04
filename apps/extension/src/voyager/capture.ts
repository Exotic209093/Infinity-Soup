/**
 * ISOLATED-world accumulator for Voyager JSON forwarded by the MAIN-world interceptor
 * (entrypoints/linkedin-voyager.content.ts).
 *
 * Flow: MAIN-world patches fetch/XHR + reads embedded <code> JSON, then `window.postMessage`s
 * each raw body. This module listens for those messages and buffers them. Parsing into an
 * entity graph happens later (see voyager/graph.ts) so capture stays cheap and lossless.
 *
 * Duplicate bodies are harmless — the entity graph dedupes by URN — so we also send a
 * "replay" request on install to recover anything captured before we began listening.
 */

export interface VoyagerEnvelope {
  url: string;
  body: string;
}

/** postMessage discriminators shared with the MAIN-world interceptor. */
export const VOYAGER_MSG = 'aura-voyager-capture';
export const VOYAGER_REPLAY_REQUEST = 'aura-voyager-replay-request';

export class VoyagerCapture {
  private buffer: VoyagerEnvelope[] = [];

  accept(env: VoyagerEnvelope | null | undefined): void {
    if (env && typeof env.body === 'string' && env.body.length > 0) {
      this.buffer.push({ url: env.url ?? '', body: env.body });
    }
  }

  snapshot(): VoyagerEnvelope[] {
    return [...this.buffer];
  }

  size(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer = [];
  }
}

interface CaptureMessage {
  source: typeof VOYAGER_MSG;
  url?: string;
  body: string;
}

export function isCaptureMessage(data: unknown): data is CaptureMessage {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return d.source === VOYAGER_MSG && typeof d.body === 'string';
}

/** Minimal surface of `window` this module needs — keeps it unit-testable with a stub. */
export type CaptureWindow = Pick<Window, 'addEventListener' | 'removeEventListener' | 'postMessage'>;

/**
 * Subscribe an accumulator to a window's message stream and request a replay of anything
 * captured before now. Returns an uninstall function.
 */
export function installVoyagerCapture(cap: VoyagerCapture, win: CaptureWindow): () => void {
  const handler = (e: Event): void => {
    const data = (e as MessageEvent).data;
    if (isCaptureMessage(data)) cap.accept({ url: data.url ?? '', body: data.body });
  };
  win.addEventListener('message', handler);
  try {
    win.postMessage({ source: VOYAGER_REPLAY_REQUEST }, '*');
  } catch {
    /* some test stubs don't implement postMessage */
  }
  return () => win.removeEventListener('message', handler);
}
