/**
 * Cloud Run (Express) server
 * - Serves static HTML apps from /apps
 * - Exposes API routes (public/dealer/admin) calling Supabase server-side
 * - Keeps all secrets in env vars (never in frontend)
 */

"use strict";

require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const { signToken, verifyToken } = require("./services/auth");
const {
  getProfileByDealerId,
  getProfileByEmail,
  upsertProfile,
  listProfiles,
  getVehiclesForDealer,
  getVehiclesForDealers,
  getVehicleByVehicleId,
  createVehicle,
  updateVehicleByVehicleId,
  archiveVehicle,
  listVehicles,
  createViewingRequest,
  updateViewingRequestByRequestId,
  listViewingRequests,
} = require("./services/supabase");
const { getDealerMetrics, getDealersSummary } = require("./services/analytics");

const app = express();

/** ========= Config ========= */
const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || "development";

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "";

const CORS_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** ========= Middleware ========= */
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

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

/** ========= Helpers ========= */

function cleanStr(v, max = 500) {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s.length > max ? s.slice(0, max) : s;
}

function isValidDealerId(dealerId) {
  return /^[a-zA-Z0-9_-]{3,40}$/.test(dealerId);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizePhone(phone) {
  return cleanStr(phone, 40).replace(/[^\d+]/g, "");
}

function mapRequestTypeToEnum(type) {
  const t = cleanStr(type, 40).toLowerCase();

  if (t === "whatsapp" || t === "wa" || t === "chat") return "whatsapp";
  if (t === "live_video" || t === "live video" || t === "video" || t === "live") return "live_video";
  if (t === "walk_in" || t === "walk-in" || t === "in_store" || t === "in-store" || t === "in person") return "walk_in";

  return null;
}

function toBool(value) {
  if (typeof value === "boolean") return value;
  const s = String(value || "").toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return undefined;
}

function normalizeVehicleStatus(value) {
  const s = cleanStr(value, 40).toLowerCase();
  if (s === "available") return "available";
  if (s === "pending") return "pending";
  if (s === "sold") return "sold";
  if (s === "archived") return "archived";
  return "";
}

function normalizeRequestStatus(value) {
  const s = cleanStr(value, 40).toLowerCase();
  if (s === "new") return "new";
  if (s === "contacted") return "contacted";
  if (s === "booked") return "booked";
  if (s === "closed") return "closed";
  if (s === "no show" || s === "noshow" || s === "no_show") return "no show";
  return null;
}

function isPausedDealer(dealer) {
  const status = cleanStr(dealer?.status, 30).toLowerCase();
  return status === "paused";
}

function generatePasscode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function getAdminCredentials() {
  const adminEmail = cleanStr(process.env.ADMIN_EMAIL, 120);
  const adminUsername = cleanStr(process.env.ADMIN_USERNAME, 120);
  const adminPassword = cleanStr(process.env.ADMIN_PASSWORD, 200);
  return {
    adminIdentifier: adminEmail || adminUsername,
    adminPassword,
    adminEmailSet: Boolean(adminEmail),
    adminUsernameSet: Boolean(adminUsername),
    adminPasswordSet: Boolean(adminPassword),
  };
}

function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "Missing token" });

    const decoded = verifyToken(token);
    req.user = decoded;
    return next();
  } catch (_err) {
    return res.status(401).json({ ok: false, error: "Invalid or expired token" });
  }
}

function requireDealer(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user?.role !== "dealer") {
      return res.status(403).json({ ok: false, error: "Dealer access required" });
    }
    next();
  });
}

function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (ADMIN_API_KEY && key && key === ADMIN_API_KEY) return next();

  requireAuth(req, res, () => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ ok: false, error: "Admin access required" });
    }
    next();
  });
}

function generateRequestId() {
  return `REQ-${crypto.randomUUID()}`;
}

function mapProfileRow(profile) {
  if (!profile) return null;
  return {
    dealerId: profile.dealer_id || "",
    name: profile.name || "",
    status: profile.status || "",
    whatsapp: profile.whatsapp || "",
    email: profile.profile_email || "",
    logoUrl: profile.logo_url || "",
  };
}

function mapVehicleRow(vehicle) {
  if (!vehicle) return null;
  return {
    dealerId: vehicle.dealer_id,
    vehicleId: vehicle.vehicle_id,
    title: vehicle.title || "",
    make: vehicle.make || "",
    model: vehicle.model || "",
    year: vehicle.year || "",
    vin: vehicle.vin || "",
    price: vehicle.price || 0,
    status: vehicle.status || "",
    availability: vehicle.availability === true,
    Availability: vehicle.availability === true,
    archived: vehicle.archived === true,
    mileage: vehicle.mileage || "",
    color: vehicle.color || "",
    bodyType: vehicle.body_type || "",
    transmission: vehicle.transmission || "",
    fuelType: vehicle.fuel_type || "",
    description: vehicle.description || "",
    "notes / description": vehicle.description || "",
    cloudinaryImageUrls: vehicle.cloudinary_image_urls || "",
    cloudinaryVideoUrl: vehicle.cloudinary_video_url || "",
    Title: vehicle.title || "",
    Make: vehicle.make || "",
    Model: vehicle.model || "",
    Year: vehicle.year || "",
    VIN: vehicle.vin || "",
    Price: vehicle.price || 0,
    Mileage: vehicle.mileage || "",
    Color: vehicle.color || "",
    Status: vehicle.status || "",
  };
}

function mapVehicleInput(body) {
  return pruneUndefined({
    title: cleanStr(body.title || body.Title, 120),
    make: cleanStr(body.make || body.Make, 80),
    model: cleanStr(body.model || body.Model, 80),
    year: Number(body.year || body.Year || 0) || null,
    vin: cleanStr(body.vin || body.VIN, 80),
    price: Number(body.price || body.Price || 0) || null,
    status: normalizeVehicleStatus(body.status || body.Status) || cleanStr(body.status || body.Status, 40),
    availability: toBool(body.availability ?? body.Availability),
    archived: toBool(body.archived),
    mileage: Number(body.mileage || body.Mileage || 0) || null,
    color: cleanStr(body.color || body.Color, 60),
    body_type: cleanStr(body.bodyType || body["Body Type"], 60),
    transmission: cleanStr(body.transmission || body.Transmission, 60),
    fuel_type: cleanStr(body.fuelType || body["Fuel Type"], 60),
    description: cleanStr(
      body.description || body.notes || body.Description || body["notes / description"],
      2000
    ),
    cloudinary_image_urls: cleanStr(body.cloudinaryImageUrls || body.cloudinaryImageUrl, 5000),
    cloudinary_video_url: cleanStr(body.cloudinaryVideoUrl, 2000),
  });
}

function mapViewingRequestRow(request) {
  if (!request) return null;
  return {
    requestId: request.request_id,
    dealerId: request.dealer_id,
    vehicleId: request.vehicle_id || "",
    type: request.type || "",
    status: request.status || "",
    name: request.name || "",
    phone: request.phone || "",
    email: request.email || "",
    preferredDate: request.preferred_date || "",
    preferredTime: request.preferred_time || "",
    notes: request.notes || "",
    source: request.source || "",
    createdAt: request.created_at || "",
  };
}

function pruneUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
}

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

/** ========= Public API ========= */
app.get("/api/public/dealer/:dealerId", async (req, res) => {
  try {
    const dealerId = cleanStr(req.params.dealerId, 60);

    if (!isValidDealerId(dealerId)) {
      return res.status(400).json({ ok: false, error: "Invalid dealerId" });
    }

    const dealer = await getProfileByDealerId(dealerId);
    if (!dealer) return res.status(404).json({ ok: false, error: "Dealer not found" });

    if (isPausedDealer(dealer)) {
      return res.status(403).json({ ok: false, error: "Dealer storefront is paused" });
    }

    return res.json({
      ok: true,
      dealer: mapProfileRow(dealer),
    });
  } catch (err) {
    console.error("GET /api/public/dealer/:dealerId error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.get("/api/public/dealer/:dealerId/vehicles", async (req, res) => {
  try {
    const dealerId = cleanStr(req.params.dealerId, 60);

    if (!isValidDealerId(dealerId)) {
      return res.status(400).json({ ok: false, error: "Invalid dealerId" });
    }

    const all = cleanStr(req.query.all, 10) === "1";

    const dealer = await getProfileByDealerId(dealerId);
    if (!dealer) return res.status(404).json({ ok: false, error: "Dealer not found" });

    if (isPausedDealer(dealer)) {
      return res.status(403).json({ ok: false, error: "Dealer storefront is paused" });
    }

    const vehicles = await getVehiclesForDealer(dealerId, {
      includeArchived: false,
      publicOnly: !all,
    });

    return res.json({
      ok: true,
      dealer: {
        dealerId: dealer.dealer_id,
        name: dealer.name || "",
        logoUrl: dealer.logo_url || "",
      },
      vehicles: vehicles.map(mapVehicleRow),
    });
  } catch (err) {
    console.error("GET /api/public/dealer/:dealerId/vehicles error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.get("/api/public/vehicles", async (req, res) => {
  try {
    const rawDealerIds = cleanStr(req.query.dealerIds, 200);
    const dealerIds = rawDealerIds
      .split(",")
      .map((id) => cleanStr(id, 60))
      .filter(Boolean);

    if (!dealerIds.length) {
      return res.status(400).json({ ok: false, error: "dealerIds query param is required" });
    }
    if (dealerIds.length > 3) {
      return res.status(400).json({ ok: false, error: "Up to 3 dealerIds are supported" });
    }
    if (dealerIds.some((id) => !isValidDealerId(id))) {
      return res.status(400).json({ ok: false, error: "Invalid dealerId in list" });
    }

    const profiles = await Promise.all(dealerIds.map((id) => getProfileByDealerId(id)));
    const activeDealers = profiles.filter((d) => d && !isPausedDealer(d));

    if (!activeDealers.length) {
      return res.status(404).json({ ok: false, error: "Dealers not found" });
    }

    const activeDealerIds = activeDealers.map((d) => d.dealer_id);
    const vehicles = await getVehiclesForDealers(activeDealerIds, {
      includeArchived: false,
      publicOnly: true,
    });

    return res.json({
      ok: true,
      dealers: activeDealers.map(mapProfileRow),
      vehicles: vehicles.map(mapVehicleRow),
    });
  } catch (err) {
    console.error("GET /api/public/vehicles error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.post("/api/public/dealer/:dealerId/requests", async (req, res) => {
  try {
    const dealerId = cleanStr(req.params.dealerId, 60);

    if (!isValidDealerId(dealerId)) {
      return res.status(400).json({ ok: false, error: "Invalid dealerId" });
    }

    const typeEnum = mapRequestTypeToEnum(req.body.requestType);
    if (!typeEnum) {
      return res.status(400).json({
        ok: false,
        error: "Invalid requestType. Use whatsapp, live_video, or walk_in.",
      });
    }

    const name = cleanStr(req.body.customerName, 120);
    const phone = normalizePhone(req.body.phone);
    const email = cleanStr(req.body.email, 120);
    const preferredDate = cleanStr(req.body.preferredDate, 40);
    const preferredTime = cleanStr(req.body.preferredTime, 60);
    const notes = cleanStr(req.body.notes, 1200);
    const vehicleId = cleanStr(req.body.vehicleId, 60);

    if (!name) return res.status(400).json({ ok: false, error: "customerName is required" });
    if (!phone || phone.length < 7) return res.status(400).json({ ok: false, error: "phone is required" });

    const dealer = await getProfileByDealerId(dealerId);
    if (!dealer) return res.status(404).json({ ok: false, error: "Dealer not found" });

    if (isPausedDealer(dealer)) {
      return res.status(403).json({ ok: false, error: "Dealer storefront is paused" });
    }

    let safeVehicleId = "";
    if (vehicleId) {
      const v = await getVehicleByVehicleId(vehicleId);
      if (v && cleanStr(v.dealer_id, 60) === dealerId) {
        safeVehicleId = vehicleId;
      }
    }

    const fields = {
      dealer_id: dealerId,
      request_id: generateRequestId(),
      type: typeEnum,
      status: "new",
      name,
      phone,
      source: "storefront",
    };

    if (safeVehicleId) fields.vehicle_id = safeVehicleId;
    if (email) fields.email = email;
    if (preferredDate) fields.preferred_date = preferredDate;
    if (preferredTime) fields.preferred_time = preferredTime;
    if (notes) fields.notes = notes;

    const created = await createViewingRequest(fields);

    return res.status(201).json({
      ok: true,
      request: mapViewingRequestRow(created),
    });
  } catch (err) {
    console.error("POST /api/public/dealer/:dealerId/requests error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

/** ========= Dealer API ========= */
app.post("/api/dealer/login", async (req, res) => {
  try {
    const rawIdentity = cleanStr(req.body.dealerId, 120);
    const emailInput = cleanStr(req.body.email, 120);
    const emailFromDealerId = rawIdentity && isValidEmail(rawIdentity) ? rawIdentity : "";
    const dealerIdInput = emailFromDealerId ? "" : rawIdentity;
    const emailCandidate = emailFromDealerId || emailInput;
    const passcode = cleanStr(req.body.passcode, 120);

    if (!dealerIdInput && !emailCandidate) {
      return res.status(400).json({ ok: false, error: "dealerId or email is required" });
    }
    if (dealerIdInput && !isValidDealerId(dealerIdInput)) {
      return res.status(400).json({ ok: false, error: "Invalid dealerId" });
    }
    if (emailCandidate && !isValidEmail(emailCandidate)) {
      return res.status(400).json({ ok: false, error: "Invalid email" });
    }
    if (!passcode) {
      return res.status(400).json({ ok: false, error: "passcode is required" });
    }

    const dealer =
      (dealerIdInput ? await getProfileByDealerId(dealerIdInput) : null) ||
      (emailCandidate ? await getProfileByEmail(emailCandidate) : null);
    if (!dealer) return res.status(401).json({ ok: false, error: "Dealer not found" });

    if (isPausedDealer(dealer)) {
      return res.status(403).json({ ok: false, error: "Dealer account is paused" });
    }

    const storedPasscode = dealer.password;
    if (!storedPasscode) return res.status(401).json({ ok: false, error: "Dealer passcode not set" });

    if (passcode !== storedPasscode) {
      return res.status(401).json({ ok: false, error: "Invalid passcode" });
    }

    const dealerId = dealer.dealer_id || dealerIdInput;
    const token = signToken({ role: "dealer", dealerId });

    return res.json({
      ok: true,
      token,
      dealer: mapProfileRow(dealer),
    });
  } catch (err) {
    console.error("POST /api/dealer/login error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.get("/api/dealer/me", requireDealer, async (req, res) => {
  try {
    const dealerId = cleanStr(req.user?.dealerId, 60);
    const dealer = await getProfileByDealerId(dealerId);
    if (!dealer) return res.status(404).json({ ok: false, error: "Dealer not found" });

    return res.json({
      ok: true,
      dealer: mapProfileRow(dealer),
    });
  } catch (err) {
    console.error("GET /api/dealer/me error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.get("/api/dealer/vehicles", requireDealer, async (req, res) => {
  try {
    const dealerId = cleanStr(req.user?.dealerId, 60);
    const includeArchived = toBool(req.query.includeArchived);

    const vehicles = await getVehiclesForDealer(dealerId, {
      includeArchived: includeArchived !== undefined ? includeArchived : true,
      publicOnly: false,
    });

    return res.json({ ok: true, vehicles: vehicles.map(mapVehicleRow) });
  } catch (err) {
    console.error("GET /api/dealer/vehicles error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.post("/api/dealer/vehicles", requireDealer, async (req, res) => {
  try {
    const dealerId = cleanStr(req.user?.dealerId, 60);
    const vehicleId = cleanStr(req.body.vehicleId, 60);

    if (!vehicleId) {
      return res.status(400).json({ ok: false, error: "vehicleId is required" });
    }

    const existing = await getVehicleByVehicleId(vehicleId);
    if (existing && existing.dealer_id !== dealerId) {
      return res.status(403).json({ ok: false, error: "Vehicle belongs to another dealer" });
    }

    const fields = {
      ...mapVehicleInput(req.body),
      dealer_id: dealerId,
      vehicle_id: vehicleId,
    };

    const vehicle = existing
      ? await updateVehicleByVehicleId(vehicleId, fields)
      : await createVehicle(fields);

    if (!vehicle) {
      return res.status(500).json({ ok: false, error: "Failed to save vehicle" });
    }

    return res.json({ ok: true, vehicle: mapVehicleRow(vehicle) });
  } catch (err) {
    console.error("POST /api/dealer/vehicles error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.post("/api/dealer/vehicles/:vehicleId/archive", requireDealer, async (req, res) => {
  try {
    const vehicleId = cleanStr(req.params.vehicleId, 60);
    if (!vehicleId) {
      return res.status(400).json({ ok: false, error: "vehicleId is required" });
    }

    const dealerId = cleanStr(req.user?.dealerId, 60);
    const existing = await getVehicleByVehicleId(vehicleId);
    if (!existing) return res.status(404).json({ ok: false, error: "Vehicle not found" });
    if (existing.dealer_id !== dealerId) {
      return res.status(403).json({ ok: false, error: "Vehicle belongs to another dealer" });
    }

    const updated = await archiveVehicle(vehicleId);

    return res.json({ ok: true, vehicle: mapVehicleRow(updated) });
  } catch (err) {
    console.error("POST /api/dealer/vehicles/:vehicleId/archive error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.get("/api/dealer/requests", requireDealer, async (req, res) => {
  try {
    const dealerId = cleanStr(req.user?.dealerId, 60);
    const requests = await listViewingRequests({ dealerId });
    return res.json({ ok: true, requests: requests.map(mapViewingRequestRow) });
  } catch (err) {
    console.error("GET /api/dealer/requests error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.post("/api/dealer/requests/:requestId/status", requireDealer, async (req, res) => {
  try {
    const requestId = cleanStr(req.params.requestId, 80);
    const status = normalizeRequestStatus(req.body.status);

    if (!requestId) {
      return res.status(400).json({ ok: false, error: "requestId is required" });
    }

    if (!status) {
      return res.status(400).json({ ok: false, error: "Invalid status" });
    }

    const updated = await updateViewingRequestByRequestId(requestId, { status });
    if (!updated) return res.status(404).json({ ok: false, error: "Request not found" });

    return res.json({ ok: true, request: mapViewingRequestRow(updated) });
  } catch (err) {
    console.error("POST /api/dealer/requests/:requestId/status error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.get("/api/dealer/summary", requireDealer, async (req, res) => {
  try {
    const dealerId = cleanStr(req.user?.dealerId, 60);
    const month = cleanStr(req.query.month, 20);

    const kpis = await getDealerMetrics(dealerId, { month: month || undefined });

    return res.json({
      ok: true,
      kpis,
      dailyRequests: [],
    });
  } catch (err) {
    console.error("GET /api/dealer/summary error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

/** ========= Admin API ========= */
app.post("/api/admin/login", async (req, res) => {
  try {
    const username = cleanStr(req.body.username, 120);
    const password = cleanStr(req.body.password, 200);

    const { adminIdentifier, adminPassword, adminEmailSet, adminUsernameSet, adminPasswordSet } =
      getAdminCredentials();

    if (!adminIdentifier || !adminPasswordSet) {
      return res.status(500).json({ ok: false, error: "Admin credentials not configured" });
    }

    if (username !== adminIdentifier) {
      return res.status(401).json({
        ok: false,
        error: "Invalid credentials",
        reason: adminEmailSet || adminUsernameSet ? "username mismatch" : "admin identifier missing",
      });
    }

    if (password !== adminPassword) {
      return res.status(401).json({ ok: false, error: "Invalid credentials", reason: "password mismatch" });
    }

    const token = signToken({ role: "admin", username });
    return res.json({ ok: true, token });
  } catch (err) {
    console.error("POST /api/admin/login error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.get("/api/admin/debug-env", (req, res) => {
  if (NODE_ENV === "production") {
    return res.status(404).json({ ok: false, error: "Not Found" });
  }

  return res.json({
    ok: true,
    env: {
      SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      JWT_SECRET: Boolean(process.env.JWT_SECRET),
      ADMIN_API_KEY: Boolean(process.env.ADMIN_API_KEY),
      ADMIN_EMAIL: Boolean(process.env.ADMIN_EMAIL),
      ADMIN_USERNAME: Boolean(process.env.ADMIN_USERNAME),
      ADMIN_PASSWORD: Boolean(process.env.ADMIN_PASSWORD),
    },
  });
});

app.get("/api/admin/dealers", requireAdmin, async (req, res) => {
  try {
    const status = cleanStr(req.query.status, 30).toLowerCase();
    const dealers = await listProfiles(status ? { status } : {});
    return res.json({ ok: true, dealers: dealers.map(mapProfileRow) });
  } catch (err) {
    console.error("GET /api/admin/dealers error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.post("/api/admin/dealers", requireAdmin, async (req, res) => {
  try {
    const dealerId = cleanStr(req.body.dealerId, 60);
    const name = cleanStr(req.body.name, 120);
    const status = cleanStr(req.body.status, 40).toLowerCase() || "active";
    const whatsapp = cleanStr(req.body.whatsapp, 40);
    const logoUrl = cleanStr(req.body.logoUrl, 500);
    const profileEmail = cleanStr(req.body.profileEmail || req.body.email, 120);

    if (!dealerId || !name) {
      return res.status(400).json({ ok: false, error: "dealerId and name are required" });
    }
    if (!isValidDealerId(dealerId)) {
      return res.status(400).json({ ok: false, error: "Invalid dealerId" });
    }

    let passcode = cleanStr(req.body.passcode, 120);
    const fields = pruneUndefined({
      dealer_id: dealerId,
      name,
      status,
      whatsapp,
      logo_url: logoUrl,
      profile_email: profileEmail || undefined,
    });

    const existing = await getProfileByDealerId(dealerId);
    if (!existing && !passcode) {
      passcode = generatePasscode();
    }

    if (passcode) {
      fields.password = passcode;
    }

    const dealer = await upsertProfile(fields);

    if (!dealer) {
      return res.status(500).json({ ok: false, error: "Failed to save dealer" });
    }

    return res.json({ ok: true, dealer: mapProfileRow(dealer), passcode });
  } catch (err) {
    console.error("POST /api/admin/dealers error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.post("/api/admin/reset-passcode", requireAdmin, async (req, res) => {
  try {
    const dealerId = cleanStr(req.body.dealerId, 60);
    if (!dealerId || !isValidDealerId(dealerId)) {
      return res.status(400).json({ ok: false, error: "Invalid dealerId" });
    }

    const passcode = generatePasscode();
    const existing = await getProfileByDealerId(dealerId);
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Dealer not found" });
    }

    const dealer = await upsertProfile({
      dealer_id: dealerId,
      password: passcode,
    });

    if (!dealer) {
      return res.status(404).json({ ok: false, error: "Dealer not found" });
    }

    return res.json({ ok: true, dealer: mapProfileRow(dealer), passcode });
  } catch (err) {
    console.error("POST /api/admin/reset-passcode error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.get("/api/admin/inventory", requireAdmin, async (req, res) => {
  try {
    const dealerId = cleanStr(req.query.dealerId, 60);
    const status = normalizeVehicleStatus(req.query.status);
    const vehicles = await listVehicles({ dealerId, status });
    return res.json({ ok: true, vehicles: vehicles.map(mapVehicleRow) });
  } catch (err) {
    console.error("GET /api/admin/inventory error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.get("/api/admin/requests", requireAdmin, async (req, res) => {
  try {
    const dealerId = cleanStr(req.query.dealerId, 60);
    const status = normalizeRequestStatus(req.query.status) || "";
    const requests = await listViewingRequests({ dealerId, status });
    return res.json({ ok: true, requests: requests.map(mapViewingRequestRow) });
  } catch (err) {
    console.error("GET /api/admin/requests error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.get("/api/admin/dealers/summary", requireAdmin, async (req, res) => {
  try {
    const month = cleanStr(req.query.month, 20);
    const summaryRaw = await getDealersSummary({ month: month || undefined });

    const dealers = (summaryRaw.dealers || []).map((d) => ({
      dealerId: d.dealerId,
      name: d.name || "",
      status: d.status || "",
      inventory: d.inventory?.total || 0,
      available: d.inventory?.byStatus?.available || 0,
      requests: d.requests?.total || 0,
      new: d.requests?.byStatus?.new || 0,
      booked: d.requests?.byStatus?.booked || 0,
    }));

    const totals = {
      dealers: dealers.length,
      activeDealers: dealers.filter((d) => String(d.status).toLowerCase() === "active").length,
      availableVehicles: dealers.reduce((sum, d) => sum + Number(d.available || 0), 0),
      requests: dealers.reduce((sum, d) => sum + Number(d.requests || 0), 0),
    };

    return res.json({
      ok: true,
      summary: {
        month: summaryRaw.month || null,
        totals,
        dealers,
      },
    });
  } catch (err) {
    console.error("GET /api/admin/dealers/summary error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

/** ========= 404 ========= */
app.use((req, res) => {
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
