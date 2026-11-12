"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { invokeMessengerSend, resolveMessengerIsGroup } = require("../messengerSendRouting");

test("private send uses 3.5.2 MQTT signature and bridges Promise result to callback", async () => {
  const calls = [];
  const result = { threadID: "1234567890123456", messageID: "pm-message-1" };
  const api = {
    sendMessage: () => { throw new Error("standard send path must not be used for explicit PM"); },
    sendMessageMqtt: (...args) => {
      calls.push(args);
      return Promise.resolve(result);
    },
  };
  let callbackCount = 0;
  const returned = invokeMessengerSend(api, {
    message: "hello",
    threadID: "1234567890123456",
    replyToMessageID: "reply-1",
    isGroup: false,
  }, (error, info) => {
    callbackCount++;
    assert.equal(error, null);
    assert.equal(info, result);
  });

  assert.deepEqual(await returned, result);
  assert.deepEqual(calls, [["hello", "1234567890123456", "reply-1"]]);
  assert.equal(callbackCount, 1);
});

test("group send stays on standard 3.5.2 sendMessage path", async () => {
  const calls = [];
  const result = { threadID: "group-1", messageID: "gc-message-1" };
  const api = {
    sendMessage: (...args) => {
      calls.push(args);
      return Promise.resolve(result);
    },
    sendMessageMqtt: () => { throw new Error("group MQTT route must remain unchanged"); },
  };
  let callbackResult;
  await invokeMessengerSend(api, {
    message: "group hello",
    threadID: "group-1",
    replyToMessageID: "reply-2",
    isGroup: true,
  }, (error, info) => { callbackResult = { error, info }; });

  assert.deepEqual(calls, [["group hello", "group-1", "reply-2", false]]);
  assert.deepEqual(callbackResult, { error: null, info: result });
});

test("explicit private send falls back to standard sender with isSingleUser=true", async () => {
  const calls = [];
  const api = {
    sendMessage: (...args) => {
      calls.push(args);
      return Promise.resolve({ messageID: "fallback-pm" });
    },
  };
  await invokeMessengerSend(api, {
    message: "private fallback",
    threadID: "user-1",
    isGroup: false,
  }, () => {});
  assert.deepEqual(calls, [["private fallback", "user-1", undefined, true]]);
});

test("send Promise rejection reaches the Traffic Governor callback exactly once", async () => {
  const failure = Object.assign(new Error("Messenger rejected send"), { code: "SEND_REJECTED" });
  const api = {
    sendMessage: () => Promise.reject(failure),
  };
  let calls = 0;
  await invokeMessengerSend(api, {
    message: "hello",
    threadID: "group-1",
    isGroup: true,
  }, error => {
    calls++;
    assert.equal(error, failure);
  });
  assert.equal(calls, 1);
});

test("synchronous sender errors are delivered through callback", () => {
  const failure = new Error("sender unavailable");
  const api = { sendMessage: () => { throw failure; } };
  let received;
  invokeMessengerSend(api, {
    message: "hello",
    threadID: "group-1",
    isGroup: true,
  }, error => { received = error; });
  assert.equal(received, failure);
});

test("routing preserves explicit intent and known-group recognition", () => {
  const groups = new Set(["known-group"]);
  assert.equal(resolveMessengerIsGroup("private-user", false, groups), false);
  assert.equal(resolveMessengerIsGroup("known-group", null, groups), true);
  assert.equal(resolveMessengerIsGroup("unknown-thread", null, groups), null);
});
