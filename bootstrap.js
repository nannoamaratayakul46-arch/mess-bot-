"use strict";

/*
 * ECLIPSE STARTUP BOOTSTRAP
 * -------------------------
 * Database initialization is intentionally independent of Facebook login.
 * The dashboard, health endpoints, and background services must not depend
 * on a successful Messenger session.
 */

// Install runtime compatibility patches before index.js loads any of the
// Banat modules. This keeps the large router untouched and makes the fix
// active on the very first process start.
require("./banat-runtime-hotfix");

const db = require("./db");

async function boot() {
  try {
    await db.connect();
    console.log("[BOOT] Neon database connected before ECLIPSE runtime.");
  } catch (error) {
    console.error("[BOOT] Database initialization failed:", error?.message || error);
    process.exitCode = 1;
    return;
  }

  try {
    require("./index");
  } catch (error) {
    console.error("[BOOT] ECLIPSE runtime failed to start:", error);
    process.exitCode = 1;
  }
}

void boot();
