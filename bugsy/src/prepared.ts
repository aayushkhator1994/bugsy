// Fallback material, always announced when used: the MVP scenarios from BUGSY_SPEC.md §3,
// prepared tests in fixtures/prepared/tests/authz/, and prepared patches fixtures/prepared/<S#>.patch.
import { cpSync, existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Scenario } from './types.ts';

export const PREPARED_TESTS_DIR = 'fixtures/prepared/tests/authz';

export const PREPARED_SCENARIOS: Scenario[] = [
  {
    id: 'S1_owner_reads_own',
    kind: 'control',
    control_id: null,
    title: 'The owner can open their own invoice',
    requirement: 'A signed-in user can open an invoice they own and see its details.',
    steps: ['Sign in as Alice', 'Open /invoices/3'],
    expected: ["The page shows the heading 'Invoice #3'", "The page shows 'Client: Initech'"],
  },
  {
    id: 'S2_other_reads_by_url',
    kind: 'leak_check',
    control_id: 'S1_owner_reads_own',
    title: 'Another user cannot open an invoice by URL',
    requirement:
      "A signed-in user who opens the URL of an invoice they do not own sees 'Invoice not found' and none of that invoice's details.",
    steps: ['Sign in as Bob', 'Open /invoices/4 and confirm it shows Client: Umbrella', 'Sign out', 'Sign in as Alice', 'Open /invoices/4'],
    expected: ["The page shows 'Invoice not found'", "The text 'Umbrella' is not on the page", "The text '$4,000.00' is not on the page"],
  },
  {
    id: 'S3_list_isolation',
    kind: 'leak_check',
    control_id: 'S1_owner_reads_own',
    title: "The invoice list shows only the signed-in user's invoices",
    requirement: 'The invoice list of a signed-in user contains only invoices they own.',
    steps: ['Sign in as Alice', 'Open /invoices'],
    expected: [
      "The list shows rows for 'Acme Co', 'Globex' and 'Initech'",
      "The text 'Umbrella' is not on the page",
      "The text 'Hooli' is not on the page",
      "The text 'Vandelay' is not on the page",
    ],
  },
];

export function hasPreparedTests(root: string): boolean {
  const d = resolve(root, PREPARED_TESTS_DIR);
  return existsSync(d) && readdirSync(d).some((f) => f.endsWith('_test.md'));
}

/** Copy prepared tests (and any output-<stem>/ recordings) into tests_dir. */
export function copyPreparedTests(root: string, testsDir: string): string[] {
  const src = resolve(root, PREPARED_TESTS_DIR);
  if (!hasPreparedTests(root)) throw new Error(`no prepared tests in ${PREPARED_TESTS_DIR}`);
  const dst = resolve(root, testsDir);
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true, filter: (p) => !p.endsWith('.gitkeep') });
  return readdirSync(dst).filter((f) => f.endsWith('_test.md'));
}

export function preparedPatch(root: string, scenarioId: string): string | null {
  const label = /^(S\d+)/i.exec(scenarioId)?.[1]?.toUpperCase();
  for (const name of [`${scenarioId}.patch`, `${label}.patch`]) {
    const p = resolve(root, 'fixtures/prepared', name);
    if (existsSync(p)) return readFileSync(p, 'utf8');
  }
  return null;
}
