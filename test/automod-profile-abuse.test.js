"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAntiSpam } = require("../antiSpam");

function makeProfileHarness({ enabled = true, admins = ["bot-id"] } = {}) {
  const events = [];
  const removed = [];
  const logs = [];
  const db = {
    async query(sql, params = []) {
      if (/INSERT INTO automod_profile_abuse_events/.test(sql)) {
        const [, threadID, userID, eventKey, eventType, createdAt] = [null, ...params];
        if (events.some(row => row.threadID === threadID && row.eventKey === eventKey)) {
          return { rows: [] };
        }
        events.push({ threadID, userID, eventKey, eventType, createdAt });
        return { rows: [{ id: events.length }] };
      }
      if (/SELECT COUNT\(\*\)::int AS count FROM automod_profile_abuse_events/.test(sql)) {
        const [threadID, userID, since] = params;
        return {
          rows: [{
            count: events.filter(row =>
              row.threadID === threadID &&
              row.userID === userID &&
              row.createdAt >= since
            ).length,
          }],
        };
      }
      if (/DELETE FROM automod_profile_abuse_events WHERE thread_id = \$1 AND created_at < \$2/.test(sql)) {
        const [threadID, before] = params;
        for (let i = events.length - 1; i >= 0; i -= 1) {
          if (events[i].threadID === threadID && events[i].createdAt < before) events.splice(i, 1);
        }
        return { rows: [] };
      }
      if (/DELETE FROM automod_profile_abuse_events WHERE thread_id = \$1 AND user_id = \$2/.test(sql)) {
        const [threadID, userID] = params;
        for (let i = events.length - 1; i >= 0; i -= 1) {
          if (events[i].threadID === threadID && events[i].userID === userID) events.splice(i, 1);
        }
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  const api = {
    getCurrentUserID: () => "bot-id",
    getThreadInfo: (_threadID, callback) => callback(null, { adminIDs: admins }),
    removeUserFromGroup: (userID, threadID, callback) => {
      removed.push({ userID, threadID });
      callback(null);
    },
  };
  const detector = createAntiSpam({
    db,
    getApi: () => api,
    getSettings: async () => ({ enabled }),
    setEnabled: async (_threadID, next) => ({ enabled: next }),
    log: message => logs.push(message),
  });
  return { detector, api, events, removed, logs };
}

async function sendProfileChanges(detector, api, userID = "member-1") {
  const types = ["log:thread-image", "log:thread-name", "log:thread-image"];
  for (let i = 0; i < types.length; i += 1) {
    await detector.onGroupEvent(api, {
      type: "event",
      logMessageType: types[i],
      threadID: "group-1",
      author: userID,
      messageID: "profile-event-" + i,
      logMessageData: { value: "change-" + i },
    });
  }
}

test("AutoMod removes a member after three group photo/name changes within one minute", async () => {
  const { detector, api, removed, logs } = makeProfileHarness();
  await sendProfileChanges(detector, api);
  assert.deepEqual(removed, [{ userID: "member-1", threadID: "group-1" }]);
  assert.ok(logs.some(message => /removed member-1/.test(message)));
});

test("profile-change AutoMod stays inactive when the existing group AutoMod toggle is off", async () => {
  const { detector, api, removed, events } = makeProfileHarness({ enabled: false });
  await sendProfileChanges(detector, api);
  assert.equal(removed.length, 0);
  assert.equal(events.length, 0);
});

test("profile-change AutoMod does not act when Messenger does not identify the actor", async () => {
  const { detector, api, removed, events } = makeProfileHarness();
  for (let i = 0; i < 4; i += 1) {
    await detector.onGroupEvent(api, {
      type: "event",
      logMessageType: i % 2 ? "log:thread-name" : "log:thread-image",
      threadID: "group-1",
      messageID: "unknown-actor-" + i,
    });
  }
  assert.equal(removed.length, 0);
  assert.equal(events.length, 0);
});

test("profile-change AutoMod never removes a group admin", async () => {
  const { detector, api, removed } = makeProfileHarness({ admins: ["bot-id", "member-1"] });
  await sendProfileChanges(detector, api);
  assert.equal(removed.length, 0);
});
