import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchLeads, fetchLead } from './api.js';

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
});
