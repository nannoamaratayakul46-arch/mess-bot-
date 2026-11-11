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

test("unknown thread IDs retain ws3-fca default routing", () => {
  assert.equal(resolveMessengerIsGroup("1234567890123456", null, new Map()), null);
});

test("PM routing forces ws3-fca single-user mode in the fifth argument", () => {
  let received;
  const api = { sendMessage(...args) { received = args; } };
  const callback = () => {};
  const job = {
    message: "hello",
    threadID: "123456789012345678",
    replyToMessageID: null,
    isGroup: false,
  };

  invokeMessengerSend(api, job, callback);

  assert.equal(received.length, 5);
  assert.equal(received[0], "hello");
  assert.equal(received[1], job.threadID);
  assert.equal(received[2], callback);
  assert.equal(received[3], null);
  assert.equal(received[4], false);
});

test("reply sends retain the reply ID and explicit PM routing flag", () => {
  let received;
  const api = { sendMessage(...args) { received = args; } };
  const callback = () => {};
  const job = {
    message: "reply",
    threadID: "123456789012345678",
    replyToMessageID: "mid.123",
    isGroup: false,
  };

  invokeMessengerSend(api, job, callback);

  assert.deepEqual(received, ["reply", job.threadID, callback, "mid.123", false]);
});

test("ordinary group sends keep ws3-fca's original argument behavior", () => {
  let received;
  const api = { sendMessage(...args) { received = args; } };
  const callback = () => {};

  invokeMessengerSend(api, {
    message: "group message",
    threadID: "group-thread",
    replyToMessageID: null,
    isGroup: null,
  }, callback);

  assert.deepEqual(received, ["group message", "group-thread", callback]);
});
