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

type Loose = Record<string, unknown>;
const short = (c?: string | null) => (c ? c.slice(0, 7) : '');
const code = (s?: string | null) => (s ? `<code>${esc(s)}</code>` : '<span class="muted">n/a</span>');
const humanize = (s: string) => s.replace(/_/g, ' ');
const sid = (s: string) => s.split('_')[0] ?? s;

const VERDICT: Record<string, { cls: string; label: string }> = {
  leak_confirmed: { cls: 'bad', label: 'Leak confirmed' },
  denied_as_expected: { cls: 'good', label: 'Denied as expected' },
  inconclusive: { cls: 'warn', label: 'Inconclusive' },
};

const isPass = (v: unknown) => /^(pass|passed|ok|green|true)$/i.test(String(v));

function pill(cls: string, text: string): string {
  return `<span class="pill ${cls}">${esc(text)}</span>`;
}

function diffBlock(diff: string): string {
  return diff
    .split('\n')
    .map((l) => {
      const cls = l.startsWith('+') && !l.startsWith('+++') ? 'add' : l.startsWith('-') && !l.startsWith('---') ? 'del' : l.startsWith('@@') ? 'hunk' : '';
      return `<span class="${cls}">${esc(l)}</span>`;
    })
    .join('');
}

function shareLink(f: Finding): string {
  const k = f.kane as Loose;
  const url = [k.share_url, k.share_link, k.test_manager_url, k.link, (f as unknown as Loose).share_url]
    .find((v) => typeof v === 'string' && /^https?:\/\//.test(v)) as string | undefined;
  return url ? `<a class="btn" href="${esc(url)}">Open in Test Manager</a>` : '';
}

function verdictStrip(r: StoredReport): string {
  const outcomes = r.scan?.outcomes ?? [];
  const leaks = outcomes.filter((o) => o.kind === 'leak_check');
  const controls = outcomes.filter((o) => o.kind === 'control');
  if (!leaks.length) {
    if (!r.findings.length) return `<section class="empty">No scan yet. Run <code>bugsy scan</code> to generate and run the leak scenarios.</section>`;
    return `<section class="strip">${r.findings.map((f) => card(r, f.scenario, f.verdict, undefined, f)).join('')}</section>`;
  }
  return `<section class="strip">${leaks
    .map((o) => {
      const cid = r.scenarios?.find((s) => s.id === o.scenario)?.control_id;
      const ctl = (cid && controls.find((c) => c.scenario === cid)) || controls[0];
      return card(r, o.scenario, o.verdict as string, ctl, r.findings.find((f) => f.scenario === o.scenario), o.reason);
    })
    .join('')}</section>`;
}

function card(r: StoredReport, scenario: string, verdict: string, ctl: ScenarioOutcome | undefined, f?: Finding, reason?: string): string {
  const v = VERDICT[verdict] ?? { cls: 'warn', label: humanize(verdict) };
  const title = r.scenarios?.find((s) => s.id === scenario)?.title ?? humanize(scenario.replace(/^S\d+_/, ''));
  const control = ctl
    ? `<div class="ctl">owner control ${esc(sid(ctl.scenario))}: <b>${ctl.verdict === 'control_passed' || ctl.status === 'passed' ? 'passed' : esc(ctl.status)}</b></div>`
    : '';
  const fixed = f?.patch && f.rerun ? `<div class="fixed">Patched and re-verified</div>` : '';
  return `<div class="vcard ${v.cls}"><div class="sid">${esc(sid(scenario))}</div><div class="vlabel">${esc(v.label)}</div>
<div class="vtitle">${esc(title)}</div>${reason ? `<div class="vreason">${esc(reason)}</div>` : ''}${control}${fixed}</div>`;
}

function findingCard(r: StoredReport, f: Finding): string {
  const sc = r.scenarios?.find((s) => s.id === f.scenario);
  const v = VERDICT[f.verdict] ?? { cls: 'warn', label: humanize(f.verdict) };
  const stepText =
    f.kane?.failed_step !== undefined && sc?.steps[f.kane.failed_step - 1]
      ? sc.steps[f.kane.failed_step - 1]!
      : undefined;
  const msg = f.kane?.failure_message ?? '';
  const q = /expected[^"]*"([^"]+)"[^"]*?(?:saw|actual|got|found)[^"]*"([^"]+)"/is.exec(msg);
  const exp = q ? null : /expected\s*:?\s*(.+?)(?:\s*[,;.]?\s*(?:but\s+)?(?:saw|actual|got|found)\b|$)/is.exec(msg);
  const saw = q ? null : /(?:saw|actual|got|found)\s*:?\s*(.+)$/is.exec(msg);
  const expText = q?.[1] || exp?.[1]?.trim() || sc?.expected?.[sc.expected.length - 1];
  const sawText = q?.[2] || saw?.[1]?.trim();
  const shot = f.kane?.screenshot;
  return `<section class="panel"><div class="ph"><h2>Finding ${esc(sid(f.scenario))}</h2>${pill(v.cls, v.label)}</div>
<h3>${esc(sc?.title ?? humanize(f.scenario.replace(/^S\d+_/, '')))}</h3>
${sc?.requirement ? `<p class="req">${esc(sc.requirement)}</p>` : ''}
<div class="fail">
${stepText ? `<div><span class="k">Failing step${f.kane.failed_step !== undefined ? ` ${esc(f.kane.failed_step)}` : ''}</span> ${esc(stepText)}</div>` : f.kane?.failed_step !== undefined ? `<div><span class="k">Failing step</span> step ${esc(f.kane.failed_step)}</div>` : ''}
${expText ? `<div><span class="k">Expected</span> ${esc(expText)}</div>` : ''}
${sawText ? `<div><span class="k">Saw</span> <b class="badtxt">${esc(sawText)}</b></div>` : msg && !expText ? `<div><span class="k">Kane said</span> ${esc(msg)}</div>` : ''}
</div>
${shot ? `<a href="${esc(shot)}"><img class="shot" alt="Kane screenshot of the failing step" src="${esc(shot)}"></a><p class="cap">Screenshot captured by Kane CLI in a real browser</p>` : ''}
<div class="meta"><span>Kane execution ${code(f.kane?.execution_id)}</span><span>commit ${code(short(f.commit))}</span>${shareLink(f)}</div></section>`;
}

function fixCard(f: Finding): string {
  const p = f.patch!;
  const rerunEntries = Object.entries(f.rerun ?? {}).filter(([k]) => k !== 'execution_id');
  const ver = (f as unknown as Loose).verify as Loose | undefined;
  const verCommit = (ver && typeof ver.commit === 'string' && ver.commit) || p.commit;
  const rows = rerunEntries
    .map(([k, val]) => `<tr><td>${esc(k)}</td><td>${pill(isPass(val) ? 'good' : 'bad', isPass(val) ? 'pass' : String(val ?? 'fail'))}</td></tr>`)
    .join('');
  const verified = ver
    ? `<p class="ok">Re-verified on ${code(short(verCommit))} · Kane execution ${code(String(ver.execution_id ?? ''))}</p>`
    : f.rerun
      ? `<p class="ok">Re-verified on ${code(short(p.commit))} · Kane execution ${code(f.rerun.execution_id)}</p>`
      : '<p class="muted">Not re-verified yet.</p>';
  return `<section class="panel"><div class="ph"><h2>The fix</h2>${pill('good', 'Patched by ' + p.patcher)}</div>
<div class="meta"><span>commit ${code(short(p.commit))}</span><span>files ${p.files.map((x) => code(x)).join(' ')}</span></div>
${p.rationale ? `<p class="req">${esc(p.rationale)}</p>` : ''}
<pre class="diff">${diffBlock(p.diff)}</pre>
${rows ? `<h3>Rerun</h3><table class="rr"><thead><tr><th>Scenario</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
${verified}</section>`;
}

function selfCheckCard(f: Finding): string {
  const sc = f.self_check;
  const ok = sc?.tests_detect_leak === true;
  const leakStatus = sc ? String((sc as Loose)[sid(f.scenario)] ?? (sc as Loose).status ?? 'failed') : '';
  const steps = ['Patch reverted', `${sid(f.scenario)} ${leakStatus || 'failed'} again`, 'Patch restored']
    .map((t, i) => `<li><span class="n">${i + 1}</span>${esc(t)}</li>`)
    .join('');
  return `<section class="panel"><div class="ph"><h2>Does the test actually test?</h2>${sc ? pill(ok ? 'good' : 'bad', ok ? 'Yes' : 'No') : pill('warn', 'Not run yet')}</div>
${
  sc
    ? `<ol class="steps">${steps}</ol>
<p class="${ok ? 'ok' : 'badtxt'}">${ok ? 'The test fails when the fix is removed, so it really catches this leak.' : 'The test did not detect the leak with the fix removed. Do not trust this test.'}</p>
<div class="meta"><span>tests_detect_leak: <b>${ok ? 'yes' : 'no'}</b></span><span>Kane execution ${code(sc.execution_id)}</span></div>`
    : '<p class="muted">Run <code>bugsy self-check</code> to revert the patch and prove the test fails without it.</p>'
}</section>`;
}

function timeline(r: StoredReport): string {
  if (!r.history.length) return '';
  const items = r.history
    .map(
      (h) => `<li><div class="dot ${h.exit_code === 0 ? 'good' : 'bad'}"></div><div class="tb"><div class="th"><b>${esc(h.phase)}</b><span class="muted small">${esc(h.at)}</span></div>
<div>${esc(h.summary)}</div><div class="meta small"><span>commit ${code(short(h.commit))}</span><span>Kane execution ${code(h.execution_id)}</span></div></div></li>`,
    )
    .join('');
  return `<section class="panel"><div class="ph"><h2>Timeline</h2></div><ol class="tl">${items}</ol></section>`;
}

export function renderHtml(r: StoredReport, root: string): string {
  void root;
  const commits = [...new Set([r.scan?.commit, ...r.findings.flatMap((f) => [f.commit, f.patch?.commit]), ...r.history.map((h) => h.commit)].filter((c): c is string => !!c).map(short))];
  const detail = r.findings
    .map((f) => [f.verdict === 'leak_confirmed' ? findingCard(r, f) : '', f.patch ? fixCard(f) : '', f.patch ? selfCheckCard(f) : ''].join('\n'))
    .join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bugsy report - ${esc(r.app)}</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--fg:#0f172a;--muted:#64748b;--line:#e2e8f0;--brand:#0f766e;--brand-soft:#ccfbf1;--bad:#b91c1c;--badbg:#fee2e2;--good:#166534;--goodbg:#dcfce7;--warn:#92400e;--warnbg:#fef3c7;--code:#f1f5f9;--sh:0 1px 2px rgba(15,23,42,.06),0 8px 24px rgba(15,23,42,.06)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:960px;margin:0 auto;padding:0 20px}a{color:var(--brand)}
header{background:var(--card);border-bottom:1px solid var(--line)}header .wrap{padding:26px 20px}
.brand{display:flex;align-items:center;gap:12px}.mark{width:40px;height:40px;border-radius:11px;background:var(--brand);color:#fff;display:grid;place-items:center;font-weight:800;font-size:20px}
.word{font-size:28px;font-weight:800;letter-spacing:-.03em}.tag{color:var(--muted);margin:2px 0 0}
.facts{display:flex;flex-wrap:wrap;gap:8px 22px;margin-top:16px;font-size:13px;color:var(--muted)}.facts b{color:var(--fg)}
main.wrap{padding:24px 20px 8px}
code{background:var(--code);padding:1px 6px;border-radius:5px;font:12.5px ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}
.panel,.vcard{min-width:0;overflow-wrap:anywhere}.muted{color:var(--muted)}.small{font-size:12.5px}
.strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-bottom:20px}
.vcard{border-radius:14px;padding:22px;border:1px solid;box-shadow:var(--sh)}
.vcard.bad{background:var(--badbg);border-color:#fecaca;color:var(--bad)}.vcard.good{background:var(--goodbg);border-color:#bbf7d0;color:var(--good)}.vcard.warn{background:var(--warnbg);border-color:#fde68a;color:var(--warn)}
.sid{font-weight:700;font-size:12px;letter-spacing:.08em;opacity:.8}.vlabel{font-size:28px;font-weight:800;letter-spacing:-.02em;line-height:1.15;margin:4px 0 8px;text-transform:uppercase}
.vtitle{font-weight:600;color:var(--fg)}.vreason{font-size:13px;color:var(--muted);margin-top:4px}
.ctl{margin-top:14px;font-size:12.5px;color:var(--muted)}.ctl b{color:var(--good)}.fixed{margin-top:10px;font-size:12.5px;font-weight:700}
.panel,.empty{background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--sh);padding:22px 24px;margin-bottom:20px}
.empty{color:var(--muted);text-align:center;padding:40px}
.ph{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}h2{margin:0;font-size:18px;letter-spacing:-.01em}h3{margin:14px 0 6px;font-size:15px}
.req{color:var(--muted);margin:4px 0 12px}
.fail{background:#f8fafc;border:1px solid var(--line);border-left:4px solid var(--bad);border-radius:8px;padding:12px 16px;display:grid;gap:6px;margin:12px 0}.fail:empty{display:none}
.k{display:inline-block;min-width:92px;font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.badtxt{color:var(--bad)}.ok{color:var(--good);font-weight:600}
.shot{display:block;width:100%;height:380px;object-fit:cover;object-position:50% 0;background:#fff;border:1px solid var(--line);border-radius:10px;margin-top:6px;box-shadow:var(--sh)}.cap{font-size:12px;color:var(--muted);margin:6px 0 0}
.meta{display:flex;flex-wrap:wrap;gap:8px 20px;align-items:center;margin-top:14px;font-size:13px;color:var(--muted)}
.btn{display:inline-block;padding:6px 12px;border-radius:8px;background:var(--brand);color:#fff;text-decoration:none;font-weight:600;font-size:13px}
.pill{display:inline-block;padding:3px 12px;border-radius:999px;font-size:12.5px;font-weight:700;white-space:nowrap}
.pill.good{background:var(--goodbg);color:var(--good)}.pill.bad{background:var(--badbg);color:var(--bad)}.pill.warn{background:var(--warnbg);color:var(--warn)}
pre.diff{background:#0f172a;color:#cbd5e1;padding:14px 16px;border-radius:10px;overflow:auto;font:12.5px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;margin:12px 0}
pre.diff span{display:block;white-space:pre}pre.diff .add{color:#86efac;background:rgba(34,197,94,.14)}pre.diff .del{color:#fca5a5;background:rgba(239,68,68,.16)}pre.diff .hunk{color:#7dd3fc}
table.rr{border-collapse:collapse;width:100%;max-width:360px}.rr th,.rr td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}.rr th{font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
ol.steps{list-style:none;padding:0;margin:14px 0;display:flex;flex-wrap:wrap;gap:10px}.steps li{display:flex;align-items:center;gap:8px;background:#f8fafc;border:1px solid var(--line);border-radius:10px;padding:8px 14px;font-weight:600}
.n{width:22px;height:22px;border-radius:50%;background:var(--brand);color:#fff;display:grid;place-items:center;font-size:12px}
ol.tl{list-style:none;margin:14px 0 0;padding:0;border-left:2px solid var(--line);margin-left:6px}.tl li{position:relative;padding:0 0 18px 22px}.tl li:last-child{padding-bottom:0}
.dot{position:absolute;left:-7px;top:5px;width:12px;height:12px;border-radius:50%;border:2px solid var(--card)}.dot.good{background:#22c55e}.dot.bad{background:#ef4444}
.th{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap;text-transform:capitalize}.th .small{text-transform:none}.tb .meta{margin-top:4px}
footer{padding:12px 0 40px;text-align:center;color:var(--muted);font-size:13px}footer b{color:var(--fg)}
@media(max-width:600px){.word{font-size:24px}.vlabel{font-size:24px}.panel{padding:18px 16px}.k{display:block;min-width:0}main.wrap{padding:18px 14px 4px}header .wrap{padding:20px 14px}}
</style></head><body>
<header><div class="wrap"><div class="brand"><div class="mark">B</div><div><div class="word">Bugsy</div><p class="tag">Security seatbelt for vibe-coded apps</p></div></div>
<div class="facts"><span>App <b>${esc(r.app)}</b></span>${commits.length ? `<span>Commits ${commits.map((c) => code(c)).join(' ')}</span>` : ''}<span>Generated <b>${esc(r.generated_at)}</b></span></div></div></header>
<main class="wrap">
${verdictStrip(r)}
${detail}
${timeline(r)}
</main>
<footer><div class="wrap"><p>Built with OpenAI, tested with Kane CLI. <b>#KaneCLIHackDay</b></p><p><a href="https://github.com/aayushkhator1994/bugsy">https://github.com/aayushkhator1994/bugsy</a></p></div></footer>
</body></html>
`;
}

export function writeHtml(root: string, r: StoredReport): string {
  const p = resolve(root, REPORT_HTML);
  writeFileSync(p, renderHtml(r, root));
  return p;
}
