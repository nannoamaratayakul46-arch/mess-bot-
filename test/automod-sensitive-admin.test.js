"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAntiSpam } = require("../antiSpam");

function makeHarness({ enabled = true, admins = ["bot-id", "actor-id"], ownerID = "owner-id" } = {}) {
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
    getThreadInfo: (_threadID, callback) => callback(null, { adminIDs: admins }),
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
  assert.ok(logs.some(message => /no admin status changed/.test(message)));
});
