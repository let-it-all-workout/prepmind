#!/usr/bin/env node
/**
 * Creates .env from .env.example if .env is missing.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

if (fs.existsSync(envPath)) {
  // eslint-disable-next-line no-console
  console.log(".env already exists — not overwriting.");
  process.exit(0);
}

fs.copyFileSync(examplePath, envPath);
// eslint-disable-next-line no-console
console.log("Created .env from .env.example");
// eslint-disable-next-line no-console
console.log("Edit .env and add your ORIMISE_* and SUPABASE_* values.");
