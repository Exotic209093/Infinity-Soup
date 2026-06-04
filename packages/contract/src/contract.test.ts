import { describe, it, expect } from 'vitest';
import { JobSchema, ResultSchema, ClientHelloSchema, ServerJobSchema } from './index.js';

describe('contract schemas', () => {
  it('accepts a valid visit job', () => {
    const job = { id: 'j1', type: 'visit', target: 'https://www.linkedin.com/in/jane', payload: {} };
    expect(JobSchema.parse(job)).toEqual(job);
  });

  it('defaults payload to {}', () => {
    const parsed = JobSchema.parse({ id: 'j1', type: 'visit', target: 'https://x' });
    expect(parsed.payload).toEqual({});
  });

  it('rejects an unknown job type', () => {
    expect(() => JobSchema.parse({ id: 'j1', type: 'teleport', target: 'x' })).toThrow();
  });

  it('accepts a valid result', () => {
    const r = { jobId: 'j1', status: 'ok', data: { fullName: 'Jane Doe' } };
    expect(ResultSchema.parse(r)).toMatchObject({ jobId: 'j1', status: 'ok' });
  });

  it('round-trips a hello and a job frame', () => {
    expect(ClientHelloSchema.parse({ kind: 'hello', token: 't' }).token).toBe('t');
    const f = { kind: 'job', job: { id: 'j1', type: 'visit', target: 'x', payload: {} } };
    expect(ServerJobSchema.parse(f).job.id).toBe('j1');
  });
});
