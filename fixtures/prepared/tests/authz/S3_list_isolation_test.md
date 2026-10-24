---
mode: testing
url: http://localhost:3100
headless: true
max_steps: 20
tags: [ledger, authz, leak_check]
---

# S3 Invoice list excludes another user's invoices

## Sign in as Alice
Open http://localhost:3100/login. Type "alice@ledger.test" into the Email field and "alice123" into the Password field, then click "Sign in".
Verify the page shows "Your invoices".

## Alice's list shows only her invoices
Verify the list shows "Initech".
Verify the text "Umbrella" is not on the page.
Verify the text "$4,000.00" is not on the page.
Verify there is no link to "/invoices/4" on the page.
