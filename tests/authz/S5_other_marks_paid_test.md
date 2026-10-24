---
assurance:
  id: t-1
  base: sha256:96a8c5ea3dc4f42ba57dcc02671ac3121a56c8e91ee2b69314f58f88c67a5a7a
---
# Direct cross-owner payment attempt preserves Bob's unpaid invoice

> Alice directly sends POST /invoices/4/pay in her signed-in browser session without opening Bob's invoice page; after switching to Bob, invoice 4 still reads Status: Unpaid.

## Step 1

Open the Ledger web app at {{start_url}} and sign in as Bob with {{bob_username}} and {{bob_password}}.

## Step 2

capture baseline: status of Bob's invoice 4 on /invoices/4 in the Ledger web app (Status: Unpaid)

## Step 3

In Ledger, sign out of Bob's account and sign in as Alice with {{alice_username}} and {{alice_password}}.

## Step 4

While signed in as Alice in Ledger, first store the value of the "connect.sid" cookie as 'alice_session'. Then, only after that value is stored, and without opening invoice 4's page, call POST {{start_url}}/invoices/4/pay with the header Cookie set to connect.sid= followed by the stored alice_session value, and save the response as pay_attempt.

## Step 5

In Ledger, sign out of Alice's account and sign in as Bob with {{bob_username}} and {{bob_password}}.

## Step 6 @verifies ac-1, ac-2

As Bob in Ledger, open /invoices/4, then assert the invoice status is unchanged from the captured Unpaid baseline and the page shows 'Status: Unpaid'.
