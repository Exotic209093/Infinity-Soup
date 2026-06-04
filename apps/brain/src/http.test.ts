import { describe, it, expect, vi } from 'vitest';
import { buildHttp } from './http.js';

describe('HTTP enqueue API', () => {
  it('POST /jobs enqueues a visit job and returns its id', async () => {
    const enqueue = vi.fn();
    const app = buildHttp({ enqueue, genId: () => 'generated-id' });
    const res = await app.inject({
      method: 'POST', url: '/jobs',
      payload: { type: 'visit', target: 'https://www.linkedin.com/in/jane' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: 'generated-id' });
    expect(enqueue).toHaveBeenCalledWith({
      id: 'generated-id', type: 'visit', target: 'https://www.linkedin.com/in/jane', payload: {},
    });
    await app.close();
  });

  it('rejects an invalid job body', async () => {
    const app = buildHttp({ enqueue: vi.fn(), genId: () => 'x' });
    const res = await app.inject({ method: 'POST', url: '/jobs', payload: { type: 'nope' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
