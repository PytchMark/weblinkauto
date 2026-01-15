// routes/admin.js
"use strict";

const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

const { requireAdmin } = require("../services/auth");
const { airtableFetch } = require("../services/airtable");
const { getDealerMetrics, getGlobalMetrics } = require("../services/analytics");

// ENV
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;

// Airtable envs
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const T_DEALERS = process.env.AIRTABLE_TABLE_ID_DEALERS;
const T_VEHICLES = process.env.AIRTABLE_TABLE_ID_VEHICLES;
const T_REQUESTS = process.env.AIRTABLE_TABLE_ID_VIEWING_REQUESTS;

if (!JWT_SECRET) throw new Error("Missing JWT_SECRET in env.");
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  throw new Error("Missing ADMIN_USERNAME or ADMIN_PASSWORD in env.");
}
if (!AIRTABLE_BASE_ID || !T_DEALERS || !T_VEHICLES || !T_REQUESTS) {
  throw new Error(
    "Missing Airtable env vars: AIRTABLE_BASE_ID and/or AIRTABLE_TABLE_ID_DEALERS/VEHICLES/VIEWING_REQUESTS"
  );
}

/**
 * POST /api/admin/login
 * Body: { username, password }
 * Returns: { ok:true, token }
 */
router.post("/login", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "").trim();

  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "username and password required" });
  }

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: "Invalid credentials" });
  }

  const token = jwt.sign(
    { role: "admin", username },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  return res.json({ ok: true, token });
});
