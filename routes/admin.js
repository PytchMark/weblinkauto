"use strict";

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { getDealerByDealerId } = require("./airtable");

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

if (!JWT_SECRET) {
  throw new Error("Missing JWT_SECRET in env.");
}

/**
 * PBKDF2 hashing format:
 * pbkdf2$<iterations>$<saltBase64>$<hashBase64>
 */
function hashPasscode(passcode, iterations = 120000) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(String(passcode), salt, iterations, 32, "sha256");
  return `pbkdf2$${iterations}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function verifyPasscode(passcode, stored) {
  if (!stored || typeof stored !== "string") return false;

  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;

  const iterations = parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 1) return false;

  const salt = Buffer.from(parts[2], "base64");
  const hashExpected = Buffer.from(parts[3], "base64");

  const hash = crypto.pbkdf2Sync(String(passcode), salt, iterations, 32, "sha256");
  if (hash.length !== hashExpected.length) return false;

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
  // Option 1: x-admin-key header (useful for internal tools/scripts)
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

/** Admin login: username + password (env-controlled) */
function adminLogin(username, password) {
  const u = String(username || "").trim();
  const p = String(password || "").trim();

  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    return { ok: false, error: "Admin credentials not configured on server" };
  }

  // constant-time-ish compare for password
  const userOk = u === ADMIN_USERNAME;
  const a = Buffer.from(p);
  const b = Buffer.from(ADMIN_PASSWORD);

  const passOk = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!userOk || !passOk) return { ok: false, error: "Invalid credentials" };

  const token = signToken({ role: "admin", username: u });
  return { ok: true, token };
}

/** Dealer login: dealerId + passcode */
async function dealerLogin(dealerId, passcode) {
  const did = String(dealerId || "").trim();
  const pc = String(passcode || "").trim();

  if (!did || !pc) return { ok: false, error: "dealerId and passcode are required" };

  const dealer = await getDealerByDealerId(did);
  if (!dealer) return { ok: false, error: "Dealer not found" };

  // ✅ Your Airtable schema uses `passcodeHash`
  const storedHash = dealer.passcodeHash;
  if (!storedHash) return { ok: false, error: "Dealer passcode not set" };

  const valid = verifyPasscode(pc, storedHash);
  if (!valid) return { ok: false, error: "Invalid passcode" };

  const token = signToken({ role: "dealer", dealerId: did });

  return {
    ok: true,
    token,
    dealer: {
      dealerId: dealer.dealerId || did,
      name: dealer.name || "",
      status: dealer.status || "",
      logoUrl: dealer.logoUrl || "",
    },
  };
}

module.exports = {
  // hashing helpers
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
  adminLogin,
  dealerLogin,
};
