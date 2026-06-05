import { describe, it, expect } from 'vitest';
import { Governor, DEFAULT_GOVERNOR_CONFIG, type GovernorConfig } from './governor.js';

class FakeJobs {
  succeeded = new Set<string>();           // `${type} ${target}`
  counts: Record<string, number> = {};
  hasSucceeded(type: string, target: string) { return this.succeeded.has(`${type} ${target}`); }
  countByTypeSince(type: string, _since: number) { return this.counts[type] ?? 0; }
}

// 2026-06-08 is a Monday. Times are LOCAL.
const monday10 = new Date(2026, 5, 8, 10, 0, 0).getTime();  // in-hours
const monday2am = new Date(2026, 5, 8, 2, 0, 0).getTime();  // before 8am
const monday8pm = new Date(2026, 5, 8, 20, 0, 0).getTime(); // after 6pm
const saturday10 = new Date(2026, 5, 13, 10, 0, 0).getTime(); // weekend

function gov(cfg: GovernorConfig = DEFAULT_GOVERNOR_CONFIG, jobs = new FakeJobs()) {
  return { g: new Governor(jobs as any, cfg), jobs };
}

describe('Governor', () => {
  it('allows when in-hours, under cap, not deduped', () => {
    expect(gov().g.canDispatch('visit', 'u1', monday10)).toEqual({ kind: 'allow' });
  });
  it('skips when already acted (dedupe)', () => {
    const { g, jobs } = gov(); jobs.succeeded.add('visit u1');
    expect(g.canDispatch('visit', 'u1', monday10)).toMatchObject({ kind: 'skip' });
  });
  it('defers before working hours to 8am same day', () => {
    const d = gov().g.canDispatch('visit', 'u1', monday2am);
    expect(d.kind).toBe('defer');
    if (d.kind === 'defer') { const dt = new Date(d.nextEligibleAt); expect(dt.getHours()).toBe(8); expect(dt.getDay()).toBe(1); }
  });
  it('defers after working hours to next day 8am', () => {
    const d = gov().g.canDispatch('visit', 'u1', monday8pm);
    expect(d.kind).toBe('defer');
    if (d.kind === 'defer') { const dt = new Date(d.nextEligibleAt); expect(dt.getHours()).toBe(8); expect(dt.getDay()).toBe(2); }
  });
  it('defers on weekend to Monday 8am', () => {
    const d = gov().g.canDispatch('visit', 'u1', saturday10);
    expect(d.kind).toBe('defer');
    if (d.kind === 'defer') { const dt = new Date(d.nextEligibleAt); expect(dt.getDay()).toBe(1); expect(dt.getHours()).toBe(8); }
  });
  it('defers when the daily cap is reached', () => {
    const jobs = new FakeJobs(); jobs.counts.visit = DEFAULT_GOVERNOR_CONFIG.caps.visit;
    expect(gov(DEFAULT_GOVERNOR_CONFIG, jobs).g.canDispatch('visit', 'u1', monday10).kind).toBe('defer');
  });
  it('honours disabled working hours (allows on weekend)', () => {
    const cfg: GovernorConfig = { ...DEFAULT_GOVERNOR_CONFIG, workingHours: { ...DEFAULT_GOVERNOR_CONFIG.workingHours, enabled: false } };
    expect(gov(cfg).g.canDispatch('visit', 'u1', saturday10)).toEqual({ kind: 'allow' });
  });
});
