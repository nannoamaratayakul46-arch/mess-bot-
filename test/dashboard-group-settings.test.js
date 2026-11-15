"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadDashboardGroupSettings } = require("../dashboardGroupSettings");

test("dashboard group settings and targets load in one batched query", async () => {
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [
        {
          thread_id: "group-a", bot_enabled: false, roast_enabled: true,
          slash_pool_enabled: false, fun_enabled: true,
          target_user_id: "user-1", target_name: "Target", bang_enabled: true,
          jaiden_interval_seconds: 5, jaiden_cooldown_mode: "queue",
          jaiden_reply_mode: "random", jaiden_typing_enabled: false,
          target_updated_at: "1700000000000",
        },
        {
          thread_id: "group-b", bot_enabled: true, roast_enabled: false,
          slash_pool_enabled: true, fun_enabled: false,
          target_user_id: null,
        },
      ] };
    },
  };

  const result = await loadDashboardGroupSettings(db, ["group-a", "group-b", "group-a", ""]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, [["group-a", "group-b"]]);
  assert.match(calls[0].sql, /LEFT JOIN thread_settings/);
  assert.match(calls[0].sql, /LEFT JOIN banat_thread_targets/);
  assert.deepEqual(result.get("group-a"), {
    settings: { bot_enabled: false, roast_enabled: true, slash_pool_enabled: false, fun_enabled: true },
    target: {
      target_user_id: "user-1", target_name: "Target", bang_enabled: true,
      jaiden_interval_seconds: 5, jaiden_cooldown_mode: "queue",
      jaiden_reply_mode: "random", jaiden_typing_enabled: false,
      updated_at: "1700000000000",
    },
  });
  assert.deepEqual(result.get("group-b"), {
    settings: { bot_enabled: true, roast_enabled: false, slash_pool_enabled: true, fun_enabled: false },
    target: null,
  });
});

test("empty dashboard group list does not acquire a database connection", async () => {
  let calls = 0;
  const result = await loadDashboardGroupSettings({ query: async () => { calls += 1; } }, []);
  assert.equal(calls, 0);
  assert.equal(result.size, 0);
});
