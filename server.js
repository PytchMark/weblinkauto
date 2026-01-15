/**
 * Cloud Run (Express) server
 * - Serves static HTML apps from /apps
 * - Exposes API routes (public/dealer/admin) that will call Airtable server-side
 * - Keeps all secrets in env vars (never in frontend)
 */

"use strict";

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

// ✅ Route modules
const publicRoutes = require("./routes/public");
const dealerRoutes = require("./routes/dealer");
const adminRoutes = require("./routes/admin");

const app = express();

/** ========= Config ========= */
const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || "development";

// Recommended: set CORS_ORIGINS to comma-separated list in env
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** ========= Middleware ========= */
app.set("trust proxy", 1); // Cloud Run / load balancers

app.use(helmet());

// CORS: if no origins provided, allow all (dev-friendly).
// In production, set CORS_ORIGINS to lock this down.
app.use(
  cors({
    origin: CORS_ORIGINS.length ? CORS_ORIGINS : true,
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 180, // per IP per minute
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Logging (minimal in production)
app.use(morgan(NODE_ENV === "production" ? "combined" : "dev"));

/** ========= Static apps ========= */
const APPS_DIR = path.join(__dirname, "apps");

app.use("/storefront", express.static(path.join(APPS_DIR, "storefront")));
app.use("/dealer", express.static(path.join(APPS_DIR, "dealer")));
app.use("/admin", express.static(path.join(APPS_DIR, "admin")));

/** Root: redirect to storefront */
app.get("/", (req, res) => {
  res.redirect("/storefront");
});

/** ========= Health ========= */
app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "carsales-platform",
    env: NODE_ENV,
    time: new Date().toISOString(),
  });
});

/** ========= API index ========= */
app.get("/api", (req, res) => {
  res.json({
    ok: true,
    message: "API online",
    routes: ["/api/public", "/api/dealer", "/api/admin"],
  });
});

/** ========= API Routes ========= */
app.use("/api/public", publicRoutes);
app.use("/api/dealer", dealerRoutes);
app.use("/api/admin", adminRoutes);

/** ========= 404 ========= */
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not Found" });
});

/** ========= Error handler ========= */
app.use((err, req, res, next) => {
  console.error("Server Error:", err);
  res.status(500).json({
    ok: false,
    error: "Internal Server Error",
  });
});

/** ========= Start ========= */
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
