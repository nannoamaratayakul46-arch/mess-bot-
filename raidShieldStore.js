"use strict";

// PostgreSQL persistence for Raid Shield. Uses the application's shared db.query
// interface; this module does not create a second connection pool.
function createRaidShieldStore(db, options = {}) {
  if (!db || typeof db.query !== "function") {
    throw new TypeError("Raid Shield store requires db.query");
  }

  const retentionDays = clamp(options.retentionDays, 1, 30, 7);
  let schemaPromise = null;

  async function ensureTables() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await db.query(`
          CREATE TABLE IF NOT EXISTS raid_shield_state (
            thread_id TEXT PRIMARY KEY,
            score DOUBLE PRECISION NOT NULL DEFAULT 0,
            protection_level TEXT NOT NULL DEFAULT 'normal'
              CHECK (protection_level IN ('normal', 'watch', 'elevated', 'lockdown')),
            lockdown_until TIMESTAMPTZ,
            last_event_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        await db.query(`
          CREATE TABLE IF NOT EXISTS raid_shield_incidents (
            id BIGSERIAL PRIMARY KEY,
            incident_key TEXT NOT NULL,
            thread_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            risk_points INTEGER NOT NULL DEFAULT 0,
            score DOUBLE PRECISION NOT NULL DEFAULT 0,
            severity TEXT NOT NULL DEFAULT 'normal'
              CHECK (severity IN ('normal', 'watch', 'elevated', 'lockdown')),
            status TEXT NOT NULL DEFAULT 'watch',
            evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (thread_id, incident_key)
          )
        `);
        await db.query("CREATE INDEX IF NOT EXISTS idx_raid_shield_incidents_recent ON raid_shield_incidents(thread_id, created_at DESC)");
        await db.query("CREATE INDEX IF NOT EXISTS idx_raid_shield_state_level ON raid_shield_state(protection_level, updated_at DESC)");
      })().catch(error => {
        schemaPromise = null;
        throw error;
      });
    }
    return schemaPromise;
  }

  async function persistIncident(incident) {
    await ensureTables();
    const row = normalizeIncident(incident);
    await db.query(
      `INSERT INTO raid_shield_incidents
        (incident_key, thread_id, event_type, risk_points, score, severity, status, evidence, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::timestamptz)
       ON CONFLICT (thread_id, incident_key) DO NOTHING`,
      [row.id, row.thread_id, row.event_type, row.risk_points, row.score, row.severity, row.status, JSON.stringify(row.evidence), row.created_at],
    );
  }

  async function persistState(state) {
    await ensureTables();
    const row = normalizeState(state);
    await db.query(
      `INSERT INTO raid_shield_state
        (thread_id, score, protection_level, lockdown_until, last_event_at, updated_at)
       VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, NOW())
       ON CONFLICT (thread_id) DO UPDATE SET
         score = EXCLUDED.score,
         protection_level = EXCLUDED.protection_level,
         lockdown_until = EXCLUDED.lockdown_until,
         last_event_at = EXCLUDED.last_event_at,
         updated_at = NOW()`,
      [row.thread_id, row.score, row.protection_level, row.lockdown_until, row.last_event_at],
    );
  }

  async function listIncidents({ threadId, limit = 50, before = null } = {}) {
    await ensureTables();
    const safeLimit = clamp(limit, 1, 100, 50);
    const params = [];
    let where = "";
    if (threadId != null) {
      params.push(cleanId(threadId));
      where = "WHERE thread_id = $1";
    }
    if (before) {
      params.push(before);
      where += where ? " AND created_at < $2::timestamptz" : "WHERE created_at < $1::timestamptz";
    }
    params.push(safeLimit);
    const limitParam = "$" + params.length;
    const { rows } = await db.query(
      `SELECT id, incident_key, thread_id, event_type, risk_points, score, severity, status, evidence, created_at
       FROM raid_shield_incidents ${where}
       ORDER BY created_at DESC LIMIT ${limitParam}`,
      params,
    );
    return rows.map(row => ({
      ...row,
      evidence: sanitizeEvidence(row.evidence),
    }));
  }

  async function listStates({ limit = 100 } = {}) {
    await ensureTables();
    const safeLimit = clamp(limit, 1, 500, 100);
    const { rows } = await db.query(
      "SELECT thread_id, score, protection_level, lockdown_until, last_event_at, updated_at FROM raid_shield_state ORDER BY (lockdown_until > NOW()) DESC NULLS LAST, updated_at DESC LIMIT $1",
      [safeLimit],
    );
    return rows;
  }

  async function loadStates({ limit = 1000 } = {}) {
    await ensureTables();
    const safeLimit = clamp(limit, 1, 1000, 1000);
    const { rows } = await db.query(
      "SELECT thread_id, score, protection_level, lockdown_until, last_event_at, updated_at FROM raid_shield_state ORDER BY updated_at DESC LIMIT $1",
      [safeLimit],
    );
    return rows;
  }

  let approvalSchemaPromise = null;
  async function ensureApprovalTable() {
    if (!approvalSchemaPromise) {
      approvalSchemaPromise = (async () => {
        await ensureTables();
        await db.query(`CREATE TABLE IF NOT EXISTS raid_shield_approval_actions (
      id BIGSERIAL PRIMARY KEY,
      thread_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      action_type TEXT NOT NULL CHECK (action_type IN ('remove_member')),
      reason TEXT NOT NULL DEFAULT 'raid_shield_review',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'failed')),
      proposed_by TEXT NOT NULL DEFAULT 'raid_shield',
      reviewed_by TEXT,
      review_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ
    )`);
        await db.query("CREATE INDEX IF NOT EXISTS idx_raid_shield_actions_pending ON raid_shield_approval_actions(thread_id, status, created_at DESC)");
        // Collapse legacy duplicates once before adding the race-safe partial index.
        await db.query(`DELETE FROM raid_shield_approval_actions older
          USING raid_shield_approval_actions newer
          WHERE older.thread_id = newer.thread_id
            AND older.target_id = newer.target_id
            AND older.status = 'pending' AND newer.status = 'pending'
            AND older.id > newer.id`);
        await db.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_raid_shield_actions_pending_unique ON raid_shield_approval_actions(thread_id, target_id) WHERE status = 'pending'");
      })().catch(error => {
        approvalSchemaPromise = null;
        throw error;
      });
    }
    return approvalSchemaPromise;
  }

  async function proposeAction(action = {}) {
    await ensureApprovalTable();
    const threadId = requiredId(action.thread_id, "thread_id");
    const targetId = requiredId(action.target_id, "target_id");
    const reason = String(action.reason || "raid_shield_review").slice(0, 120);
    const proposedBy = cleanId(action.proposed_by) || "raid_shield";
    const result = await db.query(
      `INSERT INTO raid_shield_approval_actions (thread_id, target_id, action_type, reason, proposed_by)
       SELECT $1, $2, 'remove_member', $3, $4
       ON CONFLICT (thread_id, target_id) WHERE status = 'pending' DO NOTHING
       RETURNING id, thread_id, target_id, action_type, reason, status, proposed_by, created_at`,
      [threadId, targetId, reason, proposedBy],
    );
    return result.rows[0] || null;
  }

  async function listApprovalActions({ threadId, status = "pending", limit = 50 } = {}) {
    await ensureApprovalTable();
    const safeLimit = clamp(limit, 1, 100, 50);
    const params = [];
    let where = "";
    if (threadId) { params.push(cleanId(threadId)); where = "thread_id = $" + params.length; }
    if (["pending", "approved", "rejected", "completed", "failed"].includes(status)) {
      params.push(status); where += (where ? " AND " : "") + "status = $" + params.length;
    }
    params.push(safeLimit);
    const result = await db.query("SELECT id, thread_id, target_id, action_type, reason, status, proposed_by, reviewed_by, review_note, created_at, reviewed_at, completed_at FROM raid_shield_approval_actions " + (where ? "WHERE " + where : "") + " ORDER BY created_at DESC LIMIT $" + params.length, params);
    return result.rows;
  }

  async function reviewApprovalAction({ id, threadId, status, reviewedBy, note = "" } = {}) {
    await ensureApprovalTable();
    if (!["approved", "rejected"].includes(status)) throw new TypeError("status must be approved or rejected");
    const result = await db.query(
      `UPDATE raid_shield_approval_actions SET status=$2, reviewed_by=$3, review_note=$4, reviewed_at=NOW()
       WHERE id=$1 AND thread_id=$5 AND status='pending'
       RETURNING id, thread_id, target_id, action_type, reason, status, proposed_by, reviewed_by, review_note, created_at, reviewed_at`,
      [clamp(id, 1, Number.MAX_SAFE_INTEGER, 0), status, cleanId(reviewedBy) || "dashboard_admin", String(note || "").slice(0, 300), cleanId(threadId)],
    );
    return result.rows[0] || null;
  }

  async function completeApprovalAction(id, success) {
    await ensureApprovalTable();
    const status = success ? "completed" : "failed";
    const result = await db.query("UPDATE raid_shield_approval_actions SET status=$2, completed_at=NOW() WHERE id=$1 AND status='approved' RETURNING id, status", [clamp(id, 1, Number.MAX_SAFE_INTEGER, 0), status]);
    return result.rows[0] || null;
  }

  // Preserve approved status when the external removal outcome cannot be verified.
  // An ambiguous API timeout or a DB failure after removal must never be mislabeled
  // as a definite failure, because that could encourage an unsafe duplicate retry.
  async function markApprovalUncertain(id, note) {
    await ensureApprovalTable();
    const result = await db.query(
      "UPDATE raid_shield_approval_actions SET review_note=$2 WHERE id=$1 AND status='approved' RETURNING id, status, review_note",
      [clamp(id, 1, Number.MAX_SAFE_INTEGER, 0), String(note || "Removal outcome uncertain").slice(0, 300)],
    );
    return result.rows[0] || null;
  }

  async function prune() {
    await ensureTables();
    const { rowCount } = await db.query(
      "DELETE FROM raid_shield_incidents WHERE created_at < NOW() - ($1::integer * INTERVAL '1 day')",
      [retentionDays],
    );
    await db.query(
      "DELETE FROM raid_shield_state WHERE updated_at < NOW() - INTERVAL '30 days' AND (protection_level <> 'lockdown' OR lockdown_until IS NULL OR lockdown_until <= NOW())",
    );
    return { incidentsDeleted: rowCount || 0, retentionDays };
  }

  return { ensureTables, persistIncident, persistState, listIncidents, listStates, loadStates, ensureApprovalTable, proposeAction, listApprovalActions, reviewApprovalAction, completeApprovalAction, markApprovalUncertain, prune };
}

function normalizeIncident(value = {}) {
  const severity = ["normal", "watch", "elevated", "lockdown"].includes(value.severity) ? value.severity : "normal";
  const createdAt = validDate(value.created_at) || new Date().toISOString();
  return {
    id: cleanId(value.id) || "incident-" + createdAt,
    thread_id: requiredId(value.thread_id, "thread_id"),
    event_type: String(value.event_type || "unknown").replace(/[^a-z0-9_-]/gi, "_").slice(0, 60),
    risk_points: clamp(value.risk_points, 0, 10, 0),
    score: finiteNumber(value.score, 0, 30),
    severity,
    status: String(value.status || "watch").slice(0, 40),
    evidence: sanitizeEvidence(value.evidence),
    created_at: createdAt,
  };
}

function normalizeState(value = {}) {
  return {
    thread_id: requiredId(value.thread_id, "thread_id"),
    score: finiteNumber(value.score, 0, 30),
    protection_level: ["normal", "watch", "elevated", "lockdown"].includes(value.protection_level) ? value.protection_level : "normal",
    lockdown_until: validDate(value.lockdown_until),
    last_event_at: validDate(value.last_event_at),
  };
}

function sanitizeEvidence(value) {
  let input = value;
  if (typeof input === "string") {
    try { input = JSON.parse(input); } catch { input = {}; }
  }
  const result = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return result;
  for (const [key, item] of Object.entries(input).slice(0, 12)) {
    if (/body|message|text|cookie|token|password/i.test(key)) continue;
    const safeKey = key.replace(/[^a-z0-9_-]/gi, "_").slice(0, 40);
    if (typeof item === "string") result[safeKey] = item.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 160);
    else if (typeof item === "number" && Number.isFinite(item)) result[safeKey] = item;
    else if (typeof item === "boolean" || item === null) result[safeKey] = item;
  }
  return result;
}

function cleanId(value) { return String(value ?? "").trim().slice(0, 80); }
function requiredId(value, name) {
  const id = cleanId(value);
  if (!id) throw new TypeError(name + " is required");
  return id;
}
function validDate(value) {
  if (value == null || value === "") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function finiteNumber(value, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
}
function clamp(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.trunc(n))) : fallback;
}

module.exports = { createRaidShieldStore, sanitizeEvidence };
