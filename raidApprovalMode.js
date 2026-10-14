"use strict";

// Per-group automatic Messenger join-approval controller.
// The controller fails closed unless the installed FCA API exposes both
// getThreadInfo() (to read the actual setting) and changeThreadApprovalMode()
// (to change it). It never guesses a setting from Raid Shield's internal score.
function createRaidApprovalMode(options = {}) {
  const db = options.db;
  if (!db || typeof db.query !== "function") throw new TypeError("Raid approval mode requires db.query");
  const getApi = typeof options.getApi === "function" ? options.getApi : () => null;
  const log = typeof options.log === "function" ? options.log : () => {};
  const now = typeof options.now === "function" ? options.now : Date.now;
  const quietMs = clamp(options.quietMs, 30_000, 30 * 60_000, 120_000);
  const pollMs = clamp(options.pollMs, 5_000, 120_000, 15_000);
  let schemaPromise = null;
  const locks = new Map();

  async function ensureTables() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await db.query(`
          CREATE TABLE IF NOT EXISTS raid_shield_approval_mode (
            thread_id TEXT PRIMARY KEY,
            automation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            automation_active BOOLEAN NOT NULL DEFAULT FALSE,
            previous_approval_mode BOOLEAN,
            ownership_lost BOOLEAN NOT NULL DEFAULT FALSE,
            last_join_at TIMESTAMPTZ,
            restore_after TIMESTAMPTZ,
            last_action TEXT NOT NULL DEFAULT 'created',
            last_error TEXT,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        await db.query(`
          CREATE TABLE IF NOT EXISTS raid_shield_approval_mode_audit (
            id BIGSERIAL PRIMARY KEY,
            thread_id TEXT NOT NULL,
            action TEXT NOT NULL,
            actor TEXT NOT NULL DEFAULT 'system',
            details JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        await db.query("CREATE INDEX IF NOT EXISTS idx_raid_approval_audit_recent ON raid_shield_approval_mode_audit(thread_id, created_at DESC)");
      })().catch(error => { schemaPromise = null; throw error; });
    }
    return schemaPromise;
  }

  async function audit(threadId, action, details = {}, actor = "system") {
    await ensureTables();
    await db.query(
      "INSERT INTO raid_shield_approval_mode_audit(thread_id, action, actor, details) VALUES($1,$2,$3,$4::jsonb)",
      [cleanId(threadId), String(action).slice(0, 80), String(actor).slice(0, 80), JSON.stringify(sanitizeDetails(details))],
    );
  }

  async function ensureRow(threadId) {
    await ensureTables();
    const id = cleanId(threadId);
    if (!/^\d{6,32}$/.test(id)) throw new TypeError("A valid numeric group ID is required");
    await db.query("INSERT INTO raid_shield_approval_mode(thread_id) VALUES($1) ON CONFLICT(thread_id) DO NOTHING", [id]);
    const result = await db.query("SELECT * FROM raid_shield_approval_mode WHERE thread_id=$1", [id]);
    return result.rows?.[0] || null;
  }

  async function save(threadId, patch) {
    await ensureTables();
    const fields = Object.keys(patch);
    const allowed = new Set(["automation_enabled", "automation_active", "previous_approval_mode", "ownership_lost", "last_join_at", "restore_after", "last_action", "last_error"]);
    if (!fields.length || fields.some(field => !allowed.has(field))) throw new TypeError("Invalid approval-mode state patch");
    const params = [cleanId(threadId)];
    const sets = fields.map((field, i) => {
      params.push(patch[field]);
      return field + "=$" + (i + 2);
    });
    sets.push("updated_at=NOW()");
    await db.query("UPDATE raid_shield_approval_mode SET " + sets.join(", ") + " WHERE thread_id=$1", params);
  }

  function supportedApi(api) {
    return Boolean(api && typeof api.changeThreadApprovalMode === "function" &&
      (typeof api.getThreadInfo === "function" || typeof api.getThreadList === "function"));
  }

  async function callApi(api, method, args, timeoutMs = 12_000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => finish(new Error("Messenger " + method + " timed out")), timeoutMs);
      timer.unref?.();
      function finish(error, value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        error ? reject(error) : resolve(value);
      }
      let result;
      try {
        result = api[method](...args, (error, value) => finish(error, value));
      } catch (error) {
        finish(error);
        return;
      }
      if (result && typeof result.then === "function") {
        result.then(value => {
          if (value != null || method !== "getThreadInfo") finish(null, value);
        }, error => finish(error));
      }
    });
  }

  async function readMode(api, threadId) {
    let lastError = null;
    if (typeof api?.getThreadInfo === "function") {
      try {
        const info = await callApi(api, "getThreadInfo", [threadId]);
        const mode = info?.approvalMode ?? info?.approval_mode;
        if (typeof mode === "boolean") return mode;
        lastError = new Error("getThreadInfo did not return a boolean approvalMode");
      } catch (error) {
        lastError = error;
      }
    }
    // Some ws3-fca deployments have unreliable per-thread lookups. The thread
    // list is an explicitly checked fallback; never assume a missing field.
    if (typeof api?.getThreadList === "function") {
      try {
        const threads = await callApi(api, "getThreadList", [1000, null, []]);
        const info = Array.isArray(threads) ? threads.find(item =>
          String(item?.threadID ?? item?.threadId ?? item?.thread_id ?? "") === String(threadId)
        ) : null;
        const mode = info?.approvalMode ?? info?.approval_mode;
        if (typeof mode === "boolean") return mode;
        lastError = new Error("getThreadList did not return a boolean approvalMode for this group");
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(String(lastError?.message || "Messenger did not return a verified approvalMode"));
  }

  async function changeMode(api, threadId, enabled) {
    if (!supportedApi(api)) throw new Error("Installed ws3-fca does not expose the required approval-mode read/write methods");
    await callApi(api, "changeThreadApprovalMode", [threadId, Boolean(enabled)]);
  }

  async function setAutomation(threadId, enabled, actor = "authenticated_dashboard") {
    const id = cleanId(threadId);
    return withLock(id, async () => {
      const row = await ensureRow(id);
      await save(id, { automation_enabled: Boolean(enabled), last_action: enabled ? "automation_enabled" : "automation_disabled", last_error: null });
      await audit(id, enabled ? "automation_enabled" : "automation_disabled", { previous_enabled: row?.automation_enabled === true, active: row?.automation_active === true }, actor);
      log("[AUTOMOD-RAID] join-approval automation " + (enabled ? "enabled" : "disabled") + " for group " + id);
      if (!enabled && row?.automation_active === true) {
        await restore(id, "dashboard_disabled");
      }
      return getStatus(id);
    });
  }

  async function noteJoin(threadId) {
    const id = cleanId(threadId);
    if (!/^\d{6,32}$/.test(id)) return;
    await ensureRow(id);
    const result = await db.query(
      "UPDATE raid_shield_approval_mode SET last_join_at=NOW(), restore_after=CASE WHEN automation_active THEN NOW() + ($2::bigint * INTERVAL '1 millisecond') ELSE restore_after END, updated_at=NOW() WHERE thread_id=$1 AND automation_enabled=TRUE RETURNING automation_active",
      [id, quietMs],
    );
    if (result.rows?.[0]?.automation_active) {
      // Joining activity extends the quiet period without writing one audit row per person.
      await db.query("UPDATE raid_shield_approval_mode SET last_action='join_activity_seen' WHERE thread_id=$1", [id]);
    }
  }

  async function activate(threadId, reason = "join_burst") {
    const id = cleanId(threadId);
    return withLock(id, async () => {
      const row = await ensureRow(id);
      if (row?.automation_enabled !== true) return { ok: false, skipped: "automation_disabled" };
      const api = getApi();
      if (!api || !supportedApi(api)) {
        const unsupported = Boolean(api);
        const message = unsupported
          ? "Approval mode unsupported: this ws3-fca runtime must expose getThreadInfo and changeThreadApprovalMode"
          : "Messenger API is not connected; approval mode was not changed";
        const action = unsupported ? "api_unsupported" : "api_unavailable";
        await save(id, { last_action: action, last_error: message });
        await audit(id, action, { reason }, "system");
        log("[AUTOMOD-RAID] " + message + " for group " + id);
        return { ok: false, error: message };
      }
      let current;
      try {
        current = await readMode(api, id);
      } catch (error) {
        const message = String(error?.message || error).slice(0, 180);
        await save(id, { last_action: "read_failed", last_error: message });
        await audit(id, "approval_mode_read_failed", { reason, error: message });
        log("[AUTOMOD-RAID] could not read Messenger approval mode for group " + id + ": " + message);
        return { ok: false, error: message };
      }
      if (current === true) {
        // It was already enabled, so this automation does not own it and must not disable it later.
        await save(id, { automation_active: false, previous_approval_mode: null, ownership_lost: false, last_join_at: new Date(now()).toISOString(), restore_after: null, last_action: "already_enabled_externally", last_error: null });
        await audit(id, "approval_already_enabled", { reason, changed_by_automation: false });
        return { ok: true, alreadyEnabled: true };
      }
      const at = now();
      const restoreAfter = new Date(at + quietMs).toISOString();
      // Persist ownership and the restore deadline before the external write.
      // If the process crashes or times out after Messenger applies the change,
      // the next poll can reconcile the real mode instead of losing ownership.
      await save(id, { automation_active: true, previous_approval_mode: false, ownership_lost: false, last_join_at: new Date(at).toISOString(), restore_after: restoreAfter, last_action: "enable_requested", last_error: null });
      await audit(id, "approval_enable_requested", { reason, previous_approval_mode: false, restore_after: restoreAfter });
      try {
        await changeMode(api, id, true);
        await save(id, { last_action: "enabled_by_automation", last_error: null });
        await audit(id, "approval_enabled_by_automation", { reason, previous_approval_mode: false, restore_after: restoreAfter });
        log("[AUTOMOD-RAID] Messenger join approval enabled for group " + id + "; restore after " + quietMs + "ms without joins");
        return { ok: true, enabled: true };
      } catch (error) {
        const message = String(error?.message || error).slice(0, 180);
        // The write may have succeeded remotely even if the callback timed out.
        // Keep ownership/deadline so the restore sweep can read the actual mode.
        await save(id, { last_action: "enable_outcome_uncertain", last_error: message });
        await audit(id, "approval_enable_outcome_uncertain", { reason, error: message });
        log("[AUTOMOD-RAID] Messenger join-approval enable outcome uncertain for group " + id + ": " + message);
        return { ok: false, error: message, uncertain: true };
      }
    });
  }

  async function restore(threadId, reason = "quiet_period_elapsed") {
    const id = cleanId(threadId);
    const row = await ensureRow(id);
    if (row?.automation_active !== true) return { ok: true, skipped: "not_owned" };
    if (row?.ownership_lost === true) {
      await save(id, { automation_active: false, previous_approval_mode: null, restore_after: null, last_action: "manual_override_preserved", last_error: null });
      await audit(id, "restore_skipped_manual_override", { reason });
      return { ok: true, skipped: "manual_override" };
    }
    if (row?.previous_approval_mode !== false) {
      await save(id, { automation_active: false, previous_approval_mode: null, restore_after: null, last_action: "restore_skipped_unknown_previous_mode", last_error: "Previous approval mode was not confirmed OFF" });
      await audit(id, "restore_skipped_unknown_previous_mode", { reason });
      return { ok: false, skipped: "unknown_previous_mode" };
    }
    const api = getApi();
    if (!supportedApi(api)) {
      const message = "Approval-mode API unavailable; keeping restore pending";
      await save(id, { last_action: "restore_waiting_for_api", last_error: message });
      return { ok: false, error: message };
    }
    try {
      const current = await readMode(api, id);
      if (current !== true) {
        await save(id, { automation_active: false, previous_approval_mode: null, restore_after: null, last_action: "approval_already_off", last_error: null });
        await audit(id, "restore_noop_already_off", { reason });
        return { ok: true, alreadyOff: true };
      }
      await changeMode(api, id, false);
      await save(id, { automation_active: false, previous_approval_mode: null, ownership_lost: false, restore_after: null, last_action: "approval_restored_off", last_error: null });
      await audit(id, "approval_restored_off", { reason, restored_to_previous: true, restored_mode: false });
      log("[AUTOMOD-RAID] restored Messenger join approval to its pre-raid OFF state for group " + id);
      return { ok: true, restored: true };
    } catch (error) {
      const message = String(error?.message || error).slice(0, 180);
      await save(id, { last_action: "restore_failed", last_error: message });
      await audit(id, "approval_restore_failed", { reason, error: message });
      log("[AUTOMOD-RAID] could not restore Messenger join approval for group " + id + ": " + message);
      return { ok: false, error: message };
    }
  }

  async function observeExternalEvent(api, event) {
    if (event?.type !== "event") return;
    const eventName = String(event?.logMessageType || event?.type || "").toLowerCase();
    if (!eventName.includes("approval")) return;
    const id = cleanId(event?.threadID);
    if (!/^\d{6,32}$/.test(id)) return;
    const actorRaw = event?.author ?? event?.authorID ?? event?.senderID;
    const actor = String(actorRaw && typeof actorRaw === "object" ? actorRaw.id ?? actorRaw.userID ?? "" : actorRaw ?? "").trim();
    const botId = String(typeof api?.getCurrentUserID === "function" ? api.getCurrentUserID() : "").trim();
    if (!actor || (botId && actor === botId)) return;
    const row = await ensureRow(id);
    if (row?.automation_active !== true) return;
    await save(id, { ownership_lost: true, last_action: "manual_approval_mode_change", last_error: null });
    await audit(id, "manual_approval_mode_change_detected", { actor_present: true, actor_is_bot: false, automation_will_not_restore: true });
    log("[AUTOMOD-RAID] detected a non-bot approval-mode change in group " + id + "; automatic restore will not override it");
  }

  async function getStatus(threadId) {
    const row = await ensureRow(threadId);
    const api = getApi();
    return {
      thread_id: cleanId(threadId),
      enabled: row?.automation_enabled === true,
      automation_active: row?.automation_active === true,
      ownership_lost: row?.ownership_lost === true,
      last_join_at: row?.last_join_at || null,
      restore_after: row?.restore_after || null,
      last_action: row?.last_action || "created",
      last_error: row?.last_error || null,
      api_available: Boolean(api),
      api_supported: api ? supportedApi(api) : null,
      quiet_period_ms: quietMs,
    };
  }

  async function poll() {
    try {
      await ensureTables();
      const result = await db.query(
        "SELECT thread_id, automation_enabled, automation_active, ownership_lost, restore_after, last_action, updated_at FROM raid_shield_approval_mode WHERE automation_active=TRUE LIMIT 1000",
      );
      for (const row of result.rows || []) {
        const lastAttemptAt = row.updated_at ? new Date(row.updated_at).getTime() : 0;
        const recentRestoreFailure = ["restore_waiting_for_api", "restore_failed"].includes(String(row.last_action || "")) &&
          lastAttemptAt > 0 && now() - lastAttemptAt < 60_000;
        const restoreDue = !row.automation_enabled || !row.restore_after || new Date(row.restore_after).getTime() <= now();
        if (row.ownership_lost === true || (restoreDue && !recentRestoreFailure)) {
          const reason = row.ownership_lost ? "manual_override" : row.automation_enabled ? "quiet_period_elapsed" : "dashboard_disabled";
          await withLock(cleanId(row.thread_id), () => restore(cleanId(row.thread_id), reason));
        }
      }
    } catch (error) {
      log("[AUTOMOD-RAID] approval-mode restore sweep failed: " + String(error?.message || error).slice(0, 140));
    }
  }

  function withLock(id, fn) {
    const previous = locks.get(id) || Promise.resolve();
    const next = previous.catch(() => {}).then(fn);
    locks.set(id, next);
    return next.finally(() => { if (locks.get(id) === next) locks.delete(id); });
  }

  const timer = setInterval(() => { void poll(); }, pollMs);
  timer.unref?.();

  return { ensureTables, setAutomation, noteJoin, activate, restore, observeExternalEvent, getStatus, poll, stop: () => clearInterval(timer) };
}

function cleanId(value) { return String(value ?? "").trim().slice(0, 80); }
function clamp(value, min, max, fallback) { const n = Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.trunc(n))) : fallback; }
function sanitizeDetails(value) {
  const result = {};
  for (const [key, item] of Object.entries(value || {}).slice(0, 20)) {
    if (/cookie|password|token|message.?body|session/i.test(key)) continue;
    if (item == null || ["string", "number", "boolean"].includes(typeof item)) result[key] = typeof item === "string" ? item.slice(0, 300) : item;
  }
  return result;
}

module.exports = { createRaidApprovalMode };
