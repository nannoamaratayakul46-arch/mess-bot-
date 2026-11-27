"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");

test("Messenger account replacement clears previous account group discovery state", () => {
  assert.match(source, /previousMessengerUserID !== eclipseUserID/);
  assert.match(source, /activeThreads\.clear\(\);[\s\S]*?dashboardKnownGroups\.clear\(\);[\s\S]*?dashboardSavedGroupDirectoryCleared = false;[\s\S]*?archivedDashboardGroups\.clear\(\)/);
});

test("dashboard archived groups are scoped to the authenticated Messenger identity", () => {
  assert.match(source, /ADD COLUMN IF NOT EXISTS messenger_user_id TEXT NOT NULL DEFAULT ''/);
  assert.match(source, /FROM eclipse_dashboard_archived_groups WHERE messenger_user_id = \$1 AND thread_id = ANY\(\$2::text\[\]\) ORDER BY archived_at DESC/);
  assert.match(source, /INNER JOIN eclipse_dashboard_group_presence AS presence[\s\S]*?WHERE archived\.messenger_user_id = \$1[\s\S]*?presence\.last_seen_at >= NOW\(\) - INTERVAL '7 days'/);
  assert.match(source, /WHERE messenger_user_id = \$1/);
  assert.match(source, /thread_id, messenger_user_id, group_name, participant_count/);
  assert.match(source, /DELETE FROM eclipse_dashboard_archived_groups WHERE thread_id = \$1 AND messenger_user_id = \$2/);
});

test("stale Messenger group history expires after seven days and cannot repopulate saved groups", () => {
  assert.match(source, /DASHBOARD_GROUP_RETENTION_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(source, /DELETE FROM eclipse_dashboard_group_presence[\s\S]*?last_seen_at < NOW\(\) - \(\$2::bigint \* INTERVAL '1 millisecond'\)/);
  assert.match(source, /if \(!threadID \|\| !recentGroupIds\.has\(threadID\)\) continue/);
  assert.match(source, /if \(!messengerConnected && groupPresenceAvailable\)/);
});

test("uploaded replacement cookies become the durable session when getAppState is unavailable", () => {
  assert.match(source, /replacement cookie set that just authenticated/);
  assert.match(source, /if \(pendingFacebookAppState\) \{\s*appState = pendingFacebookAppState;\s*pendingFacebookAppState = null;\s*\}/);
  assert.match(source, /persistFacebookSessionState\(appState\)/);
});

test("disconnect clears previous account group caches", () => {
  const start = source.indexOf('app.post(\n  "/api/dashboard/disconnect"');
  const end = source.indexOf('app.post(\n  "/api/dashboard/bot/start"', start);
  const body = source.slice(start, end);
  assert.match(body, /activeThreads\.clear\(\)/);
  assert.match(body, /dashboardKnownGroups\.clear\(\)/);
});

test("owner group-cache reset clears only in-memory Messenger discovery state", () => {
  const start = source.indexOf('app.post(\n  "/api/dashboard/groups/cache/clear"');
  const end = source.indexOf('function dashboardOwnerId()', start);
  const body = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(body, /req\.dashboardAccount\.role !== "owner"/);
  assert.match(body, /clearSharedThreadListCache\(api\)/);
  assert.match(body, /dashboardThreadLists = new WeakMap\(\)/);
  assert.match(body, /dashboardKnownGroups\.clear\(\)/);
  assert.match(body, /dashboardSavedGroupDirectoryCleared = true/);
  assert.doesNotMatch(body, /activeThreads\.clear\(\)/);
  assert.doesNotMatch(body, /DELETE FROM|TRUNCATE TABLE/);
  assert.doesNotMatch(body, /activeListenerGeneration <= 0/);
});
