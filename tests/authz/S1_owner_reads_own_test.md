---
assurance:
  id: t-2
  base: sha256:701c9e7e08d774ae7b10510ca4bbfb8ce57c10018d4d88e74a0e2c66c9073265
---
# Alice views her own invoice client

> Alice signs in and opens /invoices/3 to view Client: Initech on her invoice.

## Step 1

At the Ledger site {{start_url}}, sign in as Alice using {{alice_username}} and {{alice_password}}.

## Step 2 @verifies ac-4

In Ledger, open Alice's /invoices/3, then assert the owned invoice page shows 'Client: Initech'.
