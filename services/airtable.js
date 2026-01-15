"use strict";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

const T_VEHICLES = process.env.AIRTABLE_TABLE_ID_VEHICLES;
const T_DEALERS = process.env.AIRTABLE_TABLE_ID_DEALERS;
const T_REQUESTS = process.env.AIRTABLE_TABLE_ID_VIEWING_REQUESTS;

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  throw new Error("Missing AIRTABLE_API_KEY (or AIRTABLE_TOKEN) or AIRTABLE_BASE_ID in env.");
}
if (!T_VEHICLES || !T_DEALERS || !T_REQUESTS) {
  throw new Error("Missing one or more Airtable table ID env vars (AIRTABLE_TABLE_ID_*).");
}

const API_ROOT = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;

function headers() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function tableUrl(tableId) {
  return `${API_ROOT}/${encodeURIComponent(tableId)}`;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function airtableFetch(url, opts = {}, attempt = 0) {
  const res = await fetch(url, {
    ...opts,
    headers: { ...headers(), ...(opts.headers || {}) },
  });

  if (res.status === 429 && attempt < 3) {
    await sleep(800 + attempt * 600);
    return airtableFetch(url, opts, attempt + 1);
  }

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const msg = typeof body === "object" ? JSON.stringify(body) : String(body);
    throw new Error(`Airtable error ${res.status}: ${msg}`);
  }

  return body;
}

// Airtable formulas: escape single quotes
function formulaEquals(field, value) {
  const safe = String(value).replace(/'/g, "\\'");
  return `{${field}}='${safe}'`;
}
function formulaAnd(...parts) {
  return `AND(${parts.join(",")})`;
}

/* =========================
   DEALERS (Table ID)
   ========================= */

async function getDealerByDealerId(dealerId) {
  const u = new URL(tableUrl(T_DEALERS));
  u.searchParams.set("maxRecords", "1");
  u.searchParams.set("filterByFormula", formulaEquals("dealerId", dealerId));

  const data = await airtableFetch(u.toString(), { method: "GET" });
  const rec = data?.records?.[0];
  if (!rec) return null;

  return {
    airtableRecordId: rec.id,
    ...rec.fields,
  };
}

/* =========================
   VEHICLES (Table ID)
   ========================= */

async function getVehiclesForDealer(dealerId, { includeArchived = false, publicOnly = false } = {}) {
  const u = new URL(tableUrl(T_VEHICLES));
  u.searchParams.set("pageSize", "100");

  const parts = [formulaEquals("dealerId", dealerId)];

  // Your schema has BOTH: "archived" checkbox and "status" single select.
  // We'll honor "archived" first (hard hide).
  if (!includeArchived) {
    parts.push("{archived}!=TRUE()");
  }

  if (publicOnly) {
    // Your schema has "Availability" checkbox (fldcG1Z...) but also "Availability" and "availability".
    // You listed: Availability checkbox in Vehicles table.
    // We'll treat it as "Availability" (exact casing) if you use it, BUT you also have `status`.
    // Easiest public rule: Availability = true AND archived != true
    parts.push("{Availability}=TRUE()");
  }

  u.searchParams.set("filterByFormula", formulaAnd(...parts));

  const records = [];
  let offset;

  do {
    if (offset) u.searchParams.set("offset", offset);
    const data = await airtableFetch(u.toString(), { method: "GET" });
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset);

  return records.map((r) => ({ airtableRecordId: r.id, ...r.fields }));
}

async function getVehicleByVehicleId(vehicleId) {
  const u = new URL(tableUrl(T_VEHICLES));
  u.searchParams.set("maxRecords", "1");
  u.searchParams.set("filterByFormula", formulaEquals("vehicleId", vehicleId));

  const data = await airtableFetch(u.toString(), { method: "GET" });
  const rec = data?.records?.[0];
  if (!rec) return null;

  return { airtableRecordId: rec.id, ...rec.fields };
}

async function createVehicle(fields) {
  const url = tableUrl(T_VEHICLES);
  const payload = { records: [{ fields }] };
  const data = await airtableFetch(url, { method: "POST", body: JSON.stringify(payload) });
  const rec = data?.records?.[0];
  return rec ? { airtableRecordId: rec.id, ...rec.fields } : null;
}

async function updateVehicleByRecordId(recordId, fields) {
  const url = `${tableUrl(T_VEHICLES)}/${recordId}`;
  const data = await airtableFetch(url, { method: "PATCH", body: JSON.stringify({ fields }) });
  return data ? { airtableRecordId: data.id, ...data.fields } : null;
}

async function upsertVehicleByVehicleId(vehicleId, fields) {
  const existing = await getVehicleByVehicleId(vehicleId);
  if (existing?.airtableRecordId) return updateVehicleByRecordId(existing.airtableRecordId, fields);
  return createVehicle(fields);
}

async function archiveVehicle(vehicleId) {
  const existing = await getVehicleByVehicleId(vehicleId);
  if (!existing?.airtableRecordId) return null;

  // enforce “no deletes”: archive checkbox + status
  return updateVehicleByRecordId(existing.airtableRecordId, {
    archived: true,
    status: "archived",
  });
}

/* =========================
   VIEWING_REQUESTS (Table ID)
   ========================= */

async function createViewingRequest(fields) {
  const url = tableUrl(T_REQUESTS);
  const payload = { records: [{ fields }] };
  const data = await airtableFetch(url, { method: "POST", body: JSON.stringify(payload) });
  const rec = data?.records?.[0];
  return rec ? { airtableRecordId: rec.id, ...rec.fields } : null;
}

module.exports = {
  airtableFetch,

  // dealer
  getDealerByDealerId,

  // vehicles
  getVehiclesForDealer,
  getVehicleByVehicleId,
  createVehicle,
  updateVehicleByRecordId,
  upsertVehicleByVehicleId,
  archiveVehicle,

  // requests
  createViewingRequest,
};

