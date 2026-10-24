import type { BugsyConfig, KaneFailure, Scenario } from '../types.ts';

export interface FixtureInvoice { id: number; owner: string; client: string; amount: string; status?: string }

// Facts from requirements/ledger-prd.md and the spec (invoice 4 is Bob's $4,000.00 Umbrella invoice).
export const DEFAULT_FIXTURES: FixtureInvoice[] = [
  { id: 1, owner: 'alice', client: 'Acme Co', amount: '$1,200.00', status: 'Unpaid' },
  { id: 2, owner: 'alice', client: 'Globex', amount: '$350.50', status: 'Paid' },
  { id: 3, owner: 'alice', client: 'Initech', amount: '$89.99', status: 'Unpaid' },
  { id: 4, owner: 'bob', client: 'Umbrella', amount: '$4,000.00', status: 'Unpaid' },
];

/** Account labels and emails only. Never passwords. */
export function summarizeAccounts(config: BugsyConfig) {
  return Object.entries(config.accounts).map(([label, a]) => ({
    label,
    email: a.email,
    owns: a.owns,
  }));
}

export const SCENARIO_SYSTEM = `You design authorization test scenarios for a web app, to be executed by a browser agent that follows human-readable steps.
Rules:
- Produce exactly these scenarios, in this order: S1_owner_reads_own (kind control), S2_other_reads_by_url (kind leak_check, control_id S1_owner_reads_own), S3_list_isolation (kind leak_check, control_id S1_owner_reads_own). Optionally add S4_signed_out_back_button and S5_other_marks_paid (each kind leak_check, control_id S1_owner_reads_own).
- Every leak_check names its control in control_id. The control scenario has control_id null.
- "requirement" is a general rule in one sentence. Never mention a specific invoice number in the requirement sentence.
- "steps" are browser actions a person could follow, such as: Sign in as Bob, Open /invoices/4 and confirm it shows Client: Umbrella, Sign out, Sign in as Alice, Open /invoices/4. Ids and URLs are fine in steps. No SQL, no HTTP or status-code talk, no cookies, no headers.
- "expected" texts must be exact strings from the product: "Invoice not found", "Client: Initech", "Client: Umbrella", "$4,000.00". Use only strings that appear in the provided fixture summary or the quoted strings above. For a denial, expect the page shows 'Invoice not found' and that the other user's client name and amount are not on the page.
- S1: the owner signs in and opens their own invoice and sees its client (for example Alice opens /invoices/3 and sees Client: Initech).
- S2: Bob opens his invoice (/invoices/4) and confirms Client: Umbrella, signs out, Alice signs in and opens the same URL, and must see 'Invoice not found' with no Umbrella and no $4,000.00.
- S3: Alice's invoice list must not contain Bob's invoices (no Umbrella, no $4,000.00, no link to invoice 4).
- S5 (optional): Alice, signed in, sends the mark-as-paid request for Bob's invoice 4 directly (POST /invoices/4/pay) from her browser session without opening that page; she signs out, Bob signs in and opens /invoices/4, which must still show 'Status: Unpaid'. This one step may name the request; the other steps follow the rules above.
- Passwords are never provided to you and never appear in steps; steps say "Sign in as <name>".`;

export function buildScenarioInput(config: BugsyConfig, fixtures: FixtureInvoice[] = DEFAULT_FIXTURES): string {
  return JSON.stringify(
    {
      ownership_rule: config.ownership_rule,
      routes: config.routes,
      accounts: summarizeAccounts(config),
      fixtures: fixtures.map((f) => ({
        invoice: f.id,
        owner: f.owner,
        client: f.client,
        amount: f.amount,
        ...(f.status ? { status: f.status } : {}),
      })),
    },
    null,
    2,
  );
}

/** Kane's failure record; expected/actual come from the evidence pack's failure.yaml when known. */
export type PatchFailure = KaneFailure & { expected?: string; actual?: string };

export interface PatchPromptInput {
  scenario: Scenario;
  failure: PatchFailure;
  screenshotPath?: string;
  sourceFiles: { path: string; content: string }[];
}

/** Scenarios whose denial is "Invoice not found" get the specific ownership-check instruction. */
function ownershipFix(s: Scenario): boolean {
  return s.expected.some((e) => /invoice not found/i.test(e));
}

export function buildPatchPrompt(i: PatchPromptInput, opts: { forApi?: boolean } = {}): string {
  const files = i.sourceFiles
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n');
  const f = i.failure;
  const outputRule = opts.forApi
    ? 'Return JSON with "diff" (the unified diff text only) and "rationale" (one or two sentences).'
    : 'Output ONLY a unified diff inside a single ```diff fenced block. No prose before or after.';
  return `A browser test found an authorization bug in a small invoicing web app.

Requirement that is violated:
${i.scenario.requirement}

Scenario ${i.scenario.id}: ${i.scenario.title}
Steps the browser followed:
${i.scenario.steps.map((s, n) => `${n + 1}. ${s}`).join('\n')}

What the browser saw (Kane failure):
- Expected: ${f.expected ?? '(not recorded)'}
- Actual: ${f.actual ?? '(not recorded)'}
- Message: ${f.message ?? '(none)'}
${f.step_index !== undefined ? `- Failed at step: ${f.step_index}\n` : ''}${i.screenshotPath ? `Screenshot of the failing page: ${i.screenshotPath}\n` : ''}
Source files:
${files}

Task:
- ${ownershipFix(i.scenario)
    ? 'Fix this on the SERVER side with the smallest possible change: add the owner check to the invoice detail query (only return the invoice when it belongs to the signed-in user) and render the 404 "Invoice not found" page when there is no matching row.'
    : 'Fix this on the SERVER side with the smallest possible change that makes the requirement hold for what the browser did, including how the server responds to the browser.'}
- Touch nothing else. Do not modify tests, views beyond the 404 message, or unrelated routes. Do not edit files yourself; only produce the diff.
- Diff paths must be relative to the repository root, with a/ and b/ prefixes, applicable with "git apply".
- ${outputRule}`;
}
