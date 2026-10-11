"use strict";

process.env.TYPING_ENABLED = "true";

const test = require("node:test");
const assert = require("node:assert/strict");
const { typeBeforeSend, startTyping, stopTyping } = require("../typingIndicator");

test("ws3-fca typing indicator receives true before send and false after send", async () => {
  const calls = [];
  const api = {
    sendTypingIndicator(threadID, isTyping, callback) {
      calls.push([threadID, isTyping, typeof callback]);
      if (typeof callback === "function") callback(null);
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
    ["typing-test-thread", true, "function"],
    ["send"],
    ["typing-test-thread", false, "function"]
  ]);
});

test("legacy sendTyping API is supported as a fallback", async () => {
  const calls = [];
  const api = {
    sendTyping(threadID, active) {
      calls.push([threadID, active]);
    }
  };

  await typeBeforeSend(api, "legacy-thread", "reply", { ms: 1 }, async () => "sent");
  assert.deepEqual(calls, [["legacy-thread", true], ["legacy-thread", false]]);
});

test("typing API errors never prevent the message send", async () => {
  let sent = false;
  const api = {
    sendTypingIndicator() {
      throw new Error("typing unsupported");
    }
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
  } finally {
    console.warn = originalWarn;
  }
});

test("public start/stop helpers use the same API signature", () => {
  const calls = [];
  const api = {
    sendTypingIndicator(threadID, isTyping, callback) {
      calls.push([threadID, isTyping]);
      if (callback) callback(null);
    }
  };

  startTyping(api, "manual-thread")();
  stopTyping(api, "manual-thread");
  assert.deepEqual(calls, [
    ["manual-thread", true],
    ["manual-thread", false],
    ["manual-thread", false]
  ]);
});
