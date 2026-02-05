"use strict";

const stripeSecret = process.env.STRIPE_SECRET_KEY || "";

let stripe = null;
if (stripeSecret && stripeSecret !== "sk_test_placeholder") {
  const Stripe = require("stripe");
  stripe = new Stripe(stripeSecret, {
    apiVersion: "2024-06-20",
  });
} else {
  console.warn("⚠️  Stripe not configured - using mock mode");
  // Mock Stripe for development
  stripe = {
    checkout: {
      sessions: {
        create: async () => ({ id: "mock_session_id", url: "/landing?status=success&session_id=mock" }),
        retrieve: async () => ({ customer: "mock_customer", subscription: "mock_sub" }),
        list: async () => ({ data: [] }),
      },
    },
    subscriptions: {
      retrieve: async () => ({ id: "mock_sub", status: "trialing", trial_end: null }),
    },
    webhooks: {
      constructEvent: () => ({ type: "mock_event", data: { object: {} } }),
    },
  };
}

module.exports = { stripe };
