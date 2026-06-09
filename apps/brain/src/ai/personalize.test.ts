import { describe, it, expect, vi } from 'vitest';
import type { LeadRow } from '../db/schema.js';
import { templateVars, fillTemplate, buildPrompt, renderText, type AiClient } from './personalize.js';

function makeLead(overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    id: 'l1',
    profileUrl: 'https://linkedin.com/in/test',
    fullName: 'Jane Smith',
    headline: 'Senior Engineer at Acme',
    location: 'London, UK',
    about: 'I build things.',
    currentCompany: 'Acme Corp',
    currentTitle: 'Senior Engineer',
    connections: null,
    followers: null,
    openToWork: null,
    profileRaw: null,
    status: 'new',
    createdAt: 1,
    updatedAt: null,
    ...overrides,
  };
}

// ────────────────────────────────────────────────
// templateVars
// ────────────────────────────────────────────────
describe('templateVars', () => {
  it('derives firstName, lastName, company, title from a full LeadRow', () => {
    const v = templateVars(makeLead());
    expect(v.firstName).toBe('Jane');
    expect(v.lastName).toBe('Smith');
    expect(v.fullName).toBe('Jane Smith');
    expect(v.company).toBe('Acme Corp');
    expect(v.title).toBe('Senior Engineer');
    expect(v.location).toBe('London, UK');
    expect(v.headline).toBe('Senior Engineer at Acme');
  });

  it('handles single-word names (no last name)', () => {
    const v = templateVars(makeLead({ fullName: 'Madonna' }));
    expect(v.firstName).toBe('Madonna');
    expect(v.lastName).toBe('');
  });

  it('handles three-part names', () => {
    const v = templateVars(makeLead({ fullName: 'Mary Jane Watson' }));
    expect(v.firstName).toBe('Mary');
    expect(v.lastName).toBe('Jane Watson');
  });

  it('returns empty strings for null optional fields', () => {
    const v = templateVars(makeLead({ currentCompany: null, currentTitle: null, location: null, headline: null }));
    expect(v.company).toBe('');
    expect(v.title).toBe('');
    expect(v.location).toBe('');
    expect(v.headline).toBe('');
  });
});

// ────────────────────────────────────────────────
// fillTemplate
// ────────────────────────────────────────────────
describe('fillTemplate', () => {
  it('fills known placeholders', () => {
    const vars = { firstName: 'Jane', company: 'Acme' };
    expect(fillTemplate('Hi {{firstName}}, loved your work at {{company}}!', vars))
      .toBe('Hi Jane, loved your work at Acme!');
  });

  it('blanks unknown placeholders and collapses the resulting double spaces', () => {
    // empty company leaves "Hi Jane,  hope" → collapsed to single space
    const vars = { firstName: 'Jane', company: '' };
    const result = fillTemplate('Hi {{firstName}}, loved {{company}} hope to chat!', vars);
    expect(result).toBe('Hi Jane, loved  hope to chat!'.replace(/[ \t]{2,}/g, ' ').trim());
    expect(result).not.toMatch(/  /);
  });

  it('completely unknown key → blank + no double spaces', () => {
    const vars: Record<string, string> = {};
    const result = fillTemplate('Hello {{firstName}} from {{unknownKey}}!', vars);
    expect(result).not.toMatch(/  /);
    expect(result).not.toContain('{{');
  });

  it('trims leading/trailing whitespace', () => {
    const result = fillTemplate('  Hi {{firstName}}  ', { firstName: 'Jane' });
    expect(result).toBe('Hi Jane');
  });

  it('handles whitespace inside braces: {{ firstName }}', () => {
    expect(fillTemplate('Hi {{ firstName }}', { firstName: 'Jane' })).toBe('Hi Jane');
  });

  it('returns empty string for empty template', () => {
    expect(fillTemplate('', {})).toBe('');
  });
});

// ────────────────────────────────────────────────
// buildPrompt
// ────────────────────────────────────────────────
describe('buildPrompt', () => {
  it('includes the lead name and instruction', () => {
    const lead = makeLead();
    const prompt = buildPrompt('Mention their engineering background', lead);
    expect(prompt).toContain('Jane Smith');
    expect(prompt).toContain('Mention their engineering background');
  });

  it('includes title and company', () => {
    const prompt = buildPrompt('Ask about open roles', makeLead());
    expect(prompt).toContain('Senior Engineer');
    expect(prompt).toContain('Acme Corp');
  });

  it('omits empty headline and about sections', () => {
    const lead = makeLead({ headline: null, about: null });
    const prompt = buildPrompt('Say hi', lead);
    expect(prompt).not.toContain('Headline:');
    expect(prompt).not.toContain('About:');
  });

  it('truncates about to 600 chars', () => {
    const longAbout = 'x'.repeat(800);
    const lead = makeLead({ about: longAbout });
    const prompt = buildPrompt('Say hi', lead);
    // The about slice should not exceed 600 chars
    const aboutLine = prompt.split('\n').find((l) => l.startsWith('About:'))!;
    expect(aboutLine.length).toBeLessThanOrEqual('About: '.length + 600);
  });
});

// ────────────────────────────────────────────────
// renderText
// ────────────────────────────────────────────────
describe('renderText', () => {
  const lead = makeLead();

  it('with a FAKE AiClient + aiInstruction → returns the AI output', async () => {
    const fakeAi: AiClient = { complete: vi.fn().mockResolvedValue('  AI-generated message  ') };
    const result = await renderText(
      { template: 'Hi {{firstName}}', aiInstruction: 'Write something nice' },
      lead,
      fakeAi,
    );
    expect(result).toBe('AI-generated message');
    expect(fakeAi.complete).toHaveBeenCalledOnce();
  });

  it('AI client throws → falls back to template', async () => {
    const fakeAi: AiClient = { complete: vi.fn().mockRejectedValue(new Error('network error')) };
    const result = await renderText(
      { template: 'Hi {{firstName}}', aiInstruction: 'Write something nice' },
      lead,
      fakeAi,
    );
    expect(result).toBe('Hi Jane');
  });

  it('AI returns empty string → falls back to template', async () => {
    const fakeAi: AiClient = { complete: vi.fn().mockResolvedValue('') };
    const result = await renderText(
      { template: 'Hi {{firstName}}', aiInstruction: 'Write something nice' },
      lead,
      fakeAi,
    );
    expect(result).toBe('Hi Jane');
  });

  it('no aiInstruction → uses template (client present but not called)', async () => {
    const fakeAi: AiClient = { complete: vi.fn() };
    const result = await renderText({ template: 'Hi {{firstName}}' }, lead, fakeAi);
    expect(result).toBe('Hi Jane');
    expect(fakeAi.complete).not.toHaveBeenCalled();
  });

  it('no client → uses template', async () => {
    const result = await renderText(
      { template: 'Hi {{firstName}}', aiInstruction: 'Write something nice' },
      lead,
      null,
    );
    expect(result).toBe('Hi Jane');
  });

  it('null client + no aiInstruction → uses template', async () => {
    const result = await renderText({ template: 'Hi {{firstName}}' }, lead);
    expect(result).toBe('Hi Jane');
  });
});

// ────────────────────────────────────────────────
// posts personalization (scraped recent-activity → {{recentPost}} + AI prompt)
// ────────────────────────────────────────────────
describe('posts personalization', () => {
  const posts = [
    { text: 'Shipping AURA — excited about agentic outreach!', postedAt: '2w' },
    { text: '   ', postedAt: '1mo' }, // blank → skipped
    { text: 'Thoughts on Claude Opus and code that should not exist', postedAt: '1mo' },
  ];

  it('templateVars exposes the latest non-empty post as {{recentPost}}', () => {
    expect(templateVars(makeLead(), posts).recentPost).toBe('Shipping AURA — excited about agentic outreach!');
  });

  it('templateVars recentPost is empty when there are no posts', () => {
    expect(templateVars(makeLead()).recentPost).toBe('');
  });

  it('fillTemplate can reference {{recentPost}}', () => {
    const v = templateVars(makeLead(), posts);
    expect(fillTemplate('Loved your post: "{{recentPost}}"', v))
      .toBe('Loved your post: "Shipping AURA — excited about agentic outreach!"');
  });

  it('buildPrompt lists recent posts (skipping blanks) and omits the section when empty', () => {
    const withPosts = buildPrompt('Reference a recent post', makeLead(), posts);
    expect(withPosts).toContain('recent LinkedIn posts');
    expect(withPosts).toContain('Shipping AURA');
    expect(withPosts).toContain('code that should not exist');
    expect(buildPrompt('Say hi', makeLead())).not.toContain('recent LinkedIn posts');
  });

  it('renderText threads posts into the AI prompt', async () => {
    let seenPrompt = '';
    const fakeAi: AiClient = { complete: vi.fn(async (p: string) => { seenPrompt = p; return 'msg'; }) };
    await renderText({ template: 'Hi {{firstName}}', aiInstruction: 'ref a post' }, makeLead(), fakeAi, posts);
    expect(seenPrompt).toContain('Shipping AURA');
  });
});
