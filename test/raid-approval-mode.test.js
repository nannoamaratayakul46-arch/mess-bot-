"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRaidApprovalMode } = require("../raidApprovalMode");

function fakeDb() {
  const rows = new Map();
  const auditRows = [];
  return {
    rows,
    auditRows,
    async query(sql, params = []) {
      const text = String(sql);
      if (/^\s*CREATE TABLE|^\s*CREATE INDEX/i.test(text)) return { rows: [], rowCount: 0 };
      if (text.includes("INSERT INTO raid_shield_approval_mode_audit")) {
        auditRows.push({ thread_id: params[0], action: params[1], actor: params[2], details: JSON.parse(params[3]) });
        return { rows: [], rowCount: 1 };
      }
      if (text.includes("INSERT INTO raid_shield_approval_mode(thread_id)")) {
        if (!rows.has(params[0])) rows.set(params[0], {
          thread_id: params[0], automation_enabled: false, automation_active: false,
          previous_approval_mode: null, ownership_lost: false, last_join_at: null,
          restore_after: null, last_action: "created", last_error: null,
        });
        return { rows: [], rowCount: 1 };
      }
      if (text.includes("SELECT * FROM raid_shield_approval_mode WHERE thread_id=$1")) {
        const row = rows.get(params[0]);
        return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
      }
      if (text.includes("SELECT thread_id, automation_enabled, automation_active, ownership_lost, restore_after") && text.includes("FROM raid_shield_approval_mode")) {
        return { rows: [...rows.values()].filter(row => row.automation_active).map(row => ({ ...row })), rowCount: rows.size };
      }
      if (text.includes("UPDATE raid_shield_approval_mode SET") && text.includes("RETURNING automation_active")) {
        const row = rows.get(params[0]);
        if (!row) return { rows: [], rowCount: 0 };
        row.last_join_at = new Date().toISOString();
        if (row.automation_active) row.restore_after = new Date(Date.now() + Number(params[1])).toISOString();
        return { rows: [{ automation_active: row.automation_active }], rowCount: 1 };
      }
      if (text.includes("UPDATE raid_shield_approval_mode SET")) {
        const row = rows.get(params[0]);
        if (!row) return { rows: [], rowCount: 0 };
        for (const match of text.matchAll(/([a-z_]+)=\$(\d+)/g)) {
          const [, key, index] = match;
          if (key === "updated_at") continue;
          row[key] = params[Number(index) - 1];
        }
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

function apiHarness(initialMode = false) {
  let mode = initialMode;
  const calls = [];
  return {
    calls,
    get mode() { return mode; },
    api: {
      getCurrentUserID: () => "999999",
      getThreadInfo(threadId, callback) {
        calls.push(["getThreadInfo", threadId]);
        callback(null, { approvalMode: mode });
      },
      changeThreadApprovalMode(threadId, enabled, callback) {
        calls.push(["changeThreadApprovalMode", threadId, enabled]);
        mode = enabled;
        callback(null, true);
      },
    },
  };
}

test("fails closed when installed ws3-fca lacks approval-mode methods", async () => {
  const db = fakeDb();
  let invoked = false;
  const controller = createRaidApprovalMode({ db, getApi: () => ({ changeThreadApprovalMode() { invoked = true; } }), pollMs: 120000 });
  await controller.setAutomation("123456789", true);
  const result = await controller.activate("123456789");
  assert.equal(result.ok, false);
  assert.equal(result.error.includes("must expose"), true);
  assert.equal(invoked, false);
  assert.equal(db.auditRows.some(row => row.action === "api_unsupported"), true);
  controller.stop();
});

test("enables approval on a raid and restores the prior OFF mode after the quiet period", async () => {
  let time = 1_000_000;
  const db = fakeDb();
  const messenger = apiHarness(false);
  const controller = createRaidApprovalMode({
    db,
    getApi: () => messenger.api,
    now: () => time,
    quietMs: 30_000,
    pollMs: 120_000,
  });
  await controller.setAutomation("123456789", true);
  const activated = await controller.activate("123456789", "join_burst");
  assert.equal(activated.enabled, true);
  assert.equal(messenger.mode, true);
  assert.equal(messenger.calls.filter(call => call[0] === "changeThreadApprovalMode").length, 1);

  time += 31_000;
  await controller.poll();
  assert.equal(messenger.mode, false);
  assert.equal(db.rows.get("123456789").automation_active, false);
  assert.equal(db.auditRows.some(row => row.action === "approval_enabled_by_automation"), true);
  assert.equal(db.auditRows.some(row => row.action === "approval_restored_off"), true);
  controller.stop();
});

test("does not disable approval that was already enabled before the raid", async () => {
  const db = fakeDb();
  const messenger = apiHarness(true);
  const controller = createRaidApprovalMode({ db, getApi: () => messenger.api, pollMs: 120000 });
  await controller.setAutomation("123456789", true);
  const result = await controller.activate("123456789");
  assert.equal(result.alreadyEnabled, true);
  assert.equal(messenger.mode, true);
  assert.equal(messenger.calls.filter(call => call[0] === "changeThreadApprovalMode").length, 0);
  assert.equal(db.rows.get("123456789").automation_active, false);
  controller.stop();
});

test("preserves a manual approval-mode change instead of auto-restoring over it", async () => {
  let time = 2_000_000;
  const db = fakeDb();
  const messenger = apiHarness(false);
  const controller = createRaidApprovalMode({ db, getApi: () => messenger.api, now: () => time, quietMs: 30_000, pollMs: 120000 });
  await controller.setAutomation("123456789", true);
  await controller.activate("123456789");
  await controller.observeExternalEvent(messenger.api, {
    type: "event", logMessageType: "log:thread-approval-mode", threadID: "123456789", authorID: "123456",
  });
  time += 31_000;
  await controller.poll();
  assert.equal(messenger.mode, true);
  assert.equal(db.rows.get("123456789").ownership_lost, true);
  assert.equal(db.auditRows.some(row => row.action === "restore_skipped_manual_override"), true);
  controller.stop();
});
