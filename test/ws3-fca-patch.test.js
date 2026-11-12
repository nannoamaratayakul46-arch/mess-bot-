"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const patchScript = fs.readFileSync(path.join(root, "scripts", "patch-ws3-fca.js"), "utf8");

test("ws3-fca postinstall validates the pinned public API without rewriting package internals", () => {
  assert.match(patchScript, /packageJson\.version !== "3\.5\.2"/);
  assert.match(patchScript, /typeof client\.login !== "function"/);
  assert.match(patchScript, /require\(packageRoot\)/);
  assert.doesNotMatch(patchScript, /patchSource|patchDirectory|writeFileSync/);
  assert.match(patchScript, /no package source patches applied/);
});

test("package manifest pins the audited ws3-fca release", () => {
  const pkg = require(path.join(root, "package.json"));
  assert.equal(pkg.dependencies["ws3-fca"], "3.5.2");
  assert.equal(pkg.scripts.postinstall, "node scripts/patch-ws3-fca.js");
});
