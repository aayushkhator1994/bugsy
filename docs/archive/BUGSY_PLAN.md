> **Superseded by [BUGSY_SPEC.md](BUGSY_SPEC.md)** (reviewed 2026-10-24 12:45). Kept for history.

# Bugsy — Build Plan

> **One line:** An AI agent wrote your app *and* your tests. Who checks the tests?
> Bugsy breaks your app on purpose, runs your Kane CLI suite against every broken copy, and tells you which bugs got through. Then the agent closes the gaps and Kane proves it.

Event: Kane CLI Hack Day SF (TestMu AI × OpenAI), 2026‑10‑24. Hashtag `#KaneCLIHackDay`. Tag `@kane_cli` on X and TestMu AI on LinkedIn.

This document is the single source of truth for whoever codes it. Read all of it before writing code. Sections 11–13 are the handoff: prompts and task splits.

---

## 0. Hard constraints (from the rules — miss one and you can't place)

| Gate | What it means for us |
|---|---|
| All code written today | Repo created at kickoff. No pre-written code copied in. Libraries/templates OK. |
| **OpenAI API used in the build** | Bugsy calls OpenAI for (a) mutation generation, (b) gap analysis / new test proposal, (c) report narrative. `OPENAI_API_KEY` comes from env. Never commit it. |
| **Kane CLI used in the build** | Kane is the grader inside the product *and* the test runner for the demo app. Every run leaves an evidence pack. |
| Public repo | GitHub, public from the first commit. |
| Kane run report + evidence pack attached | Commit `.testmuai/evidence/*.evidence` for the key runs (first red, the green rerun, the final matrix) and link them in README + submission. |

Key times: **12:00 idea locks · 2:00 mid-eval (feedback only) · 4:00–5:00 scored eval at table (must run live) · 5:00–6:00 content hour · 6:00 submission locks · 6:00–7:00 top-7 demos.**

---

## 1. Storyline (this is the pitch, the video script, and the blog in one)

1. **The setup.** Everyone now ships with coding agents. The agent writes the feature, then writes the E2E tests, then says "all green." HN this week: *"I just approve PRs, because I have to"* (618 pts), *"AI agents generate more code, not more software"* (365 pts). Lovable shipped 170 apps where one user could see another's data. The tests were green.
2. **The question.** Green means the tests passed. It doesn't mean the tests would *notice* if something broke. Coverage tells you a test *exists*. Nothing tells you a test *works*.
3. **The idea.** Mutation testing exists for unit tests (Stryker, PIT). It has never existed for AI-driven browser tests. Bugsy plants realistic AI-style bugs in your app, one at a time, runs your Kane suite against each one, and scores: **"Your tests caught 2 of 6 bugs. The data leak got through."**
4. **The loop.** For every missed bug, the agent reads what Bugsy found, designs the missing test through Kane, reruns, and the score climbs: 2/6 → 6/6. Every step is a commit with Kane's execution id in it. Red, then green, with receipts.
5. **The close.** Kane proves your app works. Bugsy proves your tests would tell you if it didn't. Open source, works on any Kane suite, `npx bugsy run`.

**Tagline options:** "Trust, but mutate." / "Who tests the tests?" / "Green isn't proof."

---

## 2. What we demo

### 2.1 Table demo at 4:00 (scored, must be live, ≤ 5 min)

Pre-state: demo app running, Kane suite committed (4 tests), full mutant matrix already run during 2–4pm and committed. One terminal, one browser.

1. `cat bugsy.report.json | jq .summary` → shows the **pre-baked** score from the morning: `caught 2/6`. Point at the two misses: `leak_cross_tenant` and `cart_total_rounding`.
2. **Live:** `bugsy run --mutant leak_cross_tenant` → Bugsy starts the app with the bug planted, runs the Kane suite headless (`testrun run --parallel 4`), prints the per-test verdict. All green. Bug survived. Show Kane's evidence screenshot: user B's invoice visible to user A — and the suite didn't care.
3. **Live:** `bugsy fix leak_cross_tenant` → OpenAI reads the mutant description + existing tests + Kane evidence, proposes the missing acceptance criterion ("a user must not see another user's invoice by URL"), writes it to `requirements/addendum.md`, calls `kane-cli context ingest` + `kane-cli design tests`, commits the new `_test.md`. (Pre-generated fallback test exists if this takes too long — see §9.)
4. **Live:** `bugsy run --mutant leak_cross_tenant` again → new test goes **red** on the mutant (that's the point: it caught the bug), `bugsy run --mutant none` → suite **green** on the clean app. Score now 3/6 (or 6/6 if the morning loop finished).
5. Open `report.html`: the scorecard grid (mutants × tests, caught/missed), the before/after score, the Kane execution ids. Show `git log --oneline`: each fix commit cites the Kane run that drove it.
6. One sentence on the open-source future: works on any Kane suite, any app with a start command.

### 2.2 Demo video (2–4 min, voiceover, recorded at 5:00)

Same beats as the table demo, trimmed:
- 0:00–0:30 The problem (storyline §1.1–1.2), one slide + a screenshot of the HN thread.
- 0:30–1:00 `bugsy run` matrix result: 2/6, the leak got through, Kane screenshot of the leak.
- 1:00–2:00 `bugsy fix` → new test designed through Kane → red on mutant → green on clean app.
- 2:00–2:40 report.html scorecard before/after, `git log` showing the agent↔Kane loop.
- 2:40–3:00 What Kane caught, what Bugsy adds, what's next. Repo link.

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ bugsy (Node/TypeScript CLI)                                       │
│                                                                      │
│  plan ──► OpenAI: propose mutants ──► mutants.json                   │
│                                                                      │
│  run  ──► for each mutant:                                           │
│            start app (BUG=<id>, port 3000)                           │
│            kane-cli testrun run tests/*_test.md --parallel 4 --agent │
│            parse NDJSON + evidence pack result.yaml                  │
│            stop app                                                  │
│         ──► catch score ──► bugsy.report.json + report.html       │
│                                                                      │
│  fix  ──► OpenAI: read mutant + tests + evidence ──► missing AC      │
│         ──► requirements/addendum.md                                 │
│         ──► kane-cli context ingest / design tests ──► new _test.md  │
│         ──► git commit "fix(tests): catch <mutant> — kane <exec_id>" │
└──────────────────────────────────────────────────────────────────────┘
          │                                  │
          ▼                                  ▼
┌──────────────────────┐          ┌─────────────────────────────┐
│ demo app: "Ledger"   │          │ Kane CLI 0.10.0             │
│ Express + SQLite     │          │ runs tests in real Chrome   │
│ BUG=<mutant id> env  │          │ seals evidence packs        │
│ two users seeded     │          │ .testmuai/evidence/*.evid.  │
└──────────────────────┘          └─────────────────────────────┘
```

**Design decisions (don't relitigate):**
- **Mutants are an env flag, not forks or deployments.** `BUG=leak_cross_tenant npm start`. One codebase, one port (3000). Mutants run **sequentially**; tests inside a mutant run **in parallel** via `kane-cli testrun run --parallel 4`. This avoids per-mutant URL juggling and keeps `url: http://localhost:3000` fixed in every test's frontmatter.
- **Kane runs with `--no-adaptive-heal` during mutant runs.** Adaptive heal re-authors failing steps up to 3 times; on a mutant that could "heal around" the bug and mask it. Also saves credits. Clean-app runs can keep heal on.
- **Pre-written mutants are the safety net, OpenAI-generated mutants are the showpiece.** Five hand-written mutants ship in `app/src/mutants.ts`. `bugsy plan` asks OpenAI to propose more and writes them as code patches; a patch that fails to apply is skipped with a warning, never a crash.
- **Evidence is read from the pack, not scraped from the terminal.** `.testmuai/evidence/<exec_id>.evidence` is a zip; `tests/<id>/result.yaml` has the verdict per step. The NDJSON stream is used for live progress only.
- **Everything is a commit.** Each `fix` produces one commit whose message contains the Kane execution id of the run that motivated it. That's the "agent and Kane talked" evidence (9 pts).

---

## 4. Repo layout

```
bugsy/
├── README.md                     # one run command, how it works, score table, links to evidence packs
├── package.json                  # workspaces: app, bugsy
├── .env.example                  # OPENAI_API_KEY=, OPENAI_MODEL=
├── app/                          # demo app "Ledger"
│   ├── package.json
│   ├── src/server.ts             # Express, port from PORT (default 3000)
│   ├── src/db.ts                 # better-sqlite3, seeds 2 users + invoices on boot
│   ├── src/mutants.ts            # MUTANTS registry: id → description → behaviour switch
│   ├── src/routes/*.ts           # login, invoices list, invoice detail, new invoice, totals
│   └── views/*.ejs               # server-rendered HTML, stable text labels, data-testid on key nodes
├── requirements/
│   ├── ledger-prd.md             # the PRD Kane ingests → use-cases → tests
│   └── addendum-*.md             # written by `bugsy fix`
├── tests/                        # Kane-designed *_test.md (committed)
├── bugsy/                     # the CLI
│   ├── package.json              # bin: bugsy
│   ├── src/cli.ts                # commander: plan | run | fix | report
│   ├── src/openai.ts             # Responses API wrapper, structured outputs
│   ├── src/app-runner.ts         # spawn/kill app with BUG env, wait for /health
│   ├── src/kane.ts               # spawn kane-cli, parse NDJSON, locate + unzip evidence pack
│   ├── src/evidence.ts           # read result.yaml, step screenshots
│   ├── src/score.ts              # matrix + catch score
│   ├── src/report.ts             # JSON + HTML scorecard
│   └── src/fix.ts                # gap analysis → addendum → kane design → commit
├── mutants.json                  # output of `bugsy plan` (OpenAI-proposed + built-ins)
├── bugsy.report.json          # latest matrix
├── report.html                   # scorecard
├── .testmuai/evidence/           # committed packs for key runs (first red, green rerun, final matrix)
└── docs/
    ├── demo-script.md
    ├── blog.md
    └── posts.md                  # LinkedIn, X, Show HN text
```

---

## 5. Demo app: "Ledger" (tiny invoices SaaS)

Purpose: small enough to build in 60 min, realistic enough that each mutant is a bug an AI agent *would* ship.

- **Stack:** Node 20, Express, EJS server-rendered views, better-sqlite3 (in-memory, re-seeded on boot), express-session with a cookie. No React, no build step. Stable visible text so Kane assertions are crisp.
- **Users (seeded):** `alice@ledger.test` / `alice123`, `bob@ledger.test` / `bob123`. Each has 3 invoices. Alice's invoice ids 1–3, Bob's 4–6.
- **Pages:**
  - `GET /login`, `POST /login` → sets session; wrong password shows "Invalid email or password".
  - `GET /invoices` → current user's invoices, table with `Invoice #`, `Client`, `Amount`, `Status`; footer shows **"Total outstanding: $X.XX"** (sum of unpaid).
  - `GET /invoices/:id` → detail page; header "Invoice #<id>", client, line items, amount, status, "Mark as paid" button.
  - `POST /invoices/:id/pay` → status → Paid, redirect to detail with banner "Invoice #<id> marked as paid".
  - `GET /invoices/new`, `POST /invoices` → form: client (required), amount (> 0), due date; validation errors shown inline ("Amount must be greater than 0"); success redirects to the new invoice detail.
  - `GET /health` → `{ok:true, bug:<BUG or "none">}` (used by app-runner and shown on the page footer in small text so the demo audience can see which mutant is live).
- **Mutant hook:** every route reads `process.env.BUG` through `mutants.ts`; `isBug('leak_cross_tenant')` returns true only for that mutant. Mutant code lives inline next to the correct code with a comment `// MUTANT: <id>` so it's easy to read and easy for the OpenAI-generated patches to follow the same pattern.

---

## 6. Mutant catalogue

Built-in (hand-written, always available). Each is a bug class that AI-generated code commonly ships.

| id | Bug | What a good suite needs to catch it |
|---|---|---|
| `leak_cross_tenant` | `GET /invoices/:id` skips the `owner_id = session.user` check. Alice can open `/invoices/4` (Bob's). | A negative test: log in as Alice, open Bob's invoice URL, expect "Not found"/403, not Bob's data. |
| `cart_total_rounding` | "Total outstanding" sums with float math and `toFixed(0)`, or omits the last unpaid invoice (off-by-one in the loop). | An assertion on the exact total value, not just "a total is visible". |
| `pay_no_persist` | `POST /pay` shows the success banner but never writes to DB; a reload shows Unpaid. | Mark paid → reload/revisit → still Paid. |
| `validation_inverted` | `amount <= 0` check inverted: negative amounts accepted, positive rejected. | Submitting amount 0 / −5 shows the error; submitting 120 succeeds. |
| `login_any_password` | Password check compares email only. | Wrong password must show "Invalid email or password". |
| `none` | Clean app. Control run; must be all green. | — |

OpenAI-generated mutants (`bugsy plan`): the model gets the app source (routes + views, ~400 lines), the catalogue above, and the instruction "propose 3 more single-line or single-block bugs an AI coding agent would plausibly ship; realistic, silent (no crash), user-visible only through the UI." Output: JSON `{id, title, description, bug_class, patch (unified diff against app/src)}`. The runner applies the patch in a temp git worktree; if `git apply --check` fails, the mutant is skipped and listed under `skipped` in the report. Keep OpenAI mutants ≤ 3 so the matrix stays runnable.

---

## 7. Test suite (must come from Kane's assurance flow, not hand-written)

The rubric rewards "assurance loop" range and the Kane skill is explicit: tests come from `context ingest → design tests`, never written by hand.

1. `requirements/ledger-prd.md` — a ~40-line PRD written at build time: login, invoice list with total, invoice detail, mark as paid, create invoice with validation. **Deliberately say nothing about cross-tenant access** so the initial suite plausibly misses the leak. That's the story.
2. `kane-cli context ingest requirements/ledger-prd.md --mode agent` → use-cases. Approve with `kane-cli context review --approve <uc...>`.
3. `kane-cli design tests --use-case <uc> --mode agent --max 2` for each use-case → `tests/*_test.md`. Target **4 tests** total: login, list + total, mark paid, create invoice.
4. Frontmatter on every test: `url: http://localhost:3000`, `headless: true`, `tags: [ledger]`, `mode: testing`, `max_steps: 25`.
5. Author them once on the clean app: `kane-cli testrun run tests/ --parallel 4 --agent < /dev/null`. Green. Commit the pack. (This is the baseline; replay from cache afterwards is cheaper.)

**Fallback (only if the assurance flow blocks for > 20 min):** hand-write the four `_test.md` files following `references/testmd.md`. Note it honestly in the README ("tests were hand-authored because …") — scope honesty is worth 6 pts, pretending is worth 0.

---

## 8. Bugsy CLI — command spec

All commands: `--app-dir ./app`, `--tests ./tests`, `--port 3000`, `--parallel 4`, `--json` for machine output. Every `kane-cli` invocation is prefixed `KANE_CLI_USER_AGENT=bugsy`.

### `bugsy plan`
- Reads built-in mutants from `app/src/mutants.ts` (export a `MUTANTS` array with id/title/description/bug_class).
- Calls OpenAI (structured output, schema `MutantProposal[]`) with app source + catalogue → up to 3 extra mutants with patches.
- Writes `mutants.json`. Prints the table.

### `bugsy run [--mutant <id>|all] [--include-openai]`
For each mutant (default: all built-ins + `none`; `--include-openai` adds generated ones):
1. `app-runner.start({BUG: id, PORT})` → spawn `node app/dist/server.js`, poll `/health` until `bug === id` (timeout 15s).
2. `kane.testrun(testsDir, {parallel, noAdaptiveHeal: id !== 'none'})` → spawn `kane-cli testrun run <tests> --parallel N --agent --no-adaptive-heal --name "bugsy:<id>"`, stdin from `/dev/null`, stream NDJSON to a progress line, capture the `done`/final event to get the execution id and pack path. Exit code non-zero on any failing member — that is **expected** on a mutant.
3. `evidence.read(packPath)` → unzip → `tests/*/result.yaml` → per-test `{test_id, status, failed_step, screenshot_path}`.
4. `app-runner.stop()`.
5. Record `{mutant, execution_id, pack, tests: [...], caught: anyFailed}`. For `none`: `caught` is meaningless; it's the control — if any test fails on `none`, abort with "suite is red on the clean app, fix that first".

Then `score.compute()`:
- `catch_score = caught / total_mutants (excluding none)`
- per-test "kill count" = how many mutants each test caught (shows which tests are earning their keep)
- `survivors = mutants with caught === false`

Writes `bugsy.report.json`, regenerates `report.html`, prints:

```
Bugsy ▸ 6 mutants · 4 tests · Kane runs: 7 (exec ids in report)
  ✔ caught   validation_inverted     by create_invoice_test (step 4 failed)
  ✔ caught   login_any_password      by login_test (step 2 failed)
  ✘ survived leak_cross_tenant       — no test opened another user's invoice
  ✘ survived cart_total_rounding     — total asserted as "visible", never as a value
  ✘ survived pay_no_persist          — no test reloaded after paying
  ✔ caught   (openai) due_date_tz    by create_invoice_test
Catch score: 3/6 (50%).  Next: bugsy fix leak_cross_tenant
```

### `bugsy fix <mutant-id>`
1. Gather: mutant description, the diff/pattern of the mutant, all current `_test.md` contents, the evidence from the survived run (which steps passed and what they asserted), the PRD.
2. OpenAI (structured output): `{missing_acceptance_criterion, rationale, requirement_addendum_markdown, test_hint}`. The model must phrase the addendum as a *requirement* ("A signed-in user must not be able to view an invoice that belongs to another user; the page shows 'Not found'"), not as a test script.
3. Write `requirements/addendum-<mutant>.md`. Run `kane-cli context ingest requirements/addendum-<mutant>.md --mode agent`, approve the new use-case, `kane-cli design tests --use-case <uc> --mode agent --max 1` → new `tests/<name>_test.md`. Handle exit 3 (pause) by answering with `--message` using OpenAI's `test_hint`; on a second pause, fall back to the prepared test (§9).
4. Author the new test on the **clean** app (`BUG=none`), must be green. Then run it on the mutant, must be red.
5. `git add -A && git commit -m "fix(tests): catch <mutant> — Kane <exec_id_green> green on clean, <exec_id_red> red on mutant"`.
6. Print the before/after score line.

### `bugsy report`
Regenerates `report.html` from `bugsy.report.json`. HTML is self-contained: a grid (rows = mutants, cols = tests, cells = pass/fail/caught), the score big at the top, before/after if a history exists, each Kane execution id as text, thumbnails of the failing-step screenshots pulled from the packs into `report-assets/`.

---

## 9. OpenAI usage (the gate, and where it earns its keep)

- **SDK:** `openai` npm, **Responses API** (`client.responses.create`) with `text.format = { type: "json_schema", strict: true }` for every structured call. Model from `OPENAI_MODEL` env; default to the newest GPT‑5‑series model the key can reach — verify at build start with `curl -s https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY" | jq '.data[].id' | grep gpt-5`. Set the default to whatever is newest there; keep a `gpt-5.1` fallback.
- **Three call sites, all logged to `bugsy/.calls/` as JSON (prompt + response) so the judges can see OpenAI was real:**
  1. `plan`: propose mutants + patches.
  2. `fix`: gap analysis → requirement addendum + test hint.
  3. `report`: one-paragraph narrative per survivor ("why this bug class matters, which real-world incident it resembles") used in `report.html` and the blog.
- **Prepared fallback (built before 4pm, not shown unless needed):** `fixtures/fallback-tests/leak_cross_tenant_test.md` etc. If `fix` can't complete the Kane design flow live within ~3 min, copy the fallback in, say so out loud ("design flow paused, using the pre-designed test from this morning"), and continue. Honesty beats a stalled demo.
- **Never** put the key in a commit, a screenshot, or the video. `.env` is gitignored; `.env.example` has placeholders.

---

## 10. Scoring map (why each piece exists)

| Rubric item | Pts | What in Bugsy earns it |
|---|---|---|
| Proof, not presence | 8 | Survivor run (green on a broken app) → new test red on mutant → green on clean. Packs committed. |
| Agent and Kane talked | 9 | `fix` reads Kane evidence, designs a test through Kane, commits with exec ids. `git log` shows it. |
| Range | 8 | assurance loop (ingest/design/cover), committed `_test.md`, `testrun --parallel`, headless, Kane as the grader inside the product. |
| Problem real & nameable | 7 | "Green tests that wouldn't notice a data leak." Lovable incident, HN threads. |
| Originality | 10 | Mutation testing for AI browser tests. No prior art. Kane `cover` measures existence; Bugsy measures effectiveness. |
| Needs verification | 8 | The product is about verification; the leak mutant is exactly the bug an untested agent ships. |
| Works live end to end | 12 | Table demo runs `run` + `fix` live. |
| Scope honesty | 6 | README states what's built-in vs generated, what's fallback. |
| Repo quality | 7 | `npm run demo` one-liner, tests dir, packs, report.html. |
| GTM | 25 | §12. |

---

## 11. Timeline and ownership (3 coding agents + you)

| Time | You | Agent A | Agent B | Agent C (Codex/OpenAI) |
|---|---|---|---|---|
| 11:00–11:15 | `git init`, public repo, `kane-cli login --oauth`, `kane-cli balance`, verify OpenAI model list, `.env` | read this doc | read this doc | read this doc |
| 11:15–12:00 | write `requirements/ledger-prd.md`; submit idea by 12:00 | **Ledger app** (§5) + built-in mutants (§6) | **bugsy `run`** skeleton: app-runner, kane.ts (NDJSON + pack), evidence.ts, score.ts | **openai.ts** + `plan` command + `report.html` template |
| 12:00–1:00 | run assurance flow → 4 tests (§7); first clean green run; commit pack | finish app, `/health`, seed data | wire `run` end to end on `none` + one mutant | `fix` command (§8) |
| 1:00–2:00 | run full matrix → first `bugsy.report.json` (expect ~2/6). Commit. | fix whatever the matrix exposes in the app | `report` command, HTML scorecard | prepared fallback tests (§9) |
| 2:00 | **Mid-eval:** show the 2/6 matrix and the leak screenshot. Ask the judges what they'd want to see at 4. | | | |
| 2:00–3:30 | run `fix` for 2–3 survivors; commit each; re-run matrix → score climbs | polish, README | stability: timeouts, retries, skipped-patch handling | blog draft, deck |
| 3:30–4:00 | **Dry run the table demo twice.** Pre-start the app. Pin terminal font size. | | | |
| 4:00–5:00 | Scored eval at table (§2.1) | | | |
| 5:00–6:00 | Record video, post everything (§12), final commit, submission with pack links | | | |

Credits budget: each `testrun` of 4 tests ≈ 4 Kane runs. Matrix = 6 mutants + control = ~28 runs; plus fixes ≈ 10; plus demo ≈ 10. Check `kane-cli balance` at 11:00; if under ~60 runs, drop to 4 mutants and 3 tests.

---

## 12. GTM assets (25 pts — plan now, execute 5–6pm)

- **Demo video (7):** §2.2 script, voiceover by you, screen-record with QuickTime, no editing beyond trim. Upload to YouTube unlisted + link.
- **Deck (4):** 6 slides: Problem → Idea → How it works (architecture) → What Kane caught (screenshot) → Score before/after → What's next. Google Slides, shared link.
- **Blog (4):** dev.to. Title: *"Your AI wrote the tests. I planted 6 bugs to see if they'd notice."* Sections: the incident that motivated it, how Bugsy works, the matrix, what Kane caught, the fix loop, try it. Embed the evidence screenshots and the exec ids.
- **LinkedIn (3):** tag TestMu AI, `#KaneCLIHackDay`, the score screenshot, repo link.
- **X (3):** thread, tag `@kane_cli`, 4 posts: hook / the leak screenshot / the score climbing / repo.
- **Show HN (2):** *"Show HN: Bugsy – mutation testing for AI-generated browser tests (Kane CLI + OpenAI)"*. First comment: the story in 5 lines, link to the report.
- **Reach bonus (2):** message 3–4 friends at 5:30 to reply/repost.

Draft all text in `docs/posts.md` during the 2–3:30 window; at 5pm it's paste-and-post.

---

## 13. Handoff prompts for the coding agents

Paste this doc path plus the relevant block.

**Agent A — Ledger app:**
> Build `app/` per §5 and §6 of `BUGSY_PLAN.md`. Express + EJS + better-sqlite3, TypeScript, `npm run build && PORT=3000 BUG=none npm start`. Implement all five built-in mutants behind `process.env.BUG` with `// MUTANT: <id>` comments, export `MUTANTS` metadata from `src/mutants.ts`. Seed Alice and Bob with 3 invoices each. Stable visible text exactly as specified. `/health` returns the active bug. Verify every mutant manually with curl before handing off. Do not write any tests.

**Agent B — Bugsy runner:**
> Build `bugsy/` commands `run` and `report` per §8 of `BUGSY_PLAN.md`. Spawn the app with `BUG` env and wait on `/health`; spawn `KANE_CLI_USER_AGENT=bugsy kane-cli testrun run <tests> --parallel N --agent --no-adaptive-heal --name bugsy:<id>` with stdin from /dev/null; parse NDJSON for progress and the final execution id; locate the pack in `.testmuai/evidence/`, unzip it, read `tests/*/result.yaml` for verdicts. Compute the matrix and catch score, write `bugsy.report.json` and a self-contained `report.html`. Read `~/.agents/skills/kane-cli/references/testrun.md`, `evidence.md`, `parsing.md` first. A failing testrun exit code is expected on mutants; only `none` failing is fatal.

**Agent C (Codex) — OpenAI integration:**
> Build `bugsy/src/openai.ts`, the `plan` command and the `fix` command per §8 and §9 of `BUGSY_PLAN.md`. Use the Responses API with strict JSON schema outputs, model from `OPENAI_MODEL`. `plan` proposes ≤3 realistic silent bugs as unified diffs and validates them with `git apply --check` in a temp worktree. `fix` turns a survived mutant into a requirement addendum, drives `kane-cli context ingest` / `context review --approve` / `design tests --mode agent` (handle exit 3 pauses with `--message`), authors the new test on the clean app, verifies it's red on the mutant, commits with both Kane execution ids. Log every OpenAI call to `bugsy/.calls/`. Never read or print the API key.

**You (owner):** PRD, assurance flow, matrix runs, commits, demo, GTM. You are the only one who runs Kane against real credits; agents run Kane only when you say.

---

## 14. Risks and fallbacks

| Risk | Mitigation |
|---|---|
| Kane credits run out | Check balance at 11:00. Cut mutants to 4, tests to 3. Replay from cache is cheaper than authoring; author once on `none`. |
| Assurance flow pauses / stalls | Answer pauses with `--message`; after 20 min, hand-write tests and say so in README. |
| Adaptive heal masks a mutant | `--no-adaptive-heal` on mutant runs (already in spec). |
| OpenAI patch doesn't apply | Skip with warning; built-ins carry the demo. |
| `fix` too slow live | Prepared fallback test, announced honestly. |
| Suite red on clean app | Abort with a clear message; fix the app or the test before any mutant run. |
| Demo machine flakiness | Dry-run twice at 3:30; app pre-started; terminal + browser pre-arranged; `bugsy.report.json` from the morning already on disk so step 1 of the demo never depends on live runs. |

---

## 15. Definition of done (check before 6:00)

- [ ] Public repo, first commit after 11:00, all code from today
- [ ] `npm run demo` in README runs the matrix on built-in mutants end to end
- [ ] `tests/` has ≥ 4 Kane-designed `_test.md` + the ones added by `fix`
- [ ] `.testmuai/evidence/` has: baseline green pack, a survivor pack, a red-on-mutant pack, the green rerun, the final matrix
- [ ] `bugsy.report.json` + `report.html` committed, score before and after
- [ ] `git log` shows ≥ 2 `fix(tests): catch … — Kane <id>` commits
- [ ] `bugsy/.calls/` shows real OpenAI calls (key redacted)
- [ ] README: problem, run command, how it works, score table, what's built-in vs generated vs fallback, pack links
- [ ] Video, deck, blog, LinkedIn, X, Show HN posted and linked in the submission
- [ ] Kane run report attached in the team hub
