import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchLeads, fetchLead, fetchOverview, fetchCampaigns, fetchCampaign } from './api.js';

afterEach(() => vi.restoreAllMocks());

describe('api client', () => {
  it('fetchLeads GETs /leads and returns the array', async () => {
    const data = [{ id: 'l1', fullName: 'Jane' }];
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => data })));
    expect(await fetchLeads()).toEqual(data);
    expect(fetch).toHaveBeenCalledWith('/leads');
  });
  it('fetchLead GETs /leads/:id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ id: 'l1' }) })));
    expect(await fetchLead('l1')).toMatchObject({ id: 'l1' });
    expect(fetch).toHaveBeenCalledWith('/leads/l1');
  });
  it('fetchOverview GETs /overview and returns the json', async () => {
    const data = { caps: [], counts: { leads: 2 }, recentActivity: [] };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => data })));
    expect(await fetchOverview()).toEqual(data);
    expect(fetch).toHaveBeenCalledWith('/overview');
  });
  it('fetchCampaigns GETs /campaigns and returns the array', async () => {
    const data = [{ id: 'c1', name: 'Outreach' }];
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => data })));
    expect(await fetchCampaigns()).toEqual(data);
    expect(fetch).toHaveBeenCalledWith('/campaigns');
  });
  it('fetchCampaign GETs /campaigns/:id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ id: 'c1' }) })));
    expect(await fetchCampaign('c1')).toMatchObject({ id: 'c1' });
    expect(fetch).toHaveBeenCalledWith('/campaigns/c1');
  });
});
