"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAntiSpam } = require("../antiSpam");

function makeHarness({ enabled = true, admins = ["bot-id", "actor-id"], ownerID = "owner-id", threads = [{ threadID: "group-1" }], adminsByThread = {} } = {}) {
  const demotions = [];
  const sent = [];
  const logs = [];
  const db = {
    async query(sql) {
      if (/CREATE TABLE|CREATE INDEX|DELETE FROM automod_profile_abuse_events/.test(sql)) return { rows: [] };
      return { rows: [] };
    },
  };
  const api = {
    getCurrentUserID: () => "bot-id",
    getThreadList: (_limit, _timestamp, _tags, callback) => callback(null, threads),
    getThreadInfo: (threadID, callback) => callback(null, { adminIDs: adminsByThread[threadID] || admins }),
    changeAdminStatus: (threadID, userID, status, callback) => {
      demotions.push({ threadID, userID, status });
      callback(null);
    },
    sendMessage: (body, threadID, callback) => {
      sent.push({ body, threadID });
      callback(null, { messageID: "notice-id" });
    },
  };
  const detector = createAntiSpam({
    db,
    getApi: () => api,
    getSettings: async () => ({ enabled }),
    setEnabled: async (_threadID, next) => ({ enabled: next }),
    isBotOwnerId: id => String(id) === ownerID,
    log: message => logs.push(message),
  });
  return { detector, api, demotions, sent, logs };
}

function removalEvent({ targetID = "owner-id", actor = "actor-id", adminEvent = "remove_admin" } = {}) {
  return {
    type: "event",
    logMessageType: "log:thread-admins",
    threadID: "group-1",
    author: actor,
    logMessageData: { ADMIN_EVENT: adminEvent, TARGET_ID: targetID },
  };
}

test("Sensitive AutoMod demotes an admin who removes the bot owner's admin status", async () => {
  const { detector, api, demotions, sent, logs } = makeHarness();
  await detector.onGroupEvent(api, removalEvent());
  assert.deepEqual(demotions, [{ threadID: "group-1", userID: "actor-id", status: false }]);
  assert.equal(sent.length, 1);
  assert.ok(logs.some(message => /Demoted actor-id/.test(message)));
});

test("Sensitive AutoMod does nothing while AutoMod is disabled", async () => {
  const { detector, api, demotions } = makeHarness({ enabled: false });
  await detector.onGroupEvent(api, removalEvent());
  assert.equal(demotions.length, 0);
});

test("Sensitive AutoMod ignores admin removals that do not target the bot owner", async () => {
  const { detector, api, demotions } = makeHarness();
  await detector.onGroupEvent(api, removalEvent({ targetID: "someone-else" }));
  await detector.onGroupEvent(api, removalEvent({ adminEvent: "add_admin" }));
  assert.equal(demotions.length, 0);
});

test("Sensitive AutoMod fails closed if the bot is no longer a group admin", async () => {
  const { detector, api, demotions, logs } = makeHarness({ admins: ["actor-id"] });
  await detector.onGroupEvent(api, removalEvent());
  assert.equal(demotions.length, 0);
  assert.ok(logs.some(message => /No demotions completed/.test(message)));
});

test("Sensitive AutoMod demotes the actor in every listed group where both bot and actor are admins", async () => {
  const { detector, api, demotions, sent } = makeHarness({
    threads: [
      { threadID: "group-1" },
      { threadID: "group-2" },
      { threadID: "group-3" },
      { threadID: "private-thread" },
    ],
    adminsByThread: {
      "group-1": ["bot-id", "actor-id"],
      "group-2": ["bot-id", "actor-id"],
      "group-3": ["bot-id", "someone-else"],
      "private-thread": [],
    },
  });
  await detector.onGroupEvent(api, removalEvent());
  assert.deepEqual(demotions, [
    { threadID: "group-1", userID: "actor-id", status: false },
    { threadID: "group-2", userID: "actor-id", status: false },
  ]);
  assert.equal(sent.length, 1);
  assert.match(sent[0].body, /revoked in 2 group\(s\)/);
});

test("Sensitive AutoMod falls back to the triggering group when thread enumeration fails", async () => {
  const { detector, api, demotions } = makeHarness();
  api.getThreadList = (_limit, _timestamp, _tags, callback) => callback(new Error("offline"));
  await detector.onGroupEvent(api, removalEvent());
  assert.deepEqual(demotions, [{ threadID: "group-1", userID: "actor-id", status: false }]);
});
