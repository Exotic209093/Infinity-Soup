import type { SettingStore } from '../db/setting-store.js';

export interface WorkingHours { enabled: boolean; startHour: number; endHour: number; days: number[]; } // days: 0=Sun..6=Sat
export interface GovernorConfig { caps: Record<string, number>; workingHours: WorkingHours; }

export const DEFAULT_GOVERNOR_CONFIG: GovernorConfig = {
  caps: { connect: 20, message: 40, visit: 60, follow: 15, endorse: 15 },
  workingHours: { enabled: true, startHour: 8, endHour: 18, days: [1, 2, 3, 4, 5] },
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
  };
}

// 'skip' is currently unused (reserved for future enrollment-level dedupe).
export type GovernorDecision =
  | { kind: 'allow' }
  | { kind: 'defer'; nextEligibleAt: number; reason: string }
  | { kind: 'skip'; reason: string };

interface JobCounts {
  countByTypeSince(type: string, since: number): number;
}

export class Governor {
  constructor(private jobs: JobCounts, private config: GovernorConfig) {}

  canDispatch(action: string, target: string, now: number): GovernorDecision {
    // 1. Working hours — defer to the next open window.
    const wh = this.config.workingHours;
    if (wh.enabled && !withinHours(now, wh)) {
      return { kind: 'defer', nextEligibleAt: nextWindowOpen(now, wh), reason: 'outside working hours' };
    }

    // 2. Daily cap — defer to the next day's window open.
    const cap = this.config.caps[action] ?? Infinity;
    const used = this.jobs.countByTypeSince(action, startOfDay(now));
    if (used >= cap) {
      const tomorrow = startOfDay(now) + 24 * 60 * 60 * 1000;
      return { kind: 'defer', nextEligibleAt: nextWindowOpen(tomorrow, wh), reason: 'daily cap reached' };
    }

    return { kind: 'allow' };
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
    d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0);                       // else advance to next day 00:00
  }
  return now; // safety fallback (no working days configured)
}
