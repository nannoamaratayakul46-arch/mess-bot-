"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const indexSource = fs.readFileSync(
  path.join(__dirname, "..", "index.js"),
  "utf8"
);
const dbSource = fs.readFileSync(
  path.join(__dirname, "..", "db.js"),
  "utf8"
);

// Startup must restore the durable checkpoint before the first login, while
// preserving FB_COOKIES as a fallback when that checkpoint is rejected.
assert(indexSource.includes("async function initializeMessengerSession()"));
assert(indexSource.includes("await loadPersistedFacebookSessionState();"));
assert(indexSource.includes('let deploymentAppState = null;'));
assert(indexSource.includes('let appStateSource = "none";'));
assert(indexSource.includes("durableSessionRejected"));
assert(indexSource.includes("falling back to FB_COOKIES"));

// A listener/MQTT error must not be translated into an authentication logout
// or a competing login loop. ws3-fca owns listener/session recovery.
const listenerErrorBlockStart = indexSource.indexOf("if (listenError) {");
assert(listenerErrorBlockStart >= 0);
const listenerErrorBlock = indexSource.slice(
  listenerErrorBlockStart,
  listenerErrorBlockStart + 1200
);
assert(!listenerErrorBlock.includes("watchdogSetMessengerConnected(false)"));
assert(listenerErrorBlock.includes("ws3-fca owns its reconnect/relogin"));

// Dashboard reconnect/start must not race ws3-fca just because the watchdog
// temporarily observed a listener error.
assert(!indexSource.includes(
  "!activeMessengerApi ||\n      !watchdogMessengerConnected"
));

// A transient database initialization failure must not terminate a valid
// Messenger session.
assert(indexSource.includes(
  "keeping the Facebook session alive"
));
assert(!indexSource.includes(
  'console.error(\n          "Database connection failed:",\n          error\n        );\n\n        process.exit(1);'
));

// Failed DB initialization must discard the half-created pool so a later
// connect() can retry cleanly.
assert(dbSource.includes("let initializingPool = null;"));
assert(dbSource.includes("if (pool === initializingPool)"));
assert(dbSource.includes("pool = null;"));

console.log("Messenger session stability source checks passed");
