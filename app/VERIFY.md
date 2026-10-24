# Ledger verification (curl, cookie jar)

Run on the vulnerable commit (seeded: detail route has no ownership check). Start: `npx tsx app/src/server.ts`. Key result: Alice GET /invoices/4 returns HTTP 200 with Client: Umbrella (the leak).

```
$ curl /health
{"ok":true,"sha":"e85bb70"}
$ signed-out GET /invoices
302 -> http://localhost:3100/login
$ wrong password
<html lang="en"><head><meta charset="utf-8"><title>Sign in</title>
<h1>Sign in</h1>
<p class="error">Invalid email or password</p>
  <button type="submit">Sign in</button>
$ Alice login
302 -> http://localhost:3100/invoices
$ Alice GET /invoices
<h1>Your invoices</h1>
<tr><td><a href="/invoices/1">1</a></td><td>Acme Co</td><td>$1,200.00</td><td>Unpaid</td></tr>
<tr><td><a href="/invoices/2">2</a></td><td>Globex</td><td>$350.50</td><td>Paid</td></tr>
<tr><td><a href="/invoices/3">3</a></td><td>Initech</td><td>$89.99</td><td>Unpaid</td></tr>
<p>Total outstanding: $1,289.99</p>
<p><a href="/invoices/new">New invoice</a></p>
<footer>build: e85bb70</footer>
$ Alice GET /invoices/4 (the leak)
<h1>Invoice #4</h1>
<p>Client: Umbrella</p>
<p>Amount: $4,000.00</p>
<p>Status: Unpaid</p>
HTTP 200
$ Alice GET /invoices/3
<h1>Invoice #3</h1>
<p>Client: Initech</p>
<p>Amount: $89.99</p>
<p>Status: Unpaid</p>
<form method="post" action="/invoices/3/pay"><button type="submit">Mark as paid</button></form>
$ Alice POST /invoices/3/pay
302 -> http://localhost:3100/invoices/3
$ follow redirect
<div class="banner">Invoice #3 marked as paid</div>
<p>Status: Paid</p>
$ reload
<p>Status: Paid</p>
$ list total after pay
<p>Total outstanding: $1,200.00</p>
$ GET /invoices/999
<h1>Invoice not found</h1>
HTTP 404
$ create amount 0
<p class="error">Amount must be greater than 0</p>
$ create valid
302 -> http://localhost:3100/invoices/7
<p>Client: Wonka</p>
<p>Amount: $1,234.50</p>
<p>Status: Unpaid</p>
<p>Total outstanding: $2,434.50</p>
```
