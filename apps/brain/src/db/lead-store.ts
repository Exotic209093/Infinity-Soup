import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { ScrapedProfile } from '@aura/contract';
import { lead, leadExperience, leadEducation, leadSkill, leadCertification, leadPost, type LeadRow } from './schema.js';

export interface FullLead {
  lead: LeadRow;
  experience: unknown[]; education: unknown[]; skills: unknown[]; certifications: unknown[]; posts: unknown[];
}

export class LeadStore {
  constructor(private db: BetterSQLite3Database) {}

  upsertProfile(p: ScrapedProfile, now: number): string {
    return this.db.transaction((tx) => {
      const existing = tx.select().from(lead).where(eq(lead.profileUrl, p.profileUrl)).get();
      const id = existing?.id ?? randomUUID();
      const row = {
        id, profileUrl: p.profileUrl, fullName: p.fullName, headline: p.headline, location: p.location,
        about: p.about, currentCompany: p.currentCompany, currentTitle: p.currentTitle,
        connections: p.connections, followers: p.followers, openToWork: p.openToWork ? 1 : 0,
        profileRaw: p as unknown as Record<string, unknown>,
        status: existing?.status ?? 'new', createdAt: existing?.createdAt ?? now, updatedAt: now,
      };
      if (existing) tx.update(lead).set(row).where(eq(lead.id, id)).run();
      else tx.insert(lead).values(row).run();

      for (const t of [leadExperience, leadEducation, leadSkill, leadCertification]) {
        tx.delete(t).where(eq(t.leadId, id)).run();
      }
      for (const e of p.experience) tx.insert(leadExperience).values({ id: randomUUID(), leadId: id, ...e, isCurrent: e.isCurrent ? 1 : 0 }).run();
      for (const e of p.education) tx.insert(leadEducation).values({ id: randomUUID(), leadId: id, ...e }).run();
      for (const s of p.skills) tx.insert(leadSkill).values({ id: randomUUID(), leadId: id, name: s.name }).run();
      for (const c of p.certifications) tx.insert(leadCertification).values({ id: randomUUID(), leadId: id, ...c }).run();
      // Posts come from a best-effort SECOND navigation (the recent-activity feed) that fails open
      // to []. Only replace stored posts when this scrape actually brought some — otherwise a
      // hiccuped posts pass on a re-scrape would silently wipe a lead's previously-scraped posts.
      if (p.posts.length > 0) {
        tx.delete(leadPost).where(eq(leadPost.leadId, id)).run();
        for (const post of p.posts) tx.insert(leadPost).values({
          id: randomUUID(), leadId: id, urn: post.urn, text: post.text, postedAt: post.postedAt, url: post.url,
          likes: post.likes, comments: post.comments, reposts: post.reposts, isRepost: post.isRepost ? 1 : 0,
        }).run();
      }
      return id;
    });
  }

  get(id: string): LeadRow | undefined { return this.db.select().from(lead).where(eq(lead.id, id)).get(); }
  all(): LeadRow[] { return this.db.select().from(lead).all(); }

  getFull(id: string): FullLead | undefined {
    const row = this.get(id); if (!row) return undefined;
    return {
      lead: row,
      experience: this.db.select().from(leadExperience).where(eq(leadExperience.leadId, id)).all(),
      education: this.db.select().from(leadEducation).where(eq(leadEducation.leadId, id)).all(),
      skills: this.db.select().from(leadSkill).where(eq(leadSkill.leadId, id)).all(),
      certifications: this.db.select().from(leadCertification).where(eq(leadCertification.leadId, id)).all(),
      posts: this.db.select().from(leadPost).where(eq(leadPost.leadId, id)).all(),
    };
  }
}
