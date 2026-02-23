// backend/src/instrument.js
const Sentry = require("@sentry/node");

Sentry.init({
  dsn: process.env.SENTRY_DSN || "https://f0e578688db79ec6abebe26d25cd6e5b@o4510933725544448.ingest.us.sentry.io/4510933735178240",
  environment: process.env.NODE_ENV || "development",

  // Capture 20% of transactions in production (100% in dev)
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  // Send request data (IPs, headers) for debugging
  sendDefaultPii: true,

  // Tag every event with the app name
  initialScope: {
    tags: { app: "bidblitz-backend" },
  },

  // Don't send noise - filter out expected errors
  beforeSend(event) {
    // Skip CORS rejections and 404s
    if (event.message && event.message.includes("Not allowed by CORS")) return null;
    if (event.message && event.message.includes("Route not found")) return null;
    return event;
  },
});

module.exports = Sentry;