import { describe, it, expect, vi } from 'vitest';
import { Dispatcher } from './dispatcher.js';
import type { Job, Result } from '@aura/contract';

function fakeStore() {
  return { create: vi.fn(), markDispatched: vi.fn(), saveResult: vi.fn(), get: vi.fn() };
}

describe('Dispatcher', () => {
  it('persists, marks dispatched, and pushes the job to hands', () => {
    const store = fakeStore();
    const send = vi.fn().mockReturnValue(true);
    const d = new Dispatcher(store as any, send, () => 1000);
    const job: Job = { id: 'j1', type: 'visit', target: 'x', payload: {} };
    expect(d.enqueue(job)).toBe(true);
    expect(store.create).toHaveBeenCalledWith(job, 1000);
    expect(store.markDispatched).toHaveBeenCalledWith('j1', 1000);
    expect(send).toHaveBeenCalledWith(job);
  });

  it('stores the job as queued when no hands are connected', () => {
    const store = fakeStore();
    const send = vi.fn().mockReturnValue(false);
    const d = new Dispatcher(store as any, send, () => 1000);
    expect(d.enqueue({ id: 'j1', type: 'visit', target: 'x', payload: {} })).toBe(false);
    expect(store.create).toHaveBeenCalled();
    expect(store.markDispatched).not.toHaveBeenCalled();
  });

  it('saves an incoming result', () => {
    const store = fakeStore();
    const d = new Dispatcher(store as any, vi.fn(), () => 2000);
    const result: Result = { jobId: 'j1', status: 'ok', data: { fullName: 'Jane' } };
    d.handleResult(result);
    expect(store.saveResult).toHaveBeenCalledWith(result, 2000);
  });
});
