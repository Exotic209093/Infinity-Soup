import { describe, it, expect } from 'vitest';
import { statusLabel, statusTone } from './popup-status.js';

describe('statusLabel', () => {
  it('shows Connected when connected and not paused', () => {
    expect(statusLabel(true, false)).toBe('Connected');
  });

  it('shows Disconnected when not connected and not paused', () => {
    expect(statusLabel(false, false)).toBe('Disconnected');
  });

  it('shows Paused when paused, regardless of connection', () => {
    expect(statusLabel(true, true)).toBe('Paused');
    expect(statusLabel(false, true)).toBe('Paused');
  });
});

describe('statusTone', () => {
  it('is connected (green) only when connected and not paused', () => {
    expect(statusTone(true, false)).toBe('connected');
  });

  it('is disconnected (grey) when not connected and not paused', () => {
    expect(statusTone(false, false)).toBe('disconnected');
  });

  it('is paused (amber) when paused, taking precedence over connection', () => {
    expect(statusTone(true, true)).toBe('paused');
    expect(statusTone(false, true)).toBe('paused');
  });
});
