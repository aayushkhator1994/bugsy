# Launch brief

Format from `$hack-gtm`'s template. The `key: value` lines feed its video script. Items marked TODO are filled after the runs exist; never invent numbers.

project: Bugsy
pitch: Mutation testing for AI-written browser tests. Plant a bug, see if your Kane suite notices, close the gap with a test Kane designs from the missing requirement.
hook: Your AI wrote the app and the tests, and they're all green. We planted a data leak and the tests stayed green.
problem: Teams shipping with coding agents get green test runs that never fail, because the tests only check what the spec said. Every unwritten requirement is an untested one. Reported incidents of AI-built apps exposing one user's data to another had passing tests.
who: Engineering lead at a small team shipping with Codex or another coding agent
solution: Bugsy plants one realistic bug at a time and runs your Kane CLI suite against it. It tells you which bugs the suite caught and which it missed. For each miss, OpenAI names the missing requirement, Kane designs the test, and Bugsy proves it green on clean and red on the bug.
demo: TODO (report.html screenshot, probe output screenshot, fix commit screenshot)
demo_narration: The matrix of planted bugs against the suite, the probe showing Alice reading Bob's invoice, and the commit that closes the gap with both Kane execution ids.
why: Before, a green suite told you nothing about what it would miss. After, you know which bugs it's blind to and you have a verified test for each one.
openai: OPENAI_MODEL (TODO: exact id) via the Responses API with strict JSON schema output. It owns gap analysis: given the bug, the PRD, the tests and Kane's evidence, it writes the requirement that was never stated. It never decides a verdict; Kane's evidence does.
openai_narration: We used TODO-model through the Responses API for one job: reading a survived bug and naming the requirement nobody wrote down. Kane turned that into the test.
fix: TODO (what the first failed Kane run on Ledger caught, and what changed; plus the tenant isolation test added through the fix loop)
hero: TODO (report.html screenshot path)
ship_url: TODO
deck_url: TODO
credits: Built with OpenAI, tested with Kane CLI. Kane CLI Hack Day SF, 24 Oct 2026.

## Description

Bugsy answers one question: would your browser tests notice a realistic bug? It takes an app and its Kane CLI suite, plants one bug at a time (a cross-user data leak, a payment that doesn't persist, a wrong total), and runs the unchanged suite against each. Verdicts come from Kane's own evidence pack, per test and per step. When a bug survives, Bugsy uses OpenAI to write the requirement that was missing from the PRD, then uses Kane's assurance flow to design a test from it, authors it on the clean app, runs it on the bug, and commits only when it's green then red.

## Who is it for

Anyone whose tests were written by an agent. Especially small teams where the PRD is short, the agent filled in the gaps, and nobody has checked whether the green suite would catch the bugs that matter.

## How we used OpenAI

Responses API, strict JSON schema outputs, model TODO. One call site in the MVP: gap analysis for a survived mutant (input: mutant description, PRD, every test, the survived run's per-test results; output: missing requirement, why current tests miss it, an addendum paragraph in the PRD's voice, a one-line hint for Kane). Opt-in second call: a one-line explanation of each caught failure from Kane's failure record, shown in the report but never used for the verdict. Every call logged, key redacted.

## How we used Kane CLI

- Commands actually ran: TODO after C1 (paste exact `kane-cli context ingest`, `context review --approve`, `design tests --max 1`, `testrun run --parallel 1 --no-adaptive-heal --bug-detection off --agent`, each through `kanehack report`)
- What the tests asserted: sign-in with wrong password shows "Invalid email or password"; list shows "Total outstanding: $1,289.99"; detail shows client, amount, status; mark as paid shows "Invoice #3 marked as paid" and survives a reload; the added test: another user's invoice shows "Invoice not found"
- What failed, and what you changed: TODO
- How many runs before the pass: TODO
- Evidence packs: on the hack hub (never in the repo); redacted exports in `evidence/`

## Links

- Repo and submitted SHA: https://github.com/aayushkhator1994/bugsy · SHA TODO
- Demo URL: run command `npm run demo`
- Ship Page: TODO
- Deck: TODO
- Screenshots or screen recording: TODO

## Team

| Name | Role on the project | X | LinkedIn | Posting? |
|---|---|---|---|---|
| Aayush Khator | everything | TODO | TODO | yes |

## Voice notes

Short sentences. Say what ran and what it found. No "game-changer", no "revolutionary", no "we're excited to announce". US spelling.
