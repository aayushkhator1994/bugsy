---
test: ../S3_list_isolation_test.md
status: passed
started: 2026-10-24T21:42:51.408Z
duration_s: 65
session_id: 585048a2-d7bc-47a0-922a-b076c594e25d
---

# Alice's complete invoice list isolates Bob's records — Result

## Step 1 ✓ passed (26.4s)
md5: 03264a0d0610b40b50b5524a80d85cc4
Open Ledger at {{start_url}} and sign in as Alice using {{alice_username}} and {{alice_password}}.

## Step 2 ✓ passed (37.5s)
md5: da7223ef7db53fd6bee07d12ffef5c30
On Ledger's /invoices page, inspect every invoice entry, following any pagination or additional loading when available, then assert every displayed invoice belongs to Alice (invoices 1–3), Initech is present, Umbrella and $4,000.00 are absent, and no links target /invoices/4, /invoices/5, or /invoices/6.
