# bugsy

Security seatbelt for vibe-coded apps. Built with OpenAI, tested with Kane CLI.

Run from the repo root (the directory holding `bugsy.config.json`):

```bash
npx tsx bugsy/src/cli.ts --help        # or: npm run bugsy -- --help
```

## Commands

| Command | What it does |
|---|---|
| `bugsy scan` | OpenAI turns `ownership_rule` + `routes` into scenarios → writes `requirements/authz-scenarios.md` → Kane assurance flow (`context ingest` → `context review --approve` → `design tests --max 1` per scenario) → copies the designed tests to `tests_dir` as `<scenario>_test.md` → starts the app → `kane-cli testrun run` → redacted evidence export → §7 verdicts → `bugsy.report.json` + `report.html` → prints the findings table. |
| `bugsy scan --scenarios-only` | Stops after writing `requirements/authz-scenarios.md` (scenarios are also saved in `bugsy.report.json`). |
| `bugsy scan --use-prepared` | No OpenAI, no design: reuses the scenarios saved in `bugsy.report.json` (or the spec §3 set, printed as `USING PREPARED SCENARIOS`) and copies `fixtures/prepared/tests/authz/` into `tests_dir` (printed as `USING PREPARED TESTS`). |
| `bugsy scan --skip-design` | Like `--use-prepared` for scenarios, but runs the tests already in `tests_dir` (no design, no copy). |
| `bugsy patch <scenario> [--patcher codex\|api] [--use-prepared]` | Needs a `leak_confirmed` finding. Sends Kane's failure, the failed-step screenshot and the `source_globs` files to the patcher (130 s cap), prints the diff, `git apply --check`, applies, restarts the app, reruns the same tests. Commits **only the files the diff touched**, only when every leak check is `denied_as_expected` and every control passed; otherwise reverts the files and prints `REFUSED`. A bad, empty, slow or out-of-`app/` diff falls back to `fixtures/prepared/<S#>.patch` (printed as `USING PREPARED PATCH`). |
| `bugsy self-check [<scenario>] [--leak-only]` | `git revert --no-commit <fix commit>` → restart → run the leak test and its control (`--match`) → expect `leak_confirmed` → **always** `git revert --abort` in `finally`. Refuses to start unless `git status` is clean apart from Bugsy's own outputs (`bugsy.report.json`, `report.html`, `requirements/authz-scenarios.md`, `evidence/`); fails if any tracked file differs after restore. `--leak-only` skips the control and judges on "failed at step ≥ 1". |
| `bugsy report` | Regenerates `report.html` from `bugsy.report.json`. |

Global options: `--no-report` (do not wrap Kane with `kanehack report`), `--json` (one JSON document on stdout; narration stays on stderr).

Exit codes: `0` whenever Bugsy did its job, including when a leak is found or a patch is refused. `1` only when Bugsy itself failed (bad config, port busy, app not healthy, git refused). A run with no evidence pack is not a Bugsy failure: it yields `inconclusive` verdicts.

## How Kane is called

```
kanehack report --objective "<label>" --commit <sha> -- \
  kane-cli testrun run tests/authz --parallel 1 --no-adaptive-heal --bug-detection off --agent \
  --name "bugsy:<phase>:<sha7>" [--match <regex>]   < /dev/null
```

The `kanehack` wrapper is used when `kanehack_report` is true in the config, `--no-report` is not given, and `kanehack` is on `PATH`. `KANE_CLI_USER_AGENT=bugsy` is set. stdout NDJSON is parsed line by line; non-JSON lines and unknown event types (including the wrapper's own line) are ignored. Every run's raw stdout is saved to `bugsy/.run/<phase>-<timestamp>.ndjson` (gitignored) so real captures can replace the synthetic samples in `fixtures/kane-samples/`. The pack is read from `.testmuai/evidence/<execution_id>.evidence`.

`BUGSY_KANE_BIN` overrides the `kane-cli` binary (used for offline end-to-end tests with a fake).

## Evidence export

`evidence/<execution_id>/` holds only `run.yaml`, `failure.yaml`, and per test `<S#>/result.yaml`, `<S#>/<n>-failure.yaml`, `<S#>/<n>-screenshot.png`. Never HAR, console logs, action logs, annotated screenshots or test definitions. The seeded account passwords are replaced by `***` in the YAML files.

## Verdicts (spec §7)

Per leak check, using its `control_id`:

- `leak_confirmed`: test `failed`, `failure.step_index ≥ 1`, the failed step comes after the last sign-in step and mentions one of the scenario's quoted expected texts (e.g. `Invoice not found`), and the control `passed` in the same run.
- `denied_as_expected`: test `passed` and control `passed`.
- `inconclusive`: pack missing, test or control missing, any member `broken`/`interrupted`, control failed, failure at step 0 or without a step index, sign-in step failed, failure not at the denial step.

Verdicts come from the stream and the pack, never from the exit code.

## Layout

```
src/cli.ts            commander entry
src/config.ts         bugsy.config.json (zod)
src/types.ts          Scenario, KaneFailure, BugsyConfig, report types
src/app-runner.ts     start/stop the app, health poll, busy-port check
src/kane.ts           testrun + NDJSON parsing; assurance ingest/review/design with one resume
src/design.ts         scenarios → designed tests in tests_dir
src/evidence.ts       pack reader + redacted export
src/verdict.ts        §7 (pure)
src/run.ts            one pass: app up → Kane → app down → judge
src/commands/scan.ts  scan
src/commands/patch.ts patch
src/selfcheck.ts      self-check
src/report.ts         bugsy.report.json + report.html
src/git.ts            git wrappers (patch and self-check only)
src/prepared.ts       announced fallbacks
src/openai/           scenario generation and patch proposal (OpenAI)
```

## Tests

```bash
cd bugsy && npm test          # node:test via tsx; no network, no Kane, no OpenAI
```
