# How Bugsy works, in plain language

Meet **Alice**. She's a freelancer who invoices clients with Ledger. **Bob** uses Ledger too. Ledger was built in an afternoon by a coding agent from a short PRD. Nobody wrote "a user must not see another user's invoices", so nobody tested it. Alice can type `/invoices/4` and read Bob's $4,000 invoice.

Bugsy finds that, fixes it, proves the fix, and proves the proof.

## 1. The idea

```mermaid
flowchart TB
  subgraph today["How vibe-coded apps ship"]
    A1["Short PRD"] --> A2["Agent writes the app"] --> A3["Agent writes tests for what the PRD said"] --> A4["All green. Alice can still read Bob's data."]
  end
  subgraph bugsy["What Bugsy adds"]
    B1["One sentence: who owns what"] --> B2["OpenAI: scenarios, each with an owner control"] --> B3["Kane: run them in a real browser as Bob, then as Alice"]
    B3 --> B4{"Alice saw Bob's invoice?"}
    B4 -->|yes| B5["Codex patches the server check"] --> B6["Kane reruns the same scenarios: denied, owner still OK"] --> B7["Revert the patch, rerun: red again. Restore."]
    B4 -->|no| B8["Denied as expected"]
  end
  A4 --> B1
```

## 2. The pieces

```mermaid
flowchart LR
  subgraph in["You provide"]
    CFG["bugsy.config.json<br/>app URL · Alice and Bob ·<br/>ownership rule · routes"]
  end
  subgraph cli["bugsy"]
    SCAN["scan"] --> PATCH["patch"] --> SELF["self-check"] --> REP["report"]
  end
  subgraph oai["OpenAI"]
    GEN["Responses API<br/>rule → scenarios"]
    CDX["Codex CLI<br/>Kane failure → patch"]
  end
  subgraph kane["Kane CLI"]
    DS["design tests<br/>from the scenarios"]
    TR["run in real Chrome"]
    EV[("evidence pack:<br/>status, failure, screenshot")]
  end
  subgraph app["Ledger"]
    A["commit A<br/>vulnerable"] --> B["commit B<br/>patched"]
  end
  CFG --> SCAN --> GEN --> DS --> TR --> EV
  EV --> CDX --> B
  SCAN -. runs on .-> A
  PATCH -. reruns on .-> B
  SELF -. reverts, reruns, restores .-> B
```

**OpenAI** does two jobs: it writes the scenarios from your one-sentence rule (so you can read what will be tested before anything runs), and, as Codex, it writes the server-side patch from what Kane saw.

**Kane CLI** turns each scenario into a browser test, runs it, and seals an evidence pack with a status per scenario, a failure record and a screenshot. Kane is also the eyes of the patching agent: Codex fixes from Kane's failure, not from an HTTP response.

**Ledger** is the app under test. Commit A is the vulnerable one the agent shipped. Commit B is the patched one. Git is the fixture; there's no hidden switch.

## 3. One scenario, start to finish

```mermaid
sequenceDiagram
  participant K as Kane (one Chrome)
  participant L as Ledger (commit A)
  K->>L: sign in as Bob
  K->>L: open /invoices/4
  L-->>K: Invoice #4, Client: Umbrella, $4,000.00 (noted)
  K->>L: sign out
  K->>L: sign in as Alice
  K->>L: open /invoices/4
  L-->>K: Invoice #4, Client: Umbrella, $4,000.00
  K-->>K: expected "Invoice not found" — FAILED (screenshot)
  Note over K,L: S1 control in the same run: Alice opens /invoices/3 → Initech → passed
```

Why the control matters: if Alice were denied *everything*, including her own invoice, the app would be broken, not secure. A denial only counts when the owner still gets in.

## 4. How a verdict is decided

```mermaid
flowchart TD
  S([Kane run finished]) --> Q0{Sign-in steps passed, no test broken or interrupted?}
  Q0 -->|no| INC[inconclusive: environment, not security]
  Q0 -->|yes| Q1{Owner control S1 passed?}
  Q1 -->|no| INC
  Q1 -->|yes| Q2{Leak scenario S2 passed?}
  Q2 -->|yes| OK[denied as expected]
  Q2 -->|no, failed at the denial step| LEAK[leak confirmed]
```

## 5. The patch, and the proof of the proof

```mermaid
sequenceDiagram
  participant U as You
  participant B as bugsy
  participant C as Codex
  participant L as Ledger
  participant K as Kane
  participant H as Hub
  U->>B: bugsy patch S2
  B->>C: Kane failure.yaml + screenshot + routes/invoices.ts
  C-->>B: diff: WHERE id = ? AND owner_id = ?, else 404 "Invoice not found"
  B->>B: git apply --check, apply, commit B
  B->>L: restart at commit B
  B->>K: run S1, S2, S3 (same files)
  K-->>H: all passed → fix re-verified
  U->>B: bugsy self-check
  B->>B: git revert --no-commit B
  B->>L: restart
  B->>K: run S2
  K-->>B: failed → the test detects the leak
  B->>B: restore B (always, even on error)
  B-->>U: finding · patch · before/after run ids · self-check
```

## 6. Why the PRD doesn't mention tenant isolation

`requirements/ledger-prd.md` describes sign-in, the list, the detail page, mark-as-paid and create. It never says who may see what. That's deliberate and we say it at the table: it's the most common way vibe-coded apps leak data. The seatbelt exists because the spec was silent.

## 7. The afternoon

```mermaid
gantt
  title Pacific time
  dateFormat HH:mm
  axisFormat %H:%M
  section Gates
  Mid-eval               :milestone, 14:00, 0m
  Scored eval at table   :crit, 16:00, 60m
  Submissions lock       :milestone, 18:00, 0m
  section Build
  C0 pair, model, codex login, Ledger at A :13:10, 20m
  Ledger app                       :13:10, 50m
  C1 S1 and S2 authored on A       :14:00, 15m
  bugsy scan + verdicts            :13:30, 75m
  C2 scan end to end               :milestone, 14:45, 0m
  bugsy patch + self-check         :14:15, 60m
  C3 patch + self-check timed      :milestone, 15:15, 0m
  README, exports, hub, Submit tab :15:15, 25m
  Dry run x2                       :15:40, 20m
  section Launch
  Video, posts, blog, deck         :17:00, 60m
```

## 8. What the judges' Proof tab will show

| Step | Commit | Kane exit | Hub counter |
|---|---|---|---|
| S1 control passes on the vulnerable app | A | 0 | verified pass |
| S2 leak confirmed | A | 1 | suspected defect, confirmed by us |
| Same scenarios after the Codex patch | B | 0 | fix re-verified |
| Self-check with the patch reverted | B (temp) | 1 | labelled self-check |
