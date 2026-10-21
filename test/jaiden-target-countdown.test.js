"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  COMPLETION_PHRASE,
  createJaidenTargetCountdown,
} = require("../jaiden-target-countdown");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("exports the exact completion phrase", () => {
  assert.equal(COMPLETION_PHRASE, "D.O SI TABA AAAAAA DI MAKATAGOS SA BOSS OMA NIYA");
});

test("only selected target messages start and reset the inactivity timer", async () => {
  const sends = [];
  const tracker = createJaidenTargetCountdown({
    inactivityMs: 45,
    countDelayMs: 1000,
    getTarget: async () => ({ target_user_id: "target-1", bang_enabled: true }),
    send: async (_api, message) => { sends.push(message); return { sent: true }; },
  });
  await tracker.onMessage({ api: {}, threadId: "gc-1", senderId: "target-1" });
  await sleep(25);
  await tracker.onMessage({ api: {}, threadId: "gc-1", senderId: "member-2" });
  await sleep(30);
  assert.deepEqual(sends, ["1"]);
  tracker.stop();
});

test("a target message cancels the count before subsequent numbers and phrase", async () => {
  const sends = [];
  const tracker = createJaidenTargetCountdown({
    inactivityMs: 30,
    countDelayMs: 250,
    getTarget: async () => ({ target_user_id: "target-1", bang_enabled: true }),
    send: async (_api, message) => { sends.push(message); return { sent: true }; },
  });
  await tracker.onMessage({ api: {}, threadId: "gc-1", senderId: "target-1" });
  await sleep(45);
  assert.deepEqual(sends, ["1"]);
  await tracker.onMessage({ api: {}, threadId: "gc-1", senderId: "target-1" });
  await sleep(80);
  assert.deepEqual(sends, ["1", "1"]);
  tracker.stop();
});

test("a saved target is tracked independently of the bang toggle", async () => {
  const sends = [];
  const tracker = createJaidenTargetCountdown({
    inactivityMs: 10,
    getTarget: async () => ({ target_user_id: "target-1", bang_enabled: false }),
    send: async (_api, message) => { sends.push(message); return { sent: true }; },
  });
  await tracker.onMessage({ api: {}, threadId: "gc-1", senderId: "target-1" });
  await sleep(20);
  assert.deepEqual(sends, ["1"]);
  tracker.stop();
});
