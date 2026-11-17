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
  listenerErrorBlockStart + 3000
);
assert(indexSource.includes("Recover a dead listener through one controlled fresh login"));

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

// Authentication diagnostics must distinguish a missing session from a transient
// listener/database problem and must never invoke ws3-fca with empty input.
const indexForAuth = indexSource;
assert(indexForAuth.includes("async function getMessengerAuthDiagnostics()"));
assert(indexForAuth.includes('durable_checkpoint: durableState'));
assert(indexForAuth.includes('fb_cookies_configured: Boolean(deploymentAppState)'));
assert(indexForAuth.includes("No usable Facebook session is available"));
assert(indexForAuth.includes('action: "session_required"'));
assert(indexForAuth.includes('diagnostics.durable_checkpoint !== "available"'));
assert(indexForAuth.includes("No durable Messenger session or FB_COOKIES is available"));
assert(!indexForAuth.includes("dashboardFacebookCredentials"));
assert(!indexForAuth.includes("preferDashboardCredentials"));
assert(!indexForAuth.includes('/api/dashboard/connect-credentials'));

console.log("Authentication diagnostics and recovery source checks passed");

// An explicit cookie upload must supersede a stalled login attempt instead
// of returning 409 and leaving the dashboard permanently in Connecting.
const connectSessionStart = indexSource.indexOf('app.post(\n  "/api/dashboard/connect-session"');
const connectSessionEnd = indexSource.indexOf('app.post(\n  "/api/dashboard/reconnect"', connectSessionStart);
const connectSessionRoute = indexSource.slice(connectSessionStart, connectSessionEnd);
assert.ok(connectSessionStart >= 0 && connectSessionEnd > connectSessionStart);
assert.doesNotMatch(connectSessionRoute, /A Facebook login is already in progress/);
assert.match(connectSessionRoute, /if \(loginInProgress\) \{\s*loginInProgress = false;[\s\S]*?Superseding a stalled Messenger login/);
assert.match(connectSessionRoute, /listenerGeneration\+\+/);
assert.match(connectSessionRoute, /pendingFacebookAppState = incoming/);

console.log("Replacement-cookie recovery source checks passed");
