"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRaidShieldStore, sanitizeEvidence } = require("../raidShieldStore");

function fakeDb() {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/SELECT id, incident_key/.test(sql)) return { rows: [{ evidence: { actor_id: "123456", message_body: "secret" }, thread_id: "123456789" }] };
      if (/SELECT thread_id, score/.test(sql)) return { rows: [{ thread_id: "123456789", protection_level: "watch" }] };
      return { rows: [], rowCount: 2 };
    },
  };
}

test("store schema setup is shared across concurrent calls", async () => {
  const db = fakeDb();
  const store = createRaidShieldStore(db);
  await Promise.all([store.ensureTables(), store.ensureTables(), store.ensureTables()]);
  assert.equal(db.calls.filter(x => /CREATE TABLE IF NOT EXISTS raid_shield_state/.test(x.sql)).length, 1);
  assert.equal(db.calls.filter(x => /CREATE TABLE IF NOT EXISTS raid_shield_incidents/.test(x.sql)).length, 1);
});

test("incident persistence uses parameters and strips message-like evidence", async () => {
  const db = fakeDb();
  const store = createRaidShieldStore(db);
  await store.persistIncident({
    id: "incident-1", thread_id: "123456789", event_type: "message_burst",
    risk_points: 2, score: 4, severity: "watch", status: "mitigating",
    evidence: { actor_id: "123456", message_body: "private", text: "private", count: 6 },
    created_at: "2026-10-14T00:00:00.000Z",
  });
  const insert = db.calls.find(x => /INSERT INTO raid_shield_incidents/.test(x.sql));
  assert.ok(insert);
  assert.equal(insert.params[1], "123456789");
  assert.equal(insert.params[7], JSON.stringify({ actor_id: "123456", count: 6 }));
  assert.match(insert.sql, /ON CONFLICT \(thread_id, incident_key\) DO NOTHING/);
});

test("state persistence bounds score and validates protection level", async () => {
  const db = fakeDb();
  const store = createRaidShieldStore(db);
  await store.persistState({ thread_id: "123456789", score: 999, protection_level: "untrusted", lockdown_until: "bad" });
  const insert = db.calls.find(x => /INSERT INTO raid_shield_state/.test(x.sql));
  assert.equal(insert.params[1], 30);
  assert.equal(insert.params[2], "normal");
  assert.equal(insert.params[3], null);
});

test("incident query limit is clamped and evidence sanitized on read", async () => {
  const db = fakeDb();
  const store = createRaidShieldStore(db);
  const rows = await store.listIncidents({ threadId: "123456789", limit: 999 });
  const query = db.calls.find(x => /SELECT id, incident_key/.test(x.sql));
  assert.equal(query.params.at(-1), 100);
  assert.equal(rows[0].evidence.message_body, undefined);
  assert.equal(rows[0].evidence.actor_id, "123456");
});

test("sanitizeEvidence rejects arrays and malformed JSON", () => {
  assert.deepEqual(sanitizeEvidence(["nope"]), {});
  assert.deepEqual(sanitizeEvidence("{bad"), {});
});
