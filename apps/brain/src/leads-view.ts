import type { LeadSummary, LeadDetail } from '@aura/contract';
import type { FullLead } from './db/lead-store.js';

const join = (a: unknown, b: unknown, sep = ' – ') => [a, b].filter(Boolean).map(String).join(sep);

export function toLeadSummary(f: FullLead): LeadSummary {
  return {
    id: f.lead.id, fullName: f.lead.fullName, currentTitle: f.lead.currentTitle ?? '',
    currentCompany: f.lead.currentCompany ?? '', location: f.lead.location ?? '',
    expCount: f.experience.length, eduCount: f.education.length, skillCount: f.skills.length,
    postCount: f.posts.length,
    updatedAt: f.lead.updatedAt ?? null,
  };
}

/** "12 likes · 3 comments" — only the non-zero parts, empty when there's no engagement. */
function engagementLine(p: { likes?: number; comments?: number; reposts?: number }): string {
  const bits: string[] = [];
  if (p.likes) bits.push(`${p.likes} like${p.likes === 1 ? '' : 's'}`);
  if (p.comments) bits.push(`${p.comments} comment${p.comments === 1 ? '' : 's'}`);
  if (p.reposts) bits.push(`${p.reposts} repost${p.reposts === 1 ? '' : 's'}`);
  return bits.join(' · ');
}

export function toLeadDetail(f: FullLead): LeadDetail {
  return {
    id: f.lead.id, fullName: f.lead.fullName, headline: f.lead.headline ?? '', location: f.lead.location ?? '',
    currentTitle: f.lead.currentTitle ?? '', currentCompany: f.lead.currentCompany ?? '', about: f.lead.about ?? '',
    profileUrl: f.lead.profileUrl, updatedAt: f.lead.updatedAt ?? null,
    connections: f.lead.connections ?? 0, followers: f.lead.followers ?? 0, openToWork: !!f.lead.openToWork,
    experience: (f.experience as any[]).map((e) => ({ title: e.title ?? '', company: e.company ?? '', dates: join(e.startDate, e.endDate), isCurrent: !!e.isCurrent })),
    education: (f.education as any[]).map((e) => ({ school: e.school ?? '', years: join(e.startYear, e.endYear) })),
    skills: (f.skills as any[]).map((s) => s.name ?? '').filter(Boolean),
    posts: (f.posts as any[]).map((p) => ({
      text: p.text ?? '', postedAt: p.postedAt ?? '', url: p.url ?? '', engagement: engagementLine(p),
    })),
  };
}
