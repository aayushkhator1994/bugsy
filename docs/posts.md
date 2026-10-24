# Launch posts (drafts)

Rules: tag `@testmuai` and `@OpenAI` on X, company page *TestMu AI* on LinkedIn, `#KaneCLIHackDay`; "built with OpenAI, tested with Kane CLI"; every Kane claim points at a real run. TODOs are filled from `bugsy.report.json`; don't post with placeholders. You post these yourself.

## X thread

**1/**
Alice can read Bob's invoice. The app's tests are green.
An agent built it from a one-page PRD, and the PRD never said who owns what.
We built Bugsy at #KaneCLIHackDay: a security seatbelt for vibe-coded apps. Built with @OpenAI, tested with Kane CLI by @testmuai.
[screenshot: Alice's browser on /invoices/4]

**2/**
One sentence in: "Alice owns 1–3, Bob owns 4–6, nobody sees anyone else's."
OpenAI turns it into browser scenarios, each paired with an owner control.
Kane CLI runs them as Bob, then as Alice. Leak confirmed, with a screenshot. Run TODO.
[screenshot: bugsy scan output]

**3/**
Codex reads Kane's failure and patches the server check. Four lines.
Same scenarios rerun on the patched commit: Alice denied, Alice still sees her own. Run TODO.
Then we revert the patch and rerun. Red again. The test isn't decorative.
[screenshot: diff + self-check]

**4/**
Repo: https://github.com/aayushkhator1994/bugsy
Ship page: TODO
Rule in, not payloads. Every denial has a control. The seatbelt checks itself.

## LinkedIn

Today at Kane CLI Hack Day I built Bugsy, a security seatbelt for vibe-coded apps.

The problem is simple and common. A coding agent builds an app from a short PRD. The PRD never says "a user must not see another user's records", so the agent never writes the check and never tests it. Everything is green, and Alice can type a URL to read Bob's invoice.

Bugsy takes one sentence about who owns what. OpenAI turns it into two-account scenarios, each with an owner control, so a fix that breaks the app can't pass as secure. Kane CLI runs them in a real browser and confirmed the leak with a screenshot (run TODO). Codex patched the ownership check on the server. Kane reran the same scenarios on the patched commit and they passed (run TODO). Then Bugsy reverted the patch and reran, and the scenario went red again, which is how we know the test actually tests something.

Built with OpenAI, tested with Kane CLI from TestMu AI. Repo in the comments. #KaneCLIHackDay

## Show HN

**Title:** Show HN: Bugsy – a security seatbelt for vibe-coded apps (OpenAI + Kane CLI)

**First comment:**
Built today at a hackathon. The itch: agent-built apps pass every test in the PRD and still let one user read another's records, because the PRD never said who owns what.

Bugsy takes the ownership rule as one English sentence plus two test accounts. OpenAI (Responses API, strict JSON) turns that into browser scenarios; every leak check is paired with an owner control, so "deny everyone" can't pass. Kane CLI designs and runs the tests in a real Chrome, signing in as Bob, then Alice, and confirmed the leak with a screenshot. Codex writes the server-side patch from Kane's failure record. The same scenarios rerun on the patched commit. Then Bugsy reverts the patch and reruns, so you know the test detects the leak.

On the demo app: TODO scenarios, TODO leak confirmed, patched in `routes/invoices.ts`, re-verified on commit TODO, self-check red.

Limits: one app, three scenarios, sequential, one browser. Not a scanner; it checks the rule you state.

Repo: https://github.com/aayushkhator1994/bugsy

## Blog (dev.to) outline

**Title:** Alice could read Bob's invoice, and every test was green

1. Ledger: an agent, a one-page PRD, and the sentence nobody wrote.
2. The leak by hand: `/invoices/4`.
3. One sentence of rule → OpenAI scenarios with controls (paste the generated doc).
4. Kane confirms it in a browser: the failing step, the screenshot, the run id.
5. Codex's patch, the rerun on commit B, the run id.
6. The self-check: revert, red, restore. Why this is the part scanners skip.
7. What the hub's Proof tab recorded.
8. Limits and next: write scenarios, any app with a start command. Built with OpenAI, tested with Kane CLI. Repo.
