"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

test("dedicated Jaiden pool contains exactly 200 separate replies", () => {
  const pool = require("../jaiden-separate-pool");
  assert.equal(pool.TEMPLATES.length, 200);
  assert.ok(pool.TEMPLATES.every((line) => typeof line === "string" && line.trim().length > 0));
});

test("dashboard Jaiden queue bypasses the generic coalescing Banat burst queue", () => {
  const source = fs.readFileSync(path.join(root, "index.js"), "utf8");
  const start = source.indexOf("function scheduleJaidenReply(");
  const end = source.indexOf("\nfunction clearJaidenCooldownState", start);
  const body = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(body, /jaidenMessageQueue\.enqueue\(threadKey/);
  assert.doesNotMatch(body, /acceptBanatBurstMessage\(threadKey, queued\)/);
  assert.match(source, /send:\s*async \(job\) =>/);
  assert.match(source, /job\.replyToMessageID/);
});

test("Jaiden message queue has a finite cap and bounded processor retries", () => {
  const source = fs.readFileSync(path.join(root, "jaiden-message-queue.js"), "utf8");
  assert.match(source, /maxQueuePerThread = Math\.max/);
  assert.match(source, /thrownRetries >= retryDelays\.length/);
  assert.match(source, /Never retry blindly/);
  assert.match(source, /state\.jobs\.push\(\{ job: \{ \.\.\.job \}/);
});
