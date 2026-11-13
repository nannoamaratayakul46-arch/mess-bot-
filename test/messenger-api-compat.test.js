"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  sendGroupMessage,
  editMessage,
  setMessageReaction,
  setMessageReactionMqtt,
  setGroupTitle,
  changeNickname,
  changeGroupImage,
  canChangeGroupImage,
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

test("ws3-fca 3.5.2 group-name and nickname aliases are used", async () => {
  const calls = [];
  const api = {
    gcname: async (title, threadID) => { calls.push(["gcname", title, threadID]); },
    nickname: async (nickname, threadID, participantID) => { calls.push(["nickname", nickname, threadID, participantID]); },
  };
  await setGroupTitle(api, "Locked name", "thread-1");
  await changeNickname(api, "Locked nickname", "thread-1", "user-1");
  assert.deepEqual(calls, [
    ["gcname", "Locked name", "thread-1"],
    ["nickname", "Locked nickname", "thread-1", "user-1"],
  ]);
});

test("group photo compatibility uploads then applies the returned image ID", async () => {
  const calls = [];
  const api = {
    ctx: { jar: {}, userID: "bot-1" },
    defaultFuncs: {
      async postFormData(url, jar, form, query, ctx) {
        calls.push({ kind: "upload", url, jar, form, query, ctx });
        return { statusCode: 200, body: { payload: { metadata: [{ image_id: "image-77" }] } } };
      },
      async post(url, jar, form, ctx) {
        calls.push({ kind: "apply", url, jar, form, ctx });
        return { statusCode: 200, body: { payload: { ok: true } } };
      },
    },
  };
  const { Readable } = require("node:stream");
  assert.equal(canChangeGroupImage(api), true);
  const result = await changeGroupImage(api, Readable.from(Buffer.from("image")), "thread-9");
  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://upload.facebook.com/ajax/mercury/upload.php");
  assert.equal(calls[0].form.images_only, "true");
  assert.equal(calls[1].url, "https://www.facebook.com/messaging/set_thread_image/");
  assert.deepEqual(calls[1].form, { thread_image_id: "image-77", thread_id: "thread-9" });
});

test("group photo compatibility rejects failed upload responses", async () => {
  const api = {
    ctx: { jar: {}, userID: "bot-1" },
    defaultFuncs: {
      async postFormData() { return { statusCode: 200, body: { error: 1357001 } }; },
      async post() { throw new Error("must not update after failed upload"); },
    },
  };
  const { Readable } = require("node:stream");
  await assert.rejects(
    changeGroupImage(api, Readable.from(Buffer.from("image")), "thread-9"),
    /Group photo upload rejected by Messenger/
  );
});
