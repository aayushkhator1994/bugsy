// bugsy self-check [scenario]: revert the patch (no commit), restart, rerun the leak check, expect red,
// ALWAYS restore. History stays intact: `git revert --no-commit` then `git revert --abort`.
import { BugsyError } from './config.ts';
import * as git from './git.ts';
import { PREPARED_SCENARIOS } from './prepared.ts';
import { executeRun, judgeRun, matchFor, type Ctx, type RunResult } from './run.ts';
import { loadReport, pushHistory, saveReport, writeHtml } from './report.ts';
import { selfCheckPassed } from './verdict.ts';
import { formatOutcome } from './commands/scan.ts';

export interface SelfCheckOptions {
  /** run only the leak test, without its control (then judged by "failed at step ≥ 1" alone) */
  leakOnly?: boolean;
}

export async function selfCheck(ctx: Ctx, scenarioArg: string | undefined, o: SelfCheckOptions = {}): Promise<number> {
  const report = loadReport(ctx.root);
  const patched = report.findings.filter((f) => f.patch?.commit);
  const finding = scenarioArg ? report.findings.find((f) => f.scenario === scenarioArg) : patched[patched.length - 1];
  const scenarioId = finding?.scenario ?? scenarioArg;
  if (!scenarioId) throw new BugsyError('no patched finding in bugsy.report.json — run `bugsy patch <scenario>` first');
  const B = finding?.patch?.commit ?? (await git.findFixCommit(ctx.root, scenarioId));
  if (!B) throw new BugsyError(`no fix commit found for ${scenarioId}`);

  const scenarios = report.scenarios?.length ? report.scenarios : PREPARED_SCENARIOS;
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) throw new BugsyError(`scenario ${scenarioId} not found`);
  const ids = o.leakOnly || !scenario.control_id ? [scenario.id] : [scenario.control_id, scenario.id];
  const inScope = scenarios.filter((s) => ids.includes(s.id));

  // Bugsy's own outputs (report, redacted evidence, scenarios doc) may be uncommitted; anything else must be clean.
  const exportDir = ctx.cfg.evidence_export_dir.replace(/\/+$/, '') + '/';
  const testsDir = ctx.cfg.tests_dir.replace(/\/+$/, '');
  const recordingDirs = scenarios.map((s) => `${testsDir}/output-${s.id}/`);
  const ownOutput = (line: string) => {
    const p = line.slice(3).replace(/^"|"$/g, '');
    return p === 'report/bugsy.report.json' || p === 'report/report.html' || p === 'report/' || p === 'requirements/authz-scenarios.md' || p.startsWith(exportDir) || p === exportDir || recordingDirs.some((dir) => p.startsWith(dir));
  };
  const before = await git.porcelain(ctx.root);
  const foreign = before.filter((l) => !ownOutput(l));
  if (foreign.length) {
    throw new BugsyError(`working tree is not clean; commit first so self-check can restore exactly:\n  ${foreign.join('\n  ')}`);
  }
  const head = await git.headSha(ctx.root);

  let run: RunResult | undefined;
  let runError: unknown;
  ctx.log(`  reverting ${git.short(B)} in the working tree (no commit)…`);
  try {
    await git.revertNoCommit(ctx.root, B);
    run = await executeRun(ctx, {
      phase: 'self-check',
      sha: head,
      match: matchFor(ids),
      label: 'bugsy:self-check (leak reintroduced on purpose)',
    });
  } catch (e) {
    runError = e;
  } finally {
    await git.restoreHead(ctx.root);
  }
  const after = await git.porcelain(ctx.root);
  // tracked changes after restore are a hard failure; new untracked files (Kane run artifacts) are reported
  const tracked = after.filter((l) => !l.startsWith('??') && !ownOutput(l) && !before.includes(l));
  if (tracked.length) {
    throw new BugsyError(`tree not clean after restore (inspect before continuing):\n  ${after.join('\n  ')}`);
  }
  const fresh = after.filter((l) => !before.includes(l) && !ownOutput(l));
  if (fresh.length) ctx.log(`  note: new untracked files from the run: ${fresh.map((l) => l.slice(3)).join(', ')}`);
  else ctx.log(`  restored ${git.short(head)}; git status clean`);
  if (runError) throw runError;

  const { outcomes } = judgeRun(ctx, run!, inScope);
  const leak = outcomes.find((x) => x.scenario === scenario.id)!;
  const detected = o.leakOnly
    ? leak.status === 'failed' && (leak.failed_step ?? 0) >= 1
    : selfCheckPassed(outcomes, scenario.id);
  const label = scenario.id.split('_')[0]!;

  if (finding) {
    finding.self_check = { execution_id: run!.execution_id, [label]: leak.status, tests_detect_leak: detected, leak_only: !!o.leakOnly };
    if (leak.evidence_note) finding.self_check.evidence_note = leak.evidence_note;
  }
  pushHistory(report, {
    phase: 'self-check',
    commit: head,
    execution_id: run!.execution_id,
    exit_code: run!.exit_code,
    summary: `patch ${git.short(B)} reverted; ${label} ${leak.status}; ${detected ? 'tests detect the leak' : 'tests did NOT detect the leak'}`,
    outcomes,
  });
  saveReport(ctx.root, report);
  writeHtml(ctx.root, report);

  if (ctx.json) {
    console.log(JSON.stringify({ scenario: scenario.id, reverted: B, execution_id: run!.execution_id, tests_detect_leak: detected, outcomes }, null, 2));
    return 0;
  }
  console.log(`Bugsy self-check ▸ patch ${git.short(B)} reverted, Kane exec ${run!.execution_id ?? '(none)'}`);
  for (const oc of outcomes) {
    if (o.leakOnly && oc.scenario === scenario.id) {
      console.log(`  ${oc.status === 'failed' ? '✘' : '✔'} ${oc.scenario.padEnd(28)}${oc.status}${oc.failed_step !== undefined ? ` at step ${oc.failed_step}` : ''}  (leak-only: control not run)`);
    } else console.log(formatOutcome(oc));
  }
  console.log(
    detected
      ? `✔ self-check passed: with the patch reverted, ${scenario.id} goes red. The tests detect the leak.`
      : `✘ self-check FAILED: with the patch reverted, ${scenario.id} did not confirm the leak (${leak.reason}).`,
  );
  console.log(`tree restored to ${git.short(head)}`);
  return 0;
}
