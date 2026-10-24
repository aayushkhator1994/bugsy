import { test } from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { stringify as yaml } from 'yaml';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { judgeRun, type Ctx, type RunResult } from '../src/run.ts';
import { newTestrunState } from '../src/kane.ts';
import { parseConfig } from '../src/config.ts';
import { patchMayCommit, selfCheckPassed } from '../src/verdict.ts';
import { PREPARED_SCENARIOS as scenarios } from '../src/prepared.ts';
import type { KaneMember } from '../src/types.ts';

const S1 = scenarios[0]!.id;
const S2 = scenarios[1]!.id;
const S3 = scenarios[2]!.id;
const green = { [S1]: 'passed', [S2]: 'passed', [S3]: 'passed' };
const denialFailure = { step_index: 5, message: "Expected 'Invoice not found', saw 'Client: Umbrella'" };

function fixture(opts: {
  overall?: string;
  exit?: number;
  done?: boolean;
  executionId?: string | null;
  memberStatuses?: Record<string, string>;
  packStatuses?: Record<string, string>;
  omitted?: string[];
  malformed?: string;
  duplicate?: string;
  failedPassingResult?: string;
  corrupt?: boolean;
  missing?: boolean;
  errors?: string[];
  invalidPlan?: boolean;
  rca?: string;
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'bugsy-judge-'));
  const cfg = parseConfig({
    app: { start: 'unused', url: 'http://localhost:3100', source_globs: ['app/src/routes/**'] },
    accounts: { alice: { email: 'alice@example.test', password: 'demo-alice' }, bob: { email: 'bob@example.test', password: 'demo-bob' } },
    ownership_rule: 'Users can read only their own invoices',
    routes: ['GET /invoices/:id'],
  });
  const ctx: Ctx = { root, cfg, report: false, json: false, log: () => {} };
  const memberStatuses = { ...green, ...opts.memberStatuses };
  const members: KaneMember[] = scenarios.map((s) => ({
    path: `tests/authz/${s.id}_test.md`,
    test_id: s.id,
    status: memberStatuses[s.id] as KaneMember['status'],
    ...(memberStatuses[s.id] === 'failed' ? { failure: opts.rca ? { step_index: 5, message: 'assertion_failed: @ step 5' } : denialFailure } : {}),
  }));
  const packPath = join(root, 'run.evidence');
  const zip = new AdmZip();
  zip.addFile('run.yaml', Buffer.from(`status: ${opts.overall ?? 'passed'}\n`));
  for (const s of scenarios) {
    if (opts.omitted?.includes(s.id)) continue;
    const status = opts.packStatuses?.[s.id] ?? memberStatuses[s.id]!;
    const failed = status === 'failed' || opts.failedPassingResult === s.id;
    const result = opts.malformed === s.id
      ? 'status: [unterminated'
      : `path: tests/authz/${s.id}_test.md\nstatus: ${status}\n${failed ? 'steps:\n  - {ordinal: 5, status: failed}\n' : ''}`;
    zip.addFile(`tests/${s.id}/result.yaml`, Buffer.from(result));
    if (opts.duplicate === s.id) zip.addFile('tests/duplicate/result.yaml', Buffer.from(result));
    if (status === 'failed') zip.addFile(`tests/${s.id}/steps/5-denial/failure.yaml`, Buffer.from('expected: Invoice not found\nactual: Client: Umbrella\n'));
    if (s.id === S2 && opts.rca) {
      const md = readFileSync(join(import.meta.dirname, '../../tests/authz', `${S2}_test.md`), 'utf8');
      mkdirSync(join(root, 'tests/authz'), { recursive: true });
      writeFileSync(join(root, 'tests/authz', `${S2}_test.md`), md);
      zip.addFile(`tests/${s.id}/test.md`, Buffer.from(md));
      zip.addFile(`tests/${s.id}/result.yaml`, Buffer.from(yaml({
        path: `tests/authz/${s.id}_test.md`, status,
        external_id: { execution_id: opts.rca === 'wrong-execution' ? 'another-run' : 'run' },
        definition: { sha256: 'sha256:' + (opts.rca === 'definition-mismatch' ? 'wrong' : createHash('sha256').update(md).digest('hex')) },
        steps: [
          { id: '3-6', ordinal: 21, status: opts.rca === 'prior-broken' ? 'broken' : 'passed', kind: 'click' },
          { id: '4-5', ordinal: 22, status: 'failed', kind: opts.rca === 'wrong-kind' ? 'navigate' : 'assert' },
        ],
      })));
      zip.addFile(`tests/${s.id}/steps/22-4-5/failure.yaml`, Buffer.from(yaml({
        step: '4-5', status: 'broken',
        error: { type: 'replay_failure', message: opts.rca === 'timeout' ? 'timeout' : opts.rca === 'wrong-step' ? 'assertion_failed: @ step 4' : 'assertion_failed: @ step 5' },
        ...(opts.rca === 'no-triage' ? {} : { triage: {
          status: 'triaged', by: { kind: 'agent' },
          rca: { category: opts.rca === 'other-category' ? 'infra/network' : 'automation_bug/test_data_issue', root_cause: 'Invoice unexpectedly present' },
        } }),
      })));
      if (opts.rca !== 'no-screenshot') zip.addFile(`tests/${s.id}/steps/22-4-5/screenshot.jpg`, Buffer.from('ffd8ffe0', 'hex'));
    }
  }
  if (opts.corrupt) writeFileSync(packPath, 'not a zip');
  else if (!opts.missing) zip.writeZip(packPath);
  const overall = opts.overall ?? 'passed';
  const run: RunResult = {
    execution_id: opts.executionId === undefined ? 'run' : opts.executionId,
    members,
    exit_code: opts.exit ?? 0,
    pack_path: opts.missing ? null : packPath,
    overall_status: overall,
    state: {
      ...newTestrunState(), done: opts.done ?? true, overall_status: overall,
      errors: opts.errors ?? [], ...(opts.invalidPlan ? { plan_invalid: [] } : {}),
    },
    wrapped: false,
  };
  return { ctx, run, outcomes: () => judgeRun(ctx, run, scenarios).outcomes };
}

function assertInconclusive(outcomes: ReturnType<typeof judgeRun>['outcomes']) {
  assert.ok(outcomes.every((o) => o.verdict === 'inconclusive'), JSON.stringify(outcomes));
  assert.equal(patchMayCommit(outcomes), false);
  assert.equal(selfCheckPassed(outcomes, S2), false);
}

test('completed green run with matching evidence can authorize a commit', () => {
  const outcomes = fixture().outcomes();
  assert.deepEqual(outcomes.map((o) => o.verdict), ['control_passed', 'denied_as_expected', 'denied_as_expected']);
  assert.equal(patchMayCommit(outcomes), true);
});

test('completed red run still confirms the intended leak with its owner control', () => {
  const outcomes = fixture({ overall: 'failed', exit: 1, memberStatuses: { [S2]: 'failed' } }).outcomes();
  assert.equal(outcomes[0]!.verdict, 'control_passed');
  assert.equal(outcomes[1]!.verdict, 'leak_confirmed');
  assert.equal(outcomes[2]!.verdict, 'denied_as_expected');
  assert.equal(selfCheckPassed(outcomes, S2), true);
  assert.equal(patchMayCommit(outcomes), false);
});

test('missing terminal event or execution id makes every outcome inconclusive', () => {
  assertInconclusive(fixture({ done: false }).outcomes());
  assertInconclusive(fixture({ executionId: null }).outcomes());
});

test('cancellation, timeout, refusal and inconsistent exit cannot pass despite green members', () => {
  for (const [overall, exit] of [['cancelled', 3], ['refused', 2], ['passed', 3], ['passed', 1], ['failed', 0], ['failed', 1]] as const) {
    assertInconclusive(fixture({ overall, exit }).outcomes());
  }
});

test('stream errors, invalid plans and conflicting terminal statuses cannot authorize a commit', () => {
  assertInconclusive(fixture({ errors: ['runner stopped'] }).outcomes());
  assertInconclusive(fixture({ invalidPlan: true }).outcomes());
  const f = fixture();
  f.run.overall_status = 'cancelled';
  assertInconclusive(f.outcomes());
});

test('missing, unreadable and empty evidence packs prove nothing', () => {
  assertInconclusive(fixture({ missing: true }).outcomes());
  assertInconclusive(fixture({ corrupt: true }).outcomes());
  assertInconclusive(fixture({ omitted: [S1, S2, S3] }).outcomes());
});

test('leak checks require matching result evidence for their owner control', () => {
  const outcomes = fixture({ omitted: [S1] }).outcomes();
  assertInconclusive(outcomes);
  assert.match(outcomes[1]!.reason, /paired control/);
});

test('missing, malformed, ambiguous or conflicting leak records cannot be secure', () => {
  for (const opts of [
    { omitted: [S2] }, { malformed: S2 }, { duplicate: S2 },
    { packStatuses: { [S2]: 'failed' } }, { packStatuses: { [S2]: 'unknown' } },
    { failedPassingResult: S2 },
  ]) {
    const outcomes = fixture(opts).outcomes();
    assert.equal(outcomes[1]!.verdict, 'inconclusive', JSON.stringify(opts));
    assert.equal(patchMayCommit(outcomes), false);
  }
});

test('failed stream member cannot confirm a leak when the pack says passed', () => {
  const outcomes = fixture({
    overall: 'failed', exit: 1,
    memberStatuses: { [S2]: 'failed' }, packStatuses: { [S2]: 'passed' },
  }).outcomes();
  assert.equal(outcomes[1]!.verdict, 'inconclusive');
  assert.equal(selfCheckPassed(outcomes, S2), false);
});

test('control evidence disagreement makes its paired leak checks inconclusive', () => {
  assertInconclusive(fixture({ packStatuses: { [S1]: 'failed' } }).outcomes());
});

test('a control failure still prevents a deny-everyone patch from committing', () => {
  const outcomes = fixture({ overall: 'failed', exit: 1, memberStatuses: { [S1]: 'failed' } }).outcomes();
  assert.equal(outcomes[0]!.verdict, 'control_failed');
  assert.equal(outcomes[1]!.verdict, 'inconclusive');
  assert.equal(outcomes[2]!.verdict, 'inconclusive');
  assert.equal(patchMayCommit(outcomes), false);
});

test('recorded denial assertion confirms leak despite later RCA automation-bug classification', () => {
  const f = fixture({ overall: 'failed', exit: 1, memberStatuses: { [S2]: 'failed' }, packStatuses: { [S2]: 'broken' }, rca: 'valid' });
  const packHash = createHash('sha256').update(readFileSync(f.run.pack_path!)).digest('hex');
  const { outcomes, exported } = judgeRun(f.ctx, f.run, scenarios);
  const leak = outcomes[1]!;
  assert.equal(leak.verdict, 'leak_confirmed');
  assert.match(leak.evidence_note!, /later RCA.*automation_bug\/test_data_issue.*raw evidence status: broken/);
  assert.equal(exported!.tests.find((t) => t.name === S2)!.status, 'broken');
  assert.match(readFileSync(join(f.ctx.root, 'evidence/run/S2/result.yaml'), 'utf8'), /status: broken/);
  assert.equal(createHash('sha256').update(readFileSync(f.run.pack_path!)).digest('hex'), packHash);
  assert.equal(selfCheckPassed(outcomes, S2), true);
  assert.equal(patchMayCommit(outcomes), false);
});

test('RCA does not excuse timeouts, other broken steps, uncorrelated failures or missing proof', () => {
  for (const rca of ['wrong-kind', 'prior-broken', 'timeout', 'wrong-step', 'wrong-execution', 'definition-mismatch', 'no-screenshot', 'no-triage', 'other-category']) {
    const outcomes = fixture({ overall: 'failed', exit: 1, memberStatuses: { [S2]: 'failed' }, packStatuses: { [S2]: 'broken' }, rca }).outcomes();
    assert.equal(outcomes[1]!.verdict, 'inconclusive', rca);
    assert.equal(selfCheckPassed(outcomes, S2), false, rca);
  }
  const broken = fixture({ overall: 'failed', exit: 1, memberStatuses: { [S1]: 'broken', [S2]: 'failed' }, packStatuses: { [S2]: 'broken' }, rca: 'valid' }).outcomes();
  assert.equal(selfCheckPassed(broken, S2), false);
  const green = fixture({ packStatuses: { [S2]: 'broken' }, rca: 'valid' }).outcomes();
  assert.equal(green[1]!.verdict, 'inconclusive');
  assert.equal(patchMayCommit(green), false);
});
