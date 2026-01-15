"use strict";

const { airtableFetch } = require("./airtable");

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const T_VEHICLES = process.env.AIRTABLE_TABLE_ID_VEHICLES;
const T_REQUESTS = process.env.AIRTABLE_TABLE_ID_VIEWING_REQUESTS;

if (!AIRTABLE_BASE_ID || !T_VEHICLES || !T_REQUESTS) {
  throw new Error(
    "Missing Airtable env vars for analytics: AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID_VEHICLES, AIRTABLE_TABLE_ID_VIEWING_REQUESTS"
  );
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

// Month helpers
function parseMonth(monthStr) {
  // monthStr: YYYY-MM
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) return null;
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
}

async function listAllRecords(tableId, { filterByFormula, pageSize = 100 } = {}) {
  const records = [];
  let offset;

  const u = new URL(tableUrl(tableId));
  u.searchParams.set("pageSize", String(pageSize));
  if (filterByFormula) u.searchParams.set("filterByFormula", filterByFormula);

  do {
    if (offset) u.searchParams.set("offset", offset);
    const data = await airtableFetch(u.toString(), { method: "GET" });
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset);

  return records.map((r) => ({ airtableRecordId: r.id, ...r.fields }));
}

/**
 * Inventory KPIs for a dealer (all-time)
 * Counts:
 * - available / pending / sold / archived (from status)
 * - archived checkbox count
 * - live count (Availability checkbox true and not archived)
 */
async function getDealerInventoryKpis(dealerId) {
  const filter = formulaEquals("dealerId", dealerId);
  const vehicles = await listAllRecords(T_VEHICLES, { filterByFormula: filter });

  const out = {
    total: vehicles.length,
    byStatus: {
      available: 0,
      pending: 0,
      sold: 0,
      archived: 0,
      other: 0,
    },
    archivedChecked: 0,
    liveAvailable: 0, // Availability=true AND archived!=true
    totalValueJmd: 0,
  };

  for (const v of vehicles) {
    const status = String(v.status || "").toLowerCase();
    if (status && out.byStatus[status] !== undefined) out.byStatus[status]++;
    else out.byStatus.other++;

    if (v.archived === true) out.archivedChecked++;
    if (v.Availability === true && v.archived !== true) out.liveAvailable++;

    // Sum value using Price if present
    const price = Number(v.Price || 0);
    if (Number.isFinite(price) && price > 0) out.totalValueJmd += price;
  }

  return out;
}

/**
 * Request KPIs for a dealer, optionally within a month
 */
async function getDealerRequestKpis(dealerId, { month } = {}) {
  const monthDate = parseMonth(month);
  let filterParts = [formulaEquals("dealerId", dealerId)];

  // createdAt is a Formula(Date) field in your schema.
  // Airtable formula date comparisons expect ISO-like strings.
  if (monthDate) {
    const start = startOfMonth(monthDate).toISOString();
    const end = endOfMonth(monthDate).toISOString();
    filterParts.push(`IS_AFTER({createdAt}, '${start}')`);
    filterParts.push(`IS_BEFORE({createdAt}, '${end}')`);
  }

  const filter = formulaAnd(...filterParts);
  const requests = await listAllRecords(T_REQUESTS, { filterByFormula: filter });

  const out = {
    total: requests.length,
    byStatus: {},
    byType: {},
  };

  for (const r of requests) {
    const s = String(r.status || "unknown").toLowerCase();
    const t = String(r.type || "unknown").toLowerCase();

    out.byStatus[s] = (out.byStatus[s] || 0) + 1;
    out.byType[t] = (out.byType[t] || 0) + 1;
  }

  return out;
}

/**
 * “Sales” KPIs derived from vehicles: status=sold within month (best-effort)
 * NOTE: You don't currently have soldDate in the schema you sent.
 * We'll use updatedAt as the "sold timestamp" proxy.
 */
async function getDealerSalesKpis(dealerId, { month } = {}) {
  const monthDate = parseMonth(month);
  const parts = [formulaEquals("dealerId", dealerId), `{status}='sold'`];

  if (monthDate) {
    const start = startOfMonth(monthDate).toISOString();
    const end = endOfMonth(monthDate).toISOString();
    parts.push(`IS_AFTER({updatedAt}, '${start}')`);
    parts.push(`IS_BEFORE({updatedAt}, '${end}')`);
  }

  const filter = formulaAnd(...parts);
  const soldVehicles = await listAllRecords(T_VEHICLES, { filterByFormula: filter });

  let revenue = 0;
  for (const v of soldVehicles) {
    const price = Number(v.Price || 0);
    if (Number.isFinite(price) && price > 0) revenue += price;
  }

  return {
    soldCount: soldVehicles.length,
    revenueJmd: revenue,
  };
}

/**
 * Dealer full metrics bundle
 */
async function getDealerMetrics(dealerId, { month } = {}) {
  const [inventory, requests, sales] = await Promise.all([
    getDealerInventoryKpis(dealerId),
    getDealerRequestKpis(dealerId, { month }),
    getDealerSalesKpis(dealerId, { month }),
  ]);

  return {
    dealerId,
    month: month || null,
    inventory,
    requests,
    sales,
  };
}

/**
 * Global metrics bundle (admin)
 */
async function getGlobalMetrics({ month } = {}) {
  // Vehicles (all dealers)
  const vehicles = await listAllRecords(T_VEHICLES);

  const vehiclesByStatus = {};
  let totalVehicles = vehicles.length;
  let archivedChecked = 0;
  let liveAvailable = 0;

  for (const v of vehicles) {
    const s = String(v.status || "unknown").toLowerCase();
    vehiclesByStatus[s] = (vehiclesByStatus[s] || 0) + 1;

    if (v.archived === true) archivedChecked++;
    if (v.Availability === true && v.archived !== true) liveAvailable++;
  }

  // Requests (optionally filtered by month)
  const monthDate = parseMonth(month);
  let requestFilter = null;
  if (monthDate) {
    const start = startOfMonth(monthDate).toISOString();
    const end = endOfMonth(monthDate).toISOString();
    requestFilter = formulaAnd(
      `IS_AFTER({createdAt}, '${start}')`,
      `IS_BEFORE({createdAt}, '${end}')`
    );
  }

  const requests = await listAllRecords(T_REQUESTS, { filterByFormula: requestFilter });

  const requestsByStatus = {};
  const requestsByType = {};
  const requestsByDealer = {};

  for (const r of requests) {
    const s = String(r.status || "unknown").toLowerCase();
    const t = String(r.type || "unknown").toLowerCase();
    const d = String(r.dealerId || "unknown");

    requestsByStatus[s] = (requestsByStatus[s] || 0) + 1;
    requestsByType[t] = (requestsByType[t] || 0) + 1;
    requestsByDealer[d] = (requestsByDealer[d] || 0) + 1;
  }

  // Top dealers by request volume (month scope if provided)
  const topDealers = Object.entries(requestsByDealer)
    .filter(([dealerId]) => dealerId && dealerId !== "unknown")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([dealerId, count]) => ({ dealerId, requestCount: count }));

  return {
    month: month || null,
    vehicles: {
      total: totalVehicles,
      liveAvailable,
      archivedChecked,
      byStatus: vehiclesByStatus,
    },
    requests: {
      total: requests.length,
      byStatus: requestsByStatus,
      byType: requestsByType,
      topDealers,
    },
  };
}
async function getDealersSummary({ month } = {}) {
  const monthDate = parseMonth(month);

  // Pull all dealers once
  // NOTE: Dealers table ID isn't currently imported in analytics.js, so we fetch it here via env.
  const T_DEALERS = process.env.AIRTABLE_TABLE_ID_DEALERS;
  if (!T_DEALERS) {
    throw new Error("Missing AIRTABLE_TABLE_ID_DEALERS for dealers summary");
  }

  const dealers = await listAllRecords(T_DEALERS);

  // For speed: fetch vehicles + requests once, then group in-memory.
  const [vehicles, requests] = await Promise.all([
    listAllRecords(T_VEHICLES),
    (async () => {
      // Requests optionally filtered to month (reduces payload)
      if (!monthDate) return listAllRecords(T_REQUESTS);

      const start = startOfMonth(monthDate).toISOString();
      const end = endOfMonth(monthDate).toISOString();
      const requestFilter = formulaAnd(
        `IS_AFTER({createdAt}, '${start}')`,
        `IS_BEFORE({createdAt}, '${end}')`
      );
      return listAllRecords(T_REQUESTS, { filterByFormula: requestFilter });
    })(),
  ]);

  // Group vehicles by dealerId
  const vehiclesByDealer = new Map();
  for (const v of vehicles) {
    const d = String(v.dealerId || "");
    if (!d) continue;
    if (!vehiclesByDealer.has(d)) vehiclesByDealer.set(d, []);
    vehiclesByDealer.get(d).push(v);
  }

  // Group requests by dealerId (month scoped if month provided)
  const requestsByDealer = new Map();
  for (const r of requests) {
    const d = String(r.dealerId || "");
    if (!d) continue;
    if (!requestsByDealer.has(d)) requestsByDealer.set(d, []);
    requestsByDealer.get(d).push(r);
  }

  // Build summary rows
  const rows = dealers.map((d) => {
    const dealerId = String(d.dealerId || "");
    const dealerVehicles = vehiclesByDealer.get(dealerId) || [];
    const dealerRequests = requestsByDealer.get(dealerId) || [];

    // Inventory counts
    const byStatus = { available: 0, pending: 0, sold: 0, archived: 0, other: 0 };
    let liveAvailable = 0;
    let archivedChecked = 0;

    for (const v of dealerVehicles) {
      const s = String(v.status || "other").toLowerCase();
      if (byStatus[s] !== undefined) byStatus[s]++;
      else byStatus.other++;

      if (v.archived === true) archivedChecked++;
      if (v.Availability === true && v.archived !== true) liveAvailable++;
    }

    // Requests counts
    const reqByStatus = {};
    const reqByType = {};
    for (const r of dealerRequests) {
      const rs = String(r.status || "unknown").toLowerCase();
      const rt = String(r.type || "unknown").toLowerCase();
      reqByStatus[rs] = (reqByStatus[rs] || 0) + 1;
      reqByType[rt] = (reqByType[rt] || 0) + 1;
    }

    return {
      dealerId,
      name: d.name || "",
      status: d.status || "",
      whatsapp: d.whatsapp || "",
      logoUrl: d.logoUrl || "",
      inventory: {
        total: dealerVehicles.length,
        liveAvailable,
        archivedChecked,
        byStatus,
      },
      requests: {
        month: month || null,
        total: dealerRequests.length,
        byStatus: reqByStatus,
        byType: reqByType,
      },
    };
  });

  // Sort: active first, then by request volume desc (month scoped if month set)
  rows.sort((a, b) => {
    const aActive = String(a.status).toLowerCase() === "active" ? 0 : 1;
    const bActive = String(b.status).toLowerCase() === "active" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return (b.requests.total || 0) - (a.requests.total || 0);
  });

  return { month: month || null, dealers: rows };
}

module.exports = {
  getDealerMetrics,
  getGlobalMetrics,
  getDealersSummary, // ✅ add this
};
