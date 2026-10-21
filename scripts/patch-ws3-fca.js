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
        // Match any simple numeric/expression value, not only the literal 1000.
        const reconnectPatched = updated.replace(/reconnectPeriod\s*:\s*[^,\r\n}]+/g, "reconnectPeriod: 30000");
        if (reconnectPatched !== updated) {
          console.log("[postinstall] Added 30-second MQTT reconnect backoff in listenMqtt.js");
        } else {
          console.warn("[postinstall] listenMqtt.js has no recognizable reconnectPeriod option; inspect the installed source.");
        }
        updated = reconnectPatched;
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
  console.warn("[postinstall] No utils.CustomError constructor calls found; verify ws3-fca source if the error persists.");
}
