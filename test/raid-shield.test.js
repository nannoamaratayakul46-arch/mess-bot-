"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRaidShield } = require("../raidShield");

function harness() {
  let time = 1_000_000;
  const persisted = [];
  const shield = createRaidShield({
    now: () => time,
    persistIncident: async incident => persisted.push(incident),
  });
  return { shield, persisted, advance: ms => { time += ms; } };
}

test("normal conversation does not escalate", async () => {
  const { shield } = harness();
  for (let i = 0; i < 3; i++) {
    await shield.observeMessage({ threadID: "123456789", senderID: "111111", body: "hello " + i });
  }
  assert.equal(shield.getState("123456789").protection_level, "normal");
  assert.equal(shield.listIncidents().length, 0);
});

test("message burst emits one deduplicated incident per window", async () => {
  const { shield, persisted } = harness();
  for (let i = 0; i < 6; i++) {
    await shield.observeMessage({ threadID: "123456789", senderID: "111111", body: "message " + i });
  }
  assert.equal(persisted.filter(x => x.event_type === "message_burst").length, 1);
});

test("coordinated duplicate detection requires distinct senders", async () => {
  const { shield, persisted, advance } = harness();
  for (let i = 0; i < 5; i++) {
    await shield.observeMessage({ threadID: "123456789", senderID: "111111", body: "join our link https://example.com" });
    advance(100);
  }
  assert.equal(persisted.filter(x => x.event_type === "coordinated_duplicate").length, 0);
  await shield.observeMessage({ threadID: "123456789", senderID: "222222", body: "join our link https://example.com" });
  advance(100);
  await shield.observeMessage({ threadID: "123456789", senderID: "333333", body: "join our link https://example.com" });
  assert.equal(persisted.filter(x => x.event_type === "coordinated_duplicate").length, 1);
});

test("join bursts are ignored unless event source is confirmed reliable", async () => {
  const { shield, persisted } = harness();
  for (let i = 0; i < 8; i++) await shield.observeJoin("123456789", String(100000 + i), false);
  assert.equal(persisted.length, 0);
  for (let i = 0; i < 5; i++) await shield.observeJoin("123456789", String(200000 + i), true);
  assert.equal(persisted.filter(x => x.event_type === "join_burst").length, 1);
});

test("high risk triggers temporary lockdown; release is manual and bounded", async () => {
  const { shield } = harness();
  await shield.observeProfileChange("123456789", "change-1", { confirmedUnauthorized: true, actor_id: "111111" });
  await shield.observeProfileChange("123456789", "change-2", { confirmedUnauthorized: true, actor_id: "111111" });
  await shield.observeProfileChange("123456789", "change-3", { confirmedUnauthorized: true, actor_id: "111111" });
  assert.equal(shield.getState("123456789").protection_level, "lockdown");
  const released = await shield.releaseLockdown("123456789");
  assert.equal(released.protection_level, "normal");
});

test("incident evidence strips message bodies and bounds dashboard output", async () => {
  const { shield } = harness();
  await shield.observeProfileChange("123456789", "profile-1", {
    confirmedUnauthorized: true, actor_id: "111111", message_body: "private content",
  });
  const [incident] = shield.listIncidents({ limit: 500 });
  assert.ok(incident);
  assert.equal(incident.evidence.message_body, undefined);
  assert.ok(shield.listIncidents({ limit: 1 }).length <= 1);
});

test("persisted lockdown and score are restored after restart", () => {
  const shield = createRaidShield({ now: () => 2_000_000 });
  const restored = shield.restoreStates([{
    thread_id: "987654321",
    score: 8,
    protection_level: "elevated",
    lockdown_until: new Date(2_100_000).toISOString(),
    last_event_at: new Date(1_999_000).toISOString(),
  }]);
  assert.equal(restored.length, 1);
  assert.equal(shield.getState("987654321").protection_level, "lockdown");
  assert.equal(shield.getState("987654321").lockdown_until, new Date(2_100_000).toISOString());
});
