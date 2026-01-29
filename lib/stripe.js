"use strict";

const stripeSecret = process.env.STRIPE_SECRET_KEY;

if (!stripeSecret) {
  throw new Error("Missing STRIPE_SECRET_KEY in env.");
}

const Stripe = require("stripe");

const stripe = new Stripe(stripeSecret, {
  apiVersion: "2024-06-20",
});

module.exports = { stripe };
