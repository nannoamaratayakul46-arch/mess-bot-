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
  assert.match(sends[100], /\nSTART: \d{1,2}:\d{2}:\d{2} [AP]M\nEND: \d{1,2}:\d{2}:\d{2} [AP]M/);
  assert.match(sends[100], /STATUS: COMPLETED/);
  assert.match(sends[100], /COUNT: 100\/100/);
  assert.match(sends[100], /DURATION: \d+h \d{2}m \d{2}s/);
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
  assert.match(sends[100], /^🏆 HEV\n💀 ANA SANTOS\nREASON: Custom result reason\nStarted \d{1,2}:\d{2}:\d{2} [AP]M \/ ended \d{1,2}:\d{2}:\d{2} [AP]M/);
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
  assert.equal(completed.length, 1);
  assert.equal(completed[0].threadId, "gc-autoclear");
  assert.equal(completed[0].targetId, "target-1");
  assert.equal(completed[0].targetName, "Ana Santos");
  assert.ok(completed[0].startedAt > 0);
  assert.ok(completed[0].endedAt >= completed[0].startedAt);
  assert.equal(completed[0].reason, DEFAULT_RESULT_REASON);
  tracker.stop();
});

test("backs off after a failed countdown send instead of immediately retrying", async () => {
  const sends = [];
  const tracker = createJaidenTargetCountdown({
    inactivityMs: 5,
    retryCooldownMs: 150,
    countDelayMs: 0,
    getTarget: async () => ({ target_user_id: "target-cooldown", target_name: "Target" }),
    send: async (_api, message) => {
      sends.push(message);
      return { sent: false };
    },
  });
  await tracker.onMessage({ api: {}, threadId: "gc-send-cooldown", senderId: "target-cooldown" });
  await sleep(35);
  assert.deepEqual(sends, ["1"]);
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


test("sends one opening personality line before the numbers and occasional lines between milestones", async () => {
  const sends = [];
  const personality = [];
  const tracker = createJaidenTargetCountdown({
    inactivityMs: 5,
    countDelayMs: 0,
    getTarget: async () => ({ target_user_id: "target-personality", target_name: "Ana Santos" }),
    onPersonalityLine: async (details) => {
      if (details.shouldSend()) personality.push({ context: details.context, targetName: details.targetName });
      return true;
    },
    send: async (_api, message) => { sends.push(message); return { sent: true }; },
  });
  await tracker.onMessage({ api: {}, threadId: "gc-personality", senderId: "target-personality" });
  await sleep(450);
  assert.equal(personality[0].context, "general");
  assert.equal(personality[0].targetName, "Ana Santos");
  assert.deepEqual(personality.slice(1).map((item) => item.context), ["slow", "slow", "boast", "boast"]);
  assert.deepEqual(sends.slice(0, 100), Array.from({ length: 100 }, (_, i) => String(i + 1)));
  tracker.stop();
});

test("personality callback receives a guard that turns false immediately after target return", async () => {
  let capturedGuard;
  const tracker = createJaidenTargetCountdown({
    inactivityMs: 5,
    countDelayMs: 100,
    getTarget: async () => ({ target_user_id: "target-cancel-personality", target_name: "Target" }),
    onPersonalityLine: async ({ shouldSend }) => { capturedGuard = shouldSend; },
    send: async () => ({ sent: true }),
  });
  await tracker.onMessage({ api: {}, threadId: "gc-cancel-personality", senderId: "target-cancel-personality" });
  await sleep(25);
  assert.equal(capturedGuard(), true);
  await tracker.onMessage({ api: {}, threadId: "gc-cancel-personality", senderId: "target-cancel-personality" });
  assert.equal(capturedGuard(), false);
  tracker.stop();
});


test("uses the selected target's latest message to choose the opening taunt context", async () => {
  const contexts = [];
  const tracker = createJaidenTargetCountdown({
    inactivityMs: 8,
    countDelayMs: 1000,
    getTarget: async () => ({ target_user_id: "target-context", target_name: "Ana" }),
    onPersonalityLine: async ({ context }) => { contexts.push(context); },
    send: async () => ({ sent: true }),
  });
  await tracker.onMessage({
    api: {}, threadId: "gc-context", senderId: "target-context",
    messageBody: "HAHAHAHA 😂😂",
  });
  await sleep(25);
  assert.equal(contexts[0], "laugh");
  tracker.stop();
});


test("admin force receipt posts truthful partial progress and stops the active countdown", async () => {
  const sends = [];
  const cancelled = [];
  const tracker = createJaidenTargetCountdown({
    inactivityMs: 5,
    countDelayMs: 100,
    getTarget: async () => ({ target_user_id: "target-force", target_name: "Force Target" }),
    onCancel: async (record) => { cancelled.push(record); },
    send: async (_api, message) => { sends.push(message); return { sent: true }; },
  });
  await tracker.onMessage({ api: {}, threadId: "gc-force", senderId: "target-force" });
  await sleep(35);
  assert.deepEqual(sends, ["1"]);
  const result = await tracker.forceReceipt("gc-force");
  assert.equal(result.sent, true);
  assert.equal((await tracker.forceReceipt("gc-force")).reason, "NO_COUNTDOWN_TO_REPORT");
  assert.match(sends[1], /GROUP: gc-force/);
  assert.match(sends[1], /TARGET: Force Target/);
  assert.match(sends[1], /COUNT: 1\/100/);
  assert.match(sends[1], /STATUS: FORCED/);
  assert.match(sends[1], /START: .*\d{4}/);
  assert.match(sends[1], /END: /);
  assert.equal(cancelled.length, 1);
  assert.equal(cancelled[0].reason, "FORCED_RECEIPT");
  await sleep(140);
  assert.deepEqual(sends, ["1", sends[1]]);
  tracker.stop();
});

test("force receipt can publish a previously interrupted countdown", async () => {
  const sends = [];
  const tracker = createJaidenTargetCountdown({
    inactivityMs: 5,
    countDelayMs: 100,
    getTarget: async () => ({ target_user_id: "target-interrupted", target_name: "Returned Target" }),
    send: async (_api, message) => { sends.push(message); return { sent: true }; },
  });
  await tracker.onMessage({ api: {}, threadId: "gc-interrupted", senderId: "target-interrupted" });
  await sleep(30);
  await tracker.onMessage({ api: {}, threadId: "gc-interrupted", senderId: "target-interrupted" });
  const result = await tracker.forceReceipt("gc-interrupted");
  assert.equal(result.sent, true);
  assert.match(sends.at(-1), /STATUS: INTERRUPTED/);
  assert.match(sends.at(-1), /COUNT: 1\/100/);
  tracker.stop();
});

test("dashboard force start runs immediately and ignores target activity until 100", async () => {
  const sends = [];
  const tracker = createJaidenTargetCountdown({
    inactivityMs: 60000,
    countDelayMs: 3,
    getTarget: async () => ({ target_user_id: "target-online", target_name: "Online Target" }),
    send: async (_api, message) => { sends.push(message); return { sent: true }; },
  });
  const started = await tracker.forceStart("gc-forced", {});
  assert.equal(started.started, true);
  assert.equal(started.status.forced, true);
  assert.equal(tracker.getStatus("gc-forced").active, true);
  await tracker.onMessage({ api: {}, threadId: "gc-forced", senderId: "target-online", messageBody: "I'm here" });
  await sleep(420);
  assert.equal(sends.filter(message => /^\d+$/.test(message)).length, 100);
  assert.match(sends.at(-1), /STATUS: FORCED COMPLETED/);
  assert.equal(tracker.getStatus("gc-forced").active, false);
  tracker.stop();
});

test("dashboard force start rejects missing targets and duplicate active runs", async () => {
  let hasTarget = false;
  const tracker = createJaidenTargetCountdown({
    getTarget: async () => hasTarget ? ({ target_user_id: "target-1", target_name: "Target" }) : null,
    send: async () => ({ sent: true }),
  });
  assert.equal((await tracker.forceStart("gc-empty", {})).reason, "NO_TARGET");
  hasTarget = true;
  assert.equal((await tracker.forceStart("gc-empty", {})).started, true);
  assert.equal((await tracker.forceStart("gc-empty", {})).reason, "ALREADY_RUNNING");
  tracker.stop();
});
