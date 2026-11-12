"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  sendGroupMessage,
  editMessage,
  setMessageReaction,
  setMessageReactionMqtt,
} = require("../messengerApiCompat");

function trafficProxy(methods) {
  return new Proxy({ __eclipseTrafficProxy: true, ...methods }, {
    get(target, property) {
      if (property === "__eclipseTrafficProxy") return true;
      return target[property];
    },
  });
}

test("raw ws3-fca 3.5.2 group send uses Promise signature and isSingleUser=false", async () => {
  let args;
  const api = { sendMessage: (...values) => { args = values; return Promise.resolve({ messageID: "m1" }); } };
  const result = await sendGroupMessage(api, "hello", "123456789");
  assert.deepEqual(args, ["hello", "123456789", undefined, false]);
  assert.equal(result.messageID, "m1");
});

test("Traffic Governor send uses its callback bridge and preserves reply ID", async () => {
  let args;
  const api = trafficProxy({
    sendMessage: (...values) => {
      args = values;
      values[2](null, { messageID: "m2" });
      return true;
    },
  });
  const result = await sendGroupMessage(api, "reply", "123456789", { replyToMessageID: "parent" });
  assert.equal(args[2] instanceof Function, true);
  assert.equal(args[3], "parent");
  assert.equal(args[4], true);
  assert.equal(result.messageID, "m2");
});

test("callback and Promise double settlement is ignored", async () => {
  const api = trafficProxy({
    editMessage: (_text, _id, callback) => {
      callback(null, { ok: true });
      return Promise.resolve({ ok: false });
    },
  });
  const result = await editMessage(api, "edited", "m3");
  assert.deepEqual(result, { ok: true });
});

test("raw reaction methods use 3.5.2 Promise signatures", async () => {
  const calls = [];
  const api = {
    setMessageReaction: (...args) => { calls.push(["standard", ...args]); return Promise.resolve(true); },
    setMessageReactionMqtt: (...args) => { calls.push(["mqtt", ...args]); return Promise.resolve(true); },
  };
  await setMessageReaction(api, "😂", "m4");
  await setMessageReactionMqtt(api, "😂", "m5", "thread5");
  assert.deepEqual(calls, [
    ["standard", "😂", "m4"],
    ["mqtt", "😂", "m5", "thread5"],
  ]);
});

test("raw Promise rejection is propagated", async () => {
  const api = { sendMessage: () => Promise.reject(new Error("send failed")) };
  await assert.rejects(sendGroupMessage(api, "hello", "123456789"), /send failed/);
});
