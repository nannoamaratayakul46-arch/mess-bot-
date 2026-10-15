"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createJaidenMessageQueue } = require("../jaiden-message-queue");

const job = (message, id = message) => ({
  api: {},
  message,
  replyToMessageID: id,
  incomingText: message,
});

test("Jaiden FIFO sends every message separately and in arrival order", async () => {
  const sent = [];
  const queue = createJaidenMessageQueue({
    send: async (item) => { sent.push([item.message, item.replyToMessageID]); return true; },
  });
  const results = await Promise.all([
    queue.enqueue("thread-fifo", job("yo", "m1"), 0),
    queue.enqueue("thread-fifo", job("ano", "m2"), 0),
    queue.enqueue("thread-fifo", job("ano", "m3"), 0),
    queue.enqueue("thread-fifo", job("mama mo", "m4"), 0),
  ]);
  assert.deepEqual(sent, [["yo", "m1"], ["ano", "m2"], ["ano", "m3"], ["mama mo", "m4"]]);
  assert.equal(results.length, 4);
  assert.ok(results.every((result) => result.accepted && result.sent));
  queue.stop();
});

test("Jaiden FIFO retries thrown processor errors only within the configured bound", async () => {
  let attempts = 0;
  const queue = createJaidenMessageQueue({
    retryDelays: [0, 0],
    send: async () => {
      attempts++;
      if (attempts < 3) throw new Error("transient processor failure");
      return true;
    },
  });
  const result = await queue.enqueue("thread-retry", job("ano"), 0);
  assert.equal(attempts, 3);
  assert.equal(result.sent, true);
  assert.equal(result.attempts, 3);
  queue.stop();
});

test("Jaiden FIFO does not blindly retry ambiguous send failures", async () => {
  let attempts = 0;
  const queue = createJaidenMessageQueue({
    retryDelays: [0, 0],
    send: async () => { attempts++; return false; },
  });
  const result = await queue.enqueue("thread-ambiguous", job("yo"), 0);
  assert.equal(attempts, 1);
  assert.equal(result.sent, false);
  assert.equal(result.outcome, "send-failed-or-unknown");
  queue.stop();
});

test("Jaiden FIFO rejects invalid jobs and enforces its explicit queue cap", async () => {
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const queue = createJaidenMessageQueue({
    maxQueuePerThread: 2,
    send: async () => { await blocked; return true; },
  });
  const first = queue.enqueue("thread-cap", job("one"), 0);
  const second = queue.enqueue("thread-cap", job("two"), 0);
  const third = await queue.enqueue("thread-cap", job("three"), 0);
  assert.equal(third.accepted, false);
  assert.equal(third.outcome, "queue-full");
  release();
  assert.equal((await first).sent, true);
  assert.equal((await second).sent, true);
  queue.stop();
});
