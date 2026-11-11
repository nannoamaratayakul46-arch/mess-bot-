"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const patchScript = fs.readFileSync(path.join(root, "scripts", "patch-ws3-fca.js"), "utf8");
const { patchSource } = require(path.join(root, "scripts", "ws3-fca-error-patch.js"));

test("ws3-fca postinstall patch guards missing sendMessage payload actions", () => {
  assert.ok(patchScript.includes("const sendResponsePattern ="));
  assert.ok(patchScript.includes("Array.isArray(resData.payload.actions)"));
  assert.ok(patchScript.includes("updated = updated.replace(sendResponsePattern, (_match, indent) =>"));

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


test("ws3-fca patch emits privacy-safe PM request shape diagnostics", () => {
  const source = [
    'function sendContent(form, threadID, isSingleUser, messageAndOTID, callback) {',
    '  if (isSingleUser) {',
    '    form["specific_to_list[0]"] = "fbid:" + threadID;',
    '    form["specific_to_list[1]"] = "fbid:" + ctx.userID;',
    '    form["other_user_fbid"] = threadID;',
    '  } else { form["thread_fbid"] = threadID; }',
    '  defaultFuncs',
    '    .post("https://www.facebook.com/messaging/send/", ctx.jar, form)',
    '}'
  ].join("\n");
  const patched = patchSource(source);
  assert.match(patched, /ECLIPSE_PM_SEND_SHAPE_V1_LOG/);
  assert.match(patched, /hasOtherUserFbid/);
  assert.match(patched, /hasThreadFbid/);
  assert.match(patched, /bodyLength/);
  assert.doesNotMatch(patched, /console\\.info[^\\n]*threadID[,}]/);
  assert.equal(patchSource(patched), patched, "the PM diagnostic patch must be idempotent");
});
