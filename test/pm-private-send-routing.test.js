"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { invokeMessengerSend, resolveMessengerIsGroup } = require("../messengerSendRouting");

test("known group IDs override ws3-fca's legacy ID-length inference", () => {
  const knownGroups = new Map([["61595042368860", { is_group: true }]]);
  assert.equal(resolveMessengerIsGroup("61595042368860", null, knownGroups), true);
});

test("explicit PM routing takes precedence over known group metadata", () => {
  const knownGroups = new Map([["1234567890123456", { is_group: true }]]);
  assert.equal(resolveMessengerIsGroup("1234567890123456", false, knownGroups), false);
});

test("explicit group routing takes precedence for unknown IDs", () => {
  assert.equal(resolveMessengerIsGroup("61595042368860", true, new Map()), true);
});

test("unknown thread IDs retain the caller's unresolved state", () => {
  assert.equal(resolveMessengerIsGroup("1234567890123456", null, new Map()), null);
});

test("PM routing uses the 3.5.2 MQTT sender and its reply-ID argument position", async () => {
  let received;
  const api = {
    sendMessage() { throw new Error("standard sender must not handle explicit PM"); },
    sendMessageMqtt(...args) {
      received = args;
      return Promise.resolve({ messageID: "pm-1" });
    },
  };
  let callbackInfo;
  await invokeMessengerSend(api, {
    message: "hello",
    threadID: "123456789012345678",
    replyToMessageID: null,
    isGroup: false,
  }, (error, info) => { callbackInfo = { error, info }; });

  assert.deepEqual(received, ["hello", "123456789012345678", undefined]);
  assert.equal(callbackInfo.error, null);
  assert.equal(callbackInfo.info.messageID, "pm-1");
});

test("reply sends retain the reply ID in the 3.5.2 MQTT signature", async () => {
  let received;
  const api = {
    sendMessageMqtt(...args) {
      received = args;
      return Promise.resolve({ messageID: "reply-1" });
    },
    sendMessage() { throw new Error("standard sender must not handle explicit PM"); },
  };

  await invokeMessengerSend(api, {
    message: "reply",
    threadID: "123456789012345678",
    replyToMessageID: "mid.123",
    isGroup: false,
  }, () => {});

  assert.deepEqual(received, ["reply", "123456789012345678", "mid.123"]);
});

test("unknown short numeric thread IDs retain legacy private routing", async () => {
  let received;
  const api = {
    sendMessage(...args) {
      received = args;
      return Promise.resolve({ messageID: "legacy-private-1" });
    },
  };
  await invokeMessengerSend(api, {
    message: "private reply",
    threadID: "61595042368860",
    replyToMessageID: null,
    isGroup: null,
  }, () => {});
  assert.deepEqual(received, ["private reply", "61595042368860", undefined, true]);
});

test("ordinary group sends stay on standard 3.5.2 sendMessage", async () => {
  let received;
  const api = {
    sendMessage(...args) {
      received = args;
      return Promise.resolve({ messageID: "group-1" });
    },
  };

  await invokeMessengerSend(api, {
    message: "group message",
    threadID: "group-thread",
    replyToMessageID: null,
    isGroup: true,
  }, () => {});

  assert.deepEqual(received, ["group message", "group-thread", undefined, false]);
});
