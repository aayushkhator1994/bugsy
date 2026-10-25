# Bugsy — independent review brief

Please review this proposal critically before we commit to its implementation. We want a credible, working hackathon product and a reliable live demo. Challenge the assumptions, identify the smallest convincing scope, and distinguish blockers from improvements that can wait.

Read this brief alongside `BUGSY_PLAN.md`, which contains the original build plan. This brief proposes revisions; it does not claim those revisions have been implemented or agreed upon.

## 1. The idea

**An AI agent wrote your app and your tests. Would those tests notice a realistic bug?**

Bugsy deliberately introduces one bug at a time into a small application, runs its Kane CLI browser tests, and reports which bugs the suite catches or misses. For a missed bug, OpenAI identifies the missing acceptance criterion. Kane then generates a test from that requirement. We verify that the new test passes on the correct app and fails on the faulty version.

The central demo is a tenant isolation failure: Alice can open Bob's invoice by URL, but the existing tests still pass. Bugsy helps close that gap and supplies execution evidence.

The proposed distinction is the combination of realistic behavioral mutations, AI gap analysis, and a Kane-driven requirement-to-test repair loop. We should avoid claiming to have invented browser E2E mutation testing.

## 2. Context and constraints

- Event: Kane CLI Hack Day, October 24, 2026.
- The original plan targets a live table evaluation at 4–5 p.m. and final submission at 6 p.m. Event rules, times, and scoring claims need confirmation against the organizer's current material.
- OpenAI API calls and Kane CLI execution must be substantive parts of the product.
- The original plan calls for a public repository, execution evidence, and supporting submission assets.
- This is a same-day build. Reliability of one complete loop matters more than command count or catalogue size.

No installed Kane CLI behavior, evidence format, credits, latency, or model availability has been verified as part of this review brief. Commands in the original plan are proposed integration details until checked against the installed version and an actual run.

## 3. Proposed MVP

### Application

A tiny invoice application, Ledger, with seeded Alice and Bob accounts, login, invoice list and detail pages, and a mark-as-paid action. Use deterministic amounts and records. The original plan proposes Express, EJS, and SQLite.

### Three built-in mutations

| Mutation | Fault | Test behavior needed |
|---|---|---|
| Cross-tenant invoice access | Invoice detail omits the owner check | Alice requests Bob's invoice and sees a denial or not-found response |
| Payment does not persist | Payment appears successful but status is not saved | Pay, revisit or reload, and assert the invoice remains paid |
| Incorrect outstanding total | One precisely defined arithmetic or aggregation change | Assert the exact expected amount using known fixtures |

Each mutation must have one deterministic implementation, a demonstrated behavioral difference from the clean app, and a fresh application state. Do not mix multiple possible faults under one mutation ID.

### Product surface

1. `bugsy run`: run the frozen suite against the clean app and selected mutations; produce verdicts and evidence references.
2. `bugsy fix <id>`: use OpenAI to propose a missing requirement, use Kane to generate the corresponding test, and verify it on clean and faulty apps.
3. A static HTML and JSON report showing the observed results, uncertainty, and before/after history.

### Defer until the loop works

- OpenAI-generated source patches and temporary worktree execution.
- General support for arbitrary applications and start commands.
- AI-written report narratives.
- A larger mutation catalogue.
- Parallel execution unless fixture isolation is already proven.

OpenAI remains central through evidence-informed gap analysis and requirement generation. Review whether this is sufficient for the product story and event requirements.

## 4. What counts as proof

### Freeze the comparison

- Generate and author tests against the clean app first.
- Freeze those test files for the before measurement.
- Use the same runner settings for clean and mutated measurement runs, including disabled adaptive healing.
- Record the application revision, mutation definition, test content hashes, execution settings, execution IDs, and evidence paths.
- Reset fixtures between experiments. Start with sequential tests to avoid shared-state interference.
- After adding a test, establish a new passing clean baseline before updating mutation results.

### Verdicts

| Verdict | Required interpretation |
|---|---|
| Caught | Clean comparison passes and a relevant assertion fails because of the mutation |
| Survived | The mutation demonstrably changes the intended behavior, and all scheduled suite tests complete successfully |
| Inconclusive | Runner failure, missing evidence, flaky or unrelated failure, or insufficient evidence to attribute the failure |
| Invalid mutation | Patch/build failure, inactive mutation, or no demonstrated behavioral difference on the selected fixture |

An arbitrary nonzero exit code must not count as a caught bug. Define a practical attribution rule that can be implemented during the hackathon; do not imply stronger causality than the evidence supports.

Report the catch rate as caught divided by caught plus survived for valid, conclusive experiments, alongside the total attempted, inconclusive, and invalid counts. Never hide the excluded experiments. The score measures sensitivity to these selected bugs, not overall application correctness or security.

### Separate fault verification from suite execution

If the suite never opens Bob's invoice, its passing evidence cannot show that Alice accessed it. Use a separate probe to demonstrate that the mutation is active and capture the leak. Clearly label this probe as independent fault verification; do not count it as an existing suite test.

The probe should establish that the clean app denies access and the mutated app exposes the invoice. Use seeded synthetic data only.

### Report updates

A rerun of one mutation can update that row. It cannot prove that all other survivors are now caught. Preserve run history and identify which suite version produced each result. Recompute a comparable aggregate only after the required matrix has been rerun.

## 5. Proposed live demo

1. Show a recorded matrix with its timestamps, revision, suite version, and evidence IDs.
2. Run the clean app and establish that the selected suite passes.
3. Activate the cross-tenant mutation. An independent probe demonstrates Alice opening Bob's invoice.
4. Run the unchanged suite. It passes, so the verified bug survives.
5. OpenAI reads the mutation, requirements, existing tests, and relevant execution evidence. It proposes a tenant isolation requirement.
6. Kane generates the new test from that requirement.
7. The new test passes on clean and fails on the mutant with the expected assertion.
8. Show the report's before/after row and evidence references.

Rehearse and measure this sequence. If the generation step cannot fit the live slot, use a previously generated test and announce that explicitly. Keep recorded results visibly distinct from live results.

Do not promise a starting score such as 2/6. Generate the initial suite from the stated requirements and report what actually happens. If tenant isolation was intentionally omitted from the initial requirements to illustrate a specification gap, disclose that choice.

## 6. Integration questions to resolve first

1. Can one clean Kane run and one deliberately failing run produce machine-readable, correctly attributed results and accessible evidence?
2. What are the actual commands, exit codes, pause semantics, evidence paths, and result schemas for the installed Kane version?
3. Can a new test be generated through the assurance flow and verified within the available time and credits?
4. Does cached execution preserve the assertions and behavior needed for this experiment? What gets regenerated or healed?
5. How will the runner start and stop only its own application process, handle an occupied port, and restore clean state after failure?
6. What is the measured duration and cost of the minimal complete loop?

The first implementation milestone should be a real clean/faulty comparison with evidence extraction, before building the full CLI or polishing the report.

## 7. Issues in the original plan

- It lists five built-in mutations but repeatedly assumes six; score examples and budgets need reconciliation.
- `cart_total_rounding` names a cart in an invoice app and offers two different faulty implementations.
- It says there is no build step but later launches `app/dist/server.js`.
- It describes env-switch mutations and generated worktree patches without a complete common execution contract.
- It enables healing for clean runs while disabling it for mutant runs, weakening comparability.
- It equates any test failure with catching the mutation.
- It expects a survivor pack to show a leak that the suite may never exercise.
- Parallel tests can modify shared invoices and invalidate exact-total assertions.
- `git add -A` in an automated fix could stage unrelated work. Stage only artifacts owned by that operation.
- Prompt/response logging and committed evidence need inspection for credentials and unintended data before publication.
- The proposed five-minute demo contains multiple potentially slow remote operations without measured timings.

## 8. Positioning and evidence discipline

Suggested pitch:

> Bugsy checks whether your AI-generated browser tests notice realistic bugs, then helps turn the missed behavior into a requirement and a verified test through Kane.

Avoid claiming "no prior art," "works on any app," or "proves your tests work" without qualification. A selected mutation catalogue establishes a bounded result.

Useful primary references:

- [Mutta: a novel tool for E2E web mutation testing](https://link.springer.com/article/10.1007/s11219-023-09616-6) — prior work on mutation testing of web applications through E2E suites.
- [Stryker mutant states and metrics](https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/) — established distinctions among mutation outcomes.

The original plan's HN figures, incident details, and implied connection between incidents and passing tests were not verified in this review. Omit them from public claims unless primary evidence supports the exact wording.

## 9. Questions for the reviewer

Please answer in priority order:

1. **Is the product useful and differentiated?** What is the strongest defensible pitch? What existing approach should we compare against?
2. **Is the proposed MVP small enough?** What would you remove while preserving the complete story?
3. **Does the experiment prove what we claim?** Identify false positives, selection bias, attribution problems, and misleading score interpretations.
4. **What is the simplest credible verdict implementation?** Specify a practical way to distinguish a caught mutation from unrelated execution failure.
5. **Is the repair loop overfitting?** How can the generated test verify the general requirement rather than merely recognize one seeded invoice or mutation?
6. **Can the live demo fit?** Which operations should be live, prepared, or omitted, and what evidence must remain visible?
7. **What should be validated in the first hour?** Give explicit go/no-go checkpoints and a fallback if Kane integration or generation is slow.
8. **What important risk is missing?** Focus on risks likely to prevent completion or undermine the result.

Please return:

- A recommendation: build as scoped, revise, or choose a different approach.
- The five highest-priority changes, with reasons.
- A minimum architecture and implementation order.
- A realistic live demo sequence.
- A short list of claims we can safely make once the evidence exists.

Be direct. Distinguish verified facts, assumptions, and recommendations. Do not implement or publish anything as part of this review.
