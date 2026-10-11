"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { startTyping, stopTyping, withTyping } = require("../human-typing");

test("shared human typing helpers use ws3-fca boolean, thread ID, callback API", async () => {
  const calls = [];
  const api = {
    sendTypingIndicator(active, threadID, callback) {
      calls.push([active, threadID, typeof callback]);
      if (callback) callback(null);
      return Promise.resolve();
    }
  };

  assert.equal(startTyping(api, "shared-thread"), true);
  assert.equal(stopTyping(api, "shared-thread"), true);
  const result = await withTyping(api, "shared-thread", 1, async () => {
    calls.push(["send"]);
    return "ok";
  });

  assert.equal(result, "ok");
  assert.deepEqual(calls, [
    [true, "shared-thread", "function"],
    [false, "shared-thread", "function"],
    [true, "shared-thread", "function"],
    ["send"],
    [false, "shared-thread", "function"]
  ]);
});

test("shared typing helpers keep fallback and non-fatal behavior", () => {
  const calls = [];
  const api = {
    sendTyping(threadID, active) { calls.push([threadID, active]); }
  };

  assert.equal(startTyping(api, "fallback-thread"), true);
  assert.equal(stopTyping(api, "fallback-thread"), true);
  assert.deepEqual(calls, [["fallback-thread", true], ["fallback-thread", false]]);

  const brokenApi = {
    sendTypingIndicator() { throw new Error("unsupported"); }
  };
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(startTyping(brokenApi, "broken-thread"), false);
    assert.equal(stopTyping(brokenApi, "broken-thread"), false);
  } finally {
    console.warn = originalWarn;
  }
});
