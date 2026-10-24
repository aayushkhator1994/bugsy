# Launch brief

Format from `$hack-gtm`'s template. The `key: value` lines feed its video script. TODO items are filled after the runs exist; never invent numbers.

project: Bugsy
pitch: A security seatbelt for vibe-coded apps. One sentence about who owns what becomes two-account browser checks, a confirmed leak, a Codex patch, a verified fix, and a self-check that proves the tests work.
hook: Alice can read Bob's invoice. The app's tests are green, because nobody wrote the rule down.
problem: Teams shipping with coding agents get apps that pass every test in the PRD and still leak one user's data to another, because the PRD never stated who owns what. Reported incidents of AI-built apps exposing user records had passing test suites.
who: Engineering lead or solo founder shipping with Codex or another coding agent
solution: Write the ownership rule in one sentence. OpenAI turns it into scenarios, each paired with an owner control. Kane CLI reproduces the leak in a real browser. Codex patches the server check. Kane reruns the same scenarios, then Bugsy reverts the patch to prove the tests detect the leak.
demo: TODO (Alice's browser on Bob's invoice, bugsy scan LEAK CONFIRMED, the Codex diff)
demo_narration: Alice opening Bob's invoice by URL, Kane confirming it with a screenshot, Codex's four-line patch, and the rerun going green.
why: Before, a green suite said nothing about what Alice could see. After, the rule is written, tested in a browser, fixed on the server, and the test is proven to catch a regression.
openai: OPENAI_MODEL (TODO exact id) via the Responses API for scenario generation with strict JSON output; Codex CLI for the server-side patch from Kane's failure record.
openai_narration: We used TODO-model through the Responses API to turn one ownership sentence into browser scenarios, and Codex to write the server patch from what Kane saw.
fix: TODO (the exact diff Codex produced for routes/invoices.ts, and the Kane run ids before and after)
hero: TODO (screenshot of Alice's browser showing Bob's invoice, or report.html)
ship_url: TODO
deck_url: TODO
credits: Built with OpenAI, tested with Kane CLI. Kane CLI Hack Day SF, 24 Oct 2026.

## Description

Bugsy checks one thing most vibe-coded apps never test: can one user see or change another user's records? You give it the app, two test accounts and the ownership rule in plain English. OpenAI writes the scenarios, each with an owner control so a broken app can't pass as a secure one. Kane CLI runs them in a real browser and confirms the leak with a screenshot. Codex patches the ownership check on the server. Kane reruns the unchanged scenarios on the patched commit. Then Bugsy reverts the patch and reruns, so you know the test would catch the leak if it came back.

## Who is it for

Anyone whose app was built from a short spec by an agent. If the spec didn't say who owns what, the app probably doesn't check.

## How we used OpenAI

Responses API with strict JSON schema, model TODO, for scenario generation: input is the ownership rule, the route list and account labels; output is scenarios with steps, expected text and a paired control, rendered to `requirements/authz-scenarios.md` and ingested by Kane. Codex CLI (`codex exec`) for the patch: input is Kane's failure record, the screenshot and the route source; output is a unified diff that Bugsy validates and applies only if the rerun passes. Every call logged with the key redacted.

## How we used Kane CLI

- Commands actually ran: TODO after C1 (`context ingest`, `context review --approve`, `design tests --max 1`, `testrun run tests/authz --parallel 1 --no-adaptive-heal --bug-detection off --agent`, each through `kanehack report`)
- What the tests asserted: S1 Alice opens her own invoice and sees Initech; S2 Alice opens Bob's invoice URL and must see "Invoice not found" with no Umbrella; S3 Alice's list shows only her clients
- What failed, and what you changed: S2 failed on commit A at the denial step; Codex added the owner check in `app/src/routes/invoices.ts` (TODO diff); S1–S3 passed on commit B
- How many runs before the pass: TODO
- Evidence packs: on the hack hub; redacted exports in `evidence/`

## Links

- Repo and submitted SHA: https://github.com/aayushkhator1994/bugsy · SHA TODO
- Demo URL: run command `npx bugsy scan`
- Ship Page: TODO
- Deck: TODO
- Screenshots or screen recording: TODO

## Team

| Name | Role on the project | X | LinkedIn | Posting? |
|---|---|---|---|---|
| Aayush Khator | everything | TODO | TODO | yes |

## Voice notes

Short sentences. Say what ran and what it found. Alice and Bob by name. No "game-changer", no "revolutionary". US spelling.
