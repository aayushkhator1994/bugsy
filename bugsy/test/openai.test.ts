import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScenarios } from '../src/openai/schema.ts';
import { renderScenariosMarkdown } from '../src/openai/markdown.ts';
import { extractDiff } from '../src/openai/diff.ts';
import { redact, redactString } from '../src/openai/redact.ts';
import { buildScenarioInput, buildPatchPrompt, SCENARIO_SYSTEM } from '../src/openai/prompts.ts';
import { codexArgs } from '../src/openai/patch.ts';

const mk = (id: string, kind: string, control_id: string | null) => ({
  id, kind, control_id, title: id, requirement: 'A user sees only their own invoices.',
  steps: ['Sign in as Alice'], expected: ['The page shows Client: Initech'],
});
const good = JSON.stringify({ scenarios: [
  mk('S1_owner_reads_own', 'control', null),
  mk('S2_other_reads_by_url', 'leak_check', 'S1_owner_reads_own'),
  mk('S3_list_isolation', 'leak_check', 'S1_owner_reads_own'),
] });

test('parseScenarios accepts valid output and drops null control_id', () => {
  const s = parseScenarios(good);
  assert.equal(s.length, 3);
  assert.equal('control_id' in s[0], false);
  assert.equal(s[1].control_id, 'S1_owner_reads_own');
});
test('parseScenarios rejects missing control / bad json / missing required id', () => {
  assert.throws(() => parseScenarios('nope'));
  assert.throws(() => parseScenarios(good.replace('"control_id":"S1_owner_reads_own"', '"control_id":"S9_x"')));
  assert.throws(() => parseScenarios(JSON.stringify({ scenarios: [mk('S1_owner_reads_own', 'control', null)] })));
  assert.throws(() => parseScenarios(JSON.stringify({ scenarios: [{ id: 'x' }] })));
});
test('markdown has H1, H2 per scenario, Steps, Expected, Control', () => {
  const md = renderScenariosMarkdown(parseScenarios(good), 'Alice owns 1-3.');
  assert.match(md, /^# Authorization requirements for Ledger\n/);
  assert.equal((md.match(/^## /gm) ?? []).length, 3);
  assert.match(md, /Ownership rule: Alice owns 1-3\./);
  assert.match(md, /Steps\n\n1\. Sign in as Alice/);
  assert.match(md, /Expected\n\n- The page shows Client: Initech/);
  assert.equal((md.match(/^Control: S1_owner_reads_own$/gm) ?? []).length, 2);
});
test('extractDiff', () => {
  const d = '--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-a\n+b';
  assert.equal(extractDiff('hi\n```diff\n' + d + '\n```\nbye'), d + '\n');
  assert.equal(extractDiff(d), d + '\n');
  assert.throws(() => extractDiff('no diff here'));
  assert.throws(() => extractDiff('```diff\nok\n```'));
});
test('redactor', () => {
  const o = redact({ a: 'key sk-abcdefghijklmnopqrstuv1234', b: ['Authorization: Bearer abc.def-123'], c: 'pw alice123' }, ['alice123']);
  const j = JSON.stringify(o);
  assert.ok(!j.includes('sk-abc') && !j.includes('abc.def') && !j.includes('alice123'));
  assert.equal(redactString('plain'), 'plain');
});
test('scenario input never contains passwords, includes fixtures', () => {
  const cfg = { accounts: { alice: { email: 'alice@ledger.test', password: 'alice123', owns: [1] }, bob: { email: 'bob@ledger.test', password: 'bob123' } },
    ownership_rule: 'rule', routes: ['GET /invoices'] } as never;
  const s = buildScenarioInput(cfg);
  assert.ok(!s.includes('alice123') && !s.includes('bob123'));
  assert.match(s, /Umbrella/); assert.match(s, /\$4,000\.00/); assert.match(s, /alice@ledger\.test/);
  assert.match(SCENARIO_SYSTEM, /S2_other_reads_by_url/);
});
test('patch prompt includes requirement, failure, screenshot, source; codex args', () => {
  const sc = parseScenarios(good)[1];
  const p = buildPatchPrompt({ scenario: sc, failure: { message: 'boom', expected: 'E', actual: 'A' } as never, screenshotPath: '/tmp/s.png', sourceFiles: [{ path: 'app/src/routes/invoices.ts', content: 'CODE' }] });
  for (const t of [sc.requirement, 'boom', 'Expected: E', 'Actual: A', '/tmp/s.png', 'CODE', '```diff', 'SERVER']) assert.ok(p.includes(t), t);
  const a = codexArgs('/tmp/o.txt');
  assert.deepEqual(a.slice(0, 1), ['exec']); assert.ok(a.includes('read-only') && a.at(-1) === '-');
});
test('patch prompt asks for the ownership check only for "Invoice not found" scenarios', () => {
  const src = [{ path: 'app/src/server.ts', content: 'CODE' }];
  const s2 = { ...parseScenarios(good)[1]!, expected: ["The page shows 'Invoice not found'"] };
  assert.match(buildPatchPrompt({ scenario: s2, failure: { message: 'm' } as never, sourceFiles: src }), /owner check/);
  const s4 = { ...s2, id: 'S4_signed_out_back_button', expected: ["The page shows 'Sign in'", "The text 'Client: Initech' is not visible"] };
  const p = buildPatchPrompt({ scenario: s4, failure: { message: 'm' } as never, sourceFiles: src });
  assert.doesNotMatch(p, /owner check/);
  assert.match(p, /SERVER side/);
});
