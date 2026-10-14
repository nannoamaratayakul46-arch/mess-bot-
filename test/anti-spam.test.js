"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAntiSpam } = require("../antiSpam");

function makeHarness({ enabled = true, max_messages = 6, window_seconds = 8, repeat_max = 4, warn_first = true } = {}) {
  const warnings = new Map();
  const sent = [];
  const removed = [];
  const logs = [];
  const config = { max_messages, window_seconds, repeat_max, warn_first, warn_grace_seconds: 120, warn_text: "{{name}}, slow down." };
  const db = {
    async query(sql, params = []) {
      if (/SELECT max_messages/.test(sql)) return { rows: [config] };
      if (/SELECT warned_at/.test(sql)) {
        const warned_at = warnings.get(params[0] + ":" + params[1]);
        return { rows: warned_at ? [{ warned_at }] : [] };
      }
      if (/INSERT INTO automod_spam_warnings/.test(sql)) {
        warnings.set(params[0] + ":" + params[1], new Date());
        return { rows: [] };
      }
      if (/DELETE FROM automod_spam_warnings/.test(sql)) {
        warnings.delete(params[0] + ":" + params[1]);
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  const api = {
    getCurrentUserID: () => "bot-id",
    getThreadInfo: (_threadID, callback) => callback(null, { adminIDs: ["bot-id", "admin-id"] }),
    sendMessage: (text, threadID, callback) => {
      sent.push({ text, threadID });
      callback(null, { messageID: "warning-message" });
    },
    removeUserFromGroup: (userID, threadID, callback) => {
      removed.push({ userID, threadID });
      callback(null);
    },
  };
  const detector = createAntiSpam({
    db,
    getApi: () => api,
    log: message => logs.push(message),
    getSettings: async () => ({ enabled }),
    setEnabled: async (_threadID, next) => ({ enabled: next }),
  });
  return { detector, api, sent, removed, logs };
}

async function sendBurst(detector, api, prefix, count = 6) {
  for (let i = 0; i < count; i += 1) {
    await detector.onMessage(api, {
      threadID: "group-1",
      senderID: "member-1",
      body: prefix + "-" + i,
      senderName: "Member",
    });
  }
}

test("all-member automod warns on first burst and removes on a second burst inside grace period", async () => {
  const { detector, api, sent, removed } = makeHarness();
  await sendBurst(detector, api, "first");
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /Member, slow down/);
  assert.equal(removed.length, 0);

  await sendBurst(detector, api, "second");
  assert.equal(removed.length, 1);
  assert.deepEqual(removed[0], { userID: "member-1", threadID: "group-1" });
});

test("automod does nothing while the shared !automod setting is off", async () => {
  const { detector, api, sent, removed } = makeHarness({ enabled: false });
  await sendBurst(detector, api, "off");
  assert.equal(sent.length, 0);
  assert.equal(removed.length, 0);
});

test("automod continues role verification through legacy lookup when primary thread info throws", async () => {
  const { detector, api, sent, removed, logs } = makeHarness();
  api.getThreadInfo = () => {
    throw new TypeError("simulated ws3-fca thread-info failure");
  };
  api.getThreadInfoDeprecated = (_threadID, callback) => {
    callback(null, { adminIDs: ["bot-id", "admin-id"] });
  };

  await sendBurst(detector, api, "first");
  assert.equal(sent.length, 1);
  await sendBurst(detector, api, "second");

  assert.equal(removed.length, 1);
  assert.deepEqual(removed[0], { userID: "member-1", threadID: "group-1" });
  assert.ok(logs.some(message => message.includes("removed member-1")));
});

test("automod refuses to remove a group admin", async () => {
  const { detector, api, sent, removed } = makeHarness();
  api.getThreadInfo = (_threadID, callback) => callback(null, { adminIDs: ["bot-id", "member-1"] });
  await sendBurst(detector, api, "first");
  await sendBurst(detector, api, "second");
  assert.equal(sent.length, 1);
  assert.equal(removed.length, 0);
});

test("automod counts sticker-only messages without changing ordinary word-spam handling", async () => {
  const { detector, api, sent, removed } = makeHarness();
  async function stickerBurst(prefix) {
    for (let i = 0; i < 6; i += 1) {
      await detector.onMessage(api, {
        type: "message",
        threadID: "group-1",
        senderID: "member-1",
        body: "",
        attachments: [{ type: "sticker", ID: prefix + "-sticker-" + i }],
        senderName: "Member",
      });
    }
  }
  await stickerBurst("first");
  assert.equal(sent.length, 1);
  assert.equal(removed.length, 0);
  await stickerBurst("second");
  assert.equal(removed.length, 1);
});

test("automod counts standalone reaction events using userID", async () => {
  const { detector, api, sent, removed } = makeHarness();
  async function reactionBurst(messagePrefix) {
    for (let i = 0; i < 6; i += 1) {
      await detector.onMessage(api, {
        type: "message_reaction",
        threadID: "group-1",
        userID: "member-1",
        senderID: "message-author",
        messageID: messagePrefix + "-message-" + i,
        reaction: "👍",
      });
    }
  }
  await reactionBurst("first");
  assert.equal(sent.length, 1);
  assert.equal(removed.length, 0);
  await reactionBurst("second");
  assert.equal(removed.length, 1);
});
