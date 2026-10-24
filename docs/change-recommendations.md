# Bugsy: suggested changes (v2 pivot)

Prepared October 24, 2026

## Recommendation

Keep the **Bugsy** name. Align the product, review page, and demo around the security concept discussed with Aayush:

> Bugsy is a security seatbelt for vibe-coded apps. OpenAI generates authorization scenarios using two test accounts, Kane CLI checks for cross-user leaks in the browser, Codex patches the authorization bug, and Kane reruns the same scenarios to verify the fix.

This is a proposed product scope change, not just a rename or copy edit. The current `BUGSY_SPEC.md` deliberately defines a mutation-testing product, says it is not a security scanner, and defers source patches. If that pivot was intentional, reconcile the direction before updating the build contract. The recommendation below targets the security concept requested in this conversation.

## What should change

| Area | Current plan | Suggested change |
|---|---|---|
| Main question | Would the existing tests catch a planted bug? | Can one user read or change another user's private records? |
| Product input | Ledger app, mutation switches, existing Kane suite | App URL, two dedicated test accounts, and the expected ownership rule; source access for repair |
| OpenAI's role | Explain missing requirements after a mutation survives | Generate concrete two-account authorization scenarios before testing |
| Kane's role | Measure the existing suite against mutations | Execute the scenarios in authenticated browser sessions and capture evidence |
| Codex's role | No source-repair step in the specified loop | Read the failure and source, patch server-side authorization, and show the diff |
| Success | A surviving mutation becomes caught by a new test | A browser-confirmed leak fails the security test; the same test passes after the code patch |
| Report | Mutation matrix and catch rate | Findings, affected action, expected/observed access, evidence, patch, and rerun result |

## Focus the hackathon MVP

Use the existing Ledger app and seeded Alice/Bob accounts. Demonstrate one cross-user invoice-read leak end to end before expanding. Add a cross-user write scenario only after the read-and-repair loop works reliably.

Keep the ownership rule explicit: Alice can access Alice's invoices; Bob can access Bob's invoices; neither can access the other's. Have OpenAI turn that rule and the app's routes into scenarios. For example:

1. Bob signs in and opens an invoice he owns; record its URL and identifying content.
2. Alice signs in in a separate session and opens that URL.
3. Kane verifies that access is denied and Bob's invoice content is absent.
4. Kane also verifies that Alice can still open her own invoice.

For a write scenario, check both the denial and Bob's record afterward. A denial message alone does not establish that an unauthorized update was prevented.

Use separate authenticated sessions, verify the active account, and reset fixtures consistently. Show successful owner access as a control so a broken app or blanket denial cannot masquerade as a security fix.

## Replace the demo's fix loop

Suggested sequence:

**OpenAI generates scenarios → Kane exposes the leak → Codex patches authorization → Kane reruns the unchanged scenarios → report links the before/after evidence.**

The demo may start with an intentionally vulnerable app. Disclose that the bug is seeded. Once Kane detects it, make an actual source change to enforce ownership on the server, commit that patch, restart the patched app, and rerun.

Do not present switching from `BUG=leak_cross_tenant` to `BUG=none` as Codex repairing the application. That demonstrates a fixture change. Likewise, adding a test is a test-coverage improvement; it does not by itself fix the leak.

Retain the regression test after repair. If generation or execution is prepared in advance, label the prepared steps and show their real evidence.

## Update the review page

In `docs/review-page.html`:

- **#idea:** Replace the mutation-testing introduction with the proposed pitch above. Show two users and a private invoice as the central example.
- **#pieces:** Show OpenAI scenario generation, Kane's two account sessions, Codex source repair, and the evidence report. Separate URL/account inputs from source access needed for repair.
- **#experiment:** Show Bob opening his invoice, then Alice attempting the same URL. HTTP probes may help debug, but the headline proof should be the Kane browser run.
- **#verdict:** Use “leak confirmed,” “access denied as expected,” and “inconclusive.” Login failures, timeouts, or missing fixtures must not count as secure behavior. Tie each verdict to the relevant assertion and evidence.
- **#fix:** Show a real authorization patch and the same scenarios rerunning against it, including successful owner access.
- **#hub:** Describe what the actual reported runs establish. A passing run alone does not establish that authorization code was repaired; include the source diff and linked before/after runs.
- **#day / #decide:** Prioritize one verified security repair. Move payment persistence, total calculations, the broader mutation matrix, and catch-rate metrics out of the main MVP story.

## Keep these parts

Keep Kane evidence packs, screenshot references, per-test verdict parsing, explicit inconclusive outcomes, reproducible fixtures, disclosed prepared fallbacks, and redacted public exports. Keep OpenAI responsible for proposing scenarios; let observed assertions determine findings.

Mutation testing can remain a later capability to check whether the authorization tests detect deliberately reintroduced leaks. It should not compete with the main security story in this MVP.

## Files to align

Update `BUGSY_SPEC.md` first, then `docs/review-page.html`, `docs/how-it-works.md`, `docs/demo-script.md`, `docs/launch-brief.md`, `docs/posts.md`, and `README.md`. Define the new command behavior in the spec before changing CLI names or promising automation.

## Acceptance criteria

- The page and pitch consistently describe Bugsy as the two-account security tool.
- OpenAI produces inspectable authorization scenarios, rather than only explaining a known mutation.
- Kane confirms a cross-user leak in the browser with identifiable account and record evidence.
- Codex produces a reviewable server-side authorization patch.
- The same security scenario passes on the patched app, and owner access still works.
- The report links the failing run, patch commit, and passing rerun; incomplete runs remain inconclusive.
- Claims stay within the demonstrated Ledger flows. Arbitrary-app support and complete security coverage remain unproven until separately implemented and verified.

## Suggested opening for the demo

> “AI builders make it easy to ship an app. It is harder to know whether Alice can see Bob's private data. Bugsy uses OpenAI to generate two-account authorization checks, Kane to reproduce the leak in a real browser, and Codex to patch the bug. Then Kane reruns the same checks so we can show that the fix works.”

---

Basis: inspected `docs/review-page.html`, `BUGSY_SPEC.md`, `docs/demo-script.md`, and `docs/launch-brief.md`, compared with the security concept supplied in this chat. This document recommends changes; it does not claim that the proposed workflow is already implemented or verified.
