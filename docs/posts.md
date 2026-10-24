# Launch posts (drafts)

Rules applied: tag `@testmuai` and `@OpenAI` on X, company page *TestMu AI* on LinkedIn, `#KaneCLIHackDay`; "built with OpenAI, tested with Kane CLI"; every Kane claim must point at a real run. Numbers marked TODO are filled from `bugsy.report.json` after the runs; do not post with placeholders. You post these yourself.

## X thread (4 posts)

**1/**
An AI agent wrote this app and its tests. All green.
We planted a data leak. Still green.
So we built Bugsy at #KaneCLIHackDay: mutation testing for AI-written browser tests. Built with @OpenAI, tested with Kane CLI by @testmuai.
[screenshot: report.html matrix]

**2/**
How it works: plant one realistic bug, run the unchanged Kane suite, read the verdict from Kane's evidence pack. Caught, or survived.
TODO caught / TODO survived on our demo app. The survivor: Alice could open Bob's invoice.
[screenshot: probe output]

**3/**
For every survivor, OpenAI names the requirement nobody wrote ("a user must not view another user's invoice"), Kane designs a test from it, and Bugsy proves it: green on the clean app, red on the bug. Both Kane run ids go in the commit.
[screenshot: git log]

**4/**
Repo: https://github.com/aayushkhator1994/bugsy
Ship page: TODO
Coverage tells you a test exists. Catch rate tells you it would fail. You want both.

## LinkedIn

I spent today at Kane CLI Hack Day building Bugsy.

The question it answers: if an AI agent wrote your app and your tests, would those tests notice a real bug?

We planted one bug at a time in a small invoicing app (a cross-user data leak, a payment that doesn't save, a wrong total) and ran the Kane CLI suite that had been designed from the PRD. The suite caught TODO and missed TODO. The data leak survived: Alice could read Bob's invoice and every test stayed green, because the PRD never said she couldn't.

For each miss, OpenAI writes the requirement that was missing, Kane CLI designs a test from it, and Bugsy proves the test passes on the clean app and fails on the bug before committing it.

Built with OpenAI, tested with Kane CLI from TestMu AI. Repo and the full run evidence in the comments. #KaneCLIHackDay

## Show HN

**Title:** Show HN: Bugsy – mutation testing for AI-generated browser tests (Kane CLI + OpenAI)

**First comment:**
Built this today at a hackathon. The problem: coding agents write the tests as well as the code, and the tests only check what the spec said. Every unwritten requirement is an untested one.

Bugsy plants one realistic bug at a time in the app (env flag, one behaviour change each), runs the unchanged Kane CLI browser suite against it, and reads caught/survived from Kane's per-test evidence rather than the exit code. For a survivor, an OpenAI call writes the missing requirement as a PRD addendum, Kane's requirement-to-test flow designs the test, and it's committed only after it's green on the clean app and red on the bug.

Results on the demo app: TODO caught, TODO survived, catch rate TODO. The survivor that matters was a cross-tenant invoice leak.

Limits: one app today, sequential runs, a hand-picked bug catalogue. Mutation testing of E2E suites isn't new (Mutta, 2023); the AI-suite angle and the repair loop are what we added.

Repo: https://github.com/aayushkhator1994/bugsy

## Blog (dev.to) outline

**Title:** I planted bugs in an AI-built app to see if its AI-written tests would notice

1. The green that means nothing: agent writes app, agent writes tests, all pass.
2. Mutation testing in one paragraph, and why nobody does it on browser tests.
3. Ledger, the three bugs, and the PRD that never mentioned tenant isolation.
4. The matrix: what Kane caught, what survived, with the execution ids. (screenshots: report.html, probe)
5. The fix loop: the requirement OpenAI wrote, the test Kane designed, green then red. (screenshot: git log)
6. What the hub's Proof tab recorded: suspected defect, re-verified fix.
7. Honest limits, and what's next: more bug classes, any app with a start command, coverage vs catch rate side by side.
8. Built with OpenAI, tested with Kane CLI. Repo.
