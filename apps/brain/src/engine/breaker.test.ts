import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Result } from '@aura/contract';
import { SettingStore } from '../db/setting-store.js';
import { tripReason, loadBreaker, tripBreaker, resetBreaker, UNTRIPPED } from './breaker.js';

function freshDb(): BetterSQLite3Database {
  const sqlite = new Database(':memory:'); sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle') });
  return db;
}

function makeResult(overrides: Partial<Result> = {}): Result {
  return { jobId: 'j1', status: 'ok', ...overrides };
}

describe('tripReason', () => {
  it('returns null for a clean result', () => {
    expect(tripReason(makeResult())).toBeNull();
  });

  it('returns null for a result with benign observed fields', () => {
    expect(tripReason(makeResult({ observed: { connectionState: 'connected', replied: true } }))).toBeNull();
  });

  // Boolean flag tests
  it.each(['checkpoint', 'captcha', 'restricted', 'blocked', 'authwall'] as const)(
    'detects boolean flag: %s',
    (flag) => {
      expect(tripReason(makeResult({ observed: { [flag]: true } }))).toBe(flag);
    },
  );

  it('ignores falsy boolean flags', () => {
    expect(tripReason(makeResult({ observed: { checkpoint: false } }))).toBeNull();
  });

  // Free-text danger phrase tests
  it.each([
    ['captcha', { error: 'captcha challenge presented' }],
    ['checkpoint', { warning: 'checkpoint triggered' }],
    ['unusual activity', { message: 'Unusual activity detected on your account' }],
    ['restrict', { error: 'Your account has been restricted' }],
    ['verify your', { warning: 'Please verify your identity' }],
    ['invitation limit', { error: 'You have reached your invitation limit' }],
    ['too many', { warning: 'Too many requests sent' }],
    ['temporarily', { error: 'Your account has been temporarily limited' }],
  ] as [string, Record<string, string>][])(
    'detects danger phrase "%s" in observed text',
    (_phrase, observed) => {
      const r = tripReason(makeResult({ observed }));
      expect(r).not.toBeNull();
      expect(r!.startsWith('signal:')).toBe(true);
    },
  );

  it('detects danger phrase in result.error field', () => {
    const r = tripReason(makeResult({ error: 'captcha required' }));
    expect(r).not.toBeNull();
    expect(r!.startsWith('signal:')).toBe(true);
  });
});

describe('loadBreaker / tripBreaker / resetBreaker', () => {
  let ss: SettingStore;
  beforeEach(() => { ss = new SettingStore(freshDb()); });

  it('loadBreaker returns UNTRIPPED when no setting exists', () => {
    expect(loadBreaker(ss)).toEqual(UNTRIPPED);
  });

  it('tripBreaker writes tripped state; loadBreaker reads it back', () => {
    tripBreaker(ss, 'checkpoint', 12345);
    const state = loadBreaker(ss);
    expect(state.tripped).toBe(true);
    expect(state.reason).toBe('checkpoint');
    expect(state.at).toBe(12345);
  });

  it('resetBreaker clears the tripped state', () => {
    tripBreaker(ss, 'captcha', 1);
    resetBreaker(ss);
    expect(loadBreaker(ss)).toEqual(UNTRIPPED);
  });

  it('loadBreaker is resilient to corrupt JSON', () => {
    ss.set('breaker', 'not-json!!!');
    expect(loadBreaker(ss)).toEqual(UNTRIPPED);
  });
});
