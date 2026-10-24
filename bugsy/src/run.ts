// One Kane pass: start the app → testrun → stop the app (always), then judge from the evidence pack.
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { startApp } from './app-runner.ts';
import { runTestrun, type TestrunState } from './kane.ts';
import { exportEvidence, parseTestSteps, type ExportResult } from './evidence.ts';
import { evaluate, memberFor, type ScenarioEvidence } from './verdict.ts';
import type { BugsyConfig, KaneRunResult, Scenario, ScenarioOutcome } from './types.ts';

export interface Ctx {
  root: string;
  cfg: BugsyConfig;
  /** wrap Kane runs with `kanehack report` (config.kanehack_report && !--no-report) */
  report: boolean;
  json: boolean;
  log: (msg: string) => void;
}

export type RunResult = KaneRunResult & { state: TestrunState; wrapped: boolean };

export async function executeRun(
  ctx: Ctx,
  o: { phase: string; sha: string; label?: string; match?: string },
): Promise<RunResult> {
  const app = await startApp(ctx.cfg, ctx.root);
  ctx.log(`  app up at ${app.url} (pid ${app.pid})`);
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return await runTestrun(
      {
        testsDir: ctx.cfg.tests_dir,
        phase: o.phase,
        sha: o.sha,
        match: o.match,
        label: o.label,
        report: ctx.report,
        cwd: ctx.root,
      },
      {
        cwd: ctx.root,
        rawLog: resolve(ctx.root, 'bugsy/.run', `${o.phase}-${stamp}.ndjson`),
        onEvent: (ev) => {
          if (ev.type === 'testrun_start') ctx.log(`  Kane exec ${ev.execution_id ?? '?'} started`);
          if (ev.type === 'testrun_member_end' || ev.type === 'testrun_authored_member_end') {
            ctx.log(`  · ${basename(String(ev.path))} ${ev.status}${ev.duration_s ? ` (${Math.round(ev.duration_s)}s)` : ''}`);
          }
        },
      },
    );
  } finally {
    await app.stop();
  }
}

export interface Judged {
  outcomes: ScenarioOutcome[];
  exported?: ExportResult;
}

export function judgeRun(ctx: Ctx, run: RunResult, scenarios: Scenario[]): Judged {
  let exported: ExportResult | undefined;
  if (run.pack_path && run.execution_id) {
    try {
      exported = exportEvidence({
        packPath: run.pack_path,
        executionId: run.execution_id,
        root: ctx.root,
        exportDir: ctx.cfg.evidence_export_dir,
        members: run.members,
        secrets: Object.values(ctx.cfg.accounts).map((a) => a.password),
      });
    } catch {
      ctx.log('  Evidence pack could not be read; verdicts are inconclusive');
    }
  }
  const steps: Record<string, string[]> = {};
  const evidence: Record<string, ScenarioEvidence> = {};
  for (const s of scenarios) {
    const m = memberFor(s, run.members);
    if (m) {
      const p = [resolve(ctx.root, m.path), resolve(ctx.root, ctx.cfg.tests_dir, basename(m.path))].find(existsSync);
      if (p) steps[s.id] = parseTestSteps(readFileSync(p, 'utf8'));
      const matches = exported?.tests.filter((x) => x.member_path === m.path || (m.test_id && x.test_id === m.test_id)) ?? [];
      // Missing or ambiguous records cannot establish this scenario's result.
      const t = matches.length === 1 ? matches[0] : undefined;
      if (t) {
        const f = t.failure;
        const detail = f?.expected || f?.actual ? `expected "${f.expected ?? '?'}", saw "${f.actual ?? '?'}"` : f?.error;
        evidence[s.id] = { status: t.status, assertion_before_rca: t.assertion_before_rca, failed_step: t.failed_step, screenshot: t.screenshot, error: detail };
      }
    }
  }
  const status = run.state.overall_status;
  const consistentExit = (status === 'passed' && run.exit_code === 0) || (status === 'failed' && run.exit_code === 1);
  const consistentMembers = status === 'passed'
    ? run.members.every((m) => m.status === 'passed')
    : status === 'failed' && run.members.some((m) => m.status === 'failed');
  const completed = run.state.done && !!run.execution_id && run.members.length > 0
    && consistentExit && consistentMembers
    && (run.overall_status === undefined || run.overall_status === status)
    && !run.state.plan_invalid && run.state.errors.length === 0;
  if (!completed) ctx.log('  Kane run was incomplete, cancelled, or inconsistent: every verdict is inconclusive');
  const outcomes = evaluate({ scenarios, members: run.members, packPresent: !!exported, completed, steps, evidence });
  for (const outcome of outcomes) if (outcome.evidence_note) ctx.log(`  ${outcome.scenario}: ${outcome.evidence_note}`);
  return { outcomes, exported };
}

/** `--match` regex for a set of scenario ids (project-relative path, file name end). */
export function matchFor(ids: string[]): string {
  const esc = ids.map((i) => i.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return `(${esc.join('|')})_test\\.md$`;
}
