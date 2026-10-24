# How Bugsy works, in plain language

Read this before the spec. Every diagram here renders on GitHub.

## 1. The idea in one picture

Mutation testing is simple: break the program on purpose in one small way, run the tests, see if anything fails. If nothing fails, the tests would not have noticed that bug.

```mermaid
flowchart TB
  subgraph before["What everyone has today"]
    A1[AI writes the app] --> A2[AI writes the tests] --> A3[Tests pass] --> A4["'All green' — but would they fail if something broke?"]
  end
  subgraph bugsy["What Bugsy adds"]
    B1[Plant one realistic bug] --> B2[Run the same tests] --> B3{Did any test fail?}
    B3 -->|yes| B4[Caught: the suite would notice this bug]
    B3 -->|no| B5[Survived: the suite is blind to this bug]
    B5 --> B6[Name the missing requirement, design the missing test, prove it]
  end
  A4 --> B1
```

## 2. The pieces

```mermaid
flowchart LR
  subgraph you["Your terminal"]
    CLI["bugsy<br/>run · probe · fix · report"]
  end
  subgraph app["Ledger (the app under test)"]
    L["Express + SQLite<br/>port 3000"]
    SW{{"BUG env var<br/>none / leak_cross_tenant /<br/>pay_no_persist / total_off_by_one"}}
    H["/health → which bug is live"]
  end
  subgraph kane["Kane CLI"]
    T["testrun run<br/>runs tests/*_test.md<br/>in real Chrome"]
    DZ["context ingest → design tests<br/>turns a requirement into a test"]
    EV[("evidence pack<br/>per-test status,<br/>failure records,<br/>screenshots")]
  end
  subgraph oai["OpenAI"]
    G["gap analysis:<br/>which requirement<br/>was never written?"]
  end
  subgraph hub["Hack hub (kaneclihack.sh)"]
    KR["kanehack report<br/>verified passes ·<br/>suspected defects ·<br/>fixes re-verified"]
  end
  CLI -->|"start with BUG=…"| L
  CLI -->|run suite| T
  T --> EV
  CLI -->|read verdicts| EV
  CLI -->|survivor| G
  G -->|requirement addendum| DZ
  DZ -->|new _test.md| CLI
  T -.->|every run wrapped| KR
```

**Ledger** is a deliberately tiny invoices app with two users, Alice and Bob. It exists so the bugs are realistic and the assertions are exact (Alice's total outstanding is `$1,289.99`, Bob's invoice #4 is `Umbrella $4,000.00`).

**Kane CLI** is the test runner and the grader. It drives a real Chrome from plain-English test files, and seals an evidence pack per run with the status of every test and step.

**OpenAI** is used for judgement, not for verdicts: it reads the survived bug and the PRD and names the requirement that was never written down. Kane turns that into a test.

**The hack hub** sees every Kane run through `kanehack report`, which is how the judges' Proof tab counts verified passes, suspected defects and re-verified fixes.

## 3. One experiment, start to finish

```mermaid
sequenceDiagram
  participant B as bugsy run
  participant A as Ledger
  participant P as probe (HTTP)
  participant K as Kane CLI
  participant E as evidence pack
  B->>A: start BUG=none
  B->>K: run suite (baseline)
  K-->>E: all passed
  B->>A: stop, restart BUG=leak_cross_tenant
  B->>P: as Alice, GET /invoices/4
  P-->>B: 200, page contains "Umbrella" (bug is live)
  B->>K: run the same suite
  K-->>E: all passed
  B->>E: read per-test status
  B-->>B: verdict = survived (green on a leaking app)
```

The probe matters: it proves the bug is really there before Kane runs. Without it, "all passed" could mean "the switch didn't work".

## 4. How a verdict is decided

```mermaid
flowchart TD
  S([Kane run finished]) --> Q1{Probe showed the bug is live?}
  Q1 -->|no| INV[invalid: the mutant didn't change behaviour]
  Q1 -->|yes| Q2{Any test status broken or interrupted?}
  Q2 -->|yes| INC[inconclusive: runner or environment problem]
  Q2 -->|no| Q3{Any test failed?}
  Q3 -->|no| SUR[survived]
  Q3 -->|yes| Q4{Did it fail after step 1,<br/>i.e. after reaching the app?}
  Q4 -->|no, failed at step 0| INC
  Q4 -->|yes| Q5{Same test passed on the clean baseline?}
  Q5 -->|no| INC
  Q5 -->|yes| CAU[caught]
```

**Catch rate = caught ÷ (caught + survived)**, counted over valid, conclusive experiments only. The report always shows the inconclusive and invalid counts next to it. It is a measure of how sensitive this suite is to these bugs, nothing more.

## 5. The fix loop

```mermaid
sequenceDiagram
  participant U as You
  participant B as bugsy fix
  participant O as OpenAI
  participant K as Kane CLI
  participant A as Ledger
  participant H as Hack hub
  U->>B: bugsy fix leak_cross_tenant
  B->>O: mutant + PRD + existing tests + evidence
  O-->>B: "A user must not be able to view another user's invoice"
  B->>B: write requirements/addendum-leak_cross_tenant.md
  B->>K: context ingest → review → design tests --max 1
  K-->>B: tests/tenant_isolation_test.md
  B->>A: start BUG=none
  B->>K: run the new test (authors it, records it)
  K-->>H: passed → verified pass
  B->>A: restart BUG=leak_cross_tenant
  B->>K: run the new test
  K-->>H: failed at "Invoice not found" → suspected defect
  B->>B: commit addendum + test + recordings
  B->>A: restart BUG=none
  B->>K: run the suite at the new commit
  K-->>H: passed → fix re-verified
  B-->>U: leak_cross_tenant: survived → caught
```

Two rules keep this honest:
- The new test is **always authored on the clean app**. If it were authored on the mutant, Kane would record the leak as normal behaviour.
- The requirement OpenAI writes must be general ("another user's invoice"), never "invoice #4". Kane designs the test from the requirement, so the test checks the rule, not the one seeded row.

## 6. Why the PRD doesn't mention tenant isolation

`requirements/ledger-prd.md` describes sign-in, the list, the detail page, mark-as-paid and create. It never says "a user must not see another user's invoices". That is deliberate and we say so out loud: it's the most common way AI-built apps ship a data leak. The spec never stated it, so the agent never tested it, so the suite is green while Alice reads Bob's invoice. Bugsy's job is to find that gap and close it.

## 7. The day

```mermaid
gantt
  title Hack Day, Pacific time
  dateFormat HH:mm
  axisFormat %H:%M
  section Gates
  Idea locked            :milestone, 12:00, 0m
  Mid-eval (feedback)    :milestone, 14:00, 0m
  Scored eval at table   :crit, 16:00, 60m
  Submissions lock       :milestone, 18:00, 0m
  section Build
  C0 setup, pair, model, app up   :11:00, 30m
  C1 first real Kane run, measure :11:30, 45m
  Ledger app + mutants            :11:15, 105m
  bugsy run + verdicts + report   :11:30, 150m
  C2 first survived verdict       :milestone, 13:00, 0m
  bugsy fix                       :13:00, 90m
  C3 fix loop end to end          :milestone, 14:30, 0m
  Full matrix, README, exports    :14:30, 60m
  Dry run ×2, hub housekeeping    :15:30, 30m
  section Launch
  Video, posts, blog, deck        :17:00, 60m
```

## 8. What the judges' Proof tab will show

| Bugsy event | Kane exit | Hub counter |
|---|---|---|
| Baseline on clean app | 0 | verified pass |
| Mutant survived | 0 | verified pass, on a leaking app (we say this in the demo) |
| Mutant caught | 1 | suspected defect, confirmed by us as "planted" |
| New test red on mutant | 1 | suspected defect |
| Suite green at the new commit after `fix` | 0 | fix re-verified |
| A real Ledger bug found by the first run | 1 → 0 | suspected defect → re-verified. Reported, not hidden. |
