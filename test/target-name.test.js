"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveTargetName, renderTargetReply, clearTargetNameCache } = require("../targetName");

test("saved dashboard name wins without making Messenger API calls", async () => {
  let calls = 0;
  const api = {
    getThreadInfo() { calls++; },
    getUserInfo() { calls++; }
  };
  const result = await resolveTargetName(api, "thread-saved", "user-saved", { savedName: "Ray Cruz" });
  assert.deepEqual(result, { name: "Ray Cruz", source: "dashboard" });
  assert.equal(calls, 0);
});

test("group nickname is preferred when no dashboard name is saved", async () => {
  clearTargetNameCache();
  const api = {
    getThreadInfo(threadID, callback) {
      callback(null, { nicknames: { "user-nick": "Ray" }, userInfo: [{ id: "user-nick", name: "Ray Cruz" }] });
    },
    getUserInfo() { throw new Error("should not be called when nickname exists"); }
  };
  const result = await resolveTargetName(api, "thread-nick", "user-nick");
  assert.deepEqual(result, { name: "Ray", source: "nickname" });
});

test("user info is used when group details have no target name", async () => {
  clearTargetNameCache();
  const api = {
    getThreadInfo(threadID, callback) { callback(null, { nicknames: null, userInfo: [] }); },
    getUserInfo(userIDs, callback) { callback(null, { "user-profile": { firstName: "Ray", name: "Ray Cruz" } }); }
  };
  const result = await resolveTargetName(api, "thread-profile", "user-profile");
  assert.deepEqual(result, { name: "Ray", source: "userInfo" });
});

test("renderer replaces NAME/TARGET placeholders and legacy hardcoded names", () => {
  assert.equal(
    renderTargetReply("{{NAME}} moka ka tanga; {{target}}; Jaiden; kei.", "Kaiser"),
    "Kaiser moka ka tanga; Kaiser; Kaiser; Kaiser."
  );
  assert.equal(
    renderTargetReply("Jaiden, {{target}}!", "Jaiden Smith"),
    "Jaiden Smith, Jaiden Smith!"
  );
});

test("numeric saved target IDs are ignored in favor of a real Messenger display name", async () => {
  clearTargetNameCache();
  const api = {
    getThreadInfo(threadID, callback) { callback(null, { nicknames: {}, userInfo: [] }); },
    getUserInfo(userIDs, callback) {
      assert.deepEqual(userIDs, ["123456789012345"]);
      callback(null, { "123456789012345": { id: "123456789012345", displayName: "Ray Cruz" } });
    }
  };
  const result = await resolveTargetName(api, "thread-numeric-saved", "123456789012345", {
    savedName: "123456789012345"
  });
  assert.deepEqual(result, { name: "Ray Cruz", source: "userInfo" });
});

test("generated Messenger user placeholders are not accepted as target names", async () => {
  clearTargetNameCache();
  const api = {
    getThreadInfo(threadID, callback) { callback(null, { nicknames: {}, userInfo: [] }); },
    getUserInfo(userIDs, callback) { callback(null, { "user-display": { id: "user-display", display_name: "R. Cruz" } }); }
  };
  const result = await resolveTargetName(api, "thread-placeholder", "user-display", {
    savedName: "Messenger user 123456789"
  });
  assert.deepEqual(result, { name: "R. Cruz", source: "userInfo" });
});
