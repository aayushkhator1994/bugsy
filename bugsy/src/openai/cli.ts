import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { generateScenarios, renderScenariosMarkdown, proposePatch } from './index.ts';
import { REPO_ROOT } from './patch.ts';
import type { BugsyConfig, Scenario } from '../types.ts';

const cmd = process.argv[2];
const config = JSON.parse(readFileSync(join(REPO_ROOT, 'bugsy.config.json'), 'utf8')) as BugsyConfig;

if (cmd === 'scenarios') {
  const sc = await generateScenarios(config);
  console.log(renderScenariosMarkdown(sc, config.ownership_rule));
} else if (cmd === 'patch') {
  const rel = 'app/src/routes/invoices.ts';
  const file = join(REPO_ROOT, rel);
  if (!existsSync(file)) { console.error(`${rel} does not exist yet`); process.exit(1); }
  const scenario: Scenario = {
    id: 'S2_other_reads_by_url', kind: 'leak_check', control_id: 'S1_owner_reads_own',
    title: 'Another user cannot open an invoice by URL',
    requirement: "A signed-in user who opens the URL of an invoice they do not own sees 'Invoice not found' and none of that invoice's details.",
    steps: ['Sign in as Bob', 'Open /invoices/4 and confirm it shows Client: Umbrella', 'Sign out', 'Sign in as Alice', 'Open /invoices/4'],
    expected: ["The page shows 'Invoice not found'", "The text 'Umbrella' is not on the page"],
  };
  const patcher = process.argv.includes('--api') ? 'api' : 'codex';
  const r = await proposePatch({
    scenario,
    failure: { message: 'Expected "Invoice not found" but the page showed "Client: Umbrella"', step_index: 5, expected: 'Invoice not found', actual: 'Client: Umbrella' } as never,
    sourceFiles: [{ path: rel, content: readFileSync(file, 'utf8') }],
    patcher,
  });
  console.log(r.diff);
  console.error(`patcher=${r.patcher} rationale=${r.rationale}`);
} else {
  console.error('usage: tsx bugsy/src/openai/cli.ts scenarios | patch --fixture [--api]');
  process.exit(2);
}
