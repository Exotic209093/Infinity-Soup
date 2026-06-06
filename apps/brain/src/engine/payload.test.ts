import { describe, it, expect } from 'vitest';
import { chooseCondition } from './payload.js';

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
