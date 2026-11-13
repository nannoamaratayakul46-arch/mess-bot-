"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { messengerErrorMessage, changeNicknameAsync } = require("../nickname-guard");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("Messenger naming errors preserve object-shaped FCA error messages", () => {
  assert.match(
    messengerErrorMessage({ error: "Trying to change nickname of user isn't in thread" }),
    /isn't in thread/i
  );
  assert.match(
    messengerErrorMessage({
      error: 1357031,
      errorSummary: "Nickname update rejected",
      errorDescription: { __html: "Have at least one message in the thread before trying to change the user nickname." },
    }),
    /Nickname update rejected|Have at least one message/i
  );
});

test("dashboard group-name route returns the underlying Messenger failure instead of a generic message", () => {
  const source = read("groupProfileRoutes.js");
  assert.match(source, /function messengerErrorMessage\(error\)/);
  assert.match(source, /new Error\(messengerErrorMessage\(error\)\)/);
  assert.match(source, /Group profile update failed: " \+ detail/);
});

test("nickname writes have a finite timeout and normalized API errors", () => {
  const source = read("nickname-guard.js");
  assert.match(source, /ECLIPSE_NICKNAME_API_TIMEOUT_MS/);
  assert.match(source, /new Error\(messengerErrorMessage\(error\)\)/);
});

test("nickname guard uses the ws3-fca 3.5.2 nickname alias", async () => {
  const calls = [];
  const api = {
    nickname: async (...args) => { calls.push(args); return { type: "thread_nickname_update" }; },
  };
  await changeNicknameAsync(api, "ECLIPSE", "thread-alias-test", "user-alias-test");
  assert.deepEqual(calls, [["ECLIPSE", "thread-alias-test", "user-alias-test"]]);
});
