import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('generates a token on first run and reuses it on the second', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aura-'));
    try {
      const a = loadConfig(dir);
      const b = loadConfig(dir);
      expect(a.token).toMatch(/^[a-f0-9]{32,}$/);
      expect(b.token).toBe(a.token);
      expect(a.port).toBe(51899);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
