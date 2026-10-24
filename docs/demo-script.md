# Demo script

Two versions: the table demo at 16:00 (scored, live) and the 2–4 minute video with voiceover (recorded 17:00).

## Pre-flight (15:30)

- [ ] App **not** running; `lsof -i :3000` empty
- [ ] `bugsy.report.json` from the 14:30 matrix on disk; `report.html` open in a browser tab
- [ ] Terminal font 18 pt, dark theme, window half screen; browser other half
- [ ] `kane-cli balance` noted; `kanehack status` shows the morning's runs as VERIFIED
- [ ] `fixtures/prepared/leak_cross_tenant_test.md` exists (fallback)
- [ ] Dry-run steps 2–4 twice; write the measured time here: ____ min

## Table demo (≤ 6 min)

**Open (20 s).** "Coding agents write the app and the tests, then say all green. Bugsy checks whether those tests would notice a real bug. We planted bugs in an app and ran its Kane suite against each one."

**1. The morning's matrix (30 s, prepared).**
`jq .summary bugsy.report.json` then the `report.html` tab.
"Three planted bugs, four Kane tests designed from the PRD. Caught one, missed two. Every row is a Kane execution id, you can open the packs on the hub."

**2. Prove the bug is real (40 s, live).**
`bugsy probe leak_cross_tenant`
"Clean app: Alice opens Bob's invoice, gets 404 Invoice not found. Mutant: 200, and there's Umbrella, four thousand dollars. Alice just read Bob's invoice."

**3. The suite is blind to it (90 s, live).**
`bugsy run --mutants leak_cross_tenant`
While Kane runs: "Same four tests, same settings, healing off so Kane can't paper over it. Watch them pass."
On the verdict: "Survived. Green on a leaking app. The PRD never said a user can't see another user's invoice, so the agent never tested it. That's how AI-built apps ship data leaks with green CI."

**4. Close the gap (2–3 min, live).**
`bugsy fix leak_cross_tenant`
"OpenAI reads the bug, the PRD and the tests and writes the requirement nobody wrote: a user must not view another user's invoice. Kane designs a test from that. Bugsy authors it on the clean app, green. Runs it on the mutant, red at the Invoice not found assertion. Commits. Replays the suite at the new commit, green again, so the hub records the fix as re-verified."
If it pauses twice or passes 3 min: "Design paused, using the test we generated this morning" (Bugsy prints `USING PREPARED TEST`).

**5. Receipts (30 s, prepared).**
`git log --oneline -5`
"Each fix commit carries both Kane ids: green on clean, red on the bug."
`report.html` after `bugsy report`: the row flips to caught. "The aggregate says rerun pending until the whole matrix runs on the new suite; we don't fake the number."

**Close (15 s).** "Kane proves the app works. Bugsy proves the tests would tell you if it didn't. Open source tonight."

Questions to expect:
- *How is this different from coverage?* Coverage says a test exists for a requirement. Catch rate says the test fails when the behaviour breaks. The report shows both side by side.
- *Does the new test just check invoice 4?* No. The requirement is general, Kane designs from the requirement, and we prove it on the clean app first.
- *Prior art?* Mutation testing is decades old; Mutta did it for E2E web in 2023. New here: AI-generated Kane suites and the requirement-to-test repair loop.

## Video (2–4 min, voiceover, no editing beyond trims)

| Time | On screen | Voiceover |
|---|---|---|
| 0:00–0:25 | Title card, then a terminal with a green Kane run | "An AI agent wrote this app. It wrote the tests too. They pass. Would they fail if something broke? That's what Bugsy measures." |
| 0:25–0:50 | `report.html` matrix | "We planted three realistic bugs. Kane ran the suite against each. One caught, two survived." |
| 0:50–1:20 | `bugsy probe` output | "This survivor is a data leak. Alice opens Bob's invoice. The clean app says not found. The bug hands it over." |
| 1:20–2:00 | `bugsy run --mutants leak_cross_tenant`, Kane passing | "Same suite, same settings, all green, on a leaking app. The PRD never mentioned it, so nobody tested it." |
| 2:00–3:00 | `bugsy fix`, the requirement, Kane designing, green then red | "OpenAI names the missing requirement. Kane designs the test. Green on the clean app. Red on the bug. Committed with both Kane ids." |
| 3:00–3:30 | `git log`, `report.html` row flipped, Proof tab counters | "The hub shows it as a suspected defect and a re-verified fix. Repo link below. Built with OpenAI, tested with Kane CLI." |
