import type { ScrapedProfile } from '@aura/contract';
import { parseProfileFields } from './profile-fields.js';
import { parseExperience } from './experience.js';
import { parseEducation } from './education.js';
import { parseSkills, parseCertifications } from './skills.js';

/**
 * Compose the per-section DOM parsers into a single contract-valid ScrapedProfile.
 *
 * This is the DOM-scraping FALLBACK path. The primary path (Voyager JSON) is wired in
 * scrape-orchestrate.ts; when JSON is unavailable this pure, fixture-tested DOM scrape
 * still returns a usable lead.
 *
 * currentCompany/currentTitle are derived here (not in profile-fields) because they need
 * both the top-card line and the experience list: on a self-view the experience entry has
 * no company, so we fall back to the top-card "Company · School" line; on other profiles
 * the present-dated experience entry is authoritative.
 */
export function scrapeProfile(doc: Document, profileUrl: string): ScrapedProfile {
  const fields = parseProfileFields(doc);
  const experience = parseExperience(doc);
  const current = experience.find((e) => e.isCurrent) ?? experience[0];
  return {
    profileUrl,
    fullName: fields.fullName,
    headline: fields.headline,
    location: fields.location,
    about: fields.about,
    currentCompany: current?.company || fields.currentCompany,
    currentTitle: current?.title || fields.currentTitle,
    experience,
    education: parseEducation(doc),
    skills: parseSkills(doc),
    certifications: parseCertifications(doc),
  };
}
