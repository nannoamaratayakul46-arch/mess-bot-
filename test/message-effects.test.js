"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { sendWithEffects } = require("../messageEffects");

function immediateOptions(extra = {}) {
  return { emojiVariation: false, _sleep: async () => {}, _random: () => 0, ...extra };
}

test("typo correction is disabled by default", async () => {
  const sent = [];
  const api = {
    sendMessage: async (message, threadID) => {
      sent.push({ message, threadID });
      return { messageID: "m1" };
    },
    editMessage: async () => {
      throw new Error("must not edit by default");
    },
  };

  const result = await sendWithEffects(api, "group-1", "hello", immediateOptions());
  assert.equal(sent.length, 1);
  assert.equal(sent[0].message, "hello");
  assert.equal(result.messageID, "m1");
});

test("raw ws3-fca Promise API sends once and edits the same message in demo mode", async () => {
  const sent = [];
  const edits = [];
  const api = {
    sendMessage: async (message, threadID) => {
      sent.push({ message, threadID });
      return { messageID: "raw-message-1" };
    },
    editMessage: async (message, messageID) => {
      edits.push({ message, messageID });
    },
  };

  await sendWithEffects(
    api,
    "group-2",
    "hello",
    immediateOptions({ correctionDemo: true, typoChance: 1 })
  );

  assert.equal(sent.length, 1);
  assert.notEqual(sent[0].message, "hello");
  assert.deepEqual(edits, [{ message: "hello", messageID: "raw-message-1" }]);
});

test("Traffic Governor proxy waits for queued send and edit callbacks", async () => {
  const calls = [];
  const api = {
    __eclipseTrafficProxy: true,
    sendMessage(message, threadID, callback) {
      calls.push(["send-enqueued", message, threadID]);
      setImmediate(() => {
        calls.push(["send-delivered"]);
        callback(null, { messageID: "queued-message-1" });
      });
      return true;
    },
    editMessage(message, messageID, callback) {
      calls.push(["edit-enqueued", message, messageID]);
      setImmediate(() => {
        calls.push(["edit-delivered"]);
        callback(null, { ok: true });
      });
      return true;
    },
  };

  const result = await sendWithEffects(
    api,
    "group-3",
    "hello",
    immediateOptions({ correctionDemo: true, typoChance: 1 })
  );

  assert.equal(result.messageID, "queued-message-1");
  assert.deepEqual(calls.map(call => call[0]), [
    "send-enqueued",
    "send-delivered",
    "edit-enqueued",
    "edit-delivered",
  ]);
  assert.equal(calls.filter(call => call[0] === "send-enqueued").length, 1);
});

test("failed edit never triggers a second send", async () => {
  let sendCount = 0;
  const api = {
    sendMessage: async () => {
      sendCount++;
      return { messageID: "m2" };
    },
    editMessage: async () => {
      throw new Error("edit rejected");
    },
  };

  await sendWithEffects(
    api,
    "group-4",
    "hello",
    immediateOptions({ correctionDemo: true, typoChance: 1 })
  );
  assert.equal(sendCount, 1);
});
