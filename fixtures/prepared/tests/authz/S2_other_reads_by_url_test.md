---
mode: testing
url: http://localhost:3100
headless: true
max_steps: 30
tags: [ledger, authz, leak_check]
---

# S2 Another user's invoice is hidden when opened directly

## Sign in as Bob
Open http://localhost:3100/login. Type "bob@ledger.test" into the Email field and "bob123" into the Password field, then click "Sign in".
Verify the page shows "Your invoices".

## Bob opens his own invoice
Open http://localhost:3100/invoices/4.
Verify the page shows "Client: Umbrella" and "$4,000.00".

## Sign out
Click "Sign out".
Verify the page shows "Sign in".

## Sign in as Alice
Type "alice@ledger.test" into the Email field and "alice123" into the Password field, then click "Sign in".
Verify the page shows "Your invoices".

## Alice opens Bob's invoice URL
Open http://localhost:3100/invoices/4.
Verify the page shows "Invoice not found".
Verify the text "Umbrella" is not on the page.
Verify the text "$4,000.00" is not on the page.
