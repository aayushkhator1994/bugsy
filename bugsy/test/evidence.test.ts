import { test } from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { mkdtempSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportEvidence, isExportable, parseTestSteps, scenarioLabel } from '../src/evidence.ts';

// Synthetic pack following the documented layout (evidence.md / debug.md). Field names inside the YAML are guesses.
function syntheticPack(dir: string, ext = 'png'): string {
  const z = new AdmZip();
  const png = Buffer.from(ext === 'png' ? '89504e470d0a1a0a' : 'ffd8ffe0', 'hex');
  z.addFile('run.yaml', Buffer.from('title: bugsy:scan:abc1234\nstatus: failed\n'));
  z.addFile('failure.yaml', Buffer.from('failed: 1\n'));
  // S2: failed at step 5
  z.addFile('tests/t-s2/test.md', Buffer.from('---\nmode: testing\n---\n# S2\n## Sign in as Alice\npassword alice123\n'));
  z.addFile('tests/t-s2/result.yaml', Buffer.from(
    'path: tests/authz/S2_other_reads_by_url_test.md\nstatus: failed\nsteps:\n  - {ordinal: 4, status: passed}\n  - {ordinal: 5, status: failed}\nnote: typed alice123\n'));
  z.addFile('tests/t-s2/logs/0-network.har', Buffer.from('{"cookies":"secret"}'));
  z.addFile('tests/t-s2/logs/0-console.ndjson', Buffer.from('{}'));
  z.addFile('tests/t-s2/logs/0-actions.ndjson', Buffer.from('{}'));
  z.addFile(`tests/t-s2/steps/4-open/screenshot.${ext}`, png);
  z.addFile(`tests/t-s2/steps/5-verify/screenshot.${ext}`, png);
  z.addFile('tests/t-s2/steps/5-verify/annotated.png', png);
  z.addFile('tests/t-s2/steps/5-verify/step.json', Buffer.from('{}'));
  z.addFile('tests/t-s2/steps/5-verify/failure.yaml', Buffer.from(
    'error:\n  message: "Expected Invoice not found"\nexpected: Invoice not found\nactual: "Client: Umbrella"\n'));
  // S1: passed
  z.addFile('tests/t-s1/result.yaml', Buffer.from('path: tests/authz/S1_owner_reads_own_test.md\nstatus: passed\nsteps:\n  - {ordinal: 1, status: passed}\n'));
  z.addFile(`tests/t-s1/steps/1-open/screenshot.${ext}`, png);
  const p = join(dir, 'exec-1.evidence');
  z.writeZip(p);
  return p;
}

test('allow-list never lets HAR, console or action logs out', () => {
  assert.equal(isExportable('run.yaml'), true);
  assert.equal(isExportable('tests/x/result.yaml'), true);
  assert.equal(isExportable('tests/x/steps/5-a/failure.yaml'), true);
  assert.equal(isExportable('tests/x/steps/5-a/screenshot.png'), true);
  assert.equal(isExportable('tests/x/steps/5-a/screenshot.jpg'), true);
  assert.equal(isExportable('tests/x/steps/5-a/screenshot.jpeg'), true);
  assert.equal(isExportable('tests/x/steps/5-a/annotated.png'), false);
  assert.equal(isExportable('tests/x/logs/0-network.har'), false);
  assert.equal(isExportable('tests/x/logs/0-console.ndjson'), false);
  assert.equal(isExportable('tests/x/test.md'), false);
});

test('export is redacted and returns per-test data', () => {
  const root = mkdtempSync(join(tmpdir(), 'bugsy-ev-'));
  const pack = syntheticPack(root);
  const r = exportEvidence({
    packPath: pack, executionId: 'exec-1', root, exportDir: 'evidence', secrets: ['alice123'],
    members: [
      { path: 'tests/authz/S1_owner_reads_own_test.md', status: 'passed' },
      { path: 'tests/authz/S2_other_reads_by_url_test.md', status: 'failed', failure: { message: 'x', step_index: 5 } },
    ],
  });
  const s2 = r.tests.find((t) => t.test_id === 't-s2')!;
  assert.equal(s2.status, 'failed');
  assert.equal(s2.failed_step, 5);
  assert.equal(s2.screenshot, join('evidence', 'exec-1', 'S2', '5-screenshot.png'));
  assert.equal(s2.failure?.expected, 'Invoice not found');
  assert.equal(s2.failure?.actual, 'Client: Umbrella');
  assert.equal(s2.name, 'S2_other_reads_by_url');
  const s1 = r.tests.find((t) => t.test_id === 't-s1')!;
  assert.equal(s1.status, 'passed');
  assert.equal(s1.failed_step, undefined);

  const files = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(join(d, e.name)).map((f) => `${e.name}/${f}`) : [e.name]);
  const out = files(r.dir).sort();
  assert.deepEqual(out, [
    'S1/1-screenshot.png', 'S1/result.yaml',
    'S2/4-screenshot.png', 'S2/5-failure.yaml', 'S2/5-screenshot.png', 'S2/result.yaml',
    'failure.yaml', 'run.yaml',
  ]);
  assert.ok(!readFileSync(join(r.dir, 'S2/result.yaml'), 'utf8').includes('alice123'));
  assert.ok(existsSync(join(r.dir, 'run.yaml')));
});

test('test step parsing and labels', () => {
  const md = '---\nmode: testing\nmax_steps: 30\n---\n# T\n## Sign in as Bob\nUse bob.\n## Open /invoices/4\n```yaml\ntimeout: 9\n```\nVerify \'Invoice not found\'.\n';
  assert.deepEqual(parseTestSteps(md), ['Sign in as Bob Use bob.', "Open /invoices/4 Verify 'Invoice not found'."]);
  assert.equal(scenarioLabel('tests/authz/S2_other_reads_by_url_test.md'), 'S2');
  assert.equal(scenarioLabel('t-abc'), undefined);
});


test('real Kane JPEG screenshots are exported with their original extension and bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'bugsy-jpeg-'));
  const pack = syntheticPack(root, 'jpg');
  const result = exportEvidence({ packPath: pack, executionId: 'jpeg', root, exportDir: 'evidence', members: [
    { path: 'tests/authz/S2_other_reads_by_url_test.md', status: 'failed', failure: { message: 'denial', step_index: 5 } },
  ] });
  const failure = result.tests.find((t) => t.test_id === 't-s2')!;
  assert.equal(failure.screenshot, join('evidence', 'jpeg', 'S2', '5-screenshot.jpg'));
  assert.deepEqual(readFileSync(join(root, failure.screenshot!)), Buffer.from('ffd8ffe0', 'hex'));
});
