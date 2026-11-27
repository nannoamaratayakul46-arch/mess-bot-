"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const index = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");

test("dashboard event stream uses actual SSE line delimiters", () => {
  assert.match(index, /const payload = `data: \$\{JSON\.stringify\(event\)\}\\n\\n`;/);
  assert.match(index, /res\.write\(`event: ready\\ndata:/);
  assert.match(index, /: heartbeat \$\{Date\.now\(\)\}\\n\\n/);
  assert.doesNotMatch(index, /JSON\.stringify\(event\)\}\\\\n/);
  const healthStart = index.indexOf('app.get("/health"');
  const healthEnd = index.indexOf("const port =", healthStart);
  assert.notEqual(healthStart, -1, "public health route should exist");
  assert.notEqual(healthEnd, -1, "public health route should have a clear end");
  const publicHealth = index.slice(healthStart, healthEnd);
  assert.ok(publicHealth.includes("uptime: Math.floor(process.uptime())"));
  assert.ok(!publicHealth.includes("lastFailure: status.lastFailure"));
  assert.ok(!publicHealth.includes("trafficGovernor:"));
});

test("dashboard SSE clients and heartbeat timers are closed before HTTP shutdown", () => {
  assert.match(index, /const dashboardEventHeartbeatTimers = new Map\(\);/);
  assert.match(index, /dashboardEventHeartbeatTimers\.set\(res, heartbeatTimer\)/);
  assert.match(index, /res\.once\("close", \(\) => cleanupDashboardEventClient\(res\)\)/);
  assert.doesNotMatch(index, /req\.on\("close", \(\) => \{\s*clearInterval\(heartbeatTimer\)/);

  const shutdownStart = index.indexOf("async function gracefulShutdown");
  const shutdownEnd = index.indexOf("function handleRecoverableMessengerProcessFailure", shutdownStart);
  const shutdown = index.slice(shutdownStart, shutdownEnd);
  assert.match(shutdown, /for \(const \[client, heartbeatTimer\] of dashboardEventHeartbeatTimers\)/);
  assert.match(shutdown, /client\.end\(\)/);
  assert.ok(shutdown.indexOf("server.close(") < shutdown.indexOf("client.end()"));
});
