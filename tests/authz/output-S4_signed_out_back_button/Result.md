---
test: ../S4_signed_out_back_button_test.md
status: failed
started: 2026-10-24T22:57:34.397Z
duration_s: 86
session_id: f71061d7-f60f-4803-a2d4-70617dd1229b
---

# Signed out, but still visible: Back after sign-out shows the sign-in page — Result

## Step 1 ✓ passed (17.5s)
md5: 41dba320cb4c39b658d44d873a932858
At the Ledger site {{start_url}}, sign in as Alice using {{alice_username}} and {{alice_password}}.

## Step 2 ✓ passed (21.8s)
md5: cddc068168e8489180fd6c5516082919
In Ledger, open Alice's /invoices/3, then assert the owned invoice page shows 'Client: Initech'.

## Step 3 ✓ passed (10.8s)
md5: da2c41949fb6bb4e301d33c784c51173
Sign out of Ledger by clicking the 'Sign out' button.

## Step 4 ✗ failed (34.4s)
md5: 33bab862399723b4fede0c3a7a3a0dbf
Reason: Final verification failed: "the page shows 'Sign in' and the text 'Client: Initech' is not visible" — bug verdict: Final assertion ran on invoice page [automation_bug/agent_misstep, confidence 0.98]
Go back one entry in the browser history (browser Back navigation; do not type a URL and do not reload), then assert the page shows 'Sign in' and the text 'Client: Initech' is not visible.
