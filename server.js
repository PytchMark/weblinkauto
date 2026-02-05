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
const multer = require("multer");

const { signToken, verifyToken } = require("./services/auth");
const {
  sendWelcomeEmail,
  sendNewRequestAlert,
  sendLowInventoryAlert,
  sendFailedPaymentEmail,
  sendUpgradePromptEmail,
  sendReferralInviteEmail,
  sendPasscodeResetEmail,
  sendSuspensionNoticeEmail,
} = require("./services/email");
const {
  getProfileByDealerId,
  getProfileByEmail,
  getProfileByStripeCustomerId,
  getProfileByStripeSubscriptionId,
  getLatestDealerId,
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
const { stripe } = require("./lib/stripe");

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024,
    files: 10,
  },
});

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

app.use(
  express.json({
    limit: "2mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 180,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Stricter rate limits for sensitive endpoints (#12 Rate Limiting)
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: { ok: false, error: "Too many login attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const passcodeResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 reset requests per hour
  message: { ok: false, error: "Too many reset requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(morgan(NODE_ENV === "production" ? "combined" : "dev"));

/** ========= Static apps ========= */
const APPS_DIR = path.join(__dirname, "apps");

app.use("/storefront", express.static(path.join(APPS_DIR, "storefront")));
app.use("/dealer", express.static(path.join(APPS_DIR, "dealer")));
app.use("/admin", express.static(path.join(APPS_DIR, "admin")));
app.use("/landing", express.static(path.join(APPS_DIR, "landing")));

/** Root */
app.get("/", (_req, res) => res.redirect("/storefront"));

/** Dealer storefront deep link (e.g. /DEALER-0001) */
app.get(/^\/(?!api|dealer|admin|landing|storefront|health)([A-Za-z0-9_-]{3,40})$/, (req, res) => {
  res.sendFile(path.join(APPS_DIR, "storefront", "index.html"));
});

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
  if (
    t === "walk_in" ||
    t === "walk-in" ||
    t === "walkin" ||
    t === "in_store" ||
    t === "in-store" ||
    t === "in person"
  )
    return "walk_in";

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

// #8 Referral Code Generator
function generateReferralCode(dealerId) {
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `REF-${suffix}`;
}

// #8 Process Referral Reward
async function processReferralReward(referralCode) {
  // Find the dealer who owns this referral code
  const profiles = await listProfiles({ referral_code: referralCode });
  if (!profiles || profiles.length === 0) return null;
  
  const referrer = profiles[0];
  const currentCredits = parseInt(referrer.referral_credits || "0", 10);
  
  // Add 1 month credit (30 days worth)
  await upsertProfile({
    dealer_id: referrer.dealer_id,
    referral_credits: currentCredits + 1,
  });
  
  // Send email to referrer about successful referral
  if (referrer.profile_email) {
    sendReferralInviteEmail({
      dealerEmail: referrer.profile_email,
      dealerName: referrer.name,
      referralCode: referrer.referral_code,
      referralLink: `${process.env.APP_BASE_URL || ''}/landing?ref=${referrer.referral_code}`,
    }).catch(err => console.error("Referral email error:", err));
  }
  
  return referrer;
}

// #9 Passcode Reset Token Generator
function generateResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

// Store reset tokens in memory (in production, use Redis or DB)
const resetTokens = new Map();

function getAppBaseUrl(req) {
  const envBase = cleanStr(process.env.APP_BASE_URL, 200).replace(/\/+$/, "");
  if (envBase) return envBase;
  return `${req.protocol}://${req.get("host")}`;
}

function isSubscriptionActive(dealer) {
  if (!dealer) return false;
  const status = cleanStr(dealer?.stripe_subscription_status, 40).toLowerCase();
  if (!status) return true;
  if (["active", "trialing"].includes(status)) return true;
  const trialEndsAt = dealer?.trial_ends_at ? new Date(dealer.trial_ends_at) : null;
  if (trialEndsAt && !Number.isNaN(trialEndsAt.getTime())) {
    return trialEndsAt.getTime() > Date.now();
  }
  return false;
}

async function generateNextDealerId() {
  const latest = await getLatestDealerId();
  let nextNumber = 1;

  if (latest?.dealer_id) {
    const match = String(latest.dealer_id).match(/DEALER-(\d+)/i);
    if (match) {
      nextNumber = Number(match[1]) + 1;
    }
  }

  for (let i = 0; i < 50; i += 1) {
    const candidate = `DEALER-${String(nextNumber + i).padStart(4, "0")}`;
    const existing = await getProfileByDealerId(candidate);
    if (!existing) return candidate;
  }

  return `DEALER-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function provisionDealerFromStripe({ session, subscription, passcodeOverride } = {}) {
  if (!session) return null;
  const customerId = session.customer || "";
  const subscriptionId = session.subscription || subscription?.id || "";
  const metadata = session.metadata || {};
  const tier = cleanStr(metadata.tier || metadata.plan, 40).toLowerCase();
  const plan = tier || "";
  const email = cleanStr(metadata.email || session.customer_details?.email, 120);
  const name = cleanStr(metadata.business_name || metadata.businessName || session.customer_details?.name, 120);
  const whatsapp = normalizePhone(metadata.whatsapp);
  const referralCode = cleanStr(metadata.referral_code, 20);

  let dealer =
    (customerId ? await getProfileByStripeCustomerId(customerId) : null) ||
    (subscriptionId ? await getProfileByStripeSubscriptionId(subscriptionId) : null);

  const trialEndTimestamp = subscription?.trial_end ? subscription.trial_end * 1000 : null;
  const trialEndsAt =
    trialEndTimestamp && Number.isFinite(trialEndTimestamp)
      ? new Date(trialEndTimestamp).toISOString()
      : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const status = subscription?.status || "trialing";

  if (!dealer) {
    const dealerId = await generateNextDealerId();
    const passcode = passcodeOverride || generatePasscode();
    const newReferralCode = generateReferralCode(dealerId);
    
    dealer = await upsertProfile({
      dealer_id: dealerId,
      name: name || "Dealer",
      status: "active",
      profile_email: email || undefined,
      whatsapp: whatsapp || undefined,
      password: passcode,
      plan,
      trial_ends_at: trialEndsAt,
      stripe_customer_id: customerId || undefined,
      stripe_subscription_id: subscriptionId || undefined,
      stripe_subscription_status: status,
      referral_code: newReferralCode,
      referred_by: referralCode || undefined,
    });
    
    // #1 Send Welcome Email
    if (email) {
      sendWelcomeEmail({
        email,
        dealerName: name || "Dealer",
        dealerId,
        passcode,
        plan: plan || "Tier 1",
      }).catch(err => console.error("Welcome email error:", err));
    }
    
    // #8 Process Referral - Give referrer a free month credit
    if (referralCode) {
      processReferralReward(referralCode).catch(err => console.error("Referral reward error:", err));
    }
    
    return { dealer, passcode };
  }

  const updated = await upsertProfile({
    dealer_id: dealer.dealer_id,
    name: name || dealer.name || undefined,
    profile_email: email || dealer.profile_email || undefined,
    whatsapp: whatsapp || dealer.whatsapp || undefined,
    plan: plan || dealer.plan || undefined,
    trial_ends_at: trialEndsAt,
    stripe_customer_id: customerId || dealer.stripe_customer_id || undefined,
    stripe_subscription_id: subscriptionId || dealer.stripe_subscription_id || undefined,
    stripe_subscription_status: status,
  });

  return { dealer: updated, passcode: null };
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

function requireActiveDealer(req, res, next) {
  requireDealer(req, res, async () => {
    try {
      const dealerId = cleanStr(req.user?.dealerId, 60);
      const dealer = await getProfileByDealerId(dealerId);
      if (!dealer) return res.status(404).json({ ok: false, error: "Dealer not found" });
      if (isPausedDealer(dealer)) {
        return res.status(403).json({ ok: false, error: "Dealer account is paused" });
      }
      if (!isSubscriptionActive(dealer)) {
        return res.status(402).json({ ok: false, error: "Subscription inactive" });
      }
      return next();
    } catch (err) {
      console.error("Dealer subscription check error:", err);
      return res.status(500).json({ ok: false, error: "Subscription check failed" });
    }
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

function buildCloudinaryFolder(dealerId, vehicleId) {
  const template = cleanStr(process.env.CLOUDINARY_FOLDER || process.env.CLOUDINARY_BASE_FOLDER, 200);
  const fallback = `weblink/dealers/${dealerId}/vehicles/${vehicleId}`;
  const base = template || fallback;
  return base
    .replaceAll("{dealerId}", dealerId)
    .replaceAll("{vehicleId}", vehicleId)
    .replace(/^\/+|\/+$/g, "");
}

function signCloudinaryParams(params, apiSecret) {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  const signatureBase = entries.map(([key, value]) => `${key}=${value}`).join("&");
  return crypto.createHash("sha1").update(signatureBase + apiSecret).digest("hex");
}

async function uploadToCloudinary({ file, folder, resourceType, cloudName, apiKey, apiSecret }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signCloudinaryParams({ folder, timestamp }, apiSecret);
  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

  const form = new FormData();
  const mime = file.mimetype || "application/octet-stream";
  const blob = new Blob([file.buffer], { type: mime });
  form.append("file", blob, file.originalname || `upload-${timestamp}`);
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);
  form.append("folder", folder);

  const res = await fetch(endpoint, { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.secure_url) {
    throw new Error(data?.error?.message || "Cloudinary upload failed");
  }
  return data.secure_url;
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
    plan: profile.plan || "",
    trialEndsAt: profile.trial_ends_at || "",
    stripeSubscriptionStatus: profile.stripe_subscription_status || "",
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
    heroImageUrl: vehicle.hero_image_url || "",
    heroVideoUrl: vehicle.hero_video_url || "",
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
    hero_image_url: cleanStr(body.heroImageUrl || body.hero_image_url, 2000),
    hero_video_url: cleanStr(body.heroVideoUrl || body.hero_video_url, 2000),
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

app.get("/api/public/dealer", async (req, res) => {
  try {
    const dealerId = cleanStr(req.query.dealerId, 60);
    if (!dealerId || !isValidDealerId(dealerId)) {
      return res.status(400).json({ ok: false, error: "Invalid dealerId" });
    }

    const dealer = await getProfileByDealerId(dealerId);
    if (!dealer) return res.status(404).json({ ok: false, error: "Dealer not found" });
    if (isPausedDealer(dealer)) {
      return res.status(403).json({ ok: false, error: "Dealer storefront is paused" });
    }

    return res.json({ ok: true, dealer: mapProfileRow(dealer) });
  } catch (err) {
    console.error("GET /api/public/dealer error:", err);
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

/** ========= Stripe API ========= */
app.post("/api/stripe/create-checkout-session", async (req, res) => {
  try {
    const tier = cleanStr(req.body.tier, 20).toLowerCase();
    const email = cleanStr(req.body.email, 120);
    const businessName = cleanStr(req.body.businessName, 120);
    const whatsapp = normalizePhone(req.body.whatsapp);

    const priceMap = {
      tier1: process.env.STRIPE_PRICE_TIER1,
      tier2: process.env.STRIPE_PRICE_TIER2,
      tier3: process.env.STRIPE_PRICE_TIER3,
    };
    const priceId = priceMap[tier];

    if (!priceId) {
      return res.status(400).json({ ok: false, error: "Invalid pricing tier" });
    }

    const baseUrl = getAppBaseUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email || undefined,
      success_url: `${baseUrl}/landing?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/landing?status=cancel`,
      subscription_data: {
        trial_period_days: 14,
        metadata: {
          tier,
        },
      },
      metadata: {
        tier,
        email,
        business_name: businessName,
        whatsapp,
      },
    });

    return res.json({ ok: true, sessionId: session.id, url: session.url });
  } catch (err) {
    console.error("POST /api/stripe/create-checkout-session error:", err);
    return res.status(500).json({ ok: false, error: "Unable to start checkout" });
  }
});

app.get("/api/public/checkout-session", async (req, res) => {
  try {
    const sessionId = cleanStr(req.query.sessionId, 200);
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: "sessionId is required" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const customerId = session.customer;
    const subscriptionId = session.subscription;

    let dealer =
      (customerId ? await getProfileByStripeCustomerId(customerId) : null) ||
      (subscriptionId ? await getProfileByStripeSubscriptionId(subscriptionId) : null);

    if (!dealer) {
      return res.json({ ok: true, status: "pending" });
    }

    return res.json({
      ok: true,
      status: "ready",
      dealer: mapProfileRow(dealer),
    });
  } catch (err) {
    console.error("GET /api/public/checkout-session error:", err);
    return res.status(500).json({ ok: false, error: "Unable to load checkout session" });
  }
});

app.post("/api/stripe/webhook", async (req, res) => {
  const signature = req.headers["stripe-signature"];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    return res.status(500).send("Stripe webhook secret not configured.");
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, signature, secret);
  } catch (err) {
    console.error("Stripe webhook signature error:", err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const subscription = session.subscription
          ? await stripe.subscriptions.retrieve(session.subscription)
          : null;
        await provisionDealerFromStripe({ session, subscription });
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const session = subscription.latest_invoice
          ? await stripe.checkout.sessions
              .list({ customer: subscription.customer, limit: 1 })
              .then((list) => list.data[0] || null)
          : null;
        if (session) {
          await provisionDealerFromStripe({ session, subscription });
        } else {
          const dealer =
            (subscription.customer
              ? await getProfileByStripeCustomerId(subscription.customer)
              : null) ||
            (subscription.id ? await getProfileByStripeSubscriptionId(subscription.id) : null);
          if (dealer) {
            await upsertProfile({
              dealer_id: dealer.dealer_id,
              stripe_subscription_status: subscription.status,
              trial_ends_at: subscription.trial_end
                ? new Date(subscription.trial_end * 1000).toISOString()
                : dealer.trial_ends_at,
              stripe_subscription_id: subscription.id,
              stripe_customer_id: subscription.customer || dealer.stripe_customer_id,
            });
            
            // #22 Dealer Suspension Flow - handle subscription deletion/cancellation
            if (subscription.status === "canceled" || subscription.status === "unpaid") {
              await upsertProfile({
                dealer_id: dealer.dealer_id,
                status: "paused",
              });
              
              if (dealer.profile_email) {
                sendSuspensionNoticeEmail({
                  dealerEmail: dealer.profile_email,
                  dealerName: dealer.name,
                  dealerId: dealer.dealer_id,
                  reason: subscription.status === "canceled" 
                    ? "Your subscription has been canceled." 
                    : "Payment failed after multiple attempts.",
                  reactivateLink: `${process.env.APP_BASE_URL || ''}/landing`,
                }).catch(err => console.error("Suspension email error:", err));
              }
            }
          }
        }
        break;
      }
      // #5 Failed Payment Recovery
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const dealer = customerId ? await getProfileByStripeCustomerId(customerId) : null;
        
        if (dealer && dealer.profile_email) {
          const nextAttempt = invoice.next_payment_attempt 
            ? new Date(invoice.next_payment_attempt * 1000).toLocaleDateString()
            : null;
          
          sendFailedPaymentEmail({
            dealerEmail: dealer.profile_email,
            dealerName: dealer.name,
            dealerId: dealer.dealer_id,
            nextAttemptDate: nextAttempt,
          }).catch(err => console.error("Failed payment email error:", err));
        }
        break;
      }
      default:
        break;
    }

    return res.json({ received: true });
  } catch (err) {
    console.error("Stripe webhook handler error:", err);
    return res.status(500).send("Webhook handler failed.");
  }
});

/** ========= Dealer API ========= */

// Apply rate limiter to login endpoint (#12)
app.post("/api/dealer/login", authRateLimiter, async (req, res) => {
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
    if (!isSubscriptionActive(dealer)) {
      return res.status(402).json({ ok: false, error: "Subscription inactive" });
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

// #9 Passcode Reset - Request reset token
app.post("/api/dealer/request-reset", passcodeResetLimiter, async (req, res) => {
  try {
    const email = cleanStr(req.body.email, 120);
    
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ ok: false, error: "Valid email is required" });
    }
    
    const dealer = await getProfileByEmail(email);
    
    // Always return success to prevent email enumeration
    if (!dealer) {
      return res.json({ ok: true, message: "If an account exists, a reset link has been sent." });
    }
    
    const resetToken = generateResetToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    
    resetTokens.set(resetToken, {
      dealerId: dealer.dealer_id,
      email: dealer.profile_email,
      expiresAt,
    });
    
    // Clean up expired tokens
    for (const [token, data] of resetTokens) {
      if (data.expiresAt < new Date()) resetTokens.delete(token);
    }
    
    await sendPasscodeResetEmail({
      dealerEmail: dealer.profile_email,
      dealerName: dealer.name,
      resetToken,
      expiresAt: expiresAt.toLocaleString(),
    });
    
    return res.json({ ok: true, message: "If an account exists, a reset link has been sent." });
  } catch (err) {
    console.error("POST /api/dealer/request-reset error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

// #9 Passcode Reset - Verify token and set new passcode
app.post("/api/dealer/reset-passcode", async (req, res) => {
  try {
    const token = cleanStr(req.body.token, 100);
    const newPasscode = cleanStr(req.body.passcode, 120);
    
    if (!token) {
      return res.status(400).json({ ok: false, error: "Reset token is required" });
    }
    if (!newPasscode || newPasscode.length < 6) {
      return res.status(400).json({ ok: false, error: "Passcode must be at least 6 characters" });
    }
    
    const resetData = resetTokens.get(token);
    
    if (!resetData) {
      return res.status(400).json({ ok: false, error: "Invalid or expired reset token" });
    }
    
    if (resetData.expiresAt < new Date()) {
      resetTokens.delete(token);
      return res.status(400).json({ ok: false, error: "Reset token has expired" });
    }
    
    await upsertProfile({
      dealer_id: resetData.dealerId,
      password: newPasscode,
    });
    
    resetTokens.delete(token);
    
    return res.json({ ok: true, message: "Passcode updated successfully" });
  } catch (err) {
    console.error("POST /api/dealer/reset-passcode error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.get("/api/dealer/me", requireActiveDealer, async (req, res) => {
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

app.post("/api/media/upload", requireActiveDealer, upload.array("files", 5), async (req, res) => {
  try {
    const dealerId = cleanStr(req.user?.dealerId, 60);
    const vehicleId = cleanStr(req.body.vehicleId, 60);
    const rawType = cleanStr(req.body.resourceType || req.body.type, 20).toLowerCase();
    const resourceTypeOverride = ["image", "video"].includes(rawType) ? rawType : "";

    if (!dealerId) return res.status(401).json({ ok: false, error: "Dealer not found" });
    if (!vehicleId) return res.status(400).json({ ok: false, error: "vehicleId is required" });

    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) return res.status(400).json({ ok: false, error: "No files uploaded" });
    if (files.length > 10) return res.status(400).json({ ok: false, error: "Max 10 files per upload" });

    const cloudName = cleanStr(process.env.CLOUDINARY_CLOUD_NAME, 120);
    const apiKey = cleanStr(process.env.CLOUDINARY_API_KEY, 120);
    const apiSecret = cleanStr(process.env.CLOUDINARY_API_SECRET, 200);
    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(500).json({ ok: false, error: "Cloudinary is not configured" });
    }

    const folder = buildCloudinaryFolder(dealerId, vehicleId);
    const urls = [];

    for (const file of files) {
      const detected = file.mimetype?.startsWith("video/") ? "video" : "image";
      const resourceType = resourceTypeOverride || detected;
      if (!["image", "video"].includes(resourceType)) {
        return res.status(400).json({ ok: false, error: "Unsupported media type" });
      }
      const url = await uploadToCloudinary({
        file,
        folder,
        resourceType,
        cloudName,
        apiKey,
        apiSecret,
      });
      urls.push(url);
    }

    return res.json({ ok: true, urls });
  } catch (err) {
    console.error("POST /api/media/upload error:", err);
    return res.status(500).json({ ok: false, error: "Media upload failed" });
  }
});

app.get("/api/dealer/vehicles", requireActiveDealer, async (req, res) => {
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

app.post("/api/dealer/vehicles", requireActiveDealer, async (req, res) => {
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

app.post("/api/dealer/vehicles/:vehicleId/archive", requireActiveDealer, async (req, res) => {
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

app.get("/api/dealer/requests", requireActiveDealer, async (req, res) => {
  try {
    const dealerId = cleanStr(req.user?.dealerId, 60);
    const requests = await listViewingRequests({ dealerId });
    return res.json({ ok: true, requests: requests.map(mapViewingRequestRow) });
  } catch (err) {
    console.error("GET /api/dealer/requests error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

app.post("/api/dealer/requests/:requestId/status", requireActiveDealer, async (req, res) => {
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

app.get("/api/dealer/summary", requireActiveDealer, async (req, res) => {
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
    const plan = cleanStr(req.body.plan, 40).toLowerCase();

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
      plan: plan || undefined,
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
