"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");

test("Messenger account replacement clears previous account group discovery state", () => {
  assert.match(source, /previousMessengerUserID !== eclipseUserID/);
  assert.match(source, /activeThreads\.clear\(\);[\s\S]*?dashboardKnownGroups\.clear\(\);[\s\S]*?archivedDashboardGroups\.clear\(\)/);
});

test("dashboard archived groups are scoped to the authenticated Messenger identity", () => {
  assert.match(source, /ADD COLUMN IF NOT EXISTS messenger_user_id TEXT NOT NULL DEFAULT ''/);
  assert.match(source, /WHERE messenger_user_id = \$1 ORDER BY archived_at DESC/);
  assert.match(source, /WHERE messenger_user_id = \$1/);
  assert.match(source, /thread_id, messenger_user_id, group_name, participant_count/);
  assert.match(source, /DELETE FROM eclipse_dashboard_archived_groups WHERE thread_id = \$1 AND messenger_user_id = \$2/);
});

test("uploaded replacement cookies become the durable session when getAppState is unavailable", () => {
  assert.match(source, /if \(pendingFacebookAppState\) \{\s*appState = pendingFacebookAppState;\s*pendingFacebookAppState = null;\s*\}\s*\/\/ Persist the newest session/);
});

test("disconnect clears previous account group caches", () => {
  const start = source.indexOf('app.post(\n  "/api/dashboard/disconnect"');
  const end = source.indexOf('app.post(\n  "/api/dashboard/bot/start"', start);
  const body = source.slice(start, end);
  assert.match(body, /activeThreads\.clear\(\)/);
  assert.match(body, /dashboardKnownGroups\.clear\(\)/);
});

