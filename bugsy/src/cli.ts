#!/usr/bin/env -S npx tsx
// Bugsy CLI: scan · patch · self-check · report.
// Exit codes: 0 = Bugsy did its job (a confirmed leak is a result, not an error); 1 = Bugsy itself failed.
import { Command, Option } from 'commander';
import { findRoot, loadConfig, BugsyError } from './config.ts';
import type { Ctx } from './run.ts';
import { loadReport, writeHtml, REPORT_HTML } from './report.ts';

const program = new Command();
program
  .name('bugsy')
  .description('Security seatbelt for vibe-coded apps: OpenAI writes the authorization scenarios, Kane CLI proves the leak, the fix, and the proof.')
  .option('--no-report', 'do not wrap Kane runs with `kanehack report`')
  .option('--json', 'machine-readable output on stdout', false)
  .showHelpAfterError();

function ctx(): Ctx {
  const g = program.opts<{ report: boolean; json: boolean }>();
  const root = findRoot();
  const cfg = loadConfig(root);
  return {
    root,
    cfg,
    report: g.report !== false && cfg.kanehack_report,
    json: !!g.json,
    log: (m: string) => {
      if (!g.json) console.error(m);
    },
  };
}

async function main(fn: () => Promise<number>): Promise<void> {
  try {
    process.exitCode = await fn();
  } catch (e) {
    const msg = e instanceof BugsyError ? e.message : (e as Error)?.stack ?? String(e);
    console.error(`bugsy: ${msg}`);
    process.exitCode = 1;
  }
}

program
  .command('scan')
  .description('generate scenarios (OpenAI), design tests (Kane), start the app, run, judge, report')
  .option('--scenarios-only', 'stop after writing requirements/authz-scenarios.md')
  .option('--use-prepared', 'skip design; copy fixtures/prepared/tests/authz/ (prints USING PREPARED TESTS)')
  .option('--skip-design', 'use the tests already in tests_dir (no design, no OpenAI)')
  .action((o) =>
    main(async () => {
      const { scan } = await import('./commands/scan.ts');
      return scan(ctx(), { scenariosOnly: o.scenariosOnly, usePrepared: o.usePrepared, skipDesign: o.skipDesign });
    }),
  );

program
  .command('patch')
  .description('patch a confirmed leak, rerun the same tests, commit only on green')
  .argument('<scenario>', 'scenario id, e.g. S2_other_reads_by_url')
  .addOption(new Option('--patcher <patcher>', 'who writes the patch').choices(['codex', 'api']).default('codex'))
  .option('--use-prepared', 'use fixtures/prepared/<S#>.patch (prints USING PREPARED PATCH)')
  .action((scenario: string, o) =>
    main(async () => {
      const { patch } = await import('./commands/patch.ts');
      return patch(ctx(), scenario, { patcher: o.patcher, usePrepared: o.usePrepared });
    }),
  );

program
  .command('self-check')
  .description('revert the patch, rerun the leak check, expect red, always restore')
  .argument('[scenario]', 'scenario id (default: the last patched finding)')
  .option('--leak-only', 'run only the leak test, not its owner control')
  .action((scenario: string | undefined, o) =>
    main(async () => {
      const { selfCheck } = await import('./selfcheck.ts');
      return selfCheck(ctx(), scenario, { leakOnly: o.leakOnly });
    }),
  );

program
  .command('report')
  .description('regenerate report.html from bugsy.report.json')
  .action(() =>
    main(async () => {
      const root = findRoot();
      const r = loadReport(root);
      const p = writeHtml(root, r);
      if (program.opts().json) console.log(JSON.stringify(r, null, 2));
      else console.log(`wrote ${REPORT_HTML} (${r.findings.length} finding(s), ${r.history.length} history entries) → ${p}`);
      return 0;
    }),
  );

await program.parseAsync(process.argv);
