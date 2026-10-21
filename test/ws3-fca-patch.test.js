"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const patchScript = fs.readFileSync(path.join(root, "scripts", "patch-ws3-fca.js"), "utf8");

test("ws3-fca postinstall patch guards missing sendMessage payload actions", () => {
  assert.match(patchScript, /const sendResponsePattern = \/const messageInfo = resData\\\.payload\\\.actions\\\.reduce\\s\*\\\(/);
  assert.match(patchScript, /Array\.isArray\(resData\.payload\.actions\)/);
  assert.match(patchScript, /updated = updated\.replace\(sendResponsePattern, sendResponseGuard\)/);

  const source = "const messageInfo = resData.payload.actions.reduce((p, v) => p || v, null);";
  const pattern = /const messageInfo = resData\.payload\.actions\.reduce\s*\(/;
  const guard =
    'if (!resData || !resData.payload || !Array.isArray(resData.payload.actions)) {\n' +
    '        throw new Error("Messenger send response missing payload.actions (possible session, permission, or rate-limit response).");\n' +
    '      }\n' +
    '      const messageInfo = resData.payload.actions.reduce(';
  const patched = source.replace(pattern, guard);

  assert.notEqual(patched, source, "the known ws3-fca source shape must match the patch");
  assert.match(patched, /if \(!resData \|\| !resData\.payload \|\| !Array\.isArray\(resData\.payload\.actions\)\)/);
  assert.match(patched, /const messageInfo = resData\.payload\.actions\.reduce/);
  assert.doesNotMatch(patched, /\\n/, "replacement must contain real newlines, not literal backslash-n text");
});
