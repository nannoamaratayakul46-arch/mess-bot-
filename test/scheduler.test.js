"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const scheduler = require("../scheduler");

function createApi(sent = []) {
  return {
    sendMessage(text, threadID, callback) {
      sent.push({ text, threadID });
      setImmediate(() => callback(null, { messageID: "test-" + sent.length }));
    },
  };
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test("queue accepts up to 700 messages and rejects invalid entries", () => {
  assert.throws(() => scheduler.enqueueItems("group-a", Array.from({ length: 701 }, () => "message")), /at most 700/);
  assert.throws(() => scheduler.enqueueItems("group-a", ["valid", "  "]), /empty or invalid/);
  assert.equal(scheduler.enqueueItems("group-b", ["hello"]).pending, 1);
});

test("scheduler locks the selected group, routes sends through the supplied sender, and caps each batch", async () => {
  const sent = [];
  const api = {};
  const messages = Array.from({ length: 22 }, (_, index) => "message " + (index + 1));
  assert.equal(scheduler.enqueueItems("group-a", messages).queued, 22);

  const firstRun = scheduler.startSession(api, "group-a", {
    maxMinutes: 1, minDelayMs: 1, maxDelayMs: 1,
    sendMessage: async (_api, text, threadID) => { sent.push({ text: text.toUpperCase(), threadID }); },
  });

  await assert.rejects(
    scheduler.startSession(api, "group-a", { baseMinutes: 0.001, sendMessage: async () => {} }),
    /already active/
  );

  scheduler.enqueueItems("group-c", ["separate group"]);

  const firstResult = await firstRun;
  assert.equal(firstResult.sentThisBatch, scheduler.MAX_BATCH);
  assert.equal(firstResult.remaining, 2);
  assert.equal(sent.length, scheduler.MAX_BATCH);
  assert.equal(sent[0].text, "MESSAGE 1");
  assert.ok(sent.every(item => item.threadID === "group-a"));

  const secondResult = await scheduler.startSession(api, "group-a", {
    maxMinutes: 1, minDelayMs: 1, maxDelayMs: 1,
    sendMessage: async (_api, text, threadID) => { sent.push({ text, threadID }); },
  });
  assert.equal(secondResult.sentThisBatch, 2);
  assert.equal(secondResult.remaining, 0);
});

test("stopSession interrupts the active delay and keeps unsent messages queued", async () => {
  const sent = [];
  const api = createApi(sent);

  scheduler.enqueueItems("group-stop", ["first", "second"]);
  const run = scheduler.startSession(api, "group-stop", {
    maxMinutes: 1, minDelayMs: 1, maxDelayMs: 1,
  });

  await wait(20);
  assert.equal(scheduler.stopSession("group-stop"), true);

  const result = await run;
  assert.equal(result.stopped, true);
  assert.equal(result.sentThisBatch, 1);
  assert.equal(result.remaining, 1);
  assert.equal(sent.length, 1);
  assert.equal(scheduler.stopSession("group-stop"), false);
});


test("random delay stays within the configured 30-second to max-minute range", () => {
  for (let index = 0; index < 100; index += 1) {
    const delay = scheduler.randomDelayMs(5);
    assert.ok(delay >= 30_000 && delay <= 300_000);
  }
  assert.equal(scheduler.randomDelayMs(1, 10, 10), 10);
});

test("Manila time formatter emits h:mm without an AM/PM suffix", () => {
  const formatted = scheduler.formatManilaTime(new Date("2026-11-17T10:59:00.000Z"));
  assert.match(formatted, /^6:59$/);
});


test("optional Time Check sends the Manila template at most once per run", async () => {
  const sent = [];
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    scheduler.enqueueItems("group-time-check", ["announcement one", "announcement two"]);
    const result = await scheduler.startSession({}, "group-time-check", {
      maxMinutes: 1, minDelayMs: 1, maxDelayMs: 1, enableTimeCheck: true,
      sendMessage: async (_api, text, threadID) => { sent.push({ text, threadID }); },
    });
    const checks = sent.filter(item => item.text.startsWith("time check: "));
    assert.equal(checks.length, 1);
    assert.match(checks[0].text, /^time check: \d{1,2}:\d{2}, wag sana d\.o isa jan$/);
    assert.equal(result.timeChecks, 1);
    assert.equal(result.sentThisBatch, 2);
  } finally {
    Math.random = originalRandom;
  }
});
