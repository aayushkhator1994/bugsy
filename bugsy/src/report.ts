// bugsy.report.json (schema §8, history[] kept) and a self-contained report.html (inline CSS, no CDN).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BugsyReport, Finding, HistoryEntry, Scenario, ScenarioOutcome } from './types.ts';

export const REPORT_JSON = 'bugsy.report.json';
export const REPORT_HTML = 'report.html';

export type StoredReport = BugsyReport & { scenarios?: Scenario[] };

export function emptyReport(app = 'Ledger'): StoredReport {
  return { version: 1, app, generated_at: new Date().toISOString(), findings: [], history: [] };
}

export function loadReport(root: string): StoredReport {
  const p = resolve(root, REPORT_JSON);
  if (!existsSync(p)) return emptyReport();
  try {
    const r = JSON.parse(readFileSync(p, 'utf8')) as StoredReport;
    r.findings ??= [];
    r.history ??= [];
    return r;
  } catch {
    return emptyReport();
  }
}

export function saveReport(root: string, r: StoredReport): string {
  r.generated_at = new Date().toISOString();
  const p = resolve(root, REPORT_JSON);
  writeFileSync(p, JSON.stringify(r, null, 2) + '\n');
  return p;
}

export function pushHistory(r: StoredReport, e: Omit<HistoryEntry, 'at'>): void {
  r.history.push({ at: new Date().toISOString(), ...e });
}

export function upsertFinding(r: StoredReport, f: Finding): Finding {
  const i = r.findings.findIndex((x) => x.scenario === f.scenario);
  if (i >= 0) r.findings[i] = { ...r.findings[i], ...f };
  else r.findings.push(f);
  return r.findings[i >= 0 ? i : r.findings.length - 1]!;
}

export function getFinding(r: StoredReport, scenario: string): Finding | undefined {
  return r.findings.find((f) => f.scenario === scenario);
}

// ------------------------------------------------------------------ HTML

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function thumb(root: string, rel?: string): string {
  if (!rel) return '<span class="muted">—</span>';
  const abs = resolve(root, rel);
  if (!existsSync(abs)) return `<a href="${esc(rel)}">${esc(rel)}</a>`;
  const b64 = readFileSync(abs).toString('base64');
  return `<a href="${esc(rel)}" title="${esc(rel)}"><img class="thumb" alt="screenshot" src="data:image/png;base64,${b64}"></a>`;
}

const VERDICT_CLASS: Record<string, string> = {
  leak_confirmed: 'bad',
  denied_as_expected: 'good',
  control_passed: 'good',
  control_failed: 'bad',
  inconclusive: 'warn',
};

function outcomeRows(outcomes: ScenarioOutcome[]): string {
  return outcomes
    .map(
      (o) => `<tr><td><code>${esc(o.scenario)}</code></td><td>${esc(o.kind)}</td><td>${esc(o.status)}</td>
<td><span class="pill ${VERDICT_CLASS[o.verdict] ?? ''}">${esc(o.verdict.replace(/_/g, ' '))}</span></td><td>${esc(o.reason)}</td></tr>`,
    )
    .join('\n');
}

function diffBlock(diff: string): string {
  return diff
    .split('\n')
    .map((l) => {
      const cls = l.startsWith('+') && !l.startsWith('+++') ? 'add' : l.startsWith('-') && !l.startsWith('---') ? 'del' : l.startsWith('@@') ? 'hunk' : '';
      return `<span class="${cls}">${esc(l)}</span>`;
    })
    .join('\n');
}

export function renderHtml(r: StoredReport, root: string): string {
  const findings = r.findings
    .map(
      (f) => `<tr>
<td><code>${esc(f.scenario)}</code></td>
<td><span class="pill ${VERDICT_CLASS[f.verdict] ?? ''}">${esc(f.verdict.replace(/_/g, ' '))}</span></td>
<td><code>${esc(f.commit?.slice(0, 7))}</code></td>
<td><code>${esc(f.kane?.execution_id)}</code></td>
<td>${f.kane?.failed_step ?? '—'}${f.kane?.failure_message ? `<div class="muted small">${esc(f.kane.failure_message)}</div>` : ''}</td>
<td>${thumb(root, f.kane?.screenshot)}</td></tr>`,
    )
    .join('\n');

  const patches = r.findings
    .filter((f) => f.patch)
    .map((f) => {
      const p = f.patch!;
      const rerun = f.rerun
        ? Object.entries(f.rerun)
            .filter(([k]) => k !== 'execution_id')
            .map(([k, v]) => `${esc(k)}: <b>${esc(v)}</b>`)
            .join(' · ')
        : '';
      const sc = f.self_check;
      return `<section><h2>Patch for <code>${esc(f.scenario)}</code></h2>
<p>Commit <code>${esc(p.commit?.slice(0, 7))}</code> · patcher <b>${esc(p.patcher)}</b> · files ${p.files.map((x) => `<code>${esc(x)}</code>`).join(', ')}</p>
${p.rationale ? `<p class="muted">${esc(p.rationale)}</p>` : ''}
<pre class="diff">${diffBlock(p.diff)}</pre>
<table class="kv"><tr><th>Before (red)</th><td><code>${esc(f.kane?.execution_id)}</code> on <code>${esc(f.commit?.slice(0, 7))}</code></td></tr>
<tr><th>After (green)</th><td><code>${esc(f.rerun?.execution_id)}</code> on <code>${esc(p.commit?.slice(0, 7))}</code> ${rerun ? `— ${rerun}` : ''}</td></tr>
<tr><th>Self-check</th><td>${
        sc
          ? `<code>${esc(sc.execution_id)}</code> — patch reverted, ${esc(f.scenario)} ${esc((sc as any)[f.scenario.split('_')[0]!] ?? (sc as any).status ?? '')} → <span class="pill ${sc.tests_detect_leak ? 'good' : 'bad'}">${sc.tests_detect_leak ? 'tests detect the leak' : 'tests did NOT detect the leak'}</span>`
          : '<span class="muted">not run yet</span>'
      }</td></tr></table></section>`;
    })
    .join('\n');

  const history = [...r.history]
    .reverse()
    .map(
      (h) =>
        `<tr><td class="small">${esc(h.at)}</td><td>${esc(h.phase)}</td><td><code>${esc(h.commit?.slice(0, 7))}</code></td><td><code>${esc(h.execution_id)}</code></td><td>${esc(h.exit_code)}</td><td>${esc(h.summary)}</td></tr>`,
    )
    .join('\n');

  const scan = r.scan
    ? `<section><h2>Latest scan</h2><p>Commit <code>${esc(r.scan.commit.slice(0, 7))}</code> · Kane exec <code>${esc(r.scan.execution_id)}</code>${r.scan.used_prepared_tests ? ' · <b>prepared tests</b>' : ''}</p>
<table><thead><tr><th>Scenario</th><th>Kind</th><th>Kane status</th><th>Verdict</th><th>Why</th></tr></thead><tbody>${outcomeRows(r.scan.outcomes)}</tbody></table></section>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bugsy report — ${esc(r.app)}</title>
<style>
:root{--bg:#fff;--fg:#1d1d1f;--muted:#6b7280;--line:#e5e7eb;--good:#0f7b3f;--goodbg:#e7f6ee;--bad:#b42318;--badbg:#fdecea;--warn:#8a5a00;--warnbg:#fff4dc;--code:#f6f8fa}
@media (prefers-color-scheme:dark){:root{--bg:#111316;--fg:#e8e8ea;--muted:#9aa0a6;--line:#2a2e33;--goodbg:#10291b;--good:#6fdc9a;--badbg:#3a1512;--bad:#ff8a80;--warnbg:#33270d;--warn:#ffcc66;--code:#1a1d21}}
body{font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--fg);max-width:1100px;margin:2rem auto;padding:0 1rem}
h1{margin:0 0 .25rem}h2{margin-top:2rem;font-size:1.15rem}
.muted{color:var(--muted)}.small{font-size:.82rem}
table{border-collapse:collapse;width:100%;margin:.5rem 0}th,td{text-align:left;padding:.45rem .6rem;border-bottom:1px solid var(--line);vertical-align:top}
th{font-weight:600;font-size:.85rem;color:var(--muted)}
code{background:var(--code);padding:.05rem .3rem;border-radius:4px;font-size:.88em}
.pill{display:inline-block;padding:.05rem .55rem;border-radius:999px;font-size:.82rem;font-weight:600;white-space:nowrap}
.pill.good{background:var(--goodbg);color:var(--good)}.pill.bad{background:var(--badbg);color:var(--bad)}.pill.warn{background:var(--warnbg);color:var(--warn)}
.thumb{max-width:180px;max-height:120px;border:1px solid var(--line);border-radius:4px}
pre.diff{background:var(--code);padding:.75rem;border-radius:6px;overflow:auto;font-size:.85rem}
pre.diff .add{color:var(--good)}pre.diff .del{color:var(--bad)}pre.diff .hunk{color:var(--muted)}
.kv th{width:9rem}
footer{margin-top:3rem;font-size:.8rem;color:var(--muted)}
</style></head><body>
<h1>Bugsy — ${esc(r.app)}</h1>
<p class="muted">Security seatbelt report · generated ${esc(r.generated_at)} · built with OpenAI, tested with Kane CLI</p>
<section><h2>Findings</h2>
${
  r.findings.length
    ? `<table><thead><tr><th>Scenario</th><th>Verdict</th><th>Commit</th><th>Kane exec</th><th>Failed step</th><th>Screenshot</th></tr></thead><tbody>${findings}</tbody></table>`
    : '<p class="muted">No findings yet. Run <code>bugsy scan</code>.</p>'
}</section>
${scan}
${patches}
<section><h2>History</h2>
${history ? `<table><thead><tr><th>When</th><th>Phase</th><th>Commit</th><th>Kane exec</th><th>Exit</th><th>Summary</th></tr></thead><tbody>${history}</tbody></table>` : '<p class="muted">empty</p>'}
</section>
<footer>Evidence exports are redacted (results, failure records, step screenshots only). Full packs are not committed.</footer>
</body></html>
`;
}

export function writeHtml(root: string, r: StoredReport): string {
  const p = resolve(root, REPORT_HTML);
  writeFileSync(p, renderHtml(r, root));
  return p;
}
