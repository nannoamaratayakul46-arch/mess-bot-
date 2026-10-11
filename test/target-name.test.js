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

test("renderer replaces all placeholders and leftover Jaiden text", () => {
  assert.equal(
    renderTargetReply("Jaiden, {{target}}! jaiden saw {{ target }}.", "Ray"),
    "Ray, Ray! Ray saw Ray."
  );
});
