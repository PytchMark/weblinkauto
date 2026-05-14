"use strict";

const { createClient } = require("@supabase/supabase-js");
const WebSocket = require("ws");

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

let supabase = null;

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && !SUPABASE_URL.includes("placeholder")) {
  // #region agent log
  fetch("http://127.0.0.1:7704/ingest/275b8acc-69ab-4955-a590-eb40b3dcbad0", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0650e8" },
    body: JSON.stringify({
      sessionId: "0650e8",
      runId: "pre-fix",
      hypothesisId: "D",
      location: "lib/supabase.js:createClient",
      message: "Initializing Supabase client",
      data: { nodeVersion: process.versions.node, supabaseConfigured: true },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      transport: WebSocket,
    },
  });
  // #region agent log
  fetch("http://127.0.0.1:7704/ingest/275b8acc-69ab-4955-a590-eb40b3dcbad0", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0650e8" },
    body: JSON.stringify({
      sessionId: "0650e8",
      runId: "pre-fix",
      hypothesisId: "D",
      location: "lib/supabase.js:createClient",
      message: "Supabase client initialized",
      data: { supabaseConfigured: true },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
} else {
  console.warn("⚠️  Supabase not configured - using mock mode");
  // Mock Supabase for development without real credentials
  const mockResult = (data) => ({ data, error: null });
  const mockChain = {
    select: () => mockChain,
    eq: () => mockChain,
    in: () => mockChain,
    like: () => mockChain,
    gte: () => mockChain,
    lte: () => mockChain,
    order: () => mockChain,
    limit: () => mockChain,
    maybeSingle: async () => mockResult(null),
    single: async () => mockResult({}),
    insert: () => mockChain,
    update: () => mockChain,
    upsert: () => mockChain,
    then: (resolve) => resolve(mockResult([])),
  };
  supabase = {
    from: () => mockChain,
  };
}

module.exports = { supabase };
