import { describe, it, expect, vi } from 'vitest';
import { HandsConnection } from './connection.js';
import type { Result } from '@aura/contract';

describe('HandsConnection', () => {
  it('sends hello on open', () => {
    const sent: string[] = [];
    const conn = new HandsConnection({ token: 't', send: (s) => sent.push(s), execute: async () => ({} as Result) });
    conn.onOpen();
    expect(JSON.parse(sent[0])).toEqual({ kind: 'hello', token: 't' });
  });

  it('executes a job on receiving a job frame and sends back the result', async () => {
    const sent: string[] = [];
    const execute = vi.fn(async () => ({ jobId: 'j1', status: 'ok', data: { fullName: 'Jane' } } as Result));
    const conn = new HandsConnection({ token: 't', send: (s) => sent.push(s), execute });
    await conn.onMessage(JSON.stringify({ kind: 'job', job: { id: 'j1', type: 'visit', target: 'x', payload: {} } }));
    expect(execute).toHaveBeenCalledWith({ id: 'j1', type: 'visit', target: 'x', payload: {} });
    expect(JSON.parse(sent[0])).toEqual({ kind: 'result', result: { jobId: 'j1', status: 'ok', data: { fullName: 'Jane' } } });
  });

  it('ignores malformed frames', async () => {
    const sent: string[] = [];
    const conn = new HandsConnection({ token: 't', send: (s) => sent.push(s), execute: async () => ({} as Result) });
    await conn.onMessage('not json');
    await conn.onMessage(JSON.stringify({ kind: 'bogus' }));
    expect(sent).toHaveLength(0);
  });
});
