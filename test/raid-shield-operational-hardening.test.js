"use strict";

// Additional regression coverage for resource bounds and rolling-window cleanup.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createRaidShield } = require("../raidShield");

test("group capacity evicts the least-recently touched non-locked group", async () => {
  let now = 1_000_000;
  const shield = createRaidShield({ now: () => now, config: { maxGroups: 2 } });
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
