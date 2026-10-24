# Authorization requirements for Ledger

Ownership rule: Each invoice belongs to exactly one user. Alice owns invoices 1-3, Bob owns 4-6. A signed-in user may view and change only their own invoices; any other invoice must show 'Invoice not found'.

## S1_owner_reads_own: Owner can read their own invoice

A signed-in user may view invoices they own.

Steps

1. Sign in as Alice.
2. Open /invoices/3.
3. Confirm the page shows Client: Initech.

Expected

- Client: Initech

## S2_other_reads_by_url: Another user's invoice is denied when opened directly

Opening an invoice owned by another user must show a not-found message without revealing its client or amount.

Steps

1. Sign in as Bob.
2. Open /invoices/4 and confirm the page shows Client: Umbrella and $4,000.00.
3. Sign out.
4. Sign in as Alice.
5. Open /invoices/4.
6. Confirm the page shows Invoice not found.
7. Confirm Umbrella and $4,000.00 are not on the page.

Expected

- Invoice not found

Control: S1_owner_reads_own

## S3_list_isolation: Invoice list excludes another user's invoices

A signed-in user's invoice list must contain only their own invoices and must not expose another user's clients, amounts, or invoice links.

Steps

1. Sign in as Alice.
2. Open /invoices.
3. Confirm the list contains Initech.
4. Inspect the complete invoice list, following any pagination or loading additional entries if available.
5. Confirm the list does not contain Umbrella or $4,000.00.
6. Confirm the list has no links to /invoices/4, /invoices/5, or /invoices/6.

Expected

- Initech

Control: S1_owner_reads_own

## S4_signed_out_back_button: Signed out, but still visible: Back after sign-out must not show account pages

After a user signs out, pressing the browser Back button must not show any page from their account; the sign-in page is shown instead.

Steps

1. Sign in as Alice
2. Open /invoices/3 and confirm it shows Client: Initech
3. Click Sign out
4. Press the browser Back button

Expected

- The page shows 'Sign in'
- The text 'Client: Initech' is not visible

Control: S1_owner_reads_own
