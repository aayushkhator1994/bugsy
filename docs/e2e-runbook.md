# End-to-end runbook

For the owner, in a terminal at the repo root, with `.env` filled. Each step says what to run, what you should see, and what to do if it goes wrong. Nothing here is automatic; you run each command.

Kane credits are spent by steps 3, 4 and 5 only.

## 0. Preconditions (1 min)

```bash
kane-cli whoami          # signed in
kane-cli balance         # note the number
kanehack consent status  # must say consent is on (hack-os can do this)
codex --version          # 0.164.0 or later, and `codex login` done
git status --short       # empty
lsof -i :3100            # empty
```

## 1. Scenarios only, read them (no Kane, one OpenAI call, ~20 s)

```bash
set -a; source .env; set +a
npx tsx bugsy/src/cli.ts scan --scenarios-only
cat requirements/authz-scenarios.md
```

Expect S1 (control), S2 (leak check, control S1), S3 (leak check, control S1), the exact strings `Invoice not found`, `Client: Initech`, `Client: Umbrella`, `$4,000.00`. If it differs from `fixtures/prepared/authz-scenarios.md` in substance, prefer the generated one but check the strings.

## 2. Commit the scenarios (so the next runs are on a clean tree)

```bash
git add requirements/authz-scenarios.md && git commit -m "Authorization scenarios generated from the ownership rule"
```

## 3. C1: design the tests through Kane and run them on the vulnerable app (first credits)

```bash
npx tsx bugsy/src/cli.ts scan
```

This regenerates the scenarios (one more OpenAI call; the file is overwritten, commit again afterwards if it changed), ingests them, approves the use cases, designs one test per scenario into `tests/authz/`, starts Ledger, runs the suite once (authoring, slowest run of the day), exports redacted evidence, prints verdicts.

Expect:
```
✔ S1_owner_reads_own        passed   (control)
✘ S2_other_reads_by_url     LEAK CONFIRMED  step N: expected "Invoice not found" ...
✔ S3_list_isolation         denied as expected
```

Then: `kane-cli balance` (note the cost), and look at `bugsy/.run/*.ndjson` (the real Kane output).

If the design step pauses twice or produces odd tests: rerun with `--use-prepared` (prints `USING PREPARED TESTS`). Say so in the README later.
If S1 fails: the app or sign-in is the problem, not security. Fix before going on.

Commit the tests and their recordings:
```bash
git add tests/authz evidence bugsy.report.json report.html && git commit -m "Kane tests for S1-S3; leak confirmed on the vulnerable commit"
```

## 4. Patch with Codex, rerun, re-verify (two Kane runs, cached replays)

```bash
npx tsx bugsy/src/cli.ts patch S2_other_reads_by_url
```

Expect: the diff printed (about four lines in `app/src/routes/invoices.ts`), app restarted, S1/S2/S3 all pass, a commit `fix(authz): S2_other_reads_by_url — Kane <red> red on <A>, <green> green on this commit`, then one more run on the new commit labelled `bugsy:verify …` (that's the hub's "fix re-verified").

If Codex's diff fails `git apply --check` or takes over ~2 min: rerun with `--use-prepared` (prints `USING PREPARED PATCH`).
If it prints REFUSED: the patch broke the control (S1) or didn't close the leak; the tree is restored. Read the outcomes, then try `--patcher api` or `--use-prepared`.

## 5. Self-check (one Kane run)

```bash
npx tsx bugsy/src/cli.ts self-check
```

Expect: patch reverted, app restarted, S2 fails again (and S1 still passes), tree restored, `git status --short` empty except Bugsy's report files.

## 6. Report and hub

```bash
npx tsx bugsy/src/cli.ts report
open report.html
git add -A && git commit -m "Report, evidence exports, self-check" && git push
kanehack status
```

`kanehack status` should list the runs as VERIFIED. On the Proof tab, confirm the S2 suspected defect. On the Submit tab, tick the runs and paste the SHA of the patch commit.

## Timings to write down for the demo

| Step | Measured |
|---|---|
| scan (replay, `--skip-design`) | |
| patch (Codex + two runs) | |
| self-check | |
