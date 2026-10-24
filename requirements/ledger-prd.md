# Ledger — Product Requirements

Ledger is a small invoicing web app for freelancers. A user signs in, sees their invoices, opens one, marks it as paid, and creates new ones. It runs at `http://localhost:3000`.

This document is the source of truth for what Ledger must do. Tests are designed from it.

## Test accounts

Two accounts exist for testing. Both are seeded when the app starts.

| Email | Password |
|---|---|
| alice@ledger.test | alice123 |
| bob@ledger.test | bob123 |

Alice starts with three invoices:

| Invoice # | Client | Amount | Status |
|---|---|---|---|
| 1 | Acme Co | $1,200.00 | Unpaid |
| 2 | Globex | $350.50 | Paid |
| 3 | Initech | $89.99 | Unpaid |

## 1. Sign in

- The sign-in page is at `/login`. It has an **Email** field, a **Password** field and a **Sign in** button.
- Entering a valid email and password and pressing **Sign in** takes the user to their invoice list at `/invoices`.
- Entering a wrong password shows the message **Invalid email or password** on the sign-in page. The user stays on `/login`.
- A signed-out user who opens `/invoices` is sent to `/login`.

## 2. Invoice list

- After signing in, the user sees the page titled **Your invoices** at `/invoices`.
- The page lists the user's invoices in a table with the columns **Invoice #**, **Client**, **Amount** and **Status**.
- Each row's invoice number is a link to that invoice's detail page.
- Below the table the page shows the total of all unpaid invoices, in the form **Total outstanding: $1,289.99**. For Alice's starting data that is $1,200.00 + $89.99 = **$1,289.99**. Paid invoices are not included.
- Amounts are shown in US dollars with two decimals and thousands separators.

## 3. Invoice detail

- Each invoice has a detail page at `/invoices/<number>`, for example `/invoices/3`.
- The page heading is **Invoice #3**. Below it the page shows **Client: Initech**, **Amount: $89.99** and **Status: Unpaid**.
- An unpaid invoice shows a **Mark as paid** button. A paid invoice does not show the button.
- The page has a **Back to invoices** link that returns to `/invoices`.

## 4. Mark an invoice as paid

- On an unpaid invoice's detail page, pressing **Mark as paid** records the payment.
- The page then shows the banner **Invoice #3 marked as paid** and **Status: Paid**, and the **Mark as paid** button is gone.
- The change is permanent: reloading the page, or opening the invoice again from the list, still shows **Status: Paid**.
- After paying invoice 3, Alice's list shows **Total outstanding: $1,200.00**.

## 5. Create an invoice

- The list page has a **New invoice** link to `/invoices/new`.
- The form has **Client**, **Amount** and **Due date** fields and a **Create invoice** button.
- Client is required. Amount must be a number greater than 0.
- Submitting with an amount of 0 or less shows **Amount must be greater than 0** and nothing is created.
- Submitting a valid form creates the invoice as **Unpaid** and opens its detail page, which shows the client and amount entered.
- The new invoice appears in the list and its amount is added to **Total outstanding**.

## Out of scope for this version

Editing or deleting invoices, multiple currencies, email notifications, password reset.
