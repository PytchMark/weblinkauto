"use strict";

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

const T_DEALERS = process.env.AIRTABLE_TABLE_DEALERS || "DEALERS";
const T_VEHICLES = process.env.AIRTABLE_TABLE_VEHICLES || "VEHICLES";
const T_REQUESTS = process.env.AIRTABLE_TABLE_REQUESTS || "REQUESTS";
const T_MEDIA = process.env.AIRTABLE_TABLE_MEDIA || "VEHICLE MEDIA";
const T_SALES = process.env.AIRTABLE_TABLE_SALES || "SALES";

if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
  throw new Error("Missing AIRTABLE_TOKEN or AIRTABLE_BASE_ID in env.");
}

const API_ROOT = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;

function headers() {
  return {
    Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    "Content-Type": "application/json",
  };
}

function tableUrl(tableName) {
  return `${API_ROOT}/${encodeURIComponent(tableName)}`;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function airtableFetch(url, opts = {}, attempt = 0) {
  const res = await fetch(url, {
    ...opts,
    headers: { ...headers(), ...(opts.headers || {}) },
  });

  // Rate limited: Airtable typically uses 429
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

// Airtable filterByFormula expects proper escaping for strings.
function formulaEquals(fieldName, value) {
  const safe = String(value).replace(/'/g, "\\'");
  return `{${fieldName}}='${safe}'`;
}

function formulaAnd(...parts) {
  return `AND(${parts.join(",")})`;
}

function pickRecordFields(record, fields = []) {
  const out = {};
  fields.forEach((f) => (out[f] = record?.fields?.[f]));
  return out;
}

/** -------------------------
 * DEALERS
 * ------------------------*/
async function getDealerByDealerId(dealerId) {
  const u = new URL(tableUrl(T_DEALERS));
  u.searchParams.set("maxRecords", "1");
  u.searchParams.set("filterByFormula", formulaEquals("Dealer ID", dealerId));

  const data = await airtableFetch(u.toString(), { method: "GET" });
  const rec = data?.records?.[0];
  if (!rec) return null;

  return {
    airtableRecordId: rec.id,
    ...rec.fields,
  };
}

/** -------------------------
 * VEHICLES
 * ------------------------*/
async function getVehiclesForDealer(dealerId, { includeArchived = false, publicOnly = false } = {}) {
  // publicOnly: published + not archived (and usually available)
  // We'll keep this flexible; storefront logic can decide.
  const u = new URL(tableUrl(T_VEHICLES));
  u.searchParams.set("pageSize", "100");

  const parts = [formulaEquals("Dealer ID", dealerId)];

  if (!includeArchived) {
    parts.push(`{Status}!='Archived'`);
  }

  if (publicOnly) {
    // Show only Published + not Archived
    parts.push(`{Published}=TRUE()`);
    // Optional: only Available
    // parts.push(`{Status}='Available'`);
  }

  u.searchParams.set("filterByFormula", formulaAnd(...parts));
  u.searchParams.set("sort[0][field]", "Sort Priority");
  u.searchParams.set("sort[0][direction]", "desc");

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
  u.searchParams.set("filterByFormula", formulaEquals("Vehicle ID", vehicleId));
  const data = await airtableFetch(u.toString(), { method: "GET" });
  const rec = data?.records?.[0];
  if (!rec) return null;
  return { airtableRecordId: rec.id, ...rec.fields };
}

async function createVehicle(fields) {
  // fields should match Airtable exact field names
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
  if (existing?.airtableRecordId) {
    return updateVehicleByRecordId(existing.airtableRecordId, fields);
  }
  return createVehicle(fields);
}

async function archiveVehicle(vehicleId, archivedReason = "Dealer request") {
  const existing = await getVehicleByVehicleId(vehicleId);
  if (!existing?.airtableRecordId) return null;

  return updateVehicleByRecordId(existing.airtableRecordId, {
    Status: "Archived",
    "Archived Reason": archivedReason,
  });
}

/** -------------------------
 * REQUESTS
 * ------------------------*/
async function createRequest(fields) {
  const url = tableUrl(T_REQUESTS);
  const payload = { records: [{ fields }] };
  const data = await airtableFetch(url, { method: "POST", body: JSON.stringify(payload) });
  const rec = data?.records?.[0];
  return rec ? { airtableRecordId: rec.id, ...rec.fields } : null;
}

/** -------------------------
 * Exports
 * ------------------------*/
module.exports = {
  // base/meta
  T_DEALERS,
  T_VEHICLES,
  T_REQUESTS,
  T_MEDIA,
  T_SALES,

  // dealers
  getDealerByDealerId,

  // vehicles
  getVehiclesForDealer,
  getVehicleByVehicleId,
  createVehicle,
  upsertVehicleByVehicleId,
  updateVehicleByRecordId,
  archiveVehicle,

  // requests
  createRequest,

  // helpers (sometimes useful in routes)
  pickRecordFields,
};
