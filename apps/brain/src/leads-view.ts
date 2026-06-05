import type { LeadSummary, LeadDetail } from '@aura/contract';
import type { FullLead } from './db/lead-store.js';

const join = (a: unknown, b: unknown, sep = ' – ') => [a, b].filter(Boolean).map(String).join(sep);

export function toLeadSummary(f: FullLead): LeadSummary {
  return {
    id: f.lead.id, fullName: f.lead.fullName, currentTitle: f.lead.currentTitle ?? '',
    currentCompany: f.lead.currentCompany ?? '', location: f.lead.location ?? '',
    expCount: f.experience.length, eduCount: f.education.length, skillCount: f.skills.length,
    updatedAt: f.lead.updatedAt ?? null,
  };
}

export function toLeadDetail(f: FullLead): LeadDetail {
  return {
    id: f.lead.id, fullName: f.lead.fullName, headline: f.lead.headline ?? '', location: f.lead.location ?? '',
    currentTitle: f.lead.currentTitle ?? '', currentCompany: f.lead.currentCompany ?? '', about: f.lead.about ?? '',
    profileUrl: f.lead.profileUrl, updatedAt: f.lead.updatedAt ?? null,
    experience: (f.experience as any[]).map((e) => ({ title: e.title ?? '', company: e.company ?? '', dates: join(e.startDate, e.endDate), isCurrent: !!e.isCurrent })),
    education: (f.education as any[]).map((e) => ({ school: e.school ?? '', years: join(e.startYear, e.endYear) })),
    skills: (f.skills as any[]).map((s) => s.name ?? '').filter(Boolean),
  };
}
