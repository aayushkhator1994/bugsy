# Demo script

Alice is the main character. Every step is something a person would do or see.

## Pre-flight (15:40)

- [ ] Ledger running at commit A (vulnerable); browser tab signed in as Alice on `/invoices`
- [ ] `requirements/authz-scenarios.md` on disk (generated at C2)
- [ ] `fixtures/prepared/tests/authz/` and `fixtures/prepared/S2.patch` exist
- [ ] `bugsy.report.json` from C3 present; `report.html` open in a second tab
- [ ] `git status` clean; `kanehack status` shows the afternoon's runs VERIFIED
- [ ] Terminal 18 pt, half screen; browser other half
- [ ] Dry-run timings: scan ____ · patch ____ · self-check ____

## Table demo (≤ 6 min)

**Open (15 s).** "This is Alice. She invoices her clients with Ledger. Ledger was built this morning by a coding agent from a one-page PRD."

**1. The leak, by hand (20 s, live).** In Alice's browser tab, type `/invoices/4`. Bob's $4,000 invoice to Umbrella appears. "The PRD never said she couldn't. So nobody tested it. This is how vibe-coded apps leak."

**2. The rule (30 s, prepared).** `cat requirements/authz-scenarios.md`. "We gave Bugsy one sentence: Alice owns 1 to 3, Bob owns 4 to 6, nobody sees anyone else's. OpenAI turned it into three scenarios. Every leak check has a control: Alice must still open her own invoice."

**3. Kane confirms it (90 s, live).** `bugsy scan --use-prepared`. While Kane runs: "Kane signs in as Bob, opens his invoice, signs out, signs in as Alice, opens the same URL, expects Invoice not found." On the verdict: "Leak confirmed. Here's the screenshot of Alice's browser with Bob's invoice. The control passed, so this is a leak, not a broken app. The hub just recorded a suspected defect."

**4. Codex fixes it (2 min, live).** `bugsy patch S2_other_reads_by_url`. "Codex reads Kane's failure and the route. Four lines: check the owner, 404 otherwise." Show the diff. "Applied. Restarted. Same three scenarios." On green: "Alice denied. Alice still sees her own. Committed. The hub records the fix as re-verified on a new commit."
If the diff fails validation or passes 2 min: "Using the prepared patch" (Bugsy prints it).

**5. Does the test actually test anything? (45 s, live).** `bugsy self-check`. "Revert the patch, rerun. Red. Restore. The scenario detects the leak; it's not decorative."

**6. Receipts (30 s, prepared).** `report.html`: the finding, the diff, the before/after Kane ids, the self-check. `git log -3`.

**Close (20 s).** "Three things you don't get elsewhere: the input is a rule, not payloads. Every denial has an owner control, so a fix that breaks the app fails. And the seatbelt checks itself. Built with OpenAI, tested with Kane CLI."

Expected questions:
- *Isn't this just an IDOR scanner?* Scanners send payloads. Bugsy starts from your ownership rule, pairs every denial with a control, and proves its own tests by reverting the fix. And it tests through the UI, with screenshots.
- *Did you plant the bug?* Yes, commit A ships without the check, and we say so. It's the bug the PRD invites.
- *What if Codex's patch is wrong?* It only commits when the leak scenario passes and the owner control passes. "Deny everyone" fails.
- *Any app?* Not today. Ledger, three scenarios, one browser.

## Video (2–4 min, voiceover)

| Time | On screen | Voiceover |
|---|---|---|
| 0:00–0:25 | Alice's browser, `/invoices/4`, Bob's invoice | "Alice invoices clients with Ledger. An agent built it from a one-page PRD. The PRD never said she can't see Bob's invoices. So she can." |
| 0:25–0:50 | `authz-scenarios.md` | "We gave Bugsy one sentence about who owns what. OpenAI wrote three scenarios, each with an owner control." |
| 0:50–1:30 | `bugsy scan`, Kane running, LEAK CONFIRMED, screenshot | "Kane runs them in a real browser. Bob, then Alice, same URL. Leak confirmed, with a screenshot." |
| 1:30–2:30 | `bugsy patch`, the diff, rerun green | "Codex patches the server check from Kane's failure. Same scenarios, patched app. Denied. Owner still fine. Committed." |
| 2:30–3:00 | `bugsy self-check` red then restored | "Revert the patch, rerun. Red. The test detects the leak." |
| 3:00–3:30 | `report.html`, Proof tab | "Suspected defect, re-verified fix, both on the hub. Built with OpenAI, tested with Kane CLI. Repo below." |
