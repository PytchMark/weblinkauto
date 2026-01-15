"use strict";

const {
  getVehiclesForDealer,
  createRequest, // not used here, but often paired later
} = require("./airtable");

const { airtableFetch } = require("./airtable");

/**
 * Utility: date helpers
 */
function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
}

/**
 * Dealer-level inventory stats
 */
async function getDealerInventoryStats(dealerId) {
  const vehicles = await getVehiclesForDealer(dealerId, {
    includeArchived: true,
  });

  const stats = {
    total: vehicles.length,
    available: 0,
    pending: 0,
    sold: 0,
    archived: 0,
  };

  vehicles.forEach((v) => {
    const status = (v.Status || "").toLowerCase();
    if (stats[status] !== undefined) {
      stats[status]++;
    }
  });

  return stats;
}

/**
 * Dealer request funnel stats
 */
async function getDealerRequestStats(dealerId) {
  const AIRTABLE_TABLE_REQUESTS = process.env.AIRTABLE_TABLE_REQUESTS || "REQUESTS";
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

  const url = new URL(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      AIRTABLE_TABLE_REQUESTS
    )}`
  );

  url.searchParams.set(
    "filterByFormula",
    `{Dealer ID}='${dealerId.replace(/'/g, "\\'")}'`
  );

  const data = await airtableFetch(url.toString(), { method: "GET" });
  const records = data.records || [];

  const stats = {
    total: records.length,
    new: 0,
    contacted: 0,
    booked: 0,
    closed: 0,
    noShow: 0,
  };

  records.forEach((r) => {
    const status = (r.fields?.Status || "").toLowerCase().replace(" ", "");
    if (status === "new") stats.new++;
    if (status === "contacted") stats.contacted++;
    if (status === "booked") stats.booked++;
    if (status === "closed") stats.closed++;
    if (status === "noshow") stats.noShow++;
  });

  return stats;
}

/**
 * Dealer sales summary (current month)
 * Uses VEHICLES table (Status=Sold + Sold Date)
 */
async function getDealerSalesThisMonth(dealerId) {
  const now = new Date();
  const start = startOfMonth(now).toISOString();
  const end = endOfMonth(now).toISOString();

  const AIRTABLE_TABLE_VEHICLES = process.env.AIRTABLE_TABLE_VEHICLES || "VEHICLES";
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

  const formula = `AND(
    {Dealer ID}='${dealerId.replace(/'/g, "\\'")}',
    {Status}='Sold',
    IS_AFTER({Sold Date}, '${start}'),
    IS_BEFORE({Sold Date}, '${end}')
  )`;

  const url = new URL(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      AIRTABLE_TABLE_VEHICLES
    )}`
  );
  url.searchParams.set("filterByFormula", formula);

  const data = await airtableFetch(url.toString(), { method: "GET" });
  const records = data.records || [];

  let revenue = 0;
  records.forEach((r) => {
    revenue += Number(r.fields?.["Sold Price"] || 0);
  });

  return {
    soldCount: records.length,
    revenue,
  };
}

module.exports = {
  getDealerInventoryStats,
  getDealerRequestStats,
  getDealerSalesThisMonth,
};
