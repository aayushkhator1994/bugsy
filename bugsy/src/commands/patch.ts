// bugsy patch <scenario>: Kane failure + route source → patch → apply → restart → rerun the SAME tests →
// commit only the files the diff touched, only when every leak check is denied and every control passed.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fg from 'fast-glob';
import { BugsyError } from '../config.ts';
import * as git from '../git.ts';
import { preparedPatch, PREPARED_SCENARIOS } from '../prepared.ts';
import { executeRun, judgeRun, type Ctx } from '../run.ts';
import { getFinding, loadReport, pushHistory, saveReport, writeHtml } from '../report.ts';
import { patchMayCommit } from '../verdict.ts';
import { formatOutcome } from './scan.ts';
import type { Scenario } from '../types.ts';

export interface PatchOptions {
  patcher: 'codex' | 'api';
  usePrepared?: boolean;
}

const PATCH_CAP_MS = 130_000;

// Human output. Under --json it goes to stderr so stdout stays one JSON document.
let say: (s: string) => void = (s) => console.log(s);

function readSources(root: string, globs: string[]) {
  const files = fg.sync(globs, { cwd: root, onlyFiles: true, dot: false });
  return files.sort().map((p) => ({ path: p, content: readFileSync(resolve(root, p), 'utf8') }));
}

async function propose(ctx: Ctx, scenario: Scenario, o: PatchOptions, input: {
  failure: { message: string; step_index?: number; expected?: string; actual?: string };
  screenshotPath?: string;
}): Promise<{ diff: string; rationale: string; patcher: string; prepared: boolean }> {
  const fallback = (why: string) => {
    const d = preparedPatch(ctx.root, scenario.id);
    if (!d) throw new BugsyError(`${why}; no prepared patch for ${scenario.id}`);
    console.error(`${why}. USING PREPARED PATCH (fixtures/prepared/)`);
    return { diff: d, rationale: 'prepared patch (fallback)', patcher: 'prepared', prepared: true };
  };
  if (o.usePrepared) return fallback('--use-prepared');

  const sourceFiles = readSources(ctx.root, ctx.cfg.app.source_globs);
  if (!sourceFiles.length) throw new BugsyError(`no source files match ${ctx.cfg.app.source_globs.join(', ')}`);
  ctx.log(`  asking ${o.patcher === 'codex' ? 'Codex' : 'the Responses API'} for a patch (${sourceFiles.length} source file(s))…`);
  const { proposePatch } = await import('../openai/index.ts');
  try {
    const r = await Promise.race([
      proposePatch({ scenario, failure: input.failure as never, screenshotPath: input.screenshotPath, sourceFiles, patcher: o.patcher }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('patcher took longer than the cap')), PATCH_CAP_MS).unref()),
    ]);
    if (!r.diff?.trim()) return fallback('patcher returned an empty diff');
    return { ...r, prepared: false };
  } catch (e) {
    return fallback(`patcher failed: ${(e as Error).message}`);
  }
}

export async function patch(ctx: Ctx, scenarioId: string, o: PatchOptions): Promise<number> {
  say = ctx.json ? (s) => console.error(s) : (s) => console.log(s);
  const report = loadReport(ctx.root);
  const finding = getFinding(report, scenarioId);
  if (!finding || finding.verdict !== 'leak_confirmed') {
    throw new BugsyError(`no leak_confirmed finding for ${scenarioId} in bugsy.report.json — run \`bugsy scan\` first`);
  }
  const scenarios = report.scenarios?.length ? report.scenarios : PREPARED_SCENARIOS;
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) throw new BugsyError(`scenario ${scenarioId} not found`);

  const A = await git.headSha(ctx.root);
  const outcome = report.scan?.outcomes.find((x) => x.scenario === scenarioId);
  const m = /expected "([^"]*)", saw "([^"]*)"/.exec(finding.kane.failure_message ?? '');
  const failure = {
    message: finding.kane.failure_message ?? outcome?.failure_message ?? 'leak confirmed',
    step_index: finding.kane.failed_step,
    ...(m ? { expected: m[1], actual: m[2] } : {}),
  };
  const screenshotPath = finding.kane.screenshot ? resolve(ctx.root, finding.kane.screenshot) : undefined;

  let p = await propose(ctx, scenario, o, { failure, screenshotPath });
  let files = await git.diffFiles(ctx.root, p.diff);
  let check = await git.applyCheck(ctx.root, p.diff);
  const outside = files.filter((f) => !f.startsWith('app/'));
  if ((!check.ok || outside.length || !files.length) && !p.prepared) {
    const why = !check.ok ? `git apply --check failed: ${check.error.split('\n')[0]}` : outside.length ? `diff touches files outside app/: ${outside.join(', ')}` : 'diff touches no files';
    p = await propose(ctx, scenario, { ...o, usePrepared: true }, { failure }).catch(() => {
      throw new BugsyError(why);
    });
    console.error(`(${why})`);
    files = await git.diffFiles(ctx.root, p.diff);
    check = await git.applyCheck(ctx.root, p.diff);
  }
  if (!check.ok) throw new BugsyError(`patch does not apply: ${check.error}`);
  if (files.some((f) => !f.startsWith('app/'))) throw new BugsyError('refusing a patch outside app/');
  const dirty = await git.dirtyAmong(ctx.root, files);
  if (dirty.length) throw new BugsyError(`files the patch touches have local changes: ${dirty.join(', ')}`);

  say(`--- patch (${p.patcher}) for ${scenarioId}: ${files.join(', ')}`);
  say(p.diff.trimEnd());
  say('---');

  await git.apply(ctx.root, p.diff);
  let committed = false;
  try {
    ctx.log('  patch applied; restarting the app and rerunning the same tests…');
    const run = await executeRun(ctx, { phase: 'patch', sha: A, label: `bugsy:patch ${scenarioId} on ${git.short(A)}+patch` });
    const { outcomes } = judgeRun(ctx, run, scenarios);
    const rerun: Record<string, string | null> & { execution_id: string | null } = { execution_id: run.execution_id };
    for (const oc of outcomes) rerun[oc.scenario.split('_')[0]!] = oc.status;

    for (const oc of outcomes) say(formatOutcome(oc));
    if (patchMayCommit(outcomes)) {
      const red = finding.kane.execution_id ?? '?';
      const msg = `fix(authz): ${scenarioId} — Kane ${red} red on ${git.short(finding.commit)}, ${run.execution_id ?? '?'} green on this commit`;
      const B = await git.commitFiles(ctx.root, files, msg);
      committed = true;
      finding.patch = { commit: B, files, diff: p.diff, patcher: p.patcher, rationale: p.rationale };
      finding.rerun = rerun;
      pushHistory(report, { phase: 'patch', commit: B, execution_id: run.execution_id, exit_code: run.exit_code, summary: `green; committed ${git.short(B)}`, outcomes });
      say(`committed ${git.short(B)}: ${msg}`);

      // The hub counts "fix re-verified" only from a passing run on a different commit than the
      // failing one. The green run above happened on A+patch (dirty tree), so run once more at B.
      ctx.log(`  re-verifying on the committed fix ${git.short(B)}…`);
      const verify = await executeRun(ctx, { phase: 'verify', sha: B, label: `bugsy:verify ${scenarioId} on ${git.short(B)}` });
      const verdict = judgeRun(ctx, verify, scenarios);
      for (const oc of verdict.outcomes) say(formatOutcome(oc));
      (finding as { verify?: unknown }).verify = { commit: B, execution_id: verify.execution_id, ok: patchMayCommit(verdict.outcomes) };
      pushHistory(report, {
        phase: 'verify',
        commit: B,
        execution_id: verify.execution_id,
        exit_code: verify.exit_code,
        summary: patchMayCommit(verdict.outcomes) ? `fix re-verified on ${git.short(B)}` : `verify run on ${git.short(B)} did not pass cleanly; inspect before the demo`,
        outcomes: verdict.outcomes,
      });
      say('next: bugsy self-check');
    } else {
      pushHistory(report, {
        phase: 'patch',
        commit: A,
        execution_id: run.execution_id,
        exit_code: run.exit_code,
        summary: `refused: not every leak check denied with its control passing (${outcomes.map((x) => `${x.scenario.split('_')[0]} ${x.verdict}`).join(', ')})`,
        outcomes,
      });
      say('REFUSED: the patched app did not pass every scenario (leak checks denied AND controls passing). Patch reverted.');
    }
    saveReport(ctx.root, report);
    writeHtml(ctx.root, report);
    if (ctx.json) console.log(JSON.stringify({ committed, finding }, null, 2));
    return 0;
  } finally {
    if (!committed) await git.unapply(ctx.root, p.diff, files);
  }
}
