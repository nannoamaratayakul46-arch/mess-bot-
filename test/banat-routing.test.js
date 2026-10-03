"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

test("slash Banat toggle is evaluated before automatic Banat", () => {
  const source = read("index.js");
  const toggle = source.indexOf("const banatControlMatch");
  const automatic = source.indexOf("const banatHandled = await handleAutomaticBanatMessage");

  assert.ok(toggle >= 0, "slash toggle must exist");
  assert.ok(automatic >= 0, "automatic Banat must exist");
  assert.ok(toggle < automatic, "slash toggle must run first");
});

test("slash Banat toggle exits before automatic Banat can process slash", () => {
  const source = read("index.js");
  const toggle = source.indexOf("const banatControlMatch");
  const automatic = source.indexOf("const banatHandled = await handleAutomaticBanatMessage");
  const toggleBlock = source.slice(toggle, automatic);

  assert.match(toggleBlock, /setBanatConversationMode\(threadId, enabled, senderId\)/);
  assert.match(toggleBlock, /await db\.setRoastEnabled\(threadId, enabled\)/);
  assert.match(toggleBlock, /if \(!enabled\)/);
  assert.match(toggleBlock, /if \(enabled\)/);
  assert.match(toggleBlock, /\n    return;\n  }\n\n  \/\/);
});

test("automatic Banat passes sender identity into the roast selector", () => {
  const source = read("index.js");
  assert.match(
    source,
    /getRandomRoastReply\(threadID, body, senderId\)/
  );
});

test("automatic Banat restores persistent mode before targeting", () => {
  const source = read("index.js");
  const start = source.indexOf("async function handleAutomaticBanatMessage");
  const body = source.slice(start, start + 5000);

  assert.match(body, /await db\.isRoastEnabled\(threadId\)/);
  assert.match(body, /setBanatConversationMode\(threadId, false\)/);
  assert.match(body, /setBanatConversationMode\(threadId, true\)/);
  assert.ok(
    body.indexOf("setBanatConversationMode(threadId, true)") <
      body.indexOf("classifyBanatTarget")
  );
});

test("runtime hotfix files are no longer part of the source tree", () => {
  for (const file of [
    "repo-hotfix.js",
    "broadcast-runtime-fix.js",
    "rpg-help-preload.js",
  ]) {
    assert.equal(
      fs.existsSync(path.join(root, file)),
      false,
      file + " should not exist"
    );
  }
});

test("unauthorized slash uses the Banat roast replies instead of the admin-only panel", () => {
  const source = read("index.js");
  const toggle = source.indexOf("const banatControlMatch");
  const automatic = source.indexOf("const banatHandled = await handleAutomaticBanatMessage");
  const toggleBlock = source.slice(toggle, automatic);

  assert.match(toggleBlock, /pota bawal panget gumamit command hoy/);
  assert.match(toggleBlock, /sabi ko ayoko kalbo/);
  assert.match(toggleBlock, /aaaaaa bingi ka\? sabi bawal moka paa gumamit command/);
  assert.doesNotMatch(toggleBlock, /🔒 ADMIN ONLY/);
});

test("Banat burst replies are spaced 5 seconds apart and limited to one reply per sender", () => {
  const source = read("index.js");
  assert.match(
    source,
    /ECLIPSE_BANAT_MIN_INTER_REPLY_GAP_MS \|\| 5_000/
  );
  assert.match(
    source,
    /state\.senderIds\.has\(senderKey\)/
  );
  assert.match(
    source,
    /Math\.floor\(Math\.random\(\) \* eligible\.length\)/
  );
});

test("Banat keeps burst state alive during the 5-second cooldown", () => {
  const source = read("index.js");
  assert.match(source, /cleanupTimer/);
  assert.match(
    source,
    /state\.cleanupTimer = setTimeout\(\(\) => \{/
  );
  assert.match(
    source,
    /}, BANAT_MIN_INTER_REPLY_GAP_MS\);/
  );
});
