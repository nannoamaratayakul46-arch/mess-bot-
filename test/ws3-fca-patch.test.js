"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const patchScript = fs.readFileSync(path.join(root, "scripts", "patch-ws3-fca.js"), "utf8");

test("ws3-fca postinstall validates the pinned public API and guards the fb_dtsg extraction seam", () => {
  assert.match(patchScript, /packageJson\.version !== "3\.5\.2"/);
  assert.match(patchScript, /typeof client\.login !== "function"/);
  assert.match(patchScript, /require\(packageRoot\)/);
  assert.match(patchScript, /ECLIPSE_WS3_FCA_MISSING_DTSG_DIAGNOSTICS_V2/);
  assert.match(patchScript, /legacyGuardedBlock/);
  assert.match(patchScript, /Existing guarded fb_dtsg patch could not be safely upgraded/);
  assert.match(patchScript, /buildAPI\.js/);
  assert.match(patchScript, /did not match the verified fb_dtsg extraction line/);
  assert.match(patchScript, /writeFileSync\(buildApiPath/);
  assert.match(patchScript, /responseKind:/);
  assert.match(patchScript, /twoFactorFormMarker:/);
  assert.match(patchScript, /checkpointPathMarker:/);
  assert.match(patchScript, /authenticatedHomeMarker:/);
  assert.match(patchScript, /dtsgDataKeys:/);
  assert.match(patchScript, /netDataKeys:/);
  assert.doesNotMatch(patchScript, /console\.(?:log|error)\([^\n]*responseHtml/); 
  assert.doesNotMatch(patchScript, /patchDirectory|patchSource/);
});

test("package manifest pins the audited ws3-fca release", () => {
  const pkg = require(path.join(root, "package.json"));
  assert.equal(pkg.dependencies["ws3-fca"], "3.5.2");
  assert.equal(pkg.scripts.postinstall, "node scripts/patch-ws3-fca.js");
});
