"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveModerationTarget } = require("../moderation-target");

const threadInfo = {
  userInfo: [
    { id: "100000000001", name: "Abdullah", firstName: "Abdullah" },
    { id: "100000000002", name: "Ray Cruz", firstName: "Ray" },
    { id: "100000000003", name: "Jordan Lee", firstName: "Jordan" },
  ],
  nicknames: { "100000000003": "Jordy" },
};

function callbackApi(info = threadInfo) {
  return {
    getThreadInfo(threadID, callback) {
      assert.equal(threadID, "200000000001");
      callback(null, info);
    },
  };
}

test("resolves one mentioned numeric user ID without looking up thread info", async () => {
  const api = {
    getThreadInfo() {
      throw new Error("mention should not require a lookup");
    },
  };
  assert.deepEqual(
    await resolveModerationTarget(api, { mentions: { "100000000001": "Abdullah" } }, "200000000001", ["@Abdullah", "spam"]),
    { targetId: "100000000001", consumedArgs: 1 }
  );
});

test("rejects multiple mentions instead of picking one arbitrarily", async () => {
  assert.equal(
    await resolveModerationTarget(callbackApi(), { mentions: { "100000000001": "A", "100000000002": "B" } }, "200000000001", ["@A", "@B"]),
    null
  );
});


test("rejects malformed mention IDs instead of falling back to a typed name", async () => {
  assert.equal(
    await resolveModerationTarget(callbackApi(), { mentions: { "not-a-facebook-id": "Abdullah" } }, "200000000001", ["Abdullah", "spam"]),
    null
  );
});

test("accepts a numeric Facebook user ID directly", async () => {
  assert.deepEqual(
    await resolveModerationTarget({}, {}, "200000000001", ["100000000001", "spam"]),
    { targetId: "100000000001", consumedArgs: 1 }
  );
});

test("resolves an exact member name case-insensitively and preserves the reason", async () => {
  assert.deepEqual(
    await resolveModerationTarget(callbackApi(), {}, "200000000001", ["aBdUlLaH", "spamming", "links"]),
    { targetId: "100000000001", consumedArgs: 1 }
  );
});

test("resolves a multi-word member name and consumes only the name arguments", async () => {
  assert.deepEqual(
    await resolveModerationTarget(callbackApi(), {}, "200000000001", ["Ray", "Cruz", "repeated", "spam"]),
    { targetId: "100000000002", consumedArgs: 2 }
  );
});

test("resolves a group nickname", async () => {
  assert.deepEqual(
    await resolveModerationTarget(callbackApi(), {}, "200000000001", ["Jordy", "flooding"]),
    { targetId: "100000000003", consumedArgs: 1 }
  );
});

test("rejects duplicate exact names as ambiguous", async () => {
  const info = {
    userInfo: [
      { id: "100000000011", name: "Alex Kim" },
      { id: "100000000012", name: "Alex Kim" },
    ],
    nicknames: null,
  };
  assert.equal(
    await resolveModerationTarget(callbackApi(info), {}, "200000000001", ["Alex", "Kim", "spam"]),
    null
  );
});

test("rejects names that are not members of the current group", async () => {
  assert.equal(
    await resolveModerationTarget(callbackApi(), {}, "200000000001", ["Abdullah2", "spam"]),
    null
  );
});

test("fails closed if group-member lookup fails", async () => {
  const api = {
    getThreadInfo(threadID, callback) {
      callback(new Error("offline"));
    },
  };
  assert.equal(
    await resolveModerationTarget(api, {}, "200000000001", ["Abdullah", "spam"]),
    null
  );
});
