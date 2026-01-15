"use strict";

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { getDealerByDealerId } = require("./airtable");

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "";

if (!JWT_SECRET) {
  throw new Error("Missing JWT_SECRET in env.");
}

/**
 * PBKDF2 hashing format:
 * pbkdf2$<iterations>$<saltBase64>$<hashBase64>
 */
function hashPasscode(passcode, iterations = 120000) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(passcode, salt, iterations, 32, "sha256");
  return `pbkdf2$${iterations}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function verifyPasscode(passcode, stored) {
  if (!stored || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;

  const iterations = parseInt(parts[1], 10);
  const salt = Buffer.from(parts[2], "base64");
  const hashExpected = Buffer.from(parts[3], "base64");

  const hash = crypto.pbkdf2Sync(passcode, salt, iterations, 32, "sha256");
  return crypto.timingSafeEqual(hash, hashExpected);
}

function signToken(payload, expiresIn = "12h") {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/** Middleware: require any valid session */
function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "Missing token" });

    const decoded = verifyToken(token);
    req.user = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: "Invalid or expired token" });
  }
}

/** Middleware: dealer only */
function requireDealer(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user?.role !== "dealer") {
      return res.status(403).json({ ok: false, error: "Dealer access required" });
    }
    next();
  });
}

/** Middleware: admin only (JWT role OR x-admin-key header) */
function requireAdmin(req, res, next) {
  // Option 1: x-admin-key header
  const key = req.headers["x-admin-key"];
  if (ADMIN_API_KEY && key && key === ADMIN_API_KEY) return next();

  // Option 2: admin JWT
  requireAuth(req, res, () => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ ok: false, error: "Admin access required" });
    }
    next();
  });
}

/** Dealer login: dealerId + passcode */
async function dealerLogin(dealerId, passcode) {
  const dealer = await getDealerByDealerId(dealerId);
  if (!dealer) return { ok: false, error: "Dealer not found" };

  // Recommended Airtable field name
  const storedHash = dealer["Dealer Passcode Hash"];
  if (!storedHash) return { ok: false, error: "Dealer passcode not set" };

  const valid = verifyPasscode(passcode, storedHash);
  if (!valid) return { ok: false, error: "Invalid passcode" };

  const token = signToken({ role: "dealer", dealerId });
  return {
    ok: true,
    token,
    dealer: {
      dealerId: dealer["Dealer ID"],
      dealerName: dealer["Dealer Name"],
      status: dealer["Status"],
      logoUrl: dealer["Logo URL"],
    },
  };
}

module.exports = {
  // hashing helpers (admin setup)
  hashPasscode,
  verifyPasscode,

  // jwt helpers
  signToken,
  verifyToken,

  // middleware
  requireAuth,
  requireDealer,
  requireAdmin,

  // actions
  dealerLogin,
};
