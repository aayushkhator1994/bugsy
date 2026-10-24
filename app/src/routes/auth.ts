import { Router } from "express";
import { db } from "../db.js";

export const auth = Router();

auth.get("/login", (_req, res) => res.render("login", { error: null }));

auth.post("/login", (req, res) => {
  const { email = "", password = "" } = req.body ?? {};
  const user = db.prepare("SELECT * FROM users WHERE email = ? AND password = ?").get(email, password) as
    | { id: number; email: string }
    | undefined;
  if (!user) return res.render("login", { error: "Invalid email or password" });
  req.session.userId = user.id;
  res.redirect("/invoices");
});

auth.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("/login");
  });
});
