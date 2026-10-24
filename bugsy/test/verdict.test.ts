import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate as evaluateVerdicts, judgeLeak, patchMayCommit, selfCheckPassed, denialMarkers, memberFor, type VerdictInput } from '../src/verdict.ts';
import { PREPARED_SCENARIOS as SC } from '../src/prepared.ts';
import type { KaneMember } from '../src/types.ts';

const S2 = SC[1]!;
const m = (id: string, status: KaneMember['status'], failure?: KaneMember['failure']): KaneMember => ({
  path: `tests/authz/${id}_test.md`, status, ...(failure ? { failure } : {}),
});
const S2_STEPS = [
  'Sign in as Bob', 'Open /invoices/4 and confirm it shows Client: Umbrella', 'Sign out', 'Sign in as Alice',
  'Open /invoices/4', "Verify the page shows 'Invoice not found' and not 'Umbrella'",
];
const leakFail = { message: "Expected 'Invoice not found' but saw 'Client: Umbrella'", step_index: 5 };
const ctx = { packPresent: true, anyBroken: false, steps: S2_STEPS };

// Unit fixtures describe completed runs with matching evidence records.
// run.test.ts exercises missing and conflicting evidence archives.
function evaluate(input: Omit<VerdictInput, 'completed' | 'evidence'>) {
  const evidence = Object.fromEntries(input.scenarios.flatMap((s) => {
    const member = memberFor(s, input.members);
    return member ? [[s.id, { status: member.status }]] : [];
  }));
  return evaluateVerdicts({ ...input, completed: true, evidence });
}

test('markers come from quoted expected text', () => {
  assert.deepEqual(denialMarkers(S2), ['Invoice not found', 'Umbrella', '$4,000.00']);
});

test('leak_confirmed: failed at the denial step, control passed', () => {
  const r = evaluate({ scenarios: SC, packPresent: true, members: [
    m('S1_owner_reads_own', 'passed'), m('S2_other_reads_by_url', 'failed', leakFail), m('S3_list_isolation', 'passed'),
  ], steps: { S2_other_reads_by_url: S2_STEPS } });
  assert.equal(r[0]!.verdict, 'control_passed');
  assert.equal(r[1]!.verdict, 'leak_confirmed');
  assert.equal(r[1]!.failed_step, 5);
  assert.equal(r[2]!.verdict, 'denied_as_expected');
  assert.equal(patchMayCommit(r), false);
  assert.equal(selfCheckPassed(r, S2.id), true);
});

test('denied_as_expected on the patched app → patch may commit', () => {
  const r = evaluate({ scenarios: SC, packPresent: true, members: SC.map((s) => m(s.id, 'passed')) });
  assert.deepEqual(r.map((x) => x.verdict), ['control_passed', 'denied_as_expected', 'denied_as_expected']);
  assert.equal(patchMayCommit(r), true);
});

test('"deny everyone" patch: control fails → inconclusive, no commit', () => {
  const r = evaluate({ scenarios: SC, packPresent: true, members: [
    m('S1_owner_reads_own', 'failed', { message: "expected 'Invoice #3', saw 'Invoice not found'", step_index: 2 }),
    m('S2_other_reads_by_url', 'passed'), m('S3_list_isolation', 'passed'),
  ] });
  assert.equal(r[0]!.verdict, 'control_failed');
  assert.equal(r[1]!.verdict, 'inconclusive');
  assert.match(r[1]!.reason, /control/);
  assert.equal(patchMayCommit(r), false);
});

test('inconclusive cases', () => {
  const ctl = m('S1_owner_reads_own', 'passed');
  const j = (leak: KaneMember | undefined, control: KaneMember | undefined, c = ctx) => judgeLeak(S2, leak, control, c);
  assert.equal(j(m('S2', 'failed', leakFail), ctl, { ...ctx, packPresent: false }).reason, 'evidence pack missing');
  assert.equal(j(undefined, ctl).verdict, 'inconclusive');
  assert.equal(j(m('S2', 'failed', leakFail), undefined).verdict, 'inconclusive');
  assert.equal(j(m('S2', 'failed', leakFail), ctl, { ...ctx, anyBroken: true }).verdict, 'inconclusive');
  assert.equal(j(m('S2', 'broken'), ctl).verdict, 'inconclusive');
  assert.equal(j(m('S2', 'failed', { message: 'x', step_index: 0 }), ctl).reason, 'failed at step 0');
  assert.equal(j(m('S2', 'failed', { message: 'x' }), ctl).verdict, 'inconclusive');
  // sign-in step failed (index 3 = "Sign in as Alice", predecessor "Sign out")
  const signIn = j(m('S2', 'failed', { message: 'Login form rejected the credentials', step_index: 3 }), ctl, { ...ctx, steps: ['Sign in as Bob', 'Open x', 'Sign in as Bob again', 'Sign in as Alice'] });
  assert.equal(signIn.reason, 'sign-in step failed');
  // failed at a non-denial step (Bob could not see Umbrella on his own invoice)
  const early = j(m('S2', 'failed', { message: 'page blank', step_index: 2 }), ctl, { ...ctx, steps: ['Sign in as Bob', 'Open /invoices/4', 'Sign out', 'Sign in as Alice'] });
  assert.equal(early.verdict, 'inconclusive');
  assert.match(early.reason, /not at the denial step/);
});

test('any broken member in the run makes leak checks inconclusive', () => {
  const r = evaluate({ scenarios: SC, packPresent: true, members: [
    m('S1_owner_reads_own', 'passed'), m('S2_other_reads_by_url', 'failed', leakFail), m('S3_list_isolation', 'interrupted'),
  ] });
  assert.equal(r[1]!.verdict, 'inconclusive');
  assert.equal(r[2]!.verdict, 'inconclusive');
});

test('members are matched by S<n> prefix when the stem differs', () => {
  const r = evaluate({ scenarios: SC, packPresent: true, members: [
    { path: 'S1_owner_can_read_test.md', status: 'passed' },
    { path: '/abs/S2_cross_user_read_test.md', status: 'failed', failure: leakFail },
    { path: 'S3_list_test.md', status: 'passed' },
  ] });
  assert.equal(r[1]!.verdict, 'leak_confirmed');
});

test("a failure on the owner's own step (before the last sign-in) is not a leak", () => {
  const r = judgeLeak(S2, m('S2', 'failed', { message: "expected 'Client: Umbrella', saw an error page", step_index: 1 }), m('S1', 'passed'), ctx);
  assert.equal(r.verdict, 'inconclusive');
});

test('without step texts only the primary denial text anchors the failure', () => {
  const c = { packPresent: true, anyBroken: false };
  assert.equal(judgeLeak(S2, m('S2', 'failed', leakFail), m('S1', 'passed'), c).verdict, 'leak_confirmed');
  assert.equal(judgeLeak(S2, m('S2', 'failed', { message: "expected 'Client: Umbrella'", step_index: 1 }), m('S1', 'passed'), c).verdict, 'inconclusive');
});
