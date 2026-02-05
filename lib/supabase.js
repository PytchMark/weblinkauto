"use strict";

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

let supabase = null;

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && !SUPABASE_URL.includes("placeholder")) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
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
