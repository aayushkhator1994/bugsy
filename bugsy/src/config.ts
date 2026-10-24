// Load and validate bugsy.config.json.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { BugsyConfigSchema, type BugsyConfig } from './types.ts';

export const CONFIG_FILE = 'bugsy.config.json';

/** Walk up from `start` to find the directory that holds bugsy.config.json. */
export function findRoot(start = process.cwd()): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(resolve(dir, CONFIG_FILE))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new BugsyError(`${CONFIG_FILE} not found from ${start} upwards`);
    dir = parent;
  }
}

export class BugsyError extends Error {}

export function parseConfig(raw: unknown): BugsyConfig {
  const parsed = BugsyConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
    throw new BugsyError(`invalid ${CONFIG_FILE}:\n${issues}`);
  }
  return parsed.data;
}

export function loadConfig(root = findRoot()): BugsyConfig {
  const file = resolve(root, CONFIG_FILE);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new BugsyError(`cannot read ${file}: ${(e as Error).message}`);
  }
  return parseConfig(raw);
}

/** Port from config.app.port, else from the URL. */
export function appPort(cfg: BugsyConfig): number {
  if (cfg.app.port) return cfg.app.port;
  const u = new URL(cfg.app.url);
  return Number(u.port || (u.protocol === 'https:' ? 443 : 80));
}
