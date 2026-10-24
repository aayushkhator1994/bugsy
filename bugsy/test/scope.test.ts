import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scopeScenarios, matchFor } from '../src/run.ts';
import type { Scenario } from '../src/types.ts';

const s = (id: string, kind: Scenario['kind'], control_id?: string): Scenario =>
  ({ id, kind, title: id, requirement: 'r', steps: [], expected: [], ...(control_id ? { control_id } : {}) }) as Scenario;
const all = [
  s('S1_owner_reads_own', 'control'),
  s('S2_other_reads_by_url', 'leak_check', 'S1_owner_reads_own'),
  s('S3_list_isolation', 'leak_check', 'S1_owner_reads_own'),
  s('S4_signed_out_back_button', 'leak_check', 'S1_owner_reads_own'),
];

test('--only picks the named scenario and brings its control', () => {
  assert.deepEqual(scopeScenarios(all, ['S2']).map((x) => x.id), ['S1_owner_reads_own', 'S2_other_reads_by_url']);
  assert.deepEqual(scopeScenarios(all, ['S4_signed_out_back_button']).map((x) => x.id), ['S1_owner_reads_own', 'S4_signed_out_back_button']);
  assert.deepEqual(scopeScenarios(all, ['S2', 'S4']).map((x) => x.id), ['S1_owner_reads_own', 'S2_other_reads_by_url', 'S4_signed_out_back_button']);
});

test('no --only means everything; an unknown id is an error', () => {
  assert.equal(scopeScenarios(all, undefined).length, 4);
  assert.throws(() => scopeScenarios(all, ['S9']), /matches no scenario/);
});

test('the scope becomes a testrun --match that selects only those files', () => {
  const re = new RegExp(matchFor(scopeScenarios(all, ['S4']).map((x) => x.id)));
  assert.ok(re.test('tests/authz/S1_owner_reads_own_test.md'));
  assert.ok(re.test('tests/authz/S4_signed_out_back_button_test.md'));
  assert.ok(!re.test('tests/authz/S2_other_reads_by_url_test.md'));
});
