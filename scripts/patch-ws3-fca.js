"use strict";

const fs = require("node:fs");
const path = require("node:path");

// ws3-fca@2.0.1 can mask the original request failure by constructing a
// nonexistent utils.CustomError. Replace only that broken error constructor.
const root = path.join(__dirname, "..", "node_modules", "ws3-fca", "src");
const target = /new\s+utils\.CustomError\s*\(/g;

function patchDirectory(directory) {
  if (!fs.existsSync(directory)) {
    console.warn("[postinstall] ws3-fca source not found; skipping compatibility patch.");
    return 0;
  }
  let changed = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) changed += patchDirectory(file);
    else if (entry.isFile() && entry.name.endsWith(".js")) {
      const source = fs.readFileSync(file, "utf8");
      let updated = source.replace(target, "new Error(");
      // Guard malformed send responses returned during auth/rate-limit failures.
      // This preserves the underlying failure instead of crashing on undefined.reduce.
      // Match by source content, not filename: ws3-fca versions/forks may
      // place the send implementation in differently named API files.
      const sendResponsePattern = /(^[ \t]*)(?:const|let|var)\s+messageInfo\s*=\s*resData\.payload\.actions\.reduce\s*\(/m;
      if (/resData\.payload\.actions\.reduce\s*\(/.test(updated)) {
        if (updated.includes("Messenger send response missing payload.actions")) {
          // Already patched; keep postinstall idempotent.
        } else if (sendResponsePattern.test(updated)) {
          updated = updated.replace(sendResponsePattern, (_match, indent) =>
            indent +
            'if (!resData || !resData.payload || !Array.isArray(resData.payload.actions)) {\n' +
            indent + '  throw new Error("Messenger send response missing payload.actions (possible session, permission, or rate-limit response).");\n' +
            indent + '}\n' +
            indent + 'const messageInfo = resData.payload.actions.reduce('
          );
          console.log("[postinstall] Guarded ws3-fca send response in " + path.relative(root, file));
        } else {
          console.warn("[postinstall] Found payload.actions.reduce in " + path.relative(root, file) + " but could not safely match the messageInfo declaration.");
        }
      }
      // A 1-second MQTT reconnect loop can amplify Messenger 1675004 rate
      // limits into a reconnect storm. Back off reconnects to 30 seconds.
      if (entry.name === "listenMqtt.js") {
        const reconnectPattern = /reconnectPeriod\s*:\s*[^,\r\n}]+/g;
        const reconnectPatched = updated.replace(reconnectPattern, "reconnectPeriod: 30000");
        if (reconnectPatched !== updated) {
          console.log("[postinstall] Set ws3-fca MQTT reconnect backoff to 30 seconds.");
        } else if (!/reconnectPeriod\s*:\s*30000\b/.test(updated)) {
          console.warn("[postinstall] Could not identify the MQTT reconnectPeriod setting in listenMqtt.js.");
        }
        updated = reconnectPatched;

        // Do not treat every MQTT "close" event as a fatal listener failure.
        // MQTT.js emits close during ordinary reconnect cycles too. Reporting
        // each close through globalCallback makes index.js stop the client and
        // start a fresh Facebook login, potentially defeating MQTT auto-retry
        // and amplifying Facebook rate limits. Keep recovery in the existing
        // listener error path; use reconnectPeriod backoff for transient drops.
      }
      if (updated !== source) {
        fs.writeFileSync(file, updated, "utf8");
        changed++;
        if (source !== source.replace(target, "new Error(")) {
          console.log("[postinstall] Patched ws3-fca error constructor in " + path.relative(root, file));
        }
        if (entry.name === "listenMqtt.js" && source !== updated) {
          console.log("[postinstall] Added 30-second MQTT reconnect backoff in listenMqtt.js");
        }
      }
    }
  }
  return changed;
}

const changed = patchDirectory(root);
if (!changed) {
  console.log("[postinstall] No ws3-fca source changes were needed; compatibility markers may already be present.");
}
