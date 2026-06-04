import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface AuraConfig { token: string; port: number; }

export function loadConfig(dir = '.aura'): AuraConfig {
  const file = join(dir, 'config.json');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as AuraConfig;
  const config: AuraConfig = { token: randomBytes(24).toString('hex'), port: 51899 };
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(config, null, 2));
  return config;
}
