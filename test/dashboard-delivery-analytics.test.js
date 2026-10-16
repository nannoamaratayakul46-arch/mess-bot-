"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");

test("delivery analytics records successful and failed Messenger sends", () => {
  assert.match(source, /trafficRecordDeliveryOutcome\("sent", job\)/);
  assert.match(source, /trafficRecordDeliveryOutcome\("failed", job, rawCode\)/);
});

test("delivery history is bounded in memory and persisted in PostgreSQL", () => {
  assert.match(source, /const trafficDeliveryHistory = \[\]/);
  assert.match(source, /TRAFFIC_DELIVERY_HISTORY_LIMIT = 5000/);
  assert.match(source, /TRAFFIC_DELIVERY_RETENTION_MS = 24 \* 60 \* 60 \* 1000/);
  const start = source.indexOf("function trafficRecordDeliveryOutcome(");
  const end = source.indexOf("\n}\n", start);
  assert.notEqual(start, -1, "delivery recorder should exist");
  assert.notEqual(end, -1, "delivery recorder should close");
  const recorder = source.slice(start, end);
  assert.ok(!recorder.includes("body:"), "message body must not be stored");
  assert.ok(!recorder.includes("text:"), "message text must not be stored");
});

test("delivery analytics endpoint is protected by dashboard access", () => {
  assert.match(
    source,
    /app\.get\(\s*"\/api\/dashboard\/delivery-analytics",\s*requireDashboardAccess,/
  );
  assert.match(source, /failure_codes: failureCodes/);
  assert.match(source, /trafficDeliveryStore\.getAnalytics\(hours/);
  assert.match(source, /recent_failures/);
  assert.match(source, /hourly,/);
  assert.match(source, /success_rate:/);
});
