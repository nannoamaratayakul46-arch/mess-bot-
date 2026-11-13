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
  changeGroupMember,
  changeGroupAdminStatus,
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
  const published = await setMessageReactionMqtt(api, "😂", "m5", "thread5");
  assert.deepEqual(calls, [
    ["standard", "😂", "m4"],
    ["mqtt", "😂", "m5", "thread5"],
  ]);
  assert.deepEqual(published, { published: true, acknowledged: false, transport: "mqtt" });
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


test("raw ws3-fca 3.5.2 MQTT reaction is treated as synchronous publish, not callback completion", async () => {
  let args;
  const api = {
    setMessageReactionMqtt: (...values) => { args = values; }
  };
  const result = await setMessageReactionMqtt(api, "❤️", "message-1", "thread-1");
  assert.deepEqual(args, ["❤️", "message-1", "thread-1"]);
  assert.deepEqual(result, { published: true, acknowledged: false, transport: "mqtt" });
});

test("raw MQTT reaction publish errors are propagated", async () => {
  const api = {
    setMessageReactionMqtt: () => { throw new Error("Not connected to MQTT"); }
  };
  await assert.rejects(
    setMessageReactionMqtt(api, "😂", "message-2", "thread-2"),
    /Not connected to MQTT/
  );
});


test("ws3-fca 3.5.2 gcmember adapter adds and removes members using the current signature", async () => {
  const calls = [];
  const api = {
    gcmember: async (...args) => {
      calls.push(args);
      return { type: "gc_member_update", action: args[0], threadID: args[2] };
    }
  };
  await changeGroupMember(api, "add", "user-1", "thread-1");
  await changeGroupMember(api, "remove", "user-2", "thread-1");
  assert.deepEqual(calls, [
    ["add", "user-1", "thread-1"],
    ["remove", "user-2", "thread-1"]
  ]);
});

test("ws3-fca gcmember adapter turns error_gc result objects into actionable failures", async () => {
  const api = {
    gcmember: async () => ({ type: "error_gc", error: "Not connected to MQTT" })
  };
  await assert.rejects(
    changeGroupMember(api, "remove", "user-1", "thread-1"),
    /Not connected to MQTT/
  );
});


test("gcmember adapter times out when Messenger never settles the request", async () => {
  const api = { gcmember: () => new Promise(() => {}) };
  await assert.rejects(
    changeGroupMember(api, "remove", "user-3", "thread-3", { timeoutMs: 5 }),
    /group membership request timed out/
  );
});


test("gcrule adapter verifies demotion and promotion against fresh group info", async () => {
  const admins = new Set(["admin-1", "admin-2"]);
  const calls = [];
  const api = {
    gcrule: async (action, userID, threadID) => {
      calls.push([action, userID, threadID]);
      if (action === "admin") admins.add(userID);
      else admins.delete(userID);
      return { type: "gc_rule_update", action };
    },
    getThreadInfo: (_threadID, callback) => callback(null, {
      isGroup: true, adminIDs: [...admins].map(id => ({ id })),
    }),
  };
  const demoted = await changeGroupAdminStatus(api, "demote", "admin-2", "group-1", { intervalMs: 0 });
  const promoted = await changeGroupAdminStatus(api, "promote", "member-3", "group-1", { intervalMs: 0 });
  assert.equal(demoted.verified, true);
  assert.equal(promoted.verified, true);
  assert.deepEqual(calls, [["unadmin", "admin-2", "group-1"], ["admin", "member-3", "group-1"]]);
});

test("gcrule adapter rejects error_gc_rule payloads", async () => {
  const api = {
    gcrule: async () => ({ type: "error_gc_rule", error: "User is not an admin." }),
    getThreadInfo: (_id, callback) => callback(null, { adminIDs: [] }),
  };
  await assert.rejects(changeGroupAdminStatus(api, "demote", "member-1", "group-1"), /User is not an admin/);
});

test("gcrule adapter refuses success when fresh adminIDs never confirm the change", async () => {
  const api = {
    gcrule: async () => ({ type: "gc_rule_update" }),
    getThreadInfo: (_id, callback) => callback(null, { adminIDs: [{ id: "admin-1" }] }),
  };
  await assert.rejects(
    changeGroupAdminStatus(api, "demote", "admin-1", "group-1", { attempts: 2, intervalMs: 0 }),
    /did not confirm admin demotion/
  );
});

test("gcrule adapter reports a missing role API explicitly", async () => {
  await assert.rejects(changeGroupAdminStatus({}, "demote", "admin-1", "group-1"), /gcrule group-admin API/);
});
