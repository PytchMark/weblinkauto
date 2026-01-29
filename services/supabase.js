"use strict";

const { supabase } = require("../lib/supabase");

function unwrap(result, context) {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }
  return result.data;
}

async function getProfileByDealerId(dealerId) {
  const result = await supabase.from("profiles").select("*").eq("dealer_id", dealerId).maybeSingle();
  return unwrap(result, "profiles lookup");
}

async function getProfileByEmail(email) {
  const result = await supabase.from("profiles").select("*").eq("profile_email", email).maybeSingle();
  return unwrap(result, "profiles lookup");
}

async function upsertProfile(fields) {
  const result = await supabase.from("profiles").upsert(fields, { onConflict: "dealer_id" }).select("*").single();
  return unwrap(result, "profiles upsert");
}

async function listProfiles({ status } = {}) {
  let query = supabase.from("profiles").select("*");
  if (status) query = query.eq("status", status);
  const result = await query.order("created_at", { ascending: false });
  return unwrap(result, "profiles list") || [];
}

async function getProfileByStripeCustomerId(customerId) {
  const result = await supabase
    .from("profiles")
    .select("*")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return unwrap(result, "profiles stripe customer lookup");
}

async function getProfileByStripeSubscriptionId(subscriptionId) {
  const result = await supabase
    .from("profiles")
    .select("*")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  return unwrap(result, "profiles stripe subscription lookup");
}

async function getLatestDealerId() {
  const result = await supabase
    .from("profiles")
    .select("dealer_id")
    .like("dealer_id", "DEALER-%")
    .order("dealer_id", { ascending: false })
    .limit(1)
    .maybeSingle();
  return unwrap(result, "profiles latest dealer id");
}

async function getVehiclesForDealer(dealerId, { includeArchived = false, publicOnly = false } = {}) {
  let query = supabase.from("vehicles").select("*").eq("dealer_id", dealerId);
  if (!includeArchived) query = query.eq("archived", false);
  if (publicOnly) query = query.eq("availability", true);
  const result = await query.order("created_at", { ascending: false });
  return unwrap(result, "vehicles list") || [];
}

async function getVehiclesForDealers(dealerIds, { includeArchived = false, publicOnly = false } = {}) {
  let query = supabase.from("vehicles").select("*").in("dealer_id", dealerIds);
  if (!includeArchived) query = query.eq("archived", false);
  if (publicOnly) query = query.eq("availability", true);
  const result = await query.order("created_at", { ascending: false });
  return unwrap(result, "vehicles list") || [];
}

async function getVehicleByVehicleId(vehicleId) {
  const result = await supabase.from("vehicles").select("*").eq("vehicle_id", vehicleId).maybeSingle();
  return unwrap(result, "vehicle lookup");
}

async function createVehicle(fields) {
  const result = await supabase.from("vehicles").insert(fields).select("*").single();
  return unwrap(result, "vehicle create");
}

async function updateVehicleByVehicleId(vehicleId, fields) {
  const result = await supabase.from("vehicles").update(fields).eq("vehicle_id", vehicleId).select("*").single();
  return unwrap(result, "vehicle update");
}

async function archiveVehicle(vehicleId) {
  const result = await supabase
    .from("vehicles")
    .update({ archived: true, status: "archived" })
    .eq("vehicle_id", vehicleId)
    .select("*")
    .single();
  return unwrap(result, "vehicle archive");
}

async function listVehicles({ dealerId, status, monthStart, monthEnd } = {}) {
  let query = supabase.from("vehicles").select("*");
  if (dealerId) query = query.eq("dealer_id", dealerId);
  if (status) query = query.eq("status", status);
  if (monthStart) query = query.gte("updated_at", monthStart.toISOString());
  if (monthEnd) query = query.lte("updated_at", monthEnd.toISOString());
  const result = await query.order("created_at", { ascending: false });
  return unwrap(result, "vehicles list") || [];
}

async function createViewingRequest(fields) {
  const result = await supabase.from("viewing_requests").insert(fields).select("*").single();
  return unwrap(result, "request create");
}

async function updateViewingRequestByRequestId(requestId, fields) {
  const result = await supabase
    .from("viewing_requests")
    .update(fields)
    .eq("request_id", requestId)
    .select("*")
    .single();
  return unwrap(result, "request update");
}

async function listViewingRequests({ dealerId, status, monthStart, monthEnd } = {}) {
  let query = supabase.from("viewing_requests").select("*");
  if (dealerId) query = query.eq("dealer_id", dealerId);
  if (status) query = query.eq("status", status);
  if (monthStart) query = query.gte("created_at", monthStart.toISOString());
  if (monthEnd) query = query.lte("created_at", monthEnd.toISOString());
  const result = await query.order("created_at", { ascending: false });
  return unwrap(result, "requests list") || [];
}

module.exports = {
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
};
