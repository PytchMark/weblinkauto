const { getDealerMetrics, getGlobalMetrics } = require("../services/analytics");

"use strict";

const express = require("express");
const router = express.Router();

const { requireAdmin } = require("../services/auth");
const { airtableFetch } = require("../services/airtable");

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

const T_DEALERS = process.env.AIRTABLE_TABLE_ID_DEALERS;
const T_VEHICLES = process.env.AIRTABLE_TABLE_ID_VEHICLES;
const T_REQUESTS = process.env.AIRTABLE_TABLE_ID_VIEWING_REQUESTS;

if (!AIRTABLE_BASE_ID || !T_DEALERS || !T_VEHICLES || !T_REQUESTS) {
  throw new Error(
    "Missing Airtable env vars: AIRTABLE_BASE_ID and/or AIRTABLE_TABLE_ID_DEALERS/VEHICLES/VIEWING_REQUESTS"
  );
}
/**
 * GET /api/admin/dealers/summary?month=YYYY-MM
 * Returns all dealers + KPI bundles in one call (snappy admin dashboard).
 */
router.get("/dealers/summary", requireAdmin, async (req, res) => {
  try {
    const month = cleanStr(req.query.month, 20); // YYYY-MM
    const summary = await getDealersSummary({ month: month || null });
    return res.json({ ok: true, summary });
  } catch (err) {
    console.error("GET /api/admin/dealers/summary error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

/** -----------------------
 * Helpers
 * ----------------------*/
function cleanStr(v, max = 500) {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s.length > max ? s.slice(0, max) : s;
}

function tableUrl(tableId) {
  return `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableId)}`;
}

function escapeFormulaString(value) {
  return String(value).replace(/'/g, "\\'");
}

function formulaEquals(field, value) {
  return `{${field}}='${escapeFormulaString(value)}'`;
}

function formulaAnd(...parts) {
  return `AND(${parts.join(",")})`;
}

function pickTruthy(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[k] = v;
  }
  return out;
}

async function listAllRecords(tableId, { filterByFormula, pageSize = 100, sortField, sortDirection } = {}) {
  const records = [];
  let offset;

  const u = new URL(tableUrl(tableId));
  u.searchParams.set("pageSize", String(pageSize));
  if (filterByFormula) u.searchParams.set("filterByFormula", filterByFormula);
  if (sortField) {
    u.searchParams.set("sort[0][field]", sortField);
    u.searchParams.set("sort[0][direction]", sortDirection || "asc");
  }

  do {
    if (offset) u.searchParams.set("offset", offset);
    const data = await airtableFetch(u.toString(), { method: "GET" });
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset);

  return records.map((r) => ({ airtableRecordId: r.id, ...r.fields }));
}

async function findOneRecordByField(tableId, fieldName, value) {
  const u = new URL(tableUrl(tableId));
  u.searchParams.set("maxRecords", "1");
  u.searchParams.set("filterByFormula", formulaEquals(fieldName, value));

  const data = await airtableFetch(u.toString(), { method: "GET" });
  const rec = data?.records?.[0];
  if (!rec) return null;

  return { airtableRecordId: rec.id, ...rec.fields };
}

async function createRecord(tableId, fields) {
  const url = tableUrl(tableId);
  const payload = { records: [{ fields }] };
  const data = await airtableFetch(url, { method: "POST", body: JSON.stringify(payload) });
  const rec = data?.records?.[0];
  return rec ? { airtableRecordId: rec.id, ...rec.fields } : null;
}

async function patchRecordById(tableId, recordId, fields) {
  const url = `${tableUrl(tableId)}/${recordId}`;
  const data = await airtableFetch(url, { method: "PATCH", body: JSON.stringify({ fields }) });
  return data ? { airtableRecordId: data.id, ...data.fields } : null;
}

/** -----------------------
 * Admin identity
 * ----------------------*/
router.get("/me", requireAdmin, async (req, res) => {
  return res.json({ ok: true, admin: true });
});
 /**
 * GET /api/admin/metrics
 * Query:
 *  - ?month=YYYY-MM (optional)
 * Returns global KPIs (vehicles + requests + top dealers)
 */
router.get("/metrics", requireAdmin, async (req, res) => {
  try {
    const month = cleanStr(req.query.month, 20); // YYYY-MM
    const metrics = await getGlobalMetrics({ month: month || null });
    return res.json({ ok: true, metrics });
  } catch (err) {
    console.error("GET /api/admin/metrics error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

/**
 * GET /api/admin/dealers/:dealerId/metrics
 * Query:
 *  - ?month=YYYY-MM (optional)
 * Returns dealer-scoped KPIs (inventory + requests + sales proxy)
 */
router.get("/dealers/:dealerId/metrics", requireAdmin, async (req, res) => {
  try {
    const dealerId = cleanStr(req.params.dealerId, 60);
    const month = cleanStr(req.query.month, 20);

    if (!dealerId) return res.status(400).json({ ok: false, error: "dealerId is required" });

    const metrics = await getDealerMetrics(dealerId, { month: month || null });
    return res.json({ ok: true, metrics });
  } catch (err) {
    console.error("GET /api/admin/dealers/:dealerId/metrics error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

/** -----------------------
 * DEALERS
 * ----------------------*/

/**
 * GET /api/admin/dealers
 * Optional query:
 *  - ?status=active|paused
 *  - ?dealerId=DEALER-0001
 */
router.get("/dealers", requireAdmin, async (req, res) => {
  try {
    const status = cleanStr(req.query.status, 30).toLowerCase();
    const dealerId = cleanStr(req.query.dealerId, 60);

    let filterByFormula = null;

    if (dealerId) {
      filterByFormula = formulaEquals("dealerId", dealerId);
    } else if (status) {
      filterByFormula = formulaEquals("status", status);
    }

    const dealers = await listAllRecords(T_DEALERS, {
      filterByFormula,
      sortField: "dealerId",
      sortDirection: "asc",
    });

    return res.json({ ok: true, dealers });
  } catch (err) {
    console.error("GET /api/admin/dealers error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

/**
 * POST /api/admin/dealers
 * Body: { dealerId, name, status, whatsapp, email, logoUrl, passcodeHash? }
 */
router.post("/dealers", requireAdmin, async (req, res) => {
  try {
    const dealerId = cleanStr(req.body.dealerId, 60);
    if (!dealerId) return res.status(400).json({ ok: false, error: "dealerId is required" });

    // Prevent duplicates
    const existing = await findOneRecordByField(T_DEALERS, "dealerId", dealerId);
    if (existing) return res.status(409).json({ ok: false, error: "dealerId already exists" });

    const fields = pickTruthy({
      dealerId,
      name: cleanStr(req.body.name, 140),
      status: cleanStr(req.body.status, 30) || "active",
      whatsapp: cleanStr(req.body.whatsapp, 40),
      email: cleanStr(req.body.email, 140),
      logoUrl: cleanStr(req.body.logoUrl, 600),
      passcodeHash: cleanStr(req.body.passcodeHash, 600), // optional, if you set via admin
    });

    const created = await createRecord(T_DEALERS, fields);
    return res.status(201).json({ ok: true, dealer: created });
  } catch (err) {
    console.error("POST /api/admin/dealers error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

/**
 * PATCH /api/admin/dealers/:dealerId
 * Update dealer profile (admin-only)
 */
router.patch("/dealers/:dealerId", requireAdmin, async (req, res) => {
  try {
    const dealerId = cleanStr(req.params.dealerId, 60);
    const existing = await findOneRecordByField(T_DEALERS, "dealerId", dealerId);
    if (!existing) return res.status(404).json({ ok: false, error: "Dealer not found" });

    const fields = pickTruthy({
      name: cleanStr(req.body.name, 140),
      status: cleanStr(req.body.status, 30),
      whatsapp: cleanStr(req.body.whatsapp, 40),
      email: cleanStr(req.body.email, 140),
      logoUrl: cleanStr(req.body.logoUrl, 600),
      passcodeHash: cleanStr(req.body.passcodeHash, 600),
      lastLoginAt: req.body.lastLoginAt || undefined,
    });

    const updated = await patchRecordById(T_DEALERS, existing.airtableRecordId, fields);
    return res.json({ ok: true, dealer: updated });
  } catch (err) {
    console.error("PATCH /api/admin/dealers/:dealerId error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

/** -----------------------
 * VEHICLES
 * ----------------------*/

/**
 * GET /api/admin/vehicles
 * Optional query:
 *  - ?dealerId=DEALER-0001
 *  - ?status=available|pending|sold|archived
 *  - ?archived=1 (checkbox true)
 *  - ?availableOnly=1 (Availability checkbox true)
 */
router.get("/vehicles", requireAdmin, async (req, res) => {
  try {
    const dealerId = cleanStr(req.query.dealerId, 60);
    const status = cleanStr(req.query.status, 30);
    const archived = cleanStr(req.query.archived, 10) === "1";
    const availableOnly = cleanStr(req.query.availableOnly, 10) === "1";

    const parts = [];

    if (dealerId) parts.push(formulaEquals("dealerId", dealerId));
    if (status) parts.push(formulaEquals("status", status));
    if (archived) parts.push("{archived}=TRUE()");
    if (availableOnly) parts.push("{Availability}=TRUE()");

    const filterByFormula = parts.length ? formulaAnd(...parts) : null;

    const vehicles = await listAllRecords(T_VEHICLES, {
      filterByFormula,
      sortField: "updatedAt",
      sortDirection: "desc",
    });

    return res.json({ ok: true, vehicles });
  } catch (err) {
    console.error("GET /api/admin/vehicles error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

/**
 * POST /api/admin/vehicles
 * Admin can create vehicles for any dealerId
 */
router.post("/vehicles", requireAdmin, async (req, res) => {
  try {
    const dealerId = cleanStr(req.body.dealerId, 60);
    const vehicleId = cleanStr(req.body.vehicleId, 80);

    if (!dealerId) return res.status(400).json({ ok: false, error: "dealerId is required" });
    if (!vehicleId) return res.status(400).json({ ok: false, error: "vehicleId is required" });

    const existing = await findOneRecordByField(T_VEHICLES, "vehicleId", vehicleId);
    if (existing) return res.status(409).json({ ok: false, error: "vehicleId already exists" });

    const fields = pickTruthy({
      dealerId,
      vehicleId,
      title: cleanStr(req.body.title, 160),
      status: cleanStr(req.body.status, 30) || "available",
      archived: req.body.archived === true,
      Availability: req.body.Availability === true,

      Price: req.body.Price ?? undefined,
      Year: req.body.Year ?? undefined,
      VIN: cleanStr(req.body.VIN, 80),
      Make: cleanStr(req.body.Make, 80),
      Model: cleanStr(req.body.Model, 80),
      Mileage: req.body.Mileage ?? undefined,
      Color: cleanStr(req.body.Color, 60),
      "Body Type": cleanStr(req.body["Body Type"], 60),
      Transmission: cleanStr(req.body.Transmission, 40),
      "Fuel Type": cleanStr(req.body["Fuel Type"], 40),

      cloudinaryImageUrls: cleanStr(req.body.cloudinaryImageUrls, 20000),
      cloudinaryVideoUrl: cleanStr(req.body.cloudinaryVideoUrl, 600),

      Description: cleanStr(req.body.Description, 4000),
    });

    const created = await createRecord(T_VEHICLES, fields);
    return res.status(201).json({ ok: true, vehicle: created });
  } catch (err) {
    console.error("POST /api/admin/vehicles error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

/**
 * PATCH /api/admin/vehicles/:vehicleId
 * Admin can update any vehicle
 */
router.patch("/vehicles/:vehicleId", requireAdmin, async (req, res) => {
  try {
    const vehicleId = cleanStr(req.params.vehicleId, 80);
    const existing = await findOneRecordByField(T_VEHICLES, "vehicleId", vehicleId);
    if (!existing) return res.status(404).json({ ok: false, error: "Vehicle not found" });

    const fields = pickTruthy({
      dealerId: cleanStr(req.body.dealerId, 60), // admin can re-assign if needed
      title: cleanStr(req.body.title, 160),
      status: cleanStr(req.body.status, 30),
      archived: typeof req.body.archived === "boolean" ? req.body.archived : undefined,
      Availability: typeof req.body.Availability === "boolean" ? req.body.Availability : undefined,

      Price: req.body.Price ?? undefined,
      Year: req.body.Year ?? undefined,
      VIN: cleanStr(req.body.VIN, 80),
      Make: cleanStr(req.body.Make, 80),
      Model: cleanStr(req.body.Model, 80),
      Mileage: req.body.Mileage ?? undefined,
      Color: cleanStr(req.body.Color, 60),
      "Body Type": cleanStr(req.body["Body Type"], 60),
      Transmission: cleanStr(req.body.Transmission, 40),
      "Fuel Type": cleanStr(req.body["Fuel Type"], 40),

      cloudinaryImageUrls: cleanStr(req.body.cloudinaryImageUrls, 20000),
      cloudinaryVideoUrl: cleanStr(req.body.cloudinaryVideoUrl, 600),

      Description: cleanStr(req.body.Description, 4000),
    });

    const updated = await patchRecordById(T_VEHICLES, existing.airtableRecordId, fields);
    return res.json({ ok: true, vehicle: updated });
  } catch (err) {
    console.error("PATCH /api/admin/vehicles/:vehicleId error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

/** -----------------------
 * VIEWING REQUESTS
 * ----------------------*/

/**
 * GET /api/admin/requests
 * Optional query:
 *  - ?dealerId=DEALER-0001
 *  - ?status=new|booked|closed|...
 *  - ?type=whatsapp|live_video|walk_in
 */
router.get("/requests", requireAdmin, async (req, res) => {
  try {
    const dealerId = cleanStr(req.query.dealerId, 60);
    const status = cleanStr(req.query.status, 30);
    const type = cleanStr(req.query.type, 30);

    const parts = [];
    if (dealerId) parts.push(formulaEquals("dealerId", dealerId));
    if (status) parts.push(formulaEquals("status", status));
    if (type) parts.push(formulaEquals("type", type));

    const filterByFormula = parts.length ? formulaAnd(...parts) : null;

    const requests = await listAllRecords(T_REQUESTS, {
      filterByFormula,
      sortField: "updatedAt",
      sortDirection: "desc",
    });

    return res.json({ ok: true, requests });
  } catch (err) {
    console.error("GET /api/admin/requests error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

/**
 * PATCH /api/admin/requests/:requestId
 * Admin can update request status/assignment/etc
 */
router.patch("/requests/:requestId", requireAdmin, async (req, res) => {
  try {
    const requestId = cleanStr(req.params.requestId, 80);
    const existing = await findOneRecordByField(T_REQUESTS, "requestId", requestId);
    if (!existing) return res.status(404).json({ ok: false, error: "Request not found" });

    const fields = pickTruthy({
      dealerId: cleanStr(req.body.dealerId, 60),
      vehicleId: cleanStr(req.body.vehicleId, 80),
      type: cleanStr(req.body.type, 30),
      status: cleanStr(req.body.status, 30),
      name: cleanStr(req.body.name, 120),
      phone: cleanStr(req.body.phone, 40),
      email: cleanStr(req.body.email, 140),
      preferredDate: req.body.preferredDate || undefined,
      preferredTime: req.body.preferredTime || undefined,
      notes: cleanStr(req.body.notes, 2000),
      source: cleanStr(req.body.source, 30),
    });

    const updated = await patchRecordById(T_REQUESTS, existing.airtableRecordId, fields);
    return res.json({ ok: true, request: updated });
  } catch (err) {
    console.error("PATCH /api/admin/requests/:requestId error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

module.exports = router;
