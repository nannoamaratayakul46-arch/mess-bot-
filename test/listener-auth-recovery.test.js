"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("listener auth rejection schedules one bounded saved-session revalidation", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  const marker = 'if (authRejected) {';
  const start = source.indexOf(marker);
  const end = source.indexOf('\n            // Recover a dead listener', start);
  assert.ok(start >= 0 && end > start, "auth rejection branch should be present");
  const branch = source.slice(start, end);
  assert.match(branch, /authRejectionRetryUsed/);
  assert.match(branch, /const retryDelayMs = 30_000/);
  assert.match(branch, /attemptLogin\(\)/);
  assert.match(branch, /activeListenerGeneration <= 0/);
  assert.match(source, /authRejectionRetryUsed = false/);
});
