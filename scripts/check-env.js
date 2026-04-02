#!/usr/bin/env node
/**
 * Reports which env vars still use placeholders (no secrets printed).
 */
require("dotenv").config();
const path = require("path");

const root = path.join(__dirname, "..");
const hasEnvFile = require("fs").existsSync(path.join(root, ".env"));

function modelOk() {
  const v = String(process.env.ORIMISE_MODEL || "").trim();
  if (!v) return true;
  return !/^your_default_model$|^your_orimise/i.test(v);
}

function orimiseUrlConfigured() {
  const end = String(process.env.ORIMISE_ENDPOINT || "").trim();
  const base = String(process.env.ORIMISE_BASE_URL || "").trim();
  const bad = (u) =>
    !u ||
    /your-host|YOUR_ORIMISE|example\.com|placeholder/i.test(u) ||
    !/^https?:\/\//i.test(u);
  if (end && !bad(end)) return true;
  if (base && !bad(base)) return true;
  return false;
}

function apiKeyOk() {
  const v = process.env.ORIMISE_API_KEY || "";
  return (
    v.length > 8 &&
    !/^your_orimise_api_key$/i.test(v) &&
    !/^your_secret/i.test(v) &&
    !/placeholder/i.test(v)
  );
}

const checks = [
  {
    label: "ORIMISE_API_KEY",
    ok: apiKeyOk,
    hint: "API key from your Orimise dashboard",
  },
  {
    label: "ORIMISE_BASE_URL or ORIMISE_ENDPOINT",
    ok: orimiseUrlConfigured,
    hint:
      "Set ORIMISE_BASE_URL (Orimise base URL) and optionally ORIMISE_CHAT_PATH, or set full ORIMISE_ENDPOINT",
  },
  {
    label: "ORIMISE_MODEL",
    ok: modelOk,
    hint: "Default model id as shown in Orimise (optional if your setup does not require it)",
  },
  {
    label: "SUPABASE_URL",
    ok: () =>
      process.env.SUPABASE_URL &&
      /\.supabase\.co/.test(process.env.SUPABASE_URL) &&
      !process.env.SUPABASE_URL.includes("your-project"),
    hint: "Supabase → Settings → API → Project URL",
  },
  {
    label: "SUPABASE_ANON_KEY",
    ok: () =>
      process.env.SUPABASE_ANON_KEY &&
      process.env.SUPABASE_ANON_KEY.length > 20 &&
      !/^your_anon/i.test(process.env.SUPABASE_ANON_KEY),
    hint: "Supabase → Settings → API → anon public key",
  },
];

let bad = 0;
// eslint-disable-next-line no-console
console.log(hasEnvFile ? "Checking .env …\n" : "No .env file — run: npm run setup\n");

for (const { label, ok, hint } of checks) {
  const pass = ok();
  if (!pass) {
    bad += 1;
    // eslint-disable-next-line no-console
    console.log(`  ✗ ${label} — ${hint}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`  ✓ ${label}`);
  }
}

// eslint-disable-next-line no-console
console.log("");
if (bad > 0) {
  // eslint-disable-next-line no-console
  console.log(
    "Google OAuth: enable in Supabase Dashboard (Authentication → Providers → Google).\n" +
      "Redirect URL for this app: http://localhost:3000/chat (add under URL Configuration).\n"
  );
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log("Environment looks configured for local dev. Run: npm start\n");
process.exit(0);
