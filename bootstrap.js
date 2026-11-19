"use strict";

/*
 * ECLIPSE STARTUP BOOTSTRAP
 * -------------------------
 * Database initialization is intentionally independent of Facebook login.
 * The dashboard, health endpoints, and background services must not depend
 * on a successful Messenger session.
 */

const db = require("./db");

async function boot() {
  try {
    await db.connect();
    console.log("[BOOT] Neon database connected before ECLIPSE runtime.");
  } catch (error) {
    console.error("[BOOT] Database initialization failed:", String(error?.code || error?.name || "DB_INIT_FAILED"));
    process.exitCode = 1;
    return;
  }

  let licenseClient = null;
  if (/^(1|true|yes|on)$/i.test(process.env.ECLIPSE_LICENSE_ENFORCEMENT || "")) {
    try {
      const { createLicenseClient } = require("./eclipse-license-client");
      licenseClient = createLicenseClient();
      const authorized = await licenseClient.initialize();
      const status = licenseClient.getStatus();
      console.log("[ECLIPSE LICENSE] Client status:", JSON.stringify({
        app: status.app,
        installation_id: status.installation_id,
        status: status.status,
        offline_grace_until: status.offline_grace_until
      }));
      if (!authorized) {
        console.error("[ECLIPSE LICENSE] Startup blocked:", status.last_error);
        licenseClient.stop();
        process.exitCode = 1;
        return;
      }
      licenseClient.startHeartbeat(reason => {
        console.error("[ECLIPSE LICENSE] Authorization revoked; stopping bot:", reason);
        licenseClient.stop();
        process.exit(1);
      });
    } catch (error) {
      console.error("[ECLIPSE LICENSE] Client initialization failed:", String(error?.message || error).slice(0, 300));
      process.exitCode = 1;
      return;
    }
  } else {
    console.warn("[ECLIPSE LICENSE] Enforcement is disabled. Set ECLIPSE_LICENSE_ENFORCEMENT=true to require owner approval.");
  }

  try {
    require("./index");
  } catch (error) {
    licenseClient?.stop();
    console.error("[BOOT] ECLIPSE runtime failed to start:", String(error?.code || error?.name || "RUNTIME_START_FAILED"));
    process.exitCode = 1;
  }
}

void boot();
