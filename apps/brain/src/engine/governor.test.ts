import { describe, it, expect } from 'vitest';
import { Governor, DEFAULT_GOVERNOR_CONFIG, type GovernorConfig } from './governor.js';

class FakeJobs {
  counts: Record<string, number> = {};
  countByTypeSince(type: string, _since: number) { return this.counts[type] ?? 0; }
  lastActionAt: () => number | null = () => null;
}

// 2026-06-08 is a Monday. Times are LOCAL.
const monday10 = new Date(2026, 5, 8, 10, 0, 0).getTime();  // in-hours
const monday2am = new Date(2026, 5, 8, 2, 0, 0).getTime();  // before 8am
const monday8pm = new Date(2026, 5, 8, 20, 0, 0).getTime(); // after 6pm
const saturday10 = new Date(2026, 5, 13, 10, 0, 0).getTime(); // weekend

// rng()→0 for existing cap tests: no jitter shaved, account age 0 → now/ms in days = ~20000+ → fraction clamps to 1 → full caps
function gov(cfg: GovernorConfig = DEFAULT_GOVERNOR_CONFIG, jobs = new FakeJobs()) {
  return { g: new Governor(jobs as any, cfg, { rng: () => 0 }), jobs };
}

describe('Governor — working hours', () => {
  it('allows when in-hours, under cap', () => {
    expect(gov().g.canDispatch('visit', 'u1', monday10)).toEqual({ kind: 'allow' });
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
  it('honours disabled working hours (allows on weekend)', () => {
    const cfg: GovernorConfig = { ...DEFAULT_GOVERNOR_CONFIG, workingHours: { ...DEFAULT_GOVERNOR_CONFIG.workingHours, enabled: false } };
    expect(gov(cfg).g.canDispatch('visit', 'u1', saturday10)).toEqual({ kind: 'allow' });
  });
});

describe('Governor — daily cap', () => {
  it('defers when the daily cap is reached', () => {
    const jobs = new FakeJobs(); jobs.counts.visit = DEFAULT_GOVERNOR_CONFIG.caps.visit;
    // rng()→0: no jitter, accountCreatedAt default 0 → age ~20000 days → full cap → used=60 >= 60 → defer
    expect(gov(DEFAULT_GOVERNOR_CONFIG, jobs).g.canDispatch('visit', 'u1', monday10).kind).toBe('defer');
  });

  it('allows when under the daily cap', () => {
    const jobs = new FakeJobs(); jobs.counts.visit = DEFAULT_GOVERNOR_CONFIG.caps.visit - 1;
    expect(gov(DEFAULT_GOVERNOR_CONFIG, jobs).g.canDispatch('visit', 'u1', monday10)).toEqual({ kind: 'allow' });
  });
});

describe('Governor — invalid-window guard', () => {
  it('does not gate dispatch when working-hours window can never open (empty days)', () => {
    // Covered via loadGovernorConfig in setting-store.test.ts; direct test for disabled path
    const cfg: GovernorConfig = { ...DEFAULT_GOVERNOR_CONFIG, workingHours: { enabled: false, startHour: 0, endHour: 0, days: [] } };
    expect(gov(cfg).g.canDispatch('visit', 'u1', saturday10)).toEqual({ kind: 'allow' });
  });
});

describe('Governor — circuit breaker', () => {
  it('defers with "circuit breaker tripped" when breaker is tripped, regardless of hours/caps', () => {
    const { g } = gov(DEFAULT_GOVERNOR_CONFIG, new FakeJobs());
    const trippedGov = new Governor(new FakeJobs() as any, DEFAULT_GOVERNOR_CONFIG, {
      breakerTripped: () => true,
      rng: () => 0,
    });
    const d = trippedGov.canDispatch('visit', 'u1', monday10);
    expect(d.kind).toBe('defer');
    if (d.kind === 'defer') expect(d.reason).toBe('circuit breaker tripped');
    void g; // silence unused warning
  });

  it('allows when breaker is explicitly not tripped', () => {
    const g = new Governor(new FakeJobs() as any, DEFAULT_GOVERNOR_CONFIG, {
      breakerTripped: () => false,
      rng: () => 0,
    });
    expect(g.canDispatch('visit', 'u1', monday10)).toEqual({ kind: 'allow' });
  });
});

describe('Governor — warm-up ramp', () => {
  it('defers at a much lower count for a fresh account (age=0) vs a mature account', () => {
    const visitCap = DEFAULT_GOVERNOR_CONFIG.caps.visit; // 60

    // Fresh account: age 0 → fraction = minFraction 0.25 → effectiveCap = ceil(60*0.25) = 15
    const freshJobs = new FakeJobs(); freshJobs.counts.visit = 15;
    const freshGov = new Governor(freshJobs as any, DEFAULT_GOVERNOR_CONFIG, {
      accountCreatedAt: monday10, // same as now → ageDays=0
      rng: () => 0,               // no jitter
    });
    expect(freshGov.canDispatch('visit', 'u1', monday10).kind).toBe('defer');

    // Mature account: accountCreatedAt=0 → age ~20000 days → fraction=1 → effectiveCap=60
    const matureJobs = new FakeJobs(); matureJobs.counts.visit = 15;
    const matureGov = new Governor(matureJobs as any, DEFAULT_GOVERNOR_CONFIG, {
      accountCreatedAt: 0,
      rng: () => 0,
    });
    expect(matureGov.canDispatch('visit', 'u1', monday10)).toEqual({ kind: 'allow' });

    // Sanity: fresh account at 14 → allow (under the 15 cap)
    const freshJobs14 = new FakeJobs(); freshJobs14.counts.visit = 14;
    const freshGov14 = new Governor(freshJobs14 as any, DEFAULT_GOVERNOR_CONFIG, {
      accountCreatedAt: monday10,
      rng: () => 0,
    });
    expect(freshGov14.canDispatch('visit', 'u1', monday10)).toEqual({ kind: 'allow' });

    void visitCap;
  });

  it('warm-up disabled: fresh account uses the full configured cap', () => {
    const cfg: GovernorConfig = {
      ...DEFAULT_GOVERNOR_CONFIG,
      warmup: { enabled: false, rampDays: 21, minFraction: 0.25 },
    };
    const jobs = new FakeJobs(); jobs.counts.visit = 15;
    const g = new Governor(jobs as any, cfg, { accountCreatedAt: monday10, rng: () => 0 });
    expect(g.canDispatch('visit', 'u1', monday10)).toEqual({ kind: 'allow' }); // 15 < 60 → allow
  });
});

describe('Governor — human pacing', () => {
  it('defers when last action was too recent (rng→0 → gap = minGapMs = 45000)', () => {
    const now = monday10;
    const last = now - 10_000; // 10 s ago — shorter than 45 s minimum
    const jobs = new FakeJobs();
    jobs.lastActionAt = () => last;

    const g = new Governor(jobs as any, DEFAULT_GOVERNOR_CONFIG, { rng: () => 0, accountCreatedAt: 0 });
    const d = g.canDispatch('visit', 'u1', now);
    expect(d.kind).toBe('defer');
    if (d.kind === 'defer') {
      expect(d.reason).toBe('pacing gap');
      expect(d.nextEligibleAt).toBe(last + 45_000);
    }
  });

  it('allows when last action is far enough in the past (gap elapsed)', () => {
    const now = monday10;
    const last = now - 300_000; // 5 minutes ago — well beyond 240 s max gap
    const jobs = new FakeJobs();
    jobs.lastActionAt = () => last;

    const g = new Governor(jobs as any, DEFAULT_GOVERNOR_CONFIG, { rng: () => 0, accountCreatedAt: 0 });
    expect(g.canDispatch('visit', 'u1', now)).toEqual({ kind: 'allow' });
  });

  it('allows when lastActionAt is null (no prior actions)', () => {
    const jobs = new FakeJobs(); // lastActionAt returns null
    const g = new Governor(jobs as any, DEFAULT_GOVERNOR_CONFIG, { rng: () => 0, accountCreatedAt: 0 });
    expect(g.canDispatch('visit', 'u1', monday10)).toEqual({ kind: 'allow' });
  });

  it('pacing disabled: does not gate even with a very recent last action', () => {
    const cfg: GovernorConfig = {
      ...DEFAULT_GOVERNOR_CONFIG,
      pacing: { enabled: false, minGapMs: 45_000, maxGapMs: 240_000, dailyJitter: 0 },
    };
    const now = monday10;
    const jobs = new FakeJobs();
    jobs.lastActionAt = () => now - 1; // 1ms ago
    const g = new Governor(jobs as any, cfg, { rng: () => 0, accountCreatedAt: 0 });
    expect(g.canDispatch('visit', 'u1', now)).toEqual({ kind: 'allow' });
  });
});

describe('Governor — daily jitter', () => {
  it('rng→0.999, dailyJitter 0.15, cap 60 mature: effectiveCap ≈ 52; used=52 → defer, used=51 → allow', () => {
    const highRng = () => 0.999;
    // mature account: accountCreatedAt=0 → full cap 60; jitter shaves floor(0.999*0.15*60)=floor(8.991)=8 → cap=52
    const jobs52 = new FakeJobs(); jobs52.counts.visit = 52;
    const g52 = new Governor(jobs52 as any, DEFAULT_GOVERNOR_CONFIG, { rng: highRng, accountCreatedAt: 0 });
    expect(g52.canDispatch('visit', 'u1', monday10).kind).toBe('defer');

    const jobs51 = new FakeJobs(); jobs51.counts.visit = 51;
    const g51 = new Governor(jobs51 as any, DEFAULT_GOVERNOR_CONFIG, { rng: highRng, accountCreatedAt: 0 });
    expect(g51.canDispatch('visit', 'u1', monday10)).toEqual({ kind: 'allow' });
  });
});
