"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { recordEncounter } = require("../jaidenTargetRecords");

test("records a Jaiden encounter with timestamp-derived duration", async () => {
  const calls = [];
  const db = { query: async (sql, values) => { calls.push({ sql, values }); return { rows: [] }; } };
  await recordEncounter(db, {
    threadId: "group-1", targetId: "user-9", targetName: "Target",
    startedAt: 1_000, endedAt: 91_000, result: "WIN", reason: "completed",
  });
  const insert = calls.find(call => call.sql.includes("INSERT INTO jaiden_target_encounters"));
  assert.ok(insert);
  assert.equal(insert.values[4], "WIN");
  assert.equal(insert.values[8], 90);
  assert.match(insert.sql, /ON CONFLICT \(thread_id, target_user_id, started_at\) DO NOTHING/);
});

test("rejects invalid encounter identities and timestamp ranges", async () => {
  const db = { query: async () => ({ rows: [] }) };
  await assert.rejects(
    recordEncounter(db, { threadId: "", targetId: "user-9", startedAt: 100, endedAt: 200 }),
    /valid Jaiden encounter identity/
  );
  await assert.rejects(
    recordEncounter(db, { threadId: "group-1", targetId: "user-9", startedAt: 200, endedAt: 100 }),
    /valid Jaiden encounter identity/
  );
});
