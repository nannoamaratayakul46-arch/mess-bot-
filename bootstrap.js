"use strict";

/*
 * ECLIPSE STARTUP BOOTSTRAP
 * -------------------------
 * Database initialization is intentionally independent of Facebook login.
 * The dashboard, health endpoints, and background services must not depend
 * on a successful Messenger session.
 */

const db = require("./db");
const {
  installBroadcastCommand,
  shutdownBroadcastCommand,
} = require("./broadcast-command");

installBroadcastCommand();

process.once("SIGTERM", shutdownBroadcastCommand);
process.once("SIGINT", shutdownBroadcastCommand);

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
