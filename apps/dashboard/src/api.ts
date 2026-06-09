import type {
  LeadSummary,
  LeadDetail,
  Overview,
  CampaignSummary,
  CampaignDetail,
} from '@aura/contract';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const fetchLeads = () => getJson<LeadSummary[]>('/leads');
export const fetchLead = (id: string) => getJson<LeadDetail>(`/leads/${id}`);
export const fetchOverview = () => getJson<Overview>('/overview');
export const fetchCampaigns = () => getJson<CampaignSummary[]>('/campaigns');
export const fetchCampaign = (id: string) =>
  getJson<CampaignDetail>(`/campaigns/${id}`);

/**
 * Queue a profile scrape on the brain; the connected extension does the work → a lead appears.
 * `delivered: false` means no extension was connected, so the job is parked and won't run yet.
 */
export async function enqueueScrape(target: string): Promise<{ id: string; delivered?: boolean }> {
  const res = await fetch('/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'scrapeProfile', target }),
  });
  if (!res.ok) throw new Error(`/jobs → ${res.status}`);
  return res.json() as Promise<{ id: string; delivered?: boolean }>;
}
