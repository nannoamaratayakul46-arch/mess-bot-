"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "debate", "manager.js"),
  "utf8"
);

test("malformed debate state is quarantined and reset with valid JSON plus a newline", () => {
  assert.match(
    source,
    /writeFile\(STATE_FILE, "\{\}\\n", "utf8"\)/
  );
  assert.doesNotMatch(
    source,
    /writeFile\(STATE_FILE, "\{\}\\\\n", "utf8"\)/
  );
  assert.match(source, /\.corrupt-\$\{Date\.now\(\)\}/);
  assert.match(source, /await fsp\.rename\(STATE_FILE, backup\)/);
});
