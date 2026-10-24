# Live E2E results — 2026-10-24

The ownership leak was confirmed, patched by live Codex, and re-verified. The final restored app passes all three unchanged Kane-designed scenarios. The revert proof remains **inconclusive**; the full four-part acceptance criterion has not been met.

| Phase | Kane execution | Result |
|---|---|---|
| Vulnerable app | 2c29d5fa-9e9e-4616-b253-ca2615a9d20e | S1 passed, S2 leak confirmed at denial step 5, S3 passed |
| Codex patch validation | 246f93ef-d7f5-407e-afa6-4ec540cc489c | S1/S2/S3 passed on working-tree patch |
| Committed fix verification | ac202a1e-9bf8-4bc0-8aab-c8458a2f2a59 | S1/S2/S3 passed on commit 16216a9f1252e652b10d9d9116a443f1ae993bc8 |
| First revert attempt | 29e9166a-b624-48f9-8391-ec49cb2dcff4 | Source restored; bookkeeping error stopped command; stream/evidence also disagree |
| Second revert attempt | 6173e8eb-e879-4feb-ac28-2654b42991f9 | Owner passed; S2 stream failed but sealed result broken; inconclusive; patch restored |
| Final restored app | 5c6d42cf-98be-4d8e-ab22-f0ec47f85955 | S1/S2/S3 passed |

## Evidence and integrity

- Fix commit: `16216a9f1252e652b10d9d9116a443f1ae993bc8` adds `AND owner_id = ?` to the server invoice lookup.
- Actual leak screenshot: `evidence/2c29d5fa-9e9e-4616-b253-ca2615a9d20e/S2/27-screenshot.jpg`.
- `evidence/provenance.json` records the original requirement, fixture, and test-file hashes. All are unchanged through the final run.
- Tests were designed through Kane assurance, then copied/renamed without body edits. No prepared tests or prepared patch were used.
- Scenarios reuse the owner's earlier OpenAI-generated output. Codex produced the application patch.
- Sealed original packs remain local in `.testmuai/evidence/`. Committed exports are redacted and omit HAR/console data.
- Workflow credit delta: 267.2392 Kane credits (100951.4956 to 100684.2564), including requirement extraction, design, all validation and investigation runs. This excludes earlier owner-run work.

## Remaining blocker and submission

Kane CLI 0.10.0-rc.3 is the latest npm rc checked for this run. Two replays of the unchanged S2 test on the reverted app report `failed` in the stream (and zero broken members), but `broken` in the sealed per-test result. Bugsy keeps this inconclusive under BUGSY_SPEC.md section 7; no sealed evidence was changed. Private mentor ticket: https://kaneclihack.sh/help/H-0012.

Resolve this evidence inconsistency before claiming the revert proof passed. Do not blindly rerun or weaken the verdict guard. After resolution, run `self-check`, then `scan --skip-design` on the restored app again.

Public push/publication requires the owner's review. Confirm the suspected defect and any required pack attachment on https://kaneclihack.sh/t/aayush-khator/proof, then use the Submit tab for the final human submission. A VERIFIED wrapper summary does not itself prove the sealed pack was uploaded or the defect confirmed.
