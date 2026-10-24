---
test: ../S5_other_marks_paid_test.md
status: passed
started: 2026-10-24T23:37:44.284Z
duration_s: 38
session_id: a6228871-db51-4e09-b325-e16cfbcaec17
---

# Direct cross-owner payment attempt preserves Bob's unpaid invoice — Result

## Step 1 ✓ passed (2.14s)
md5: 371be7d2b90ddfcce891dc5709fc5704
Open the Ledger web app at {{start_url}} and sign in as Bob with {{bob_username}} and {{bob_password}}.

## Step 2 ✓ passed (2.91s)
md5: 4eb5b5585bebf05745397e328b4bb7a6
capture baseline: status of Bob's invoice 4 on /invoices/4 in the Ledger web app (Status: Unpaid)

## Step 3 ✓ passed (2.67s)
md5: 36ac68501faad7eb902750de46d5d0ec
In Ledger, sign out of Bob's account and sign in as Alice with {{alice_username}} and {{alice_password}}.

## Step 4 ✓ passed (0.48s)
md5: c3718590c00b8fd4ce7b2d25a671f7ec
While signed in as Alice in Ledger, first store the value of the "connect.sid" cookie as 'alice_session'. Then, only after that value is stored, and without opening invoice 4's page, call POST {{start_url}}/invoices/4/pay with the header Cookie set to connect.sid= followed by the stored alice_session value, and save the response as pay_attempt.

## Step 5 ✓ passed (2.71s)
md5: f341173f500a73b9cfdbf6a42518ba58
In Ledger, sign out of Alice's account and sign in as Bob with {{bob_username}} and {{bob_password}}.

## Step 6 ✓ passed (25.7s)
md5: 1d7dd59f5d2ffd094a7415ce7ec9a7bd
As Bob in Ledger, open /invoices/4, then assert the invoice status is unchanged from the captured Unpaid baseline and the page shows 'Status: Unpaid'.
