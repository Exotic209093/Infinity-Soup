import { describe, it, expect, vi } from 'vitest';
import { buildHttp } from './http.js';

// Read-only dashboard fixtures + deps that most tests don't exercise; spread into buildHttp and override per-test as needed.
const overview = {
  caps: [{ action: 'connect', used: 3, cap: 20 }],
  counts: { leads: 5, campaigns: 2, runningCampaigns: 1, activeEnrollments: 4, doneEnrollments: 1 },
  recentActivity: [{ jobId: 'j1', type: 'connect', target: 'u1', status: 'ok', at: 100 }],
};
const campaignSummary = { id: 'c1', name: 'Outreach', status: 'running', nodeCount: 2, counts: { active: 1, dispatched: 0, done: 0, failed: 0, total: 1 } };
const campaignDetail = { id: 'c1', name: 'Outreach', status: 'running', nodes: [], edges: [], enrollments: [] };
const dashStubs = { getOverview: () => overview, listCampaigns: () => [] as any, getCampaign: () => null };

describe('HTTP enqueue API', () => {
  it('POST /jobs enqueues a visit job and returns its id + delivery flag', async () => {
    const enqueue = vi.fn(() => true);
    const app = buildHttp({ enqueue, genId: () => 'generated-id', listLeads: () => [], getLead: () => null, leadsCsv: () => '', ...dashStubs });
    const res = await app.inject({
      method: 'POST', url: '/jobs',
      payload: { type: 'visit', target: 'https://www.linkedin.com/in/jane' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: 'generated-id', delivered: true });
    expect(enqueue).toHaveBeenCalledWith({
      id: 'generated-id', type: 'visit', target: 'https://www.linkedin.com/in/jane', payload: {},
    });
    await app.close();
  });

  it('rejects an invalid job body', async () => {
    const app = buildHttp({ enqueue: vi.fn(), genId: () => 'x', listLeads: () => [], getLead: () => null, leadsCsv: () => '', ...dashStubs });
    const res = await app.inject({ method: 'POST', url: '/jobs', payload: { type: 'nope' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  const summary = { id: 'l1', fullName: 'Jane Doe', currentTitle: 'CEO', currentCompany: 'Acme', location: 'London', expCount: 2, eduCount: 1, skillCount: 2, postCount: 1, updatedAt: 2 };
  const detail = { id: 'l1', fullName: 'Jane Doe', headline: 'Founder', location: 'London', currentTitle: 'CEO', currentCompany: 'Acme', about: 'a', profileUrl: 'u', updatedAt: 2, connections: 272, followers: 275, openToWork: false, experience: [], education: [], skills: [], posts: [] };

  it('GET /leads returns the summary list', async () => {
    const app = buildHttp({ enqueue: vi.fn(), genId: () => 'x', listLeads: () => [summary], getLead: () => null, leadsCsv: () => 'h\n', ...dashStubs });
    const res = await app.inject({ method: 'GET', url: '/leads' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([summary]);
    await app.close();
  });

  it('GET /leads/:id returns the detail, 404 when missing', async () => {
    const app = buildHttp({ enqueue: vi.fn(), genId: () => 'x', listLeads: () => [], getLead: (id) => (id === 'l1' ? detail : null), leadsCsv: () => 'h\n', ...dashStubs });
    expect((await app.inject({ method: 'GET', url: '/leads/l1' })).json()).toMatchObject({ id: 'l1' });
    expect((await app.inject({ method: 'GET', url: '/leads/nope' })).statusCode).toBe(404);
    await app.close();
  });

  it('GET /leads.csv returns text/csv', async () => {
    const app = buildHttp({ enqueue: vi.fn(), genId: () => 'x', listLeads: () => [], getLead: () => null, leadsCsv: () => 'fullName\nJane\n', ...dashStubs });
    const res = await app.inject({ method: 'GET', url: '/leads.csv' });
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.body).toContain('Jane');
    await app.close();
  });

  const leadStubs = { enqueue: vi.fn(), genId: () => 'x', listLeads: () => [], getLead: () => null, leadsCsv: () => '' };

  it('GET /overview returns the overview payload', async () => {
    const app = buildHttp({ ...leadStubs, ...dashStubs });
    const res = await app.inject({ method: 'GET', url: '/overview' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(overview);
    await app.close();
  });

  it('GET /campaigns returns the summary list', async () => {
    const app = buildHttp({ ...leadStubs, ...dashStubs, listCampaigns: () => [campaignSummary] });
    const res = await app.inject({ method: 'GET', url: '/campaigns' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([campaignSummary]);
    await app.close();
  });

  it('GET /campaigns/:id returns detail, 404 when missing', async () => {
    const app = buildHttp({ ...leadStubs, ...dashStubs, getCampaign: (id) => (id === 'c1' ? campaignDetail : null) });
    expect((await app.inject({ method: 'GET', url: '/campaigns/c1' })).json()).toMatchObject({ id: 'c1', name: 'Outreach' });
    expect((await app.inject({ method: 'GET', url: '/campaigns/nope' })).statusCode).toBe(404);
    await app.close();
  });
});
