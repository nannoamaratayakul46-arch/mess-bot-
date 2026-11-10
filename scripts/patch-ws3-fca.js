"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { patchSource } = require("./ws3-fca-error-patch");

const root = path.join(__dirname, "..", "node_modules", "ws3-fca", "src");

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
      let updated = patchSource(source);

      // Retain the legacy guard at this entry point for older ws3-fca layouts.
      // The shared patchSource helper normally applies it first.
      const sendResponsePattern = /(^[ \t]*)(?:const|let|var)\s+messageInfo\s*=\s*resData\.payload\.actions\.reduce\s*\(/m;
      if (/resData\.payload\.actions\.reduce\s*\(/.test(updated) &&
          !updated.includes("Messenger send response missing payload.actions") &&
          sendResponsePattern.test(updated)) {
        updated = updated.replace(sendResponsePattern, (_match, indent) =>
          indent +
          'if (!resData || !resData.payload || !Array.isArray(resData.payload.actions)) {\n' +
          indent + '  throw new Error("Messenger send response missing payload.actions (possible session, permission, or rate-limit response).");\n' +
          indent + '}\n' +
          indent + 'const messageInfo = resData.payload.actions.reduce('
        );
      }

      // A 1-second MQTT reconnect loop can amplify Messenger 1675004 rate
      // limits into a reconnect storm. Back off reconnects to 30 seconds.
      if (entry.name === "listenMqtt.js") {
        const reconnectPattern = /reconnectPeriod\s*:\s*[^,\r\n}]+/g;
        const reconnectPatched = updated.replace(reconnectPattern, "reconnectPeriod: 30000");
        if (reconnectPatched !== updated) {
          console.log("[postinstall] Set ws3-fca MQTT reconnect backoff to 30 seconds.");
        } else if (!/reconnectPeriod\s*:\s*30000\b/.test(updated)) {
          console.warn("[postinstall] Could not identify the reconnectPeriod setting in listenMqtt.js.");
        }
        updated = reconnectPatched;
      }

      if (updated !== source) {
        fs.writeFileSync(file, updated, "utf8");
        changed++;
        console.log("[postinstall] Applied ws3-fca compatibility/error diagnostics patch in " + path.relative(root, file));
      }
    }
  }
  return changed;
}

const changed = patchDirectory(root);
if (!changed) {
  console.log("[postinstall] No ws3-fca source changes were needed; compatibility markers may already be present.");
}
