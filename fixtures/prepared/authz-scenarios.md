# Authorization requirements for Ledger

Ownership rule: Each invoice belongs to exactly one user. Alice owns invoices 1-3, Bob owns 4-6. A signed-in user may view and change only their own invoices; any other invoice must show 'Invoice not found'.

## S1_owner_reads_own: Owner can view their own invoice

A signed-in user may view invoices they own.

Steps

1. Sign in as Alice.
2. Open /invoices/3.
3. Confirm the page shows Client: Initech.

Expected

- Client: Initech

## S2_other_reads_by_url: Another user's invoice is hidden when opened directly

Opening another user's invoice must show Invoice not found without exposing its client or amount.

Steps

1. Sign in as Bob.
2. Open /invoices/4 and confirm the page shows Client: Umbrella and $4,000.00.
3. Sign out.
4. Sign in as Alice.
5. Open /invoices/4.
6. Confirm the page shows Invoice not found.
7. Confirm neither Umbrella nor $4,000.00 appears anywhere on the page.

Expected

- Invoice not found

Control: S1_owner_reads_own

## S3_list_isolation: Invoice list excludes another user's invoices

A signed-in user's invoice list must contain only invoices they own and must not expose other users' invoice details or links.

Steps

1. Sign in as Alice.
2. Open /invoices.
3. Confirm Alice's invoice for Initech appears in the list.
4. Confirm neither Umbrella nor $4,000.00 appears anywhere on the page.
5. Confirm the list contains no links to /invoices/4, /invoices/5, or /invoices/6.

Expected

- Initech

Control: S1_owner_reads_own

