# Signed out, but still visible: Back after sign-out shows the sign-in page

> Alice signs in and opens /invoices/3 showing Client: Initech, signs out, then presses the browser Back button; the sign-in page must be shown and Client: Initech must not be visible.

## Step 1

At the Ledger site {{start_url}}, sign in as Alice using {{alice_username}} and {{alice_password}}.

## Step 2

In Ledger, open Alice's /invoices/3, then assert the owned invoice page shows 'Client: Initech'.

## Step 3

Sign out of Ledger by clicking the 'Sign out' button.

## Step 4

Go back one entry in the browser history (browser Back navigation; do not type a URL and do not reload), then assert the page shows 'Sign in' and the text 'Client: Initech' is not visible.
