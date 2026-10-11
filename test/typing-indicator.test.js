"use strict";

process.env.TYPING_ENABLED = "true";

const test = require("node:test");
const assert = require("node:assert/strict");
const { typeBeforeSend } = require("../typingIndicator");

test("typing indicator uses the supplied human delay before sending and stops afterward", async () => {
  const calls = [];
  const api = {
    sendTyping(threadID, active) {
      calls.push(active ? "typing:start" : "typing:stop");
    }
  };

  const result = await typeBeforeSend(
    api,
    "typing-test-thread",
    "a sample reply",
    { ms: 5 },
    async () => {
      calls.push("send");
      return true;
    }
  );

  assert.equal(result, true);
  assert.deepEqual(calls, ["typing:start", "send", "typing:stop"]);
});

test("typing API errors never prevent the message send", async () => {
  let sent = false;
  const api = {
    sendTyping() {
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
