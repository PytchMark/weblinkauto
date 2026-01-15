"use strict";

const express = require("express");
const router = express.Router();

const {
  getDealerByDealerId,
  getVehiclesForDealer,
  getVehicleByVehicleId,
  createVehicle,
  updateVehicleByRecordId,
  archiveVehicle,
} = require("../services/airtable");

const {
  verifyPasscode,
  signToken,
  requireDealer,
} = require("../services/auth");

/** -----------------------
 * Helpers
 * ----------------------*/
function cleanStr(v, max = 500) {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s.length > max ? s.slice(0, max) : s;
}

function cleanNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isValidDealerId(dealerId) {
  return /^[a-zA-Z0-9_-]{3,40}$/.test(dealerId);
}

function isValidVehicleId(vehicleId) {
  // allow VEH-xxxxx or any safe token
  return /^[a-zA-Z0-9_-]{3,60}$/.test(vehicleId);
}

function ensureDealerActive(dealer) {
  const status = cleanStr(dealer?.status, 30).toLowerCase();
  return status !== "paused";
}

function pickTruthy(obj) {
  // remove undefined/null/"" to avoid overwriting fields with empties unintentionally
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[k] = v;
  }
  return out;
}

/** -----------------------
 * POST /api/dealer/login
 * Body: { dealerId, passcode }
 * ----------------------*/
router.post("/login", async (req, res) => {
  try {
    const dealerId = cleanStr(req.body.dealerId, 60);
    const passcode = cleanStr(req.body.passcode, 120);

    if (!isValidDealerId(dealerId)) {
      return res.status(400).json({ ok: false, error: "Invalid dealerId" });
    }
    if (!passcode) {
      return res.status(400).json({ ok: false, error: "passcode is required" });
    }

    const dealer = await getDealerByDealerId(dealerId);
    if (!dealer) return res.status(404).json({ ok: false, error: "Dealer not found" });

    if (!ensureDealerActive(dealer)) {
      return res.status(403).json({ ok: false, error: "Dealer account is paused" });
    }

    // Your Airtable schema uses `passcodeHash` (API field name)
    const storedHash = dealer.passcodeHash;
    if (!storedHash) {
      return res.status(403).json({ ok: false, error: "Dealer passcode not set" });
    }

    const valid = verifyPasscode(passcode, storedHash);
    if (!valid) {
      return res.status(401).json({ ok: false, error: "Invalid passcode" });
    }

    const token = signToken({ role: "dealer", dealerId }, "12h");

    return res.json({
      ok: true,
      token,
      dealer: {
        dealerId: dealer.dealerId,
        name: dealer.name || "",
        status: dealer.status || "",
        whatsapp: dealer.whatsapp || "",
        logoUrl: dealer.logoUrl || "",
      },
    });
  } catch (err) {
    console.error("POST /api/dealer/login error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

/** -----------------------
 * GET /api/dealer/me
 * Header: Authorization: Bearer <token>
 * ----------------------*/
router.get("/me", requireDealer, async (req, res) => {
  try {
    const dealerId = req.user.dealerId;
    const dealer = await getDealerByDealerId(dealerId);
    if (!dealer) return res.status(404).json({ ok: false, error: "Dealer not found" });

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
    console.error("GET /api/dealer/me error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

/** -----------------------
 * GET /api/dealer/vehicles
 * Dealer-scoped inventory
 * Query:
 *  - ?includeArchived=1
 * ----------------------*/
router.get("/vehicles", requireDealer, async (req, res) => {
  try {
    const dealerId = req.user.dealerId;
    const includeArchived = cleanStr(req.query.includeArchived, 10) === "1";

    const vehicles = await getVehiclesForDealer(dealerId, {
      includeArchived,
      publicOnly: false,
    });

    return res.json({ ok: true, dealerId, vehicles });
  } catch (err) {
    console.error("GET /api/dealer/vehicles error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

/** -----------------------
 * POST /api/dealer/vehicles
 * Create a vehicle (dealer-scoped)
 * Body: fields matching your Vehicles API field names
 * Required: vehicleId, title (recommended), status
 * ----------------------*/
router.post("/vehicles", requireDealer, async (req, res) => {
  try {
    const dealerId = req.user.dealerId;

    const vehicleId = cleanStr(req.body.vehicleId, 80);
    if (!vehicleId || !isValidVehicleId(vehicleId)) {
      return res.status(400).json({ ok: false, error: "vehicleId is required" });
    }

    // Prevent dealer from creating duplicates
    const existing = await getVehicleByVehicleId(vehicleId);
    if (existing) {
      return res.status(409).json({ ok: false, error: "vehicleId already exists" });
    }

    // Build fields using your API field names (camelCase)
    const fields = pickTruthy({
      dealerId, // enforce server-side
      vehicleId,
      title: cleanStr(req.body.title, 160),
      status: cleanStr(req.body.status, 40) || "available",
      Make: cleanStr(req.body.Make, 80), // you have both Make and make-style fields; keep whichever you actually use in UI
      Model: cleanStr(req.body.Model, 80),
      Year: cleanNum(req.body.Year),
      VIN: cleanStr(req.body.VIN, 80),
      Price: cleanNum(req.body.Price),
      Mileage: cleanNum(req.body.Mileage),
      Color: cleanStr(req.body.Color, 60),
      "Body Type": cleanStr(req.body["Body Type"], 60),
      Transmission: cleanStr(req.body.Transmission, 40),
      "Fuel Type": cleanStr(req.body["Fuel Type"], 40),
      "Video URLs": cleanStr(req.body["Video URLs"], 2000),
      Description: cleanStr(req.body.Description, 4000),

      // Cloudinary URL storage (your schema)
      cloudinaryImageUrls: cleanStr(req.body.cloudinaryImageUrls, 20000), // (JSON or newline string, your choice)
      cloudinaryVideoUrl: cleanStr(req.body.cloudinaryVideoUrl, 600),

      // archive controls
      archived: false,

      // Optional visibility checkbox (your schema: Availability checkbox)
      Availability: req.body.Availability === true,
    });

    const created = await createVehicle(fields);
    return res.status(201).json({ ok: true, vehicle: created });
  } catch (err) {
    console.error("POST /api/dealer/vehicles error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

/** -----------------------
 * PATCH /api/dealer/vehicles/:vehicleId
 * Update a vehicle (dealer-scoped)
 * Body: any mutable fields (no deletes, no dealerId changes)
 * ----------------------*/
router.patch("/vehicles/:vehicleId", requireDealer, async (req, res) => {
  try {
    const dealerId = req.user.dealerId;
    const vehicleId = cleanStr(req.params.vehicleId, 80);

    if (!vehicleId || !isValidVehicleId(vehicleId)) {
      return res.status(400).json({ ok: false, error: "Invalid vehicleId" });
    }

    const existing = await getVehicleByVehicleId(vehicleId);
    if (!existing) return res.status(404).json({ ok: false, error: "Vehicle not found" });

    // Ensure vehicle belongs to this dealer
    if (cleanStr(existing.dealerId, 60) !== dealerId) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    // Deny dealerId edits + hard deletes
    const fields = pickTruthy({
      title: cleanStr(req.body.title, 160),
      status: cleanStr(req.body.status, 40),
      Make: cleanStr(req.body.Make, 80),
      Model: cleanStr(req.body.Model, 80),
      Year: cleanNum(req.body.Year),
      VIN: cleanStr(req.body.VIN, 80),
      Price: cleanNum(req.body.Price),
      Mileage: cleanNum(req.body.Mileage),
      Color: cleanStr(req.body.Color, 60),
      "Body Type": cleanStr(req.body["Body Type"], 60),
      Transmission: cleanStr(req.body.Transmission, 40),
      "Fuel Type": cleanStr(req.body["Fuel Type"], 40),
      "Video URLs": cleanStr(req.body["Video URLs"], 2000),
      Description: cleanStr(req.body.Description, 4000),
      "notes / description": cleanStr(req.body["notes / description"], 4000),

      cloudinaryImageUrls: cleanStr(req.body.cloudinaryImageUrls, 20000),
      cloudinaryVideoUrl: cleanStr(req.body.cloudinaryVideoUrl, 600),

      Availability:
        typeof req.body.Availability === "boolean" ? req.body.Availability : undefined,
    });

    // If someone tries to set archived via patch, we allow only if true -> archive (never unarchive via patch)
    if (req.body.archived === true) {
      fields.archived = true;
      fields.status = "archived";
    }

    const updated = await updateVehicleByRecordId(existing.airtableRecordId, fields);
    return res.json({ ok: true, vehicle: updated });
  } catch (err) {
    console.error("PATCH /api/dealer/vehicles/:vehicleId error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

/** -----------------------
 * POST /api/dealer/vehicles/:vehicleId/archive
 * Archive only (no delete)
 * ----------------------*/
router.post("/vehicles/:vehicleId/archive", requireDealer, async (req, res) => {
  try {
    const dealerId = req.user.dealerId;
    const vehicleId = cleanStr(req.params.vehicleId, 80);

    const existing = await getVehicleByVehicleId(vehicleId);
    if (!existing) return res.status(404).json({ ok: false, error: "Vehicle not found" });

    if (cleanStr(existing.dealerId, 60) !== dealerId) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    const archived = await archiveVehicle(vehicleId);
    return res.json({ ok: true, vehicle: archived });
  } catch (err) {
    console.error("POST /api/dealer/vehicles/:vehicleId/archive error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

module.exports = router;
