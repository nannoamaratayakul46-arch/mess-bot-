"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_RESULT_REASON,
  createJaidenTargetCountdown,
} = require("../jaiden-target-countdown");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("exports the configured results reason exactly", () => {
  assert.equal(
    DEFAULT_RESULT_REASON,
    "DI TUMAGOS SA HEV CHALLENGE, NA-OUTPLAY SA COUNTDOWN 😭"
  );
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


test("posts uppercase target name, custom reason, and time-only results after all 100 numbers", async () => {
  const sends = [];
  let tracker;
  tracker = createJaidenTargetCountdown({
    inactivityMs: 5,
    countDelayMs: 0,
    getTarget: async () => ({ target_user_id: "target-1", target_name: "Juan Dela Cruz" }),
    getTargetName: async () => "Juan Dela Cruz",
    send: async (_api, message) => {
      sends.push(message);
      if (String(message).startsWith("WIN: HEV")) tracker.stop();
      return { sent: true };
    },
  });
  await tracker.onMessage({ api: {}, threadId: "gc-results", senderId: "target-1" });
  await sleep(450);
  assert.deepEqual(sends.slice(0, 100), Array.from({ length: 100 }, (_, i) => String(i + 1)));
  assert.equal(sends.length, 101);
  assert.match(sends[100], /^WIN: HEV\nLOSE: JUAN DELA CRUZ\nREASON: /);
  assert.ok(sends[100].includes(DEFAULT_RESULT_REASON));
  assert.match(sends[100], /\nSTART: \d{1,2}:\d{2}:\d{2} [AP]M\nEND: \d{1,2}:\d{2}:\d{2} [AP]M$/);
  assert.ok(!sends[100].includes("D.O SI TABA"));
  tracker.stop();
});

test("does not post results when target returns during countdown", async () => {
  const sends = [];
  const tracker = createJaidenTargetCountdown({
    inactivityMs: 5,
    countDelayMs: 40,
    getTarget: async () => ({ target_user_id: "target-1", target_name: "Juan Dela Cruz" }),
    getTargetName: async () => "Juan Dela Cruz",
    send: async (_api, message) => { sends.push(message); return { sent: true }; },
  });
  await tracker.onMessage({ api: {}, threadId: "gc-cancel-results", senderId: "target-1" });
  await sleep(20);
  await tracker.onMessage({ api: {}, threadId: "gc-cancel-results", senderId: "target-1" });
  await sleep(100);
  assert.ok(sends.length < 101);
  assert.ok(!sends.some(message => String(message).includes("WIN: HEV")));
  tracker.stop();
});


test("uses the custom dashboard template and reason", async () => {
  const sends = [];
  let tracker;
  tracker = createJaidenTargetCountdown({
    inactivityMs: 5,
    countDelayMs: 0,
    getTarget: async () => ({ target_user_id: "target-1", target_name: "Ana Santos" }),
    getTargetName: async () => "Ana Santos",
    getResultsSettings: async () => ({
      template: "🏆 {{WIN}}\n💀 {{LOSE}}\nREASON: {{REASON}}\nStarted {{START}} / ended {{END}}",
      reason: "Custom result reason",
    }),
    send: async (_api, message) => {
      sends.push(message);
      if (String(message).startsWith("🏆 HEV")) tracker.stop();
      return { sent: true };
    },
  });
  await tracker.onMessage({ api: {}, threadId: "gc-custom-results", senderId: "target-1" });
  await sleep(450);
  assert.equal(sends.length, 101);
  assert.match(sends[100], /^🏆 HEV\n💀 ANA SANTOS\nREASON: Custom result reason\nStarted \d{1,2}:\d{2}:\d{2} [AP]M \/ ended \d{1,2}:\d{2}:\d{2} [AP]M$/);
  tracker.stop();
});


test("clears the selected target only after the results message sends successfully", async () => {
  const sends = [];
  const completed = [];
  const tracker = createJaidenTargetCountdown({
    inactivityMs: 5,
    countDelayMs: 0,
    getTarget: async () => ({ target_user_id: "target-1", target_name: "Ana Santos" }),
    getTargetName: async () => "Ana Santos",
    onComplete: async (target) => { completed.push(target); },
    send: async (_api, message) => {
      sends.push(message);
      return { sent: true };
    },
  });
  await tracker.onMessage({ api: {}, threadId: "gc-autoclear", senderId: "target-1" });
  await sleep(500);
  assert.equal(sends.length, 101);
  assert.deepEqual(completed, [{ threadId: "gc-autoclear", targetId: "target-1" }]);
  tracker.stop();
});

test("does not clear the selected target when the results message fails", async () => {
  const completed = [];
  const tracker = createJaidenTargetCountdown({
    inactivityMs: 5,
    countDelayMs: 0,
    getTarget: async () => ({ target_user_id: "target-1", target_name: "Ana Santos" }),
    getTargetName: async () => "Ana Santos",
    onComplete: async (target) => { completed.push(target); },
    send: async (_api, message) => {
      if (String(message).startsWith("WIN: HEV")) return { sent: false };
      return { sent: true };
    },
  });
  await tracker.onMessage({ api: {}, threadId: "gc-autoclear-fail", senderId: "target-1" });
  await sleep(500);
  assert.deepEqual(completed, []);
  tracker.stop();
});


test("persists target lock and resumes countdown progress with original timestamps after restart", async () => {
  const saved = new Map();
  const sendsBeforeRestart = [];
  const sendsAfterRestart = [];
  const persistState = async (state) => saved.set(state.threadId, { ...state });
  const loadState = async (threadId) => saved.get(threadId) || null;
  const loadAllStates = async () => [...saved.values()];
  const deleteState = async (threadId) => saved.delete(threadId);
  const target = async () => ({ target_user_id: "target-persist", target_name: "Target" });
  const first = createJaidenTargetCountdown({
    inactivityMs: 5, countDelayMs: 100,
    getTarget: target, persistState, loadState, loadAllStates, deleteState,
    send: async (_api, message) => { sendsBeforeRestart.push(message); return { sent: true }; },
  });
  await first.onMessage({ api: {}, threadId: "gc-persist", senderId: "target-persist" });
  await sleep(30);
  const checkpoint = saved.get("gc-persist");
  assert.ok(checkpoint);
  assert.ok(checkpoint.lockedAt > 0);
  assert.ok(checkpoint.lastActivityAt > 0);
  assert.ok(checkpoint.countdownStartedAt > 0);
  assert.ok(checkpoint.nextNumber >= 2);
  const originalLock = checkpoint.lockedAt;
  const originalCountdownStart = checkpoint.countdownStartedAt;
  first.stop();

  const second = createJaidenTargetCountdown({
    inactivityMs: 5, countDelayMs: 100,
    getTarget: target, persistState, loadState, loadAllStates, deleteState,
    send: async (_api, message) => { sendsAfterRestart.push(message); return { sent: true }; },
  });
  await second.restore({});
  await sleep(25);
  assert.equal(saved.get("gc-persist").lockedAt, originalLock);
  assert.equal(saved.get("gc-persist").countdownStartedAt, originalCountdownStart);
  assert.ok(sendsAfterRestart.length > 0);
  assert.equal(sendsAfterRestart[0], String(checkpoint.nextNumber));
  second.stop();
});


test("syncs the bot nickname to the resolved target when countdown begins", async () => {
  const nicknameSyncs = [];
  const tracker = createJaidenTargetCountdown({
    inactivityMs: 5,
    countDelayMs: 1000,
    getTarget: async () => ({ target_user_id: "target-nick", target_name: "Target Display Name" }),
    getTargetName: async () => "Target Display Name",
    syncTargetNickname: async (details) => { nicknameSyncs.push(details); },
    send: async () => ({ sent: true }),
  });
  await tracker.onMessage({ api: {}, threadId: "gc-nickname", senderId: "target-nick" });
  await sleep(30);
  assert.equal(nicknameSyncs.length, 1);
  assert.equal(nicknameSyncs[0].threadId, "gc-nickname");
  assert.equal(nicknameSyncs[0].targetId, "target-nick");
  assert.equal(nicknameSyncs[0].savedName, "Target Display Name");
  assert.ok(nicknameSyncs[0].countdownStartedAt > 0);
  tracker.stop();
});
