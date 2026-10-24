import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyReport, loadReport, pushHistory, renderHtml, saveReport, upsertFinding } from '../src/report.ts';

test('report round-trips, keeps history, renders self-contained HTML', () => {
  const root = mkdtempSync(join(tmpdir(), 'bugsy-rep-'));
  const r = emptyReport();
  upsertFinding(r, { scenario: 'S2_other_reads_by_url', verdict: 'leak_confirmed', commit: 'aaaaaaa1', kane: { execution_id: 'red-1', failed_step: 5 } });
  pushHistory(r, { phase: 'scan', commit: 'aaaaaaa1', execution_id: 'red-1', exit_code: 1, summary: 'leak <confirmed>' });
  r.findings[0]!.patch = { commit: 'bbbbbbb2', files: ['app/src/routes/invoices.ts'], diff: '--- a/x\n+++ b/x\n-old\n+new', patcher: 'codex' };
  r.findings[0]!.rerun = { execution_id: 'green-2', S1: 'passed', S2: 'passed', S3: 'passed' };
  r.findings[0]!.self_check = { execution_id: 'self-3', S2: 'failed', tests_detect_leak: true };
  saveReport(root, r);
  const back = loadReport(root);
  assert.equal(back.history.length, 1);
  assert.equal(back.findings[0]!.patch?.commit, 'bbbbbbb2');
  const html = renderHtml(back, root);
  assert.ok(!/<link|<script src|https?:\/\/cdn/i.test(html));
  assert.match(html, /leak &lt;confirmed&gt;/);
  assert.match(html, /Does the test actually test\?/);
  assert.match(html, /tests_detect_leak: <b>yes<\/b>/);
  assert.match(html, /green-2/);
  assert.match(html, /class="add">\+new/);
});


test('report labels inconclusive self-check and unsuccessful commit verification honestly', () => {
  const r = emptyReport();
  const f = upsertFinding(r, { scenario: 'S2_other_reads_by_url', verdict: 'leak_confirmed', commit: 'aaaaaaa1', kane: { execution_id: 'red' } });
  f.patch = { commit: 'bbbbbbb2', files: ['app/src/routes/invoices.ts'], diff: '', patcher: 'codex' };
  f.rerun = { execution_id: 'green', S1: 'passed', S2: 'passed', S3: 'passed' };
  (f as typeof f & { verify: { execution_id: string; commit: string; ok: boolean } }).verify = { execution_id: 'uncertain', commit: 'bbbbbbb2', ok: false };
  f.self_check = { execution_id: 'revert', S2: 'inconclusive', tests_detect_leak: false };
  const html = renderHtml(r, tmpdir());
  assert.match(html, /The revert proof is inconclusive/);
  assert.match(html, /Commit verification did not pass/);
  assert.doesNotMatch(html, /Patched and re-verified|Re-verified on|Do not trust this test/);
});
