"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRaidShieldStore } = require("../raidShieldStore");

test("loadStates creates schema and returns bounded persisted rows", async () => {
  const calls = [];
  const db = { query: async (sql, params = []) => {
    calls.push({ sql: String(sql), params });
    if (String(sql).includes("SELECT thread_id, score, protection_level, lockdown_until, last_event_at, updated_at FROM raid_shield_state")) {
      return { rows: [{ thread_id: "123456789", score: 6, protection_level: "elevated", lockdown_until: null, last_event_at: new Date().toISOString() }] };
    }
    return { rows: [], rowCount: 0 };
  } };
  const store = createRaidShieldStore(db);
  const rows = await store.loadStates({ limit: 25 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].thread_id, "123456789");
  assert.ok(calls.some(call => call.sql.includes("CREATE TABLE IF NOT EXISTS raid_shield_state")));
  assert.ok(calls.some(call => call.params[0] === 25));
});

test("approval review updates only a pending action in the selected group", async () => {
  let updateSql = "";
  let updateParams = [];
  const db = { query: async (sql, params = []) => {
    const query = String(sql);
    if (query.includes("UPDATE raid_shield_approval_actions SET status=$2")) {
      updateSql = query;
      updateParams = params;
      return { rows: [{ id: 7, thread_id: "123456789", status: "approved" }] };
    }
    return { rows: [], rowCount: 0 };
  } };
  const store = createRaidShieldStore(db);
  const row = await store.reviewApprovalAction({ id: 7, threadId: "123456789", status: "approved", reviewedBy: "admin" });
  assert.equal(row.status, "approved");
  assert.match(updateSql, /thread_id=\$5 AND status='pending'/);
  assert.equal(updateParams[4], "123456789");
});
