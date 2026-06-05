import { describe, it, expect, vi } from 'vitest';
import { buildHttp } from './http.js';

describe('HTTP enqueue API', () => {
  it('POST /jobs enqueues a visit job and returns its id', async () => {
    const enqueue = vi.fn();
    const app = buildHttp({ enqueue, genId: () => 'generated-id', listLeads: () => [], getLead: () => null, leadsCsv: () => '' });
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
    const app = buildHttp({ enqueue: vi.fn(), genId: () => 'x', listLeads: () => [], getLead: () => null, leadsCsv: () => '' });
    const res = await app.inject({ method: 'POST', url: '/jobs', payload: { type: 'nope' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  const summary = { id: 'l1', fullName: 'Jane Doe', currentTitle: 'CEO', currentCompany: 'Acme', location: 'London', expCount: 2, eduCount: 1, skillCount: 2, updatedAt: 2 };
  const detail = { id: 'l1', fullName: 'Jane Doe', headline: 'Founder', location: 'London', currentTitle: 'CEO', currentCompany: 'Acme', about: 'a', profileUrl: 'u', updatedAt: 2, experience: [], education: [], skills: [] };

  it('GET /leads returns the summary list', async () => {
    const app = buildHttp({ enqueue: vi.fn(), genId: () => 'x', listLeads: () => [summary], getLead: () => null, leadsCsv: () => 'h\n' });
    const res = await app.inject({ method: 'GET', url: '/leads' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([summary]);
    await app.close();
  });

  it('GET /leads/:id returns the detail, 404 when missing', async () => {
    const app = buildHttp({ enqueue: vi.fn(), genId: () => 'x', listLeads: () => [], getLead: (id) => (id === 'l1' ? detail : null), leadsCsv: () => 'h\n' });
    expect((await app.inject({ method: 'GET', url: '/leads/l1' })).json()).toMatchObject({ id: 'l1' });
    expect((await app.inject({ method: 'GET', url: '/leads/nope' })).statusCode).toBe(404);
    await app.close();
  });

  it('GET /leads.csv returns text/csv', async () => {
    const app = buildHttp({ enqueue: vi.fn(), genId: () => 'x', listLeads: () => [], getLead: () => null, leadsCsv: () => 'fullName\nJane\n' });
    const res = await app.inject({ method: 'GET', url: '/leads.csv' });
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.body).toContain('Jane');
    await app.close();
  });
});
