import type { SettingStore } from '../db/setting-store.js';
import type { Result } from '@aura/contract';

export interface BreakerState { tripped: boolean; reason: string | null; at: number | null; }
export const UNTRIPPED: BreakerState = { tripped: false, reason: null, at: null };

/**
 * Inspect a Result for account-danger signals.
 * Returns the signal key/phrase, or null if the result is clean.
 */
export function tripReason(result: Result): string | null {
  const o: Record<string, unknown> = result.observed ?? {};

  // Explicit boolean flags
  for (const k of ['checkpoint', 'captcha', 'restricted', 'blocked', 'authwall'] as const) {
    if (o[k]) return k;
  }

  // Free-text warning/error fields matching known danger phrases
  const text = [o['warning'], o['error'], o['message'], result.error]
    .filter((v): v is string => typeof v === 'string')
    .join(' ')
    .toLowerCase();

  if (/captcha|checkpoint|unusual activity|restrict|verify your|invitation limit|too many|temporarily/.test(text)) {
    return 'signal:' + text.slice(0, 40);
  }

  return null;
}

export function loadBreaker(settings: SettingStore): BreakerState {
  const raw = settings.get('breaker');
  if (!raw) return UNTRIPPED;
  try { return { ...UNTRIPPED, ...JSON.parse(raw) }; } catch { return UNTRIPPED; }
}

export function tripBreaker(settings: SettingStore, reason: string, now: number): void {
  settings.set('breaker', JSON.stringify({ tripped: true, reason, at: now }));
}

export function resetBreaker(settings: SettingStore): void {
  settings.set('breaker', JSON.stringify(UNTRIPPED));
}
