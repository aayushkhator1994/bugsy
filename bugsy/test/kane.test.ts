import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseTestrunOutput, parseLine, testrunArgs, foldAssurance, resumeArgs, shellSplit,
} from '../src/kane.ts';

const samples = resolve(import.meta.dirname, '../../fixtures/kane-samples');
const read = (f: string) => readFileSync(resolve(samples, f), 'utf8');

test('failing sample: members, failure, execution id, tolerant of junk', () => {
  const st = parseTestrunOutput(read('testrun-fail.synthetic.ndjson'));
  assert.equal(st.execution_id, 'synthetic-exec-red-0001');
  assert.equal(st.done, true);
  assert.equal(st.overall_status, 'failed');
  assert.equal(st.members.length, 3);
  const s2 = st.members.find((m) => m.path.includes('S2_'))!;
  assert.equal(s2.status, 'failed');
  assert.equal(s2.failure?.step_index, 5);
  assert.match(s2.failure!.message, /Invoice not found/);
  assert.ok(st.unknown_types.has('some_future_event'));
  assert.ok(st.unknown_types.has('kanehack_report'));
  assert.deepEqual(st.totals?.failed, 1);
});

test('passing sample: authored member end counts like a member end', () => {
  const st = parseTestrunOutput(read('testrun-pass.synthetic.ndjson'));
  assert.equal(st.execution_id, 'synthetic-exec-green-0002');
  assert.deepEqual(st.members.map((m) => m.status), ['passed', 'passed', 'passed']);
  assert.equal(st.members.find((m) => m.path.includes('S3_'))!.authored, true);
});

test('a later end event for the same file replaces the earlier one', () => {
  const st = parseTestrunOutput([
    '{"type":"testrun_member_end","path":"/abs/tests/authz/S1_x_test.md","status":"failed","failure":{"message":"m"}}',
    '{"type":"testrun_authored_member_end","path":"S1_x_test.md","status":"passed"}',
  ].join('\n'));
  assert.equal(st.members.length, 1);
  assert.equal(st.members[0]!.status, 'passed');
});

test('invalid plan and unknown status', () => {
  const st = parseTestrunOutput([
    '{"type":"testrun_plan","valid":false,"members":[{"path":"a_test.md","failure":"org_mismatch"}]}',
    '{"type":"testrun_member_end","path":"b_test.md","status":"weird"}',
  ].join('\n'));
  assert.deepEqual(st.plan_invalid, [{ path: 'a_test.md', failure: 'org_mismatch' }]);
  assert.equal(st.members[0]!.status, 'broken');
});

test('parseLine ignores non-objects', () => {
  assert.equal(parseLine(''), null);
  assert.equal(parseLine('[1,2]'), null);
  assert.equal(parseLine('{bad json'), null);
  assert.deepEqual(parseLine(' {"a":1} '), { a: 1 });
});

test('testrun args follow the spec', () => {
  const a = testrunArgs({ testsDir: 'tests/authz', phase: 'scan', sha: 'abcdef0123456', report: false, match: 'S2' });
  assert.deepEqual(a, [
    'testrun', 'run', 'tests/authz', '--parallel', '1', '--no-adaptive-heal', '--bug-detection', 'off', '--agent',
    '--name', 'bugsy:scan:abcdef0', '--match', 'S2',
  ]);
});

test('assurance fold + resume command', () => {
  const r = foldAssurance([
    { type: 'commit', minted: [{ cid: 'c1', logical_id: 'uc-owner-reads-own' }] },
    { type: 'session_paused', sid: 'des-1', resume: 'kane-cli design tests --resume des-1 --mode agent', pending_questions: [{ id: 'q1' }] },
    { type: 'done', status: 'paused', exit_code: 3 },
  ], 3);
  assert.equal(r.paused?.sid, 'des-1');
  assert.equal(r.minted[0]!.logical_id, 'uc-owner-reads-own');
  assert.deepEqual(resumeArgs(r.paused!, ['design', 'tests'], 'do X; then Y'), [
    'design', 'tests', '--resume', 'des-1', '--mode', 'agent', '--message', 'do X; then Y',
  ]);
  assert.deepEqual(resumeArgs({ sid: 's9' }, ['context', 'extract'], 'm'), [
    'context', 'extract', '--resume', 's9', '--mode', 'agent', '--message', 'm',
  ]);
  assert.deepEqual(shellSplit(`a "b c" 'd e' f\\ g`), ['a', 'b c', 'd e', 'f\\', 'g']);
});
