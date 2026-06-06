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
