/**
 * Cloud Run (Express) server
 * - Serves static HTML apps from /apps
 * - Exposes API routes (public/dealer/admin) calling Airtable server-side
 * - Keeps all secrets in env vars (never in frontend)
 */

"use strict";

require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

// ✅ Route modules (make sure these files EXIST)
const publicRoutes = require("./routes/public");
const dealerRoutes = require("./routes/dealer"); // <-- file must be routes/dealer.js
const adminRoutes = require("./routes/admin");   // <-- file must be routes/admin.js

const app = express();

/** ========= Config ========= */
const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || "development";

const CORS_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** ========= Middleware ========= */
app.set("trust proxy", 1);

app.use(helmet());

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
    max: 180,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use(morgan(NODE_ENV === "production" ? "combined" : "dev"));

/** ========= Static apps ========= */
const APPS_DIR = path.join(__dirname, "apps");

app.use("/storefront", express.static(path.join(APPS_DIR, "storefront")));
app.use("/dealer", express.static(path.join(APPS_DIR, "dealer")));
app.use("/admin", express.static(path.join(APPS_DIR, "admin")));

/** Root */
app.get("/", (_req, res) => res.redirect("/storefront"));

/** ========= Health ========= */
app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "carsales-platform",
    env: NODE_ENV,
    time: new Date().toISOString(),
  });
});

/** ========= API index ========= */
app.get("/api", (_req, res) => {
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
  // If they hit an app deep-link (SPA style), you can optionally serve index.html here later.
  res.status(404).json({ ok: false, error: "Not Found" });
});

/** ========= Error handler ========= */
app.use((err, _req, res, _next) => {
  console.error("Server Error:", err);
  res.status(500).json({ ok: false, error: "Internal Server Error" });
});

/** ========= Start ========= */
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
