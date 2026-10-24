import express from "express";
import session from "express-session";
import { execSync } from "node:child_process";
import path from "node:path";
import { auth } from "./routes/auth.js";
import { invoices } from "./routes/invoices.js";

declare module "express-session" {
  interface SessionData {
    userId: number;
    banner: string;
  }
}

const here = import.meta.dirname;

function gitSha(): string {
  try {
    return execSync("git rev-parse --short=7 HEAD", { cwd: here, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim() || "dev";
  } catch {
    return "dev";
  }
}
const sha = gitSha();

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(here, "..", "views"));
app.use(express.urlencoded({ extended: false }));
app.use(session({ secret: "ledger-demo", resave: false, saveUninitialized: false }));
app.use((_req, res, next) => {
  res.locals.sha = sha.slice(0, 7);
  next();
});

app.get("/", (_req, res) => res.redirect("/invoices"));
app.get("/health", (_req, res) => res.json({ ok: true, sha }));
app.use(auth);
app.use(invoices);

const port = Number(process.env.PORT ?? 3100);
app.listen(port, () => console.log(`Ledger listening on http://localhost:${port} (build ${sha})`));
