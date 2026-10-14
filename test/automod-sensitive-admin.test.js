"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAntiSpam } = require("../antiSpam");

function makeHarness({ enabled = true, admins = ["bot-id", "actor-id"], ownerID = "owner-id", threads = [{ threadID: "group-1" }], adminsByThread = {}, restoreError = null } = {}) {
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
      callback(status === true && restoreError ? restoreError : null);
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

test("Sensitive AutoMod restores the owner and demotes the actor only when explicitly enabled", async () => {
  const previous = process.env.SENSITIVE_ADMIN_DEMOTE_ACTOR_ENABLED;
  process.env.SENSITIVE_ADMIN_DEMOTE_ACTOR_ENABLED = "true";
  try {
    const { detector, api, demotions, sent, logs } = makeHarness();
    await detector.onGroupEvent(api, removalEvent());
    assert.deepEqual(demotions, [
      { threadID: "group-1", userID: "owner-id", status: true },
      { threadID: "group-1", userID: "actor-id", status: false },
    ]);
    assert.equal(sent.length, 0);
    assert.ok(logs.some(message => /Event actor demotion request succeeded/.test(message)));
  } finally {
    if (previous === undefined) delete process.env.SENSITIVE_ADMIN_DEMOTE_ACTOR_ENABLED;
    else process.env.SENSITIVE_ADMIN_DEMOTE_ACTOR_ENABLED = previous;
  }
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

test("Sensitive AutoMod does not demote the actor when Messenger rejects owner restoration", async () => {
  const { detector, api, demotions, logs } = makeHarness({
    restoreError: new Error("permission denied: bot is not a group admin"),
  });
  await detector.onGroupEvent(api, removalEvent());
  assert.deepEqual(demotions, [{ threadID: "group-1", userID: "owner-id", status: true }]);
  assert.ok(logs.some(message => /Owner admin restoration failed/.test(message)));
  assert.ok(logs.some(message => /Actor demotion skipped/.test(message)));
});

test("Sensitive AutoMod never scans or demotes the actor in other groups", async () => {
  const { detector, api, demotions } = makeHarness({
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
    { threadID: "group-1", userID: "owner-id", status: true },
  ]);
});

test("Sensitive AutoMod stays scoped to the triggering group if thread enumeration fails", async () => {
  const { detector, api, demotions } = makeHarness();
  api.getThreadList = (_limit, _timestamp, _tags, callback) => callback(new Error("offline"));
  await detector.onGroupEvent(api, removalEvent());
  assert.deepEqual(demotions, [
    { threadID: "group-1", userID: "owner-id", status: true },
  ]);
});
