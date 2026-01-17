"use strict";

const { listProfiles, listVehicles, listViewingRequests } = require("./supabase");

function parseMonth(monthStr) {
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

async function getDealerInventoryKpis(dealerId) {
  const vehicles = await listVehicles({ dealerId });

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
    liveAvailable: 0,
    totalValueJmd: 0,
  };

  for (const v of vehicles) {
    const status = String(v.status || "").toLowerCase();
    if (status && out.byStatus[status] !== undefined) out.byStatus[status]++;
    else out.byStatus.other++;

    if (v.archived === true) out.archivedChecked++;
    if (v.availability === true && v.archived !== true) out.liveAvailable++;

    const price = Number(v.price || 0);
    if (Number.isFinite(price) && price > 0) out.totalValueJmd += price;
  }

  return out;
}

async function getDealerRequestKpis(dealerId, { month } = {}) {
  const monthDate = parseMonth(month);
  const monthStart = monthDate ? startOfMonth(monthDate) : null;
  const monthEnd = monthDate ? endOfMonth(monthDate) : null;
  const requests = await listViewingRequests({ dealerId, monthStart, monthEnd });

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

async function getDealerSalesKpis(dealerId, { month } = {}) {
  const monthDate = parseMonth(month);
  const monthStart = monthDate ? startOfMonth(monthDate) : null;
  const monthEnd = monthDate ? endOfMonth(monthDate) : null;

  const soldVehicles = await listVehicles({
    dealerId,
    status: "sold",
    monthStart,
    monthEnd,
  });

  let revenue = 0;
  for (const v of soldVehicles) {
    const price = Number(v.price || 0);
    if (Number.isFinite(price) && price > 0) revenue += price;
  }

  return {
    soldCount: soldVehicles.length,
    revenueJmd: revenue,
  };
}

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

async function getDealersSummary({ month } = {}) {
  const monthDate = parseMonth(month);
  const monthStart = monthDate ? startOfMonth(monthDate) : null;
  const monthEnd = monthDate ? endOfMonth(monthDate) : null;

  const dealers = await listProfiles();

  const [vehicles, requests] = await Promise.all([
    listVehicles(),
    listViewingRequests({ monthStart, monthEnd }),
  ]);

  const vehiclesByDealer = new Map();
  for (const v of vehicles) {
    const d = String(v.dealer_id || v.dealerId || "");
    if (!d) continue;
    if (!vehiclesByDealer.has(d)) vehiclesByDealer.set(d, []);
    vehiclesByDealer.get(d).push(v);
  }

  const requestsByDealer = new Map();
  for (const r of requests) {
    const d = String(r.dealer_id || r.dealerId || "");
    if (!d) continue;
    if (!requestsByDealer.has(d)) requestsByDealer.set(d, []);
    requestsByDealer.get(d).push(r);
  }

  const rows = dealers.map((d) => {
    const dealerId = String(d.dealer_id || d.dealerId || "");
    const dealerVehicles = vehiclesByDealer.get(dealerId) || [];
    const dealerRequests = requestsByDealer.get(dealerId) || [];

    const byStatus = { available: 0, pending: 0, sold: 0, archived: 0, other: 0 };
    let liveAvailable = 0;
    let archivedChecked = 0;

    for (const v of dealerVehicles) {
      const s = String(v.status || "other").toLowerCase();
      if (byStatus[s] !== undefined) byStatus[s]++;
      else byStatus.other++;

      if (v.archived === true) archivedChecked++;
      if (v.availability === true && v.archived !== true) liveAvailable++;
    }

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
      logoUrl: d.logo_url || "",
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
  getDealersSummary,
};
