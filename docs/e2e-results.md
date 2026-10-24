# Live E2E results — 2026-10-24

The ownership leak was confirmed, patched by live Codex, and re-verified. The final restored app passes all three unchanged Kane-designed scenarios. The revert proof is **confirmed after offline re-evaluation** of the saved execution: its recorded denial assertion failed, while later RCA classified the test as an automation bug. No additional browser run or credits were needed for this re-evaluation.

| Phase | Kane execution | Result |
|---|---|---|
| Vulnerable app | 2c29d5fa-9e9e-4616-b253-ca2615a9d20e | S1 passed, S2 leak confirmed at denial step 5, S3 passed |
| Codex patch validation | 246f93ef-d7f5-407e-afa6-4ec540cc489c | S1/S2/S3 passed on working-tree patch |
| Committed fix verification | ac202a1e-9bf8-4bc0-8aab-c8458a2f2a59 | S1/S2/S3 passed on commit 16216a9f1252e652b10d9d9116a443f1ae993bc8 |
| First revert attempt | 29e9166a-b624-48f9-8391-ec49cb2dcff4 | Source restored; bookkeeping error stopped command; stream/evidence also disagree |
| Second revert attempt | 6173e8eb-e879-4feb-ac28-2654b42991f9 | Owner passed; recorded denial assertion failed; later RCA said broken. Initially inconclusive, now leak confirmed after offline re-evaluation; patch restored |
| Final restored app | 5c6d42cf-98be-4d8e-ab22-f0ec47f85955 | S1/S2/S3 passed |

## Evidence and integrity

- Fix commit: `16216a9f1252e652b10d9d9116a443f1ae993bc8` adds `AND owner_id = ?` to the server invoice lookup.
- Actual leak screenshot: `evidence/2c29d5fa-9e9e-4616-b253-ca2615a9d20e/S2/27-screenshot.jpg`.
- `evidence/provenance.json` records the original requirement, fixture, and test-file hashes. All are unchanged through the final run.
- Tests were designed through Kane assurance, then copied/renamed without body edits. No prepared tests or prepared patch were used.
- Scenarios reuse the owner's earlier OpenAI-generated output. Codex produced the application patch.
- Sealed original packs remain local in `.testmuai/evidence/`. Committed exports are redacted and omit HAR/console data.
- Workflow credit delta: 267.2392 Kane credits (100951.4956 to 100684.2564), including requirement extraction, design, all validation and investigation runs. This excludes earlier owner-run work.

## RCA explanation and submission

Kane CLI 0.10.0-rc.3 was the latest npm rc checked for this run. Two replays report `failed` in the stream but `broken` in the sealed result. The participant subsequently reported that the Kane team explained this as later RCA classification. The pack supports that explanation: recorded assertion 22 (high-level denial step 5) failed, all earlier recorded steps passed, and agent triage classified it as `automation_bug/test_data_issue`. Its explanation incorrectly treats invoice 4 as globally absent; the requirement is that Bob can read it and Alice cannot. The screenshot shows Umbrella after Alice's sign-in. The owner control passed in the same run.

Bugsy now distinguishes that later RCA classification from the correlated, recorded execution failure (see BUGSY_SPEC.md section 7). It re-evaluates the saved second revert run as `leak_confirmed`. The report retains the earlier inconclusive history entry and adds an explicit offline re-evaluation entry. The sealed pack and its `broken` status remain unchanged; this does not create a new Kane execution or change the hub's result. The final restored S1/S2/S3 run already followed that revert. No new paid replay is necessary for this evaluator-only change. A derived `bugsy-verdict.json` records the pack hash and evidence basis alongside the redacted export. Private mentor ticket: https://kaneclihack.sh/help/H-0012.

Public push/publication requires the owner's review. Confirm the suspected defect and any required pack attachment on https://kaneclihack.sh/t/aayush-khator/proof, then use the Submit tab for the final human submission. A VERIFIED wrapper summary does not itself prove the sealed pack was uploaded or the defect confirmed.
