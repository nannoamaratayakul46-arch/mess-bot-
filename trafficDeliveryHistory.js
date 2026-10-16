"use strict";

// Persistent, bounded delivery telemetry. Never store message bodies, recipient IDs,
// raw exception messages, request objects, or attachment contents.
const db = require("./db");

const TABLE = "eclipse_traffic_delivery_history";
const RETENTION_DAYS = 7;
const MAX_ROWS = 5000;
const MAX_BUFFER = 1000;
const FLUSH_INTERVAL_MS = 5000;
const SUMMARY_REFRESH_INTERVAL_MS = 60_000;
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000;

let pending = [];
let tablePromise = null;
let flushPromise = null;
let lastCleanupAt = 0;
let lastSummary = null;
let lastSummaryAt = 0;

function safeCode(value) {
  const text = String(value || "SEND_FAILED").toUpperCase().replace(/[^A-Z0-9_.:-]/g, "_").slice(0, 80);
  return text || "SEND_FAILED";
}

function record(outcome, job, code = null) {
  if (outcome !== "sent" && outcome !== "failed") return;
  const now = Date.now();
  pending.push({
    at: new Date(now).toISOString(),
    outcome,
    code: outcome === "failed" ? safeCode(code) : null,
    elapsed_ms: Math.min(86_400_000, Math.max(0, now - Number(job && job.enqueuedAt || now))),
    attachment: Boolean(job && job.message && typeof job.message === "object" && job.message.attachment),
  });
  if (pending.length > MAX_BUFFER) pending.splice(0, pending.length - MAX_BUFFER);
}

async function ensureTable() {
  if (!tablePromise) {
    tablePromise = db.query(
      "CREATE TABLE IF NOT EXISTS " + TABLE + " (" +
      "id BIGSERIAL PRIMARY KEY, " +
      "occurred_at TIMESTAMPTZ NOT NULL, " +
      "outcome TEXT NOT NULL CHECK (outcome IN ('sent', 'failed')), " +
      "failure_code TEXT, " +
      "elapsed_ms INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_ms >= 0), " +
      "attachment BOOLEAN NOT NULL DEFAULT FALSE" +
      ")"
    ).then(async () => {
      await db.query("CREATE INDEX IF NOT EXISTS eclipse_traffic_delivery_history_time_idx ON " + TABLE + " (occurred_at DESC)");
      await db.query("CREATE INDEX IF NOT EXISTS eclipse_traffic_delivery_history_failure_idx ON " + TABLE + " (outcome, failure_code, occurred_at DESC)");
    }).catch((error) => {
      tablePromise = null;
      throw error;
    });
  }
  return tablePromise;
}

async function cleanupIfDue() {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  await db.query("DELETE FROM " + TABLE + " WHERE occurred_at < NOW() - ($1::text || ' days')::interval", [String(RETENTION_DAYS)]);
  await db.query(
    "DELETE FROM " + TABLE + " WHERE id IN (" +
    "SELECT id FROM " + TABLE + " ORDER BY id DESC OFFSET $1" +
    ")",
    [MAX_ROWS]
  );
}

async function flush() {
  if (flushPromise) return flushPromise;
  if (!pending.length) return;
  const batch = pending.splice(0, Math.min(pending.length, 500));
  flushPromise = (async () => {
    try {
      await ensureTable();
      await db.query(
        "INSERT INTO " + TABLE + " (occurred_at, outcome, failure_code, elapsed_ms, attachment) " +
        "SELECT item.at::timestamptz, item.outcome, item.code, item.elapsed_ms, item.attachment " +
        "FROM jsonb_to_recordset($1::jsonb) AS item(at text, outcome text, code text, elapsed_ms integer, attachment boolean)",
        [JSON.stringify(batch)]
      );
      await cleanupIfDue();
    } catch (error) {
      pending = batch.concat(pending).slice(-MAX_BUFFER);
      throw error;
    } finally {
      flushPromise = null;
    }
  })();
  return flushPromise;
}

function emptyHourly(hours) {
  const now = Date.now();
  const currentHour = Math.floor(now / 3_600_000) * 3_600_000;
  return Array.from({ length: hours }, (_, index) => ({
    hour: new Date(currentHour - (hours - index - 1) * 3_600_000).toISOString(),
    sent: 0, failed: 0, avgLatencyMs: 0,
  }));
}

async function getAnalytics(hours = 24, lifetime = {}) {
  const boundedHours = Math.min(24, Math.max(1, Number.parseInt(String(hours), 10) || 24));
  await flush();
  await ensureTable();
  const [totalsResult, hourlyResult, codesResult, latestResult] = await Promise.all([
    db.query(
      "SELECT COUNT(*) FILTER (WHERE outcome = 'sent')::int AS sent, " +
      "COUNT(*) FILTER (WHERE outcome = 'failed')::int AS failed, " +
      "COALESCE(ROUND(AVG(elapsed_ms))::int, 0) AS avg_latency_ms, COUNT(*)::int AS sample_count " +
      "FROM " + TABLE + " WHERE occurred_at >= NOW() - ($1::text || ' hours')::interval AND occurred_at <= NOW()",
      [String(boundedHours)]
    ),
    db.query(
      "SELECT date_trunc('hour', occurred_at) AS hour, " +
      "COUNT(*) FILTER (WHERE outcome = 'sent')::int AS sent, " +
      "COUNT(*) FILTER (WHERE outcome = 'failed')::int AS failed, " +
      "COALESCE(ROUND(AVG(elapsed_ms))::int, 0) AS avg_latency_ms " +
      "FROM " + TABLE + " WHERE occurred_at >= NOW() - ($1::text || ' hours')::interval AND occurred_at <= NOW() " +
      "GROUP BY 1 ORDER BY 1",
      [String(boundedHours)]
    ),
    db.query(
      "SELECT COALESCE(failure_code, 'SEND_FAILED') AS code, COUNT(*)::int AS count " +
      "FROM " + TABLE + " WHERE outcome = 'failed' AND occurred_at >= NOW() - ($1::text || ' hours')::interval " +
      "GROUP BY 1 ORDER BY count DESC, code ASC LIMIT 20",
      [String(boundedHours)]
    ),
    db.query(
      "SELECT occurred_at AS at, COALESCE(failure_code, 'SEND_FAILED') AS code, elapsed_ms, attachment " +
      "FROM " + TABLE + " WHERE outcome = 'failed' AND occurred_at >= NOW() - ($1::text || ' hours')::interval " +
      "ORDER BY occurred_at DESC LIMIT 10",
      [String(boundedHours)]
    ),
  ]);
  const totals = totalsResult.rows[0] || {};
  const hourly = emptyHourly(boundedHours);
  const bucketMap = new Map(hourly.map((row) => [Date.parse(row.hour), row]));
  for (const row of hourlyResult.rows || []) {
    const target = bucketMap.get(Date.parse(row.hour));
    if (!target) continue;
    target.sent = Number(row.sent) || 0;
    target.failed = Number(row.failed) || 0;
    target.avgLatencyMs = Number(row.avg_latency_ms) || 0;
  }
  const sent = Number(totals.sent) || 0;
  const failed = Number(totals.failed) || 0;
  const total = sent + failed;
  const lastFailureRow = (latestResult.rows || [])[0];
  const analytics = {
    generated_at: new Date().toISOString(),
    available: true,
    source: "postgresql",
    hours: boundedHours,
    retention_hours: RETENTION_DAYS * 24,
    retention_limit: MAX_ROWS,
    sample_count: Number(totals.sample_count) || 0,
    sent,
    failed,
    success_rate: total ? Math.round((sent / total) * 1000) / 10 : null,
    avg_latency_ms: Number(totals.avg_latency_ms) || 0,
    lifetime: { sent: Number(lifetime.sent) || 0, failed: Number(lifetime.failed) || 0 },
    failure_codes: Object.fromEntries((codesResult.rows || []).map((row) => [row.code, Number(row.count) || 0])),
    last_failure: lastFailureRow ? { at: new Date(lastFailureRow.at).toISOString(), code: lastFailureRow.code, elapsed_ms: Number(lastFailureRow.elapsed_ms) || 0, attachment: Boolean(lastFailureRow.attachment) } : null,
    recent_failures: (latestResult.rows || []).map((row) => ({ at: new Date(row.at).toISOString(), code: row.code, elapsed_ms: Number(row.elapsed_ms) || 0, attachment: Boolean(row.attachment) })),
    hourly,
    note: "Persistent PostgreSQL history, retained for up to 7 days and capped at 5,000 outcomes. High-volume periods may be capped.",
  };
  lastSummary = analytics;
  lastSummaryAt = Date.now();
  return analytics;
}

function getCachedSummary() {
  if (!lastSummary || Date.now() - lastSummaryAt > 120_000) return null;
  return lastSummary;
}

const timer = setInterval(() => {
  flush().catch((error) => {
    // Database may be temporarily unavailable during startup; buffered data is retried.
    if (process.env.NODE_ENV !== "test") console.warn("[TRAFFIC HISTORY] Persistent delivery history flush deferred; PostgreSQL may be unavailable.");
  });
}, FLUSH_INTERVAL_MS);
timer.unref && timer.unref();

const summaryTimer = setInterval(() => {
  getAnalytics(24).catch(() => {
    // Summary stays explicitly unavailable until PostgreSQL responds.
  });
}, SUMMARY_REFRESH_INTERVAL_MS);
summaryTimer.unref && summaryTimer.unref();

module.exports = { record, flush, getAnalytics, getCachedSummary };
