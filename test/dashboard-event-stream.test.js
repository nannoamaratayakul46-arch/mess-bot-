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
  assert.match(index, /lastFailure: status\.lastFailure\s*\? \{ code: status\.lastFailure\.code, at: status\.lastFailure\.at \}/);
  assert.doesNotMatch(index, /trafficGovernor: trafficSafetyStatus\(\)/);
});
