import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { redact } from './redact.ts';

const here = dirname(fileURLToPath(import.meta.url));
export const CALLS_DIR = resolve(here, '..', '..', '.calls');

export function logCall(kind: string, record: { model: string; input: unknown; output: unknown; usage: unknown }): string {
  mkdirSync(CALLS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(CALLS_DIR, `${ts}-${kind}.json`);
  writeFileSync(file, JSON.stringify(redact(record), null, 2));
  return file;
}
