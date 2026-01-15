"use strict";

const express = require("express");
const router = express.Router();

const {
  getDealerByDealerId,
  getVehiclesForDealer,
  getVehicleByVehicleId,
  createRequest,
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
  const p = cleanStr(phone, 40).replace(/[^\d+]/g, "");
  return p;
}

function mapRequestTypeToAirtableLabel(type) {
  const t = cleanStr(type, 40).toLowerCase();

  // accept multiple aliases
  if (t === "whatsapp" || t === "wa" || t === "chat") return "WhatsApp";
  if (t === "live_video" || t === "live video" || t === "video" || t === "live") return "Live Video Viewing";
  if (t === "walk_in" || t === "walk-in" || t === "in_store" || t === "in-store" || t === "in person") return "Walk-in";

  return null;
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

    // Optional: hide paused dealers from public storefront
    const status = cleanStr(dealer["Status"], 20);
    if (status && status.toLowerCase() === "paused") {
      return res.status(403).json({ ok: false, error: "Dealer storefront is paused" });
    }

    return res.json({
      ok: true,
      dealer: {
        dealerId: dealer["Dealer ID"],
        dealerName: dealer["Dealer Name"],
        status: dealer["Status"],
        logoUrl: dealer["Logo URL"] || "",
        storefrontSlug: dealer["Storefront Slug"] || dealer["Dealer ID"],
        whatsappNumber: dealer["WhatsApp Number (E164)"] || "",
        whatsappDefaultMessage: dealer["WhatsApp Default Message"] || "",
      },
    });
  } catch (err) {
    console.error("GET /public/dealer/:dealerId error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

/**
 * GET vehicles for dealer (public)
 * GET /api/public/dealer/:dealerId/vehicles
 *
 * Defaults:
 * - publicOnly=true (Published + not Archived)
 * - includeArchived=false
 */
router.get("/dealer/:dealerId/vehicles", async (req, res) => {
  try {
    const dealerId = cleanStr(req.params.dealerId, 60);

    if (!isValidDealerId(dealerId)) {
      return res.status(400).json({ ok: false, error: "Invalid dealerId" });
    }

    // Optional query flags:
    // ?all=1 -> return all non-archived vehicles (still dealer-scoped)
    const all = cleanStr(req.query.all, 10) === "1";

    // Validate dealer exists + not paused
    const dealer = await getDealerByDealerId(dealerId);
    if (!dealer) return res.status(404).json({ ok: false, error: "Dealer not found" });

    const status = cleanStr(dealer["Status"], 20);
    if (status && status.toLowerCase() === "paused") {
      return res.status(403).json({ ok: false, error: "Dealer storefront is paused" });
    }

    const vehicles = await getVehiclesForDealer(dealerId, {
      includeArchived: false,
      publicOnly: !all,
    });

    return res.json({
      ok: true,
      dealer: {
        dealerId: dealer["Dealer ID"],
        dealerName: dealer["Dealer Name"],
        logoUrl: dealer["Logo URL"] || "",
      },
      vehicles,
    });
  } catch (err) {
    console.error("GET /public/dealer/:dealerId/vehicles error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

/**
 * POST create request (public)
 * POST /api/public/dealer/:dealerId/requests
 *
 * Body (recommended):
 * {
 *   requestType: "whatsapp" | "live_video" | "walk_in",
 *   vehicleId?: "VEH-XXXXX",
 *   customerName: "John Doe",
 *   phone: "+1876....",
 *   email?: "x@y.com",
 *   preferredDate?: "2026-01-15",
 *   preferredTime?: "10:00 AM",
 *   notes?: "..."
 * }
 */
router.post("/dealer/:dealerId/requests", async (req, res) => {
  try {
    const dealerId = cleanStr(req.params.dealerId, 60);

    if (!isValidDealerId(dealerId)) {
      return res.status(400).json({ ok: false, error: "Invalid dealerId" });
    }

    const requestTypeLabel = mapRequestTypeToAirtableLabel(req.body.requestType);
    if (!requestTypeLabel) {
      return res.status(400).json({
        ok: false,
        error: "Invalid requestType. Use whatsapp, live_video, or walk_in.",
      });
    }

    const customerName = cleanStr(req.body.customerName, 120);
    const phone = normalizePhone(req.body.phone);
    const email = cleanStr(req.body.email, 120);
    const preferredDate = cleanStr(req.body.preferredDate, 40);
    const preferredTime = cleanStr(req.body.preferredTime, 40);
    const notes = cleanStr(req.body.notes, 1200);
    const vehicleId = cleanStr(req.body.vehicleId, 60);

    if (!customerName) return res.status(400).json({ ok: false, error: "customerName is required" });
    if (!phone || phone.length < 7) return res.status(400).json({ ok: false, error: "phone is required" });

    // Fetch dealer Airtable record so REQUEST can be linked properly
    const dealer = await getDealerByDealerId(dealerId);
    if (!dealer) return res.status(404).json({ ok: false, error: "Dealer not found" });

    const dealerStatus = cleanStr(dealer["Status"], 20);
    if (dealerStatus && dealerStatus.toLowerCase() === "paused") {
      return res.status(403).json({ ok: false, error: "Dealer storefront is paused" });
    }

    // Optional: attach vehicle link if provided & valid
    let vehicleRecordId = null;
    if (vehicleId) {
      const vehicle = await getVehicleByVehicleId(vehicleId);
      if (vehicle?.airtableRecordId) {
        // Ensure vehicle belongs to this dealer (safety)
        const vehicleDealerId = cleanStr(vehicle["Dealer ID"], 60);
        if (vehicleDealerId && vehicleDealerId === dealerId) {
          vehicleRecordId = vehicle.airtableRecordId;
        }
      }
    }

    // Build Airtable REQUESTS record fields (must match your Airtable field names)
    const fields = {
      Dealer: [dealer.airtableRecordId], // linked record
      "Request Type": requestTypeLabel,
      "Customer Name": customerName,
      Phone: phone,
      Source: "Storefront",
      Status: "New",
    };

    if (vehicleRecordId) fields.Vehicle = [vehicleRecordId];
    if (vehicleId) fields["Vehicle ID"] = vehicleId; // lookup exists, but safe to store if you keep it
    if (email) fields.Email = email;

    // Dates/times are optional; Airtable will accept blank.
    // If you use strict formats in Airtable, we’ll align UI to those formats.
    if (preferredDate) fields["Preferred Date"] = preferredDate;
    if (preferredTime) fields["Preferred Time"] = preferredTime;
    if (notes) fields.Notes = notes;

    const created = await createRequest(fields);

    return res.status(201).json({
      ok: true,
      request: created,
    });
  } catch (err) {
    console.error("POST /public/dealer/:dealerId/requests error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

module.exports = router;
