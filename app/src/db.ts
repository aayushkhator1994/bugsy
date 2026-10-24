import Database from "better-sqlite3";

export interface Invoice {
  id: number;
  owner_id: number;
  client: string;
  amount_cents: number;
  status: "Unpaid" | "Paid";
  due_date: string | null;
}

export const db = new Database(":memory:");

db.exec(`
  CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE, password TEXT);
  CREATE TABLE invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL,
    client TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    status TEXT NOT NULL,
    due_date TEXT
  );
`);

const addUser = db.prepare("INSERT INTO users (id, email, password) VALUES (?, ?, ?)");
addUser.run(1, "alice@ledger.test", "alice123");
addUser.run(2, "bob@ledger.test", "bob123");

const addInvoice = db.prepare(
  "INSERT INTO invoices (id, owner_id, client, amount_cents, status) VALUES (?, ?, ?, ?, ?)",
);
addInvoice.run(1, 1, "Acme Co", 120000, "Unpaid");
addInvoice.run(2, 1, "Globex", 35050, "Paid");
addInvoice.run(3, 1, "Initech", 8999, "Unpaid");
addInvoice.run(4, 2, "Umbrella", 400000, "Unpaid");
addInvoice.run(5, 2, "Hooli", 7500, "Unpaid");
addInvoice.run(6, 2, "Vandelay", 99900, "Paid");

export function money(cents: number): string {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
