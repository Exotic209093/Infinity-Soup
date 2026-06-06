import type { SettingStore } from '../db/setting-store.js';

export interface WorkingHours { enabled: boolean; startHour: number; endHour: number; days: number[]; } // days: 0=Sun..6=Sat
export interface WarmupConfig { enabled: boolean; rampDays: number; minFraction: number; }
export interface PacingConfig { enabled: boolean; minGapMs: number; maxGapMs: number; dailyJitter: number; }
export interface GovernorConfig {
  caps: Record<string, number>;
  workingHours: WorkingHours;
  warmup?: WarmupConfig;
  pacing?: PacingConfig;
}

export const DEFAULT_GOVERNOR_CONFIG: GovernorConfig = {
  caps: { connect: 20, message: 40, visit: 60, follow: 15, endorse: 15 },
  workingHours: { enabled: true, startHour: 8, endHour: 18, days: [1, 2, 3, 4, 5] },
  warmup: { enabled: true, rampDays: 21, minFraction: 0.25 },
  pacing: { enabled: true, minGapMs: 45_000, maxGapMs: 240_000, dailyJitter: 0.15 },
};

/** Load config from the `governor` setting JSON, deep-merging over defaults (partial overrides keep the rest). */
export function loadGovernorConfig(settings: SettingStore): GovernorConfig {
  const raw = settings.get('governor');
  if (!raw) return DEFAULT_GOVERNOR_CONFIG;
  let parsed: Partial<GovernorConfig> = {};
  try { parsed = JSON.parse(raw); } catch { return DEFAULT_GOVERNOR_CONFIG; }
  const workingHours = { ...DEFAULT_GOVERNOR_CONFIG.workingHours, ...(parsed.workingHours ?? {}) };
  const invalidWindow = !Array.isArray(workingHours.days) || workingHours.days.length === 0 || workingHours.startHour >= workingHours.endHour;
  if (invalidWindow) workingHours.enabled = false; // a window that can never open must not gate dispatch
  return {
    caps: { ...DEFAULT_GOVERNOR_CONFIG.caps, ...(parsed.caps ?? {}) },
    workingHours,
    warmup: parsed.warmup ? { ...DEFAULT_GOVERNOR_CONFIG.warmup!, ...parsed.warmup } : DEFAULT_GOVERNOR_CONFIG.warmup,
    pacing: parsed.pacing ? { ...DEFAULT_GOVERNOR_CONFIG.pacing!, ...parsed.pacing } : DEFAULT_GOVERNOR_CONFIG.pacing,
  };
}

// 'skip' is currently unused (reserved for future enrollment-level dedupe).
export type GovernorDecision =
  | { kind: 'allow' }
  | { kind: 'defer'; nextEligibleAt: number; reason: string }
  | { kind: 'skip'; reason: string };

export interface JobCounts {
  countByTypeSince(type: string, since: number): number;
  /** Timestamp of the most recent SENT action (dispatched/ok), for pacing. null if none. */
  lastActionAt(): number | null;
}

export interface GovernorOptions {
  /** Unix ms when the account was created; for warm-up ramp. Default 0 → mature account (full caps). */
  accountCreatedAt?: number;
  /** Live breaker read. Default () => false. */
  breakerTripped?: () => boolean;
  /** Injectable randomness; default Math.random. Inject a deterministic function in tests. */
  rng?: () => number;
}

export class Governor {
  private readonly rng: () => number;
  private readonly accountCreatedAt: number;
  private readonly isBreakerTripped: () => boolean;

  constructor(
    private jobs: JobCounts,
    private config: GovernorConfig,
    private opts: GovernorOptions = {},
  ) {
    this.rng = opts.rng ?? Math.random;
    this.accountCreatedAt = opts.accountCreatedAt ?? 0;
    this.isBreakerTripped = opts.breakerTripped ?? (() => false);
  }

  canDispatch(action: string, target: string, now: number): GovernorDecision {
    // 0. Circuit breaker — halt everything while tripped.
    if (this.isBreakerTripped()) {
      return { kind: 'defer', nextEligibleAt: now + 60 * 60 * 1000, reason: 'circuit breaker tripped' };
    }

    // 1. Working hours — defer to the next open window.
    const wh = this.config.workingHours;
    if (wh.enabled && !withinHours(now, wh)) {
      return { kind: 'defer', nextEligibleAt: nextWindowOpen(now, wh), reason: 'outside working hours' };
    }

    // 2. Human pacing — random minimum gap since the last action.
    if (this.config.pacing?.enabled) {
      const last = this.jobs.lastActionAt();
      if (last != null) {
        const { minGapMs, maxGapMs } = this.config.pacing;
        const gap = minGapMs + this.rng() * Math.max(0, maxGapMs - minGapMs);
        if (now - last < gap) {
          return { kind: 'defer', nextEligibleAt: Math.ceil(last + gap), reason: 'pacing gap' };
        }
      }
    }

    // 3. Daily cap — warm-up-ramped, minus a small random daily-target jitter.
    const baseCap = this.config.caps[action] ?? Infinity;
    const cap = this.effectiveCap(baseCap, now);
    const used = this.jobs.countByTypeSince(action, startOfDay(now));
    if (used >= cap) {
      const tomorrow = startOfDay(now) + 86_400_000;
      return { kind: 'defer', nextEligibleAt: nextWindowOpen(tomorrow, wh), reason: 'daily cap reached' };
    }

    return { kind: 'allow' };
  }

  /** Apply warm-up ramp then daily jitter to produce the effective cap for today. */
  private effectiveCap(baseCap: number, now: number): number {
    if (!isFinite(baseCap)) return baseCap;
    let cap = baseCap;
    const w = this.config.warmup;
    if (w?.enabled) {
      const ageDays = Math.max(0, (now - this.accountCreatedAt) / 86_400_000);
      const fraction = Math.min(1, w.minFraction + (1 - w.minFraction) * (ageDays / w.rampDays));
      cap = Math.max(1, Math.ceil(baseCap * fraction));
    }
    const j = this.config.pacing?.dailyJitter ?? 0;
    if (j > 0) cap = Math.max(1, cap - Math.floor(this.rng() * j * cap));
    return cap;
  }
}

// ── time helpers (local server time) ──
export function startOfDay(now: number): number {
  const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime();
}
export function withinHours(now: number, wh: WorkingHours): boolean {
  const d = new Date(now);
  return wh.days.includes(d.getDay()) && d.getHours() >= wh.startHour && d.getHours() < wh.endHour;
}
/** The next instant at/after `now` that falls inside the working-hours window. */
export function nextWindowOpen(now: number, wh: WorkingHours): number {
  const d = new Date(now);
  for (let i = 0; i < 14; i++) {
    const open = new Date(d); open.setHours(wh.startHour, 0, 0, 0);
    if (wh.days.includes(d.getDay())) {
      if (d.getTime() <= open.getTime()) return open.getTime();              // before today's open → today's startHour
      if (d.getHours() < wh.endHour) return Math.max(d.getTime(), open.getTime()); // inside window → now
    }
    d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0);                     // else advance to next day 00:00
  }
  return now; // safety fallback (no working days configured)
}
