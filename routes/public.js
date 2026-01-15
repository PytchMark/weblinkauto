"use strict";

const express = require("express");
const router = express.Router();

const {
  getDealerByDealerId,
  getVehiclesForDealer,
  getVehicleByVehicleId,
  createViewingRequest,
} = require("../services/airtable");

/**
 * Basic input guards (kept lightweight)
 */
function cleanStr(v, max = 500) {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s.length > max ? s.slice(0, max) : s;
}

function isValidDealerId(dealerId) {
  // Allow DEALER-0001, dealerpytch, etc. (letters/numbers/dash/underscore)
  return /^[a-zA-Z0-9_-]{3,40}$/.test(dealerId);
}

function normalizePhone(phone) {
  // Keep digits + plus
  return cleanStr(phone, 40).replace(/[^\d+]/g, "");
}

function mapRequestTypeToEnum(type) {
  const t = cleanStr(type, 40).toLowerCase();

  // map UI-friendly values -> Airtable single select values (your VIEWING_REQUESTS.type)
  if (t === "whatsapp" || t === "wa" || t === "chat") return "whatsapp";
  if (t === "live_video" || t === "live video" || t === "video" || t === "live") return "live_video";
  if (t === "walk_in" || t === "walk-in" || t === "in_store" || t === "in-store" || t === "in person") return "walk_in";

  return null;
}

function isPausedDealer(dealer) {
  const status = cleanStr(dealer?.status, 30).toLowerCase();
  return status === "paused";
}

/**
 * GET dealer profile (public)
 * GET /api/public/dealer/:dealerId
 */
router.get("/dealer/:dealerId", async (req, res) => {
  try {
    const dealerId = cleanStr(req.params.dealerId, 60);

    if (!isValidDealerId(dealerId)) {
      return res.status(400).json({ ok: false, error: "Invalid dealerId" });
    }

    const dealer = await getDealerByDealerId(dealerId);
    if (!dealer) return res.status(404).json({ ok: false, error: "Dealer not found" });

    if (isPausedDealer(dealer)) {
      return res.status(403).json({ ok: false, error: "Dealer storefront is paused" });
    }

    return res.json({
      ok: true,
      dealer: {
        dealerId: dealer.dealerId,
        name: dealer.name || "",
        status: dealer.status || "",
        whatsapp: dealer.whatsapp || "",
        logoUrl: dealer.logoUrl || "",
      },
    });
  } catch (err) {
    console.error("GET /api/public/dealer/:dealerId error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

/**
 * GET vehicles for dealer (public)
 * GET /api/public/dealer/:dealerId/vehicles
 *
 * Defaults:
 * - publicOnly = true  => Availability = true AND archived != true
 * Query:
 * - ?all=1 => returns all non-archived vehicles for that dealer (Availability not required)
 */
router.get("/dealer/:dealerId/vehicles", async (req, res) => {
  try {
    const dealerId = cleanStr(req.params.dealerId, 60);

    if (!isValidDealerId(dealerId)) {
      return res.status(400).json({ ok: false, error: "Invalid dealerId" });
    }

    const all = cleanStr(req.query.all, 10) === "1";

    // Validate dealer exists + not paused
    const dealer = await getDealerByDealerId(dealerId);
    if (!dealer) return res.status(404).json({ ok: false, error: "Dealer not found" });

    if (isPausedDealer(dealer)) {
      return res.status(403).json({ ok: false, error: "Dealer storefront is paused" });
    }

    const vehicles = await getVehiclesForDealer(dealerId, {
      includeArchived: false,
      publicOnly: !all, // when publicOnly=true: Availability=TRUE and archived!=TRUE enforced inside service
    });

    return res.json({
      ok: true,
      dealer: {
        dealerId: dealer.dealerId,
        name: dealer.name || "",
        logoUrl: dealer.logoUrl || "",
      },
      vehicles,
    });
  } catch (err) {
    console.error("GET /api/public/dealer/:dealerId/vehicles error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

/**
 * POST create viewing request (public)
 * POST /api/public/dealer/:dealerId/requests
 *
 * Body:
 * {
 *   requestType: "whatsapp" | "live_video" | "walk_in",
 *   vehicleId?: "VEH-XXXXX",
 *   customerName: "John Doe",
 *   phone: "+1876....",
 *   email?: "x@y.com",
 *   preferredDate?: "2026-01-15",
 *   preferredTime?: "2026-01-15T15:00:00.000Z" (recommended ISO) OR "10:00 AM" (best-effort)
 *   notes?: "..."
 * }
 */
router.post("/dealer/:dealerId/requests", async (req, res) => {
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

    // Validate dealer exists + not paused
    const dealer = await getDealerByDealerId(dealerId);
    if (!dealer) return res.status(404).json({ ok: false, error: "Dealer not found" });

    if (isPausedDealer(dealer)) {
      return res.status(403).json({ ok: false, error: "Dealer storefront is paused" });
    }

    // Optional: validate vehicle belongs to dealer if vehicleId provided
    let safeVehicleId = "";
    if (vehicleId) {
      const v = await getVehicleByVehicleId(vehicleId);
      if (v && cleanStr(v.dealerId, 60) === dealerId) {
        safeVehicleId = vehicleId;
      }
    }

    // Build VIEWING_REQUESTS fields using your exact API field names
    const fields = {
      dealerId,              // VIEWING_REQUESTS.dealerId
      type: typeEnum,        // VIEWING_REQUESTS.type (single select)
      status: "new",         // VIEWING_REQUESTS.status (single select)
      name,                  // VIEWING_REQUESTS.name
      phone,                 // VIEWING_REQUESTS.phone
      source: "storefront",  // VIEWING_REQUESTS.source (single select)
    };

    if (safeVehicleId) fields.vehicleId = safeVehicleId;
    if (email) fields.email = email;
    if (preferredDate) fields.preferredDate = preferredDate;

    /**
     * NOTE on preferredTime:
     * Your schema shows preferredTime is a Date field.
     * Best practice is ISO datetime string (e.g. 2026-01-15T15:00:00.000Z).
     * If you send "10:00 AM", Airtable may reject depending on locale.
     * We'll accept it as-is here; later we can normalize on the frontend.
     */
    if (preferredTime) fields.preferredTime = preferredTime;

    if (notes) fields.notes = notes;

    const created = await createViewingRequest(fields);

    return res.status(201).json({
      ok: true,
      request: created,
    });
  } catch (err) {
    console.error("POST /api/public/dealer/:dealerId/requests error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

module.exports = router;
