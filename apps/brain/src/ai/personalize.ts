import type { LeadRow } from '../db/schema.js';

export type TemplateVars = Record<string, string>;

export function templateVars(lead: LeadRow): TemplateVars {
  const full = lead.fullName ?? '';
  const [firstName, ...rest] = full.split(/\s+/).filter(Boolean);
  return {
    firstName: firstName ?? '',
    lastName: rest.join(' '),
    fullName: full,
    company: lead.currentCompany ?? '',
    title: lead.currentTitle ?? '',
    location: lead.location ?? '',
    headline: lead.headline ?? '',
  };
}

/** Replace {{key}} placeholders; unknown keys → empty string; trims doubled spaces left behind. */
export function fillTemplate(template: string, vars: TemplateVars): string {
  return template
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => vars[k] ?? '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Minimal client seam so the real Claude SDK never appears in tests. */
export interface AiClient {
  complete(prompt: string): Promise<string>;
}

/** Build a personalization prompt from the node's AI instruction + the lead's real profile. */
export function buildPrompt(instruction: string, lead: LeadRow): string {
  const v = templateVars(lead);
  return [
    'You are writing a short, friendly, non-salesy LinkedIn outreach message.',
    `Recipient: ${v.fullName}${v.title ? `, ${v.title}` : ''}${v.company ? ` at ${v.company}` : ''}.`,
    v.headline ? `Headline: ${v.headline}` : '',
    lead.about ? `About: ${lead.about.slice(0, 600)}` : '',
    `Instruction: ${instruction}`,
    'Write ONLY the message text (no preamble, no quotes), under 300 characters.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Render outreach text for a node's config. If an AI instruction + client are present, use AI
 * (falling back to the template on any error); otherwise fill the template. Async because the AI path is.
 * config shape: { template: string (template), aiInstruction?: string }
 */
export async function renderText(
  config: { template: string; aiInstruction?: string },
  lead: LeadRow,
  ai?: AiClient | null,
): Promise<string> {
  const vars = templateVars(lead);
  const fallback = fillTemplate(config.template ?? '', vars);
  if (config.aiInstruction && ai) {
    try {
      const out = (await ai.complete(buildPrompt(config.aiInstruction, lead))).trim();
      return out || fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}
