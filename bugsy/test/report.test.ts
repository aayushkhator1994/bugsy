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
  assert.match(html, /tests detect the leak/);
  assert.match(html, /green-2/);
  assert.match(html, /class="add">\+new/);
});
