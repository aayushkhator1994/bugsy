---
mode: testing
url: http://localhost:3100
headless: true
max_steps: 20
tags: [ledger, authz, control]
---

# S1 Owner can view their own invoice

## Sign in as Alice
Open http://localhost:3100/login. Type "alice@ledger.test" into the Email field and "alice123" into the Password field, then click "Sign in".
Verify the page shows "Your invoices".

## Open Alice's own invoice
Open http://localhost:3100/invoices/3.
Verify the page shows "Invoice #3" and "Client: Initech".
