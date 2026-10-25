// bugsy scan: scenarios → tests → run on the current commit → verdicts → report.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { headSha, short } from '../git.ts';
import { designFromScenarios } from '../design.ts';
import { copyPreparedTests, hasPreparedTests, PREPARED_SCENARIOS } from '../prepared.ts';
import { executeRun, judgeRun, scopeScenarios, type Ctx } from '../run.ts';
import { loadReport, pushHistory, saveReport, upsertFinding, writeHtml } from '../report.ts';
import { BugsyError } from '../config.ts';
import type { Scenario, ScenarioOutcome } from '../types.ts';
import { formatPlanCheck, type PlanCheck } from '../verify/jev.ts';

export const SCENARIOS_MD = 'requirements/authz-scenarios.md';

export interface ScanOptions {
  scenariosOnly?: boolean;
  usePrepared?: boolean;
  skipDesign?: boolean;
}

async function getScenarios(ctx: Ctx, o: ScanOptions): Promise<{ scenarios: Scenario[]; planCheck?: PlanCheck }> {
  const report = loadReport(ctx.root);
  if (o.usePrepared || o.skipDesign) {
    if (report.scenarios?.length) {
      ctx.log(`  scenarios: reusing ${report.scenarios.length} from bugsy.report.json`);
      return { scenarios: report.scenarios };
    }
    ctx.log('  scenarios: USING PREPARED SCENARIOS (spec §3)');
    return { scenarios: PREPARED_SCENARIOS };
  }
  ctx.log('  scenarios: generating with OpenAI from the ownership rule…');
  const { generateScenarios } = await import('../openai/index.ts');
  const scenarios = await generateScenarios(ctx.cfg); // throws unless the code coverage check passes
  const { checkCoverage } = await import('../openai/schema.ts');
  const { runJev } = await import('../verify/jev.ts');
  const cov = checkCoverage(scenarios, ctx.cfg.must_check);
  const jev = await runJev(ctx.cfg.ownership_rule, scenarios, ctx.cfg.must_check);
  return { scenarios, planCheck: { must_check: cov.must_check, covered_by: cov.covered_by, jev } };
}

async function writeScenariosMd(ctx: Ctx, scenarios: Scenario[]): Promise<string> {
  const { renderScenariosMarkdown } = await import('../openai/index.ts');
  const p = resolve(ctx.root, SCENARIOS_MD);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, renderScenariosMarkdown(scenarios, ctx.cfg.ownership_rule));
  return p;
}

function testsPresent(ctx: Ctx, scenarios: Scenario[]): boolean {
  const d = resolve(ctx.root, ctx.cfg.tests_dir);
  if (!existsSync(d)) return false;
  const files = readdirSync(d);
  return scenarios.every((s) => files.some((f) => f.startsWith(`${s.id.split('_')[0]}_`) && f.endsWith('_test.md')));
}

export function formatOutcome(o: ScenarioOutcome): string {
  const id = o.scenario.padEnd(28);
  switch (o.verdict) {
    case 'control_passed':
      return `  ✔ ${id}passed   (control)`;
    case 'control_failed':
      return `  ✘ ${id}${o.status.toUpperCase()}   (control — results for its leak checks are inconclusive)`;
    case 'denied_as_expected':
      return `  ✔ ${id}denied as expected`;
    case 'leak_confirmed': {
      const where = o.failed_step !== undefined ? `step ${o.failed_step}: ` : '';
      const msg = o.failure_message ? `${where}${o.failure_message}` : where.replace(/: $/, '');
      return `  ✘ ${id}LEAK CONFIRMED  ${msg}${o.screenshot ? `  → ${o.screenshot}` : ''}`;
    }
    default:
      return `  ? ${id}inconclusive  (${o.reason})`;
  }
}

export async function scan(ctx: Ctx, o: ScanOptions): Promise<number> {
  const { scenarios, planCheck } = await getScenarios(ctx, o);
  if (planCheck) for (const line of formatPlanCheck(planCheck)) (ctx.json ? console.error : console.log)(line);
  const mdPath = await writeScenariosMd(ctx, scenarios);
  ctx.log(`  wrote ${SCENARIOS_MD} (${scenarios.length} scenarios)`);

  const report = loadReport(ctx.root);
  report.scenarios = scenarios;
  if (planCheck) report.plan_check = planCheck;
  if (o.scenariosOnly) {
    saveReport(ctx.root, report);
    if (ctx.json) console.log(JSON.stringify({ scenarios, file: mdPath }, null, 2));
    return 0;
  }

  // ---- tests
  let usedPrepared = false;
  if (o.usePrepared) {
    copyPreparedTests(ctx.root, ctx.cfg.tests_dir);
    console.error('USING PREPARED TESTS (fixtures/prepared/tests/authz/)');
    usedPrepared = true;
  } else if (o.skipDesign) {
    if (!testsPresent(ctx, scopeScenarios(scenarios, ctx.only))) throw new BugsyError(`--skip-design: ${ctx.cfg.tests_dir} lacks a test per scenario`);
    ctx.log(`  tests: using existing ${ctx.cfg.tests_dir}`);
  } else {
    const d = await designFromScenarios({
      root: ctx.root,
      requirementsFile: SCENARIOS_MD,
      testsDir: ctx.cfg.tests_dir,
      scenarios,
      log: ctx.log,
    });
    if (!d.ok) {
      if (!hasPreparedTests(ctx.root)) throw new BugsyError(`Kane design failed (${d.reason}) and no prepared tests exist`);
      console.error(`Kane design did not finish (${d.reason}). USING PREPARED TESTS (fixtures/prepared/tests/authz/)`);
      copyPreparedTests(ctx.root, ctx.cfg.tests_dir);
      usedPrepared = true;
    }
  }

  // ---- run
  const sha = await headSha(ctx.root);
  const scope = scopeScenarios(scenarios, ctx.only);
  if (ctx.only) ctx.log(`  --only: ${scope.map((x) => x.id).join(', ')}`);
  const run = await executeRun(ctx, { phase: 'scan', sha, label: `bugsy:scan @ ${short(sha)}`, scope: ctx.only ? scope : undefined });
  const { outcomes, exported } = judgeRun(ctx, run, scope);

  // ---- report
  for (const oc of outcomes) {
    if (oc.kind !== 'leak_check') continue;
    const prev = report.findings.find((f) => f.scenario === oc.scenario);
    // keep the original red evidence of a finding that has since been patched
    if (prev?.patch && oc.verdict !== 'leak_confirmed') continue;
    upsertFinding(report, {
      scenario: oc.scenario,
      verdict: oc.verdict as 'leak_confirmed' | 'denied_as_expected' | 'inconclusive',
      commit: sha,
      kane: {
        execution_id: run.execution_id,
        failed_step: oc.failed_step,
        screenshot: oc.screenshot,
        failure_message: oc.failure_message,
      },
    });
  }
  report.scan = { commit: sha, execution_id: run.execution_id, used_prepared_tests: usedPrepared, outcomes };
  const leaks = outcomes.filter((x) => x.verdict === 'leak_confirmed');
  pushHistory(report, {
    phase: 'scan',
    commit: sha,
    execution_id: run.execution_id,
    exit_code: run.exit_code,
    summary: leaks.length ? `leak confirmed: ${leaks.map((l) => l.scenario).join(', ')}` : outcomes.map((x) => `${x.scenario.split('_')[0]} ${x.verdict}`).join(', '),
    outcomes,
  });
  saveReport(ctx.root, report);
  writeHtml(ctx.root, report);

  // ---- print (§9)
  if (ctx.json) {
    console.log(JSON.stringify({ commit: sha, execution_id: run.execution_id, kane_exit: run.exit_code, evidence: exported?.dir ?? null, outcomes }, null, 2));
    return 0;
  }
  const state = leaks.length ? 'vulnerable' : outcomes.some((x) => x.verdict === 'inconclusive' || x.verdict === 'control_failed') ? 'inconclusive' : 'no leak found';
  console.log(`Bugsy ▸ ${report.app} @ ${short(sha)} (${state})  scenarios: ${scenarios.length}  Kane exec ${run.execution_id ?? '(none)'}`);
  for (const oc of outcomes) console.log(formatOutcome(oc));
  if (!run.pack_path) console.log(`  (no evidence pack found; Kane exit ${run.exit_code}${run.state.errors.length ? `: ${run.state.errors.join('; ')}` : ''})`);
  if (leaks[0]) console.log(`next: bugsy patch ${leaks[0].scenario}`);
  return 0;
}
