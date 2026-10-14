"use strict";

// Additional regression coverage for resource bounds and rolling-window cleanup.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createRaidShield } = require("../raidShield");

test("group capacity evicts the least-recently touched non-locked group", async () => {
  let now = 1_000_000;
  const shield = createRaidShield({ now: () => now, config: { maxGroups: 2, decayMs: 1_000_000 } });
  await shield.observeProfileChange("111111", "p1", { confirmedUnauthorized: true, actor_id: "900001" });
  now += 10;
  await shield.observeProfileChange("222222", "p2", { confirmedUnauthorized: true, actor_id: "900002" });
  now += 10;
  // A benign observation touches the first group's LRU timestamp.
  await shield.observeMessage({ threadID: "111111", senderID: "900001", body: "normal activity" });
  assert.equal(shield.getState("111111").score, 5);
  now += 10;
  await shield.observeProfileChange("333333", "p3", { confirmedUnauthorized: true, actor_id: "900003" });
  assert.equal(shield.getState("111111").score, 5);
  assert.equal(shield.getState("333333").score, 5);
  assert.equal(shield.getState("222222").score, 0);
});

test("cleanup prunes stale rolling fingerprint entries without affecting active state", async () => {
  let now = 1_000_000;
  const shield = createRaidShield({ now: () => now, config: { coordinatedWindowMs: 1000, decayMs: 5000 } });
  await shield.observeMessage({ threadID: "123456789", senderID: "111111", body: "same suspicious link https://example.com" });
  now += 1500;
  shield.cleanup();
  await shield.observeMessage({ threadID: "123456789", senderID: "222222", body: "same suspicious link https://example.com" });
  assert.equal(shield.listIncidents().filter(x => x.event_type === "coordinated_duplicate").length, 0);
});


test("event deduplication stays bounded without periodic cleanup", async () => {
  let now = 1_000_000;
  const shield = createRaidShield({
    now: () => now,
    config: { maxGroups: 1, maxEventsPerGroup: 2, decayMs: 60_000, profileWindowMs: 60_000 },
  });

  await shield.observeProfileChange("123456789", "event-a", { confirmedUnauthorized: true });
  now += 1;
  await shield.observeProfileChange("123456789", "event-b", { confirmedUnauthorized: true });
  now += 1;
  await shield.observeProfileChange("123456789", "event-c", { confirmedUnauthorized: true });

  // The configured two-key cap evicts the oldest dedupe entry. Replaying it
  // can be processed again, but memory cannot grow without bound in the meantime.
  now += 1;
  const replay = await shield.observeProfileChange("123456789", "event-a", { confirmedUnauthorized: true });
  assert.equal(replay.duplicate, undefined);
  assert.equal(shield.listIncidents({ threadId: "123456789", limit: 10 }).length, 4);
});
