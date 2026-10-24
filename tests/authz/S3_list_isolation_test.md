---
assurance:
  id: t-3
  base: sha256:765f184fdd3877f8dc1ef4c8f2466f6667174a4552220470ef92c38b3dcc67b9
---
# Alice's complete invoice list isolates Bob's records

> Alice opens /invoices, inspects the complete list including any additional entries, sees Initech but no Umbrella, $4,000.00, or links to /invoices/4, /invoices/5, or /invoices/6.

## Step 1

Open Ledger at {{start_url}} and sign in as Alice using {{alice_username}} and {{alice_password}}.

## Step 2 @verifies ac-5, ac-6, ac-7, ac-8, ac-9

On Ledger's /invoices page, inspect every invoice entry, following any pagination or additional loading when available, then assert every displayed invoice belongs to Alice (invoices 1–3), Initech is present, Umbrella and $4,000.00 are absent, and no links target /invoices/4, /invoices/5, or /invoices/6.
