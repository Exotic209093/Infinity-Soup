import { describe, it, expect, vi } from 'vitest';
import {
  VoyagerCapture,
  isCaptureMessage,
  installVoyagerCapture,
  VOYAGER_MSG,
  VOYAGER_REPLAY_REQUEST,
  type CaptureWindow,
} from './capture.js';

describe('VoyagerCapture', () => {
  it('buffers non-empty bodies and ignores empties/nulls', () => {
    const cap = new VoyagerCapture();
    cap.accept({ url: 'a', body: '{"x":1}' });
    cap.accept({ url: 'b', body: '' });
    cap.accept(null);
    cap.accept(undefined);
    expect(cap.size()).toBe(1);
    expect(cap.snapshot()).toEqual([{ url: 'a', body: '{"x":1}' }]);
  });

  it('snapshot is a copy; clear empties the buffer', () => {
    const cap = new VoyagerCapture();
    cap.accept({ url: 'a', body: 'x' });
    const snap = cap.snapshot();
    snap.push({ url: 'z', body: 'mutated' });
    expect(cap.size()).toBe(1);
    cap.clear();
    expect(cap.size()).toBe(0);
  });
});

describe('isCaptureMessage', () => {
  it('only accepts well-formed capture envelopes', () => {
    expect(isCaptureMessage({ source: VOYAGER_MSG, url: 'u', body: 'b' })).toBe(true);
    expect(isCaptureMessage({ source: VOYAGER_MSG, body: 'b' })).toBe(true);
    expect(isCaptureMessage({ source: 'other', body: 'b' })).toBe(false);
    expect(isCaptureMessage({ source: VOYAGER_MSG, body: 123 })).toBe(false);
    expect(isCaptureMessage(null)).toBe(false);
    expect(isCaptureMessage('str')).toBe(false);
  });
});

describe('installVoyagerCapture', () => {
  function fakeWindow() {
    const listeners: Record<string, ((e: Event) => void)[]> = {};
    const postMessage = vi.fn();
    const win: CaptureWindow = {
      addEventListener: (type: string, cb: EventListenerOrEventListenerObject) => {
        (listeners[type] ??= []).push(cb as (e: Event) => void);
      },
      removeEventListener: (type: string, cb: EventListenerOrEventListenerObject) => {
        listeners[type] = (listeners[type] ?? []).filter((f) => f !== cb);
      },
      postMessage: postMessage as unknown as CaptureWindow['postMessage'],
    };
    const dispatch = (data: unknown) =>
      (listeners['message'] ?? []).forEach((cb) => cb({ data } as MessageEvent));
    return { win, postMessage, dispatch, listeners };
  }

  it('routes capture messages into the accumulator and requests a replay on install', () => {
    const cap = new VoyagerCapture();
    const { win, postMessage, dispatch } = fakeWindow();

    const uninstall = installVoyagerCapture(cap, win);
    expect(postMessage).toHaveBeenCalledWith({ source: VOYAGER_REPLAY_REQUEST }, '*');

    dispatch({ source: VOYAGER_MSG, url: 'https://www.linkedin.com/voyager/api/x', body: '{"included":[]}' });
    dispatch({ source: 'unrelated', body: 'ignored' });
    expect(cap.size()).toBe(1);

    uninstall();
    dispatch({ source: VOYAGER_MSG, body: '{"more":1}' });
    expect(cap.size()).toBe(1); // listener removed
  });
});
