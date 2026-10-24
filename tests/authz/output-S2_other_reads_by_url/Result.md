---
test: ../S2_other_reads_by_url_test.md
status: failed
started: 2026-10-24T21:40:37.435Z
duration_s: 130
session_id: 17344be1-1ec0-4684-a229-f44c70bcda80
---

# Direct foreign invoice view hides Bob's data — Result

## Step 1 ✓ passed (29.7s)
md5: 04e10a1bb6067ae7e9a1fc600bf07e61
At the Ledger site {{start_url}}, sign in as Bob using {{bob_username}} and {{bob_password}}.

## Step 2 ✓ passed (22.1s)
md5: bf2c0926cc105ad8bb9fa28b39d4c285
In Ledger, open /invoices/4 as Bob, then assert the owned invoice page shows 'Client: Umbrella'.

## Step 3 ✓ passed (10.9s)
md5: d14399adedcc6061fcf609b2b119a97f
Sign out of Ledger from Bob's session.

## Step 4 ✓ passed (26.8s)
md5: 41dba320cb4c39b658d44d873a932858
At the Ledger site {{start_url}}, sign in as Alice using {{alice_username}} and {{alice_password}}.

## Step 5 ✗ failed (38.4s)
md5: 193dd4e360e60d53d742498a923fbae1
Reason: Final verification failed: "'Invoice not found' is shown and neither 'Umbrella' nor '$4,000.00' appears on the page." — bug verdict: Missing invoice route displays invoice #4 details [application_issue/functional_defect, confidence 0.95]
As Alice in Ledger, open /invoices/4 directly, then assert 'Invoice not found' is shown and neither 'Umbrella' nor '$4,000.00' appears on the page.
