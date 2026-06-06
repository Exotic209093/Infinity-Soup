import { describe, it, expect } from 'vitest';
import { chooseCondition, jobPayload } from './payload.js';
import type { LeadRow, NodeRow } from '../db/schema.js';

function makeNode(type: string, config: Record<string, unknown>): NodeRow {
  return { id: 'n1', campaignId: 'c1', type, config, x: 0, y: 0 };
}

function makeLead(overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    id: 'l1', profileUrl: 'u1', fullName: 'Alice Bob', headline: null, location: null,
    about: null, currentCompany: 'TechCo', currentTitle: 'Engineer',
    profileRaw: null, status: 'new', createdAt: 1, updatedAt: null,
    ...overrides,
  };
}

describe('jobPayload', () => {
  it('connect node with template note → fills firstName and company placeholders', () => {
    const node = makeNode('connect', { note: 'Hi {{firstName}} at {{company}}!' });
    const lead = makeLead();
    expect(jobPayload(node, lead)).toEqual({ note: 'Hi Alice at TechCo!' });
  });

  it('message node with template text → fills firstName', () => {
    const node = makeNode('message', { text: 'Hey {{firstName}}, want to chat?' });
    const lead = makeLead();
    expect(jobPayload(node, lead)).toEqual({ text: 'Hey Alice, want to chat?' });
  });

  it('connect node with no note → returns empty object', () => {
    expect(jobPayload(makeNode('connect', {}), makeLead())).toEqual({});
  });

  it('message node with no text → returns empty object', () => {
    expect(jobPayload(makeNode('message', {}), makeLead())).toEqual({});
  });

  it('visit/follow/endorse nodes → return empty object regardless of lead', () => {
    const lead = makeLead();
    expect(jobPayload(makeNode('visit', {}), lead)).toEqual({});
    expect(jobPayload(makeNode('follow', {}), lead)).toEqual({});
    expect(jobPayload(makeNode('endorse', {}), lead)).toEqual({});
  });

  it('unknown template key → blank (no double spaces in output)', () => {
    const node = makeNode('message', { text: 'Hi {{firstName}} from {{unknownKey}}!' });
    const result = jobPayload(node, makeLead());
    expect(result).toHaveProperty('text');
    expect(result.text as string).not.toMatch(/  /);
    expect(result.text as string).not.toContain('{{');
  });
});

describe('chooseCondition', () => {
  it('returns "replied" when repliedAt is set and "replied" is available', () => {
    expect(chooseCondition({ connectionState: 'none', repliedAt: 5000 }, ['default', 'replied'])).toBe('replied');
  });

  it('"replied" beats "accepted" when both are present', () => {
    expect(chooseCondition({ connectionState: 'connected', repliedAt: 5000 }, ['accepted', 'replied', 'default'])).toBe('replied');
  });

  it('returns "accepted" when connectionState is "connected" and "accepted" is available (no reply)', () => {
    expect(chooseCondition({ connectionState: 'connected', repliedAt: null }, ['default', 'accepted'])).toBe('accepted');
  });

  it('returns "timeout" when offered with no "default" and no positive signal', () => {
    expect(chooseCondition({ connectionState: 'pending', repliedAt: null }, ['accepted', 'timeout'])).toBe('timeout');
  });

  it('returns "default" when no positive signal and "default" is available alongside "timeout"', () => {
    // "timeout" with "default" present → fall through to default (the node hasn't timed out yet)
    expect(chooseCondition({ connectionState: 'pending', repliedAt: null }, ['default', 'timeout'])).toBe('default');
  });

  it('returns "default" when no signals and only "default" is available', () => {
    expect(chooseCondition({ connectionState: 'none', repliedAt: null }, ['default'])).toBe('default');
  });

  it('returns "default" when connectionState is "pending" and available is ["default"]', () => {
    expect(chooseCondition({ connectionState: 'pending', repliedAt: null }, ['default'])).toBe('default');
  });

  it('never returns a condition absent from available — falls back to "default" when accepted not listed', () => {
    const result = chooseCondition({ connectionState: 'connected', repliedAt: null }, ['default']);
    expect(result).toBe('default');
    expect(['default']).toContain(result);
  });

  it('never returns a condition absent from available — falls back to "default" when replied not listed', () => {
    const result = chooseCondition({ connectionState: 'none', repliedAt: 1000 }, ['default', 'accepted']);
    expect(result).toBe('default');
    expect(['default', 'accepted']).toContain(result);
  });

  it('returns "timeout" (not "default") when timeout is the only option and no positive signal', () => {
    const result = chooseCondition({ connectionState: 'none', repliedAt: null }, ['timeout']);
    expect(result).toBe('timeout');
  });
});
