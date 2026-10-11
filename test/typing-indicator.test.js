"use strict";

process.env.TYPING_ENABLED = "true";

const test = require("node:test");
const assert = require("node:assert/strict");
const { typeBeforeSend, startTyping, stopTyping } = require("../typingIndicator");

test("ws3-fca typing indicator uses boolean, thread ID, callback signature", async () => {
  const calls = [];
  const api = {
    sendTypingIndicator(active, threadID, callback) {
      calls.push([active, threadID, typeof callback]);
      if (typeof callback === "function") callback(null);
      return Promise.resolve();
    }
  };

  const result = await typeBeforeSend(
    api,
    "typing-test-thread",
    "a sample reply",
    { ms: 5 },
    async () => {
      calls.push(["send"]);
      return true;
    }
  );

  assert.equal(result, true);
  assert.deepEqual(calls, [
    [true, "typing-test-thread", "function"],
    ["send"],
    [false, "typing-test-thread", "function"]
  ]);
});

test("legacy sendTyping API is supported as a fallback", async () => {
  const calls = [];
  const api = {
    sendTyping(threadID, active) { calls.push([threadID, active]); }
  };

  await typeBeforeSend(api, "legacy-thread", "reply", { ms: 1 }, async () => "sent");
  assert.deepEqual(calls, [["legacy-thread", true], ["legacy-thread", false]]);
});

test("typing API errors never prevent the message send", async () => {
  let sent = false;
  const api = {
    sendTypingIndicator() { throw new Error("typing unsupported"); }
  };

  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await typeBeforeSend(
      api,
      "typing-error-thread",
      "a sample reply",
      { ms: 1 },
      async () => {
        sent = true;
        return "sent";
      }
    );
    assert.equal(result, "sent");
    assert.equal(sent, true);
    assert.equal(stopTyping(api, "typing-error-thread"), false);
  } finally {
    console.warn = originalWarn;
  }
});

test("public start/stop helpers send true then false to ws3-fca", () => {
  const calls = [];
  const api = {
    sendTypingIndicator(active, threadID, callback) {
      calls.push([active, threadID, typeof callback]);
      if (callback) callback(null);
      return Promise.resolve();
    }
  };

  assert.equal(startTyping(api, "manual-thread"), true);
  assert.equal(stopTyping(api, "manual-thread"), true);
  assert.deepEqual(calls, [
    [true, "manual-thread", "function"],
    [false, "manual-thread", "function"]
  ]);
});
