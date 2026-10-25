import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCoverage, coverageProblem, CoverageError, parseScenarios, SCENARIOS_JSON_SCHEMA } from '../src/openai/schema.ts';
import { buildScenarioSystem } from '../src/openai/prompts.ts';
import { parseConfig } from '../src/config.ts';
import { decideJev, formatPlanCheck, runJev, type JevClient } from '../src/verify/jev.ts';
import type { MustCheckKind, Scenario } from '../src/types.ts';

const ALL: MustCheckKind[] = ['read_by_url', 'list', 'change', 'signed_out'];
const sc = (id: string, kind: 'control' | 'leak_check', checks: string[], control_id: string | null = kind === 'leak_check' ? 'S1_owner_reads_own' : null) => ({
  id, kind, control_id, title: id, requirement: 'A user sees only their own invoices.',
  steps: ['Sign in as Alice'], expected: ["The page shows 'Invoice not found'"], checks,
});
const full = [
  sc('S1_owner_reads_own', 'control', ['control']),
  sc('S2_other_reads_by_url', 'leak_check', ['read_by_url']),
  sc('S3_list_isolation', 'leak_check', ['list']),
  sc('S4_signed_out_back_button', 'leak_check', ['signed_out']),
  sc('S5_other_marks_paid', 'leak_check', ['change']),
];
const asScen = (x: typeof full) => parseScenarios(JSON.stringify({ scenarios: x }));

test('coverage check passes when every must_check kind has a leak_check', () => {
  const c = checkCoverage(asScen(full), ALL);
  assert.equal(c.ok, true);
  assert.deepEqual(c.covered_by, { read_by_url: ['S2_other_reads_by_url'], list: ['S3_list_isolation'], change: ['S5_other_marks_paid'], signed_out: ['S4_signed_out_back_button'] });
  assert.doesNotThrow(() => parseScenarios(JSON.stringify({ scenarios: full }), ALL));
});

test('coverage check fails and names the missing kinds', () => {
  const partial = full.slice(0, 3);
  const c = checkCoverage(asScen(partial), ALL);
  assert.equal(c.ok, false);
  assert.deepEqual(c.missing, ['change', 'signed_out']);
  const msg = coverageProblem(c);
  assert.match(msg, /missing required checks: change \(add leak_check S5_other_marks_paid/);
  assert.match(msg, /signed_out \(add leak_check S4_signed_out_back_button/);
  assert.throws(() => parseScenarios(JSON.stringify({ scenarios: partial }), ALL), (e: unknown) => e instanceof CoverageError && /change/.test(e.message));
  // a kind declared only on the control does not count
  const onControl = [sc('S1_owner_reads_own', 'control', ['control', 'change']), ...full.slice(1, 3)];
  assert.ok(checkCoverage(asScen(onControl), ['change']).missing.includes('change'));
});

test('coverage check flags a leak_check whose control is not a control scenario', () => {
  const x = [...full.slice(0, 2), sc('S3_list_isolation', 'leak_check', ['list'], 'S2_other_reads_by_url')];
  const c = checkCoverage(x as Scenario[], ['list']);
  assert.throws(() => asScen(x), CoverageError);
  assert.equal(c.ok, false);
  assert.deepEqual(c.bad_controls, ['S3_list_isolation']);
});

test('schema accepts checks and requires it in strict JSON schema', () => {
  const s = asScen(full);
  assert.deepEqual(s[4]!.checks, ['change']);
  const item = SCENARIOS_JSON_SCHEMA.properties.scenarios.items;
  assert.ok((item.required as readonly string[]).includes('checks'));
  assert.deepEqual([...item.properties.checks.items.enum], ['control', 'read_by_url', 'list', 'change', 'signed_out']);
  const noChecks = full.map(({ checks, ...r }) => r);
  assert.throws(() => parseScenarios(JSON.stringify({ scenarios: noChecks })));
  assert.throws(() => asScen([sc('S1_owner_reads_own', 'control', ['bogus'])] as typeof full));
});

test('config must_check defaults to all four; prompt lists required kinds', () => {
  const base = { app: { start: 'x', url: 'http://localhost:1', source_globs: ['a'] }, accounts: { alice: { email: 'a', password: 'p' }, bob: { email: 'b', password: 'p' } }, ownership_rule: 'r', routes: ['GET /'] };
  assert.deepEqual(parseConfig(base).must_check, ALL);
  assert.deepEqual(parseConfig({ ...base, must_check: ['list'] }).must_check, ['list']);
  assert.throws(() => parseConfig({ ...base, must_check: ['nope'] }));
  const p = buildScenarioSystem(ALL);
  for (const id of ['S1_owner_reads_own', 'S2_other_reads_by_url', 'S3_list_isolation', 'S4_signed_out_back_button', 'S5_other_marks_paid']) assert.match(p, new RegExp(id));
  assert.match(p, /session cookie/);
  assert.doesNotMatch(buildScenarioSystem(['list']), /S5_other_marks_paid/);
});

const mock = (table: Record<string, Partial<Record<MustCheckKind, number>>>): JevClient & { calls: number } => {
  const m = {
    calls: 0,
    async systemOne(req: { state: Record<string, unknown> }) {
      m.calls++;
      const id = (req.state.scenario as { id: string }).id;
      const row = table[id] ?? {};
      return { model: 'jev-test', answers: Object.fromEntries(ALL.map((k) => [k, { noul: row[k] ?? 0.05 }])) };
    },
  };
  return m;
};

test('Jev: kind verified at >= 0.8, not below; mismatch when declared kind scores < 0.5', async () => {
  const s = asScen(full);
  const r = await runJev('rule', s, ALL, { log: false, client: mock({
    S2_other_reads_by_url: { read_by_url: 0.97 },
    S3_list_isolation: { list: 0.79 },
    S4_signed_out_back_button: { signed_out: 0.8 },
    S5_other_marks_paid: { change: 0.3 },
  }) });
  assert.equal(r.status, 'ok');
  if (r.status !== 'ok') return;
  assert.equal(r.kinds.read_by_url!.verified, true);
  assert.equal(r.kinds.list!.verified, false);
  assert.equal(r.kinds.signed_out!.verified, true);
  assert.equal(r.kinds.change!.verified, false);
  assert.deepEqual(r.mismatches, [{ scenario: 'S5_other_marks_paid', kind: 'change', score: 0.3 }]);
  const line = formatPlanCheck({ must_check: ALL, covered_by: checkCoverage(s, ALL).covered_by, jev: r })[0]!;
  assert.match(line, /^Plan check ▸ read_by_url S2 ✔ \(Jev 0\.97\) · list S3 ✔ \(0\.79 \? not verified\)/);
});

test('Jev: a failed call is reported as failure, never a pass', async () => {
  const bad: JevClient = { async systemOne() { throw new Error('HTTP 503'); } };
  const r = await runJev('rule', asScen(full), ALL, { client: bad, log: false });
  assert.deepEqual(r, { status: 'failed', reason: 'HTTP 503' });
  const lines = formatPlanCheck({ must_check: ALL, covered_by: {}, jev: r });
  assert.match(lines[1]!, /Jev check failed: HTTP 503/);
  // a missing answer is also a failure
  const empty: JevClient = { async systemOne() { return { answers: {} }; } };
  assert.equal((await runJev('rule', asScen(full), ALL, { client: empty, log: false })).status, 'failed');
});

test('Jev: missing TYPESAFE_API_KEY skips with a notice', async () => {
  const r = await runJev('rule', asScen(full), ALL, { apiKey: '' });
  assert.equal(r.status, 'skipped');
  assert.match(formatPlanCheck({ must_check: ALL, covered_by: {}, jev: r })[1]!, /Jev check skipped: TYPESAFE_API_KEY not set/);
});

test('decideJev picks the best-scoring leak_check per kind', () => {
  const s = asScen(full) as Scenario[];
  const d = decideJev(s, ['change'], { S2_other_reads_by_url: { change: 0.6 }, S5_other_marks_paid: { change: 0.9 } });
  assert.deepEqual(d.kinds.change, { verified: true, best: { scenario: 'S5_other_marks_paid', score: 0.9 } });
});
