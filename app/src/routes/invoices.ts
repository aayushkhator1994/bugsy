import { Router, type Request, type Response, type NextFunction } from "express";
import { db, money, type Invoice } from "../db.js";

export const invoices = Router();

function requireLogin(req: Request, res: Response, next: NextFunction) {
  res.set("Cache-Control", "no-store");
  if (!req.session.userId) return res.redirect("/login");
  next();
}
invoices.use("/invoices", requireLogin);

const view = (i: Invoice) => ({ ...i, amount: money(i.amount_cents) });

invoices.get("/invoices", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM invoices WHERE owner_id = ? ORDER BY id")
    .all(req.session.userId) as Invoice[];
  const outstanding = rows.filter((r) => r.status === "Unpaid").reduce((s, r) => s + r.amount_cents, 0);
  res.render("list", { rows: rows.map(view), outstanding: money(outstanding) });
});

invoices.get("/invoices/new", (_req, res) => {
  res.render("new", { error: null, values: { client: "", amount: "", due_date: "" } });
});

invoices.post("/invoices", (req, res) => {
  const { client = "", amount = "", due_date = "" } = req.body ?? {};
  const values = { client, amount, due_date };
  const n = Number(amount);
  if (!String(client).trim()) return res.status(400).render("new", { error: "Client is required", values });
  if (!Number.isFinite(n) || n <= 0) {
    return res.status(400).render("new", { error: "Amount must be greater than 0", values });
  }
  const info = db
    .prepare("INSERT INTO invoices (owner_id, client, amount_cents, status, due_date) VALUES (?, ?, ?, 'Unpaid', ?)")
    .run(req.session.userId, String(client).trim(), Math.round(n * 100), due_date || null);
  res.redirect(`/invoices/${info.lastInsertRowid}`);
});

invoices.get("/invoices/:id", (req, res) => {
  // NOTE: no ownership check here (seeded for the demo)
  const row = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id) as Invoice | undefined;
  if (!row) return res.status(404).render("not-found");
  const banner = req.session.banner ?? null;
  delete req.session.banner;
  res.render("detail", { inv: view(row), banner });
});

invoices.post("/invoices/:id/pay", (req, res) => {
  // Also no ownership check (scenario S4).
  const info = db.prepare("UPDATE invoices SET status = 'Paid' WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).render("not-found");
  req.session.banner = `Invoice #${req.params.id} marked as paid`;
  res.redirect(`/invoices/${req.params.id}`);
});
