---
assurance:
  id: t-1
  base: sha256:4cbbeb7f266cbcbb2a3bd4c07da8d8b3d7d9e3996748cf4dec4af1c6639639f7
---
# Direct foreign invoice view hides Bob's data

> Bob can view his invoice 4 showing Umbrella and $4,000.00; after signing in as Alice, opening /invoices/4 directly shows Invoice not found without Bob's client or amount.

## Step 1

At the Ledger site {{start_url}}, sign in as Bob using {{bob_username}} and {{bob_password}}.

## Step 2 @verifies ac-4

In Ledger, open /invoices/4 as Bob, then assert the owned invoice page shows 'Client: Umbrella'.

## Step 3

Sign out of Ledger from Bob's session.

## Step 4

At the Ledger site {{start_url}}, sign in as Alice using {{alice_username}} and {{alice_password}}.

## Step 5 @verifies ac-1, ac-2, ac-3

As Alice in Ledger, open /invoices/4 directly, then assert 'Invoice not found' is shown and neither 'Umbrella' nor '$4,000.00' appears on the page.
