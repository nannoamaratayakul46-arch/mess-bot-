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
      "SELECT thread_id, score, protection_level, lockdown_until, last_event_at, updated_at FROM raid_shield_state ORDER BY updated_at DESC LIMIT $1",
      [safeLimit],
    );
    return rows;
  }

  async function prune() {
    await ensureTables();
    const { rowCount } = await db.query(
      "DELETE FROM raid_shield_incidents WHERE created_at < NOW() - ($1::integer * INTERVAL '1 day')",
      [retentionDays],
    );
    await db.query(
      "DELETE FROM raid_shield_state WHERE updated_at < NOW() - INTERVAL '30 days' AND protection_level <> 'lockdown'",
    );
    return { incidentsDeleted: rowCount || 0, retentionDays };
  }

  return { ensureTables, persistIncident, persistState, listIncidents, listStates, prune };
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
