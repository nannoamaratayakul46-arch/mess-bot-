"use strict";

const db = require("./db");
const { getPublicAiSettings, saveAiSettings, PROVIDERS } = require("./ai/runtime-config");
const { testAiProvider } = require("./ai/provider");

const SENSITIVE_TABLE_RE = /(?:messenger_session_state|eclipse_ai_settings|session|credential|secret|api.?key|token|cookie|auth)/i;
const SENSITIVE_COLUMN_RE = /(?:password|secret|token|cookie|session|credential|api.?key|encrypted|private.?key|auth)/i;
const MAX_ROWS = 50;
const MAX_OFFSET = 5000;
const USAGE_CACHE_MS = 15 * 60 * 1000;
let usageCache = { at: 0, value: null };

function quoteIdentifier(value) {
  return '"' + String(value).replace(/"/g, '""') + '"';
}

function publicError(error) {
  const message = String(error?.message || "");
  if (/ECLIPSE_SETTINGS_ENCRYPTION_KEY/.test(message)) {
    return "Set ECLIPSE_SETTINGS_ENCRYPTION_KEY in the Render environment before saving AI settings.";
  }
  if (/quota|allowance|suspend|exceed/i.test(message)) {
    return "Neon is unavailable or its usage quota is exhausted. Check Neon Billing → Usage; this dashboard cannot restore the quota.";
  }
  return "The database operation failed. Check Neon status and the bot's server logs.";
}

async function getNeonUsage() {
  if (usageCache.value && Date.now() - usageCache.at < USAGE_CACHE_MS) return usageCache.value;
  const apiKey = String(process.env.NEON_API_KEY || "").trim();
  const projectId = String(process.env.NEON_PROJECT_ID || "").trim();
  const orgId = String(process.env.NEON_ORG_ID || "").trim();
  if (!apiKey || !projectId || !orgId) {
    return {
      available: false,
      message: "Billed network-transfer metrics require NEON_API_KEY, NEON_PROJECT_ID, and NEON_ORG_ID in Render.",
    };
  }

  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const params = new URLSearchParams({
    from,
    to: now.toISOString(),
    granularity: "daily",
    org_id: orgId,
    project_ids: projectId,
    metrics: "public_network_transfer_bytes,private_network_transfer_bytes,root_branch_bytes_month,child_branch_bytes_month,compute_unit_seconds",
    limit: "10",
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch("https://console.neon.tech/api/v2/consumption_history/v2/projects?" + params.toString(), {
      headers: { Accept: "application/json", Authorization: "Bearer " + apiKey },
      signal: controller.signal,
    });
    if (!response.ok) {
      const value = { available: false, message: "Neon usage API returned HTTP " + response.status + ". Check API permissions and plan availability." };
      usageCache = { at: Date.now(), value };
      return value;
    }
    const payload = await response.json();
    const totals = {};
    const visit = value => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) { for (const item of value) visit(item); return; }
      if (typeof value.metric_name === "string" && Number.isFinite(Number(value.value))) {
        totals[value.metric_name] = (totals[value.metric_name] || 0) + Number(value.value);
      }
      for (const [key, child] of Object.entries(value)) {
        if (key !== "pagination" && child && typeof child === "object") visit(child);
      }
    };
    visit(payload.projects || payload);
    const value = {
      available: true,
      publicNetworkTransferBytes: totals.public_network_transfer_bytes || 0,
      privateNetworkTransferBytes: totals.private_network_transfer_bytes || 0,
      storageBytesMonth: (totals.root_branch_bytes_month || 0) + (totals.child_branch_bytes_month || 0),
      computeUnitSeconds: totals.compute_unit_seconds || 0,
      granularity: "daily",
      message: "Metrics are from Neon's consumption API and may lag by about 15 minutes.",
    };
    usageCache = { at: Date.now(), value };
    return value;
  } catch {
    const value = { available: false, message: "Neon usage metrics could not be reached. The database health check is independent." };
    usageCache = { at: Date.now(), value };
    return value;
  } finally {
    clearTimeout(timer);
  }
}

async function getDatabaseDiagnostics() {
  const core = await db.query(`
    SELECT
      current_database() AS database,
      current_user AS role,
      NOW() AS checked_at,
      pg_database_size(current_database())::bigint AS database_size_bytes,
      (SELECT COUNT(*)::int FROM pg_stat_activity WHERE datname = current_database()) AS active_connections,
      current_setting('max_connections')::int AS max_connections,
      (SELECT COUNT(*)::int FROM pg_stat_user_tables) AS table_count
  `);
  const tables = await db.query(`
    SELECT schemaname AS schema, relname AS table,
      pg_total_relation_size(relid)::bigint AS total_size_bytes,
      COALESCE(n_live_tup, 0)::bigint AS estimated_rows
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(relid) DESC
    LIMIT 10
  `);
  return { ...core.rows[0], largest_tables: tables.rows };
}

function registerDatabaseAiCenterRoutes(app, auth) {
  if (!app || typeof app.get !== "function" || typeof app.post !== "function") throw new TypeError("An Express app is required.");
  if (typeof auth !== "function") throw new TypeError("Dashboard authentication middleware is required.");

  app.get("/api/dashboard/ai-settings", auth, async (_req, res) => {
    try {
      return res.json({ ok: true, settings: await getPublicAiSettings(), providers: Object.keys(PROVIDERS) });
    } catch (error) {
      return res.status(503).json({ ok: false, error: publicError(error) });
    }
  });

  app.post("/api/dashboard/ai-settings", auth, async (req, res) => {
    try {
      const settings = await saveAiSettings(req.body || {});
      console.log("[DASHBOARD AI] Settings updated:", JSON.stringify({
        enabled: settings.enabled,
        activeProvider: settings.activeProvider,
        providersConfigured: Object.entries(settings.providers).filter(([, value]) => value.configured).map(([name]) => name),
      }));
      return res.json({ ok: true, settings });
    } catch (error) {
      const validation = /Choose a supported|must be a boolean|Model must|API key has/.test(String(error?.message || ""));
      return res.status(validation ? 400 : 503).json({ ok: false, error: validation ? error.message : publicError(error) });
    }
  });

  app.post("/api/dashboard/ai-settings/test", auth, async (_req, res) => {
    try {
      await testAiProvider();
      return res.json({ ok: true, message: "The selected AI provider responded successfully." });
    } catch (error) {
      const status = error?.status === 401 || error?.status === 403 ? 502 : 503;
      return res.status(status).json({ ok: false, error: String(error?.message || "Provider test failed.").slice(0, 240) });
    }
  });

  app.get("/api/dashboard/database/overview", auth, async (_req, res) => {
    let diagnostics = null;
    let databaseError = null;
    try { diagnostics = await getDatabaseDiagnostics(); }
    catch (error) { databaseError = publicError(error); }
    const usage = await getNeonUsage();
    return res.json({
      ok: true,
      database: diagnostics ? { reachable: true, ...diagnostics } : { reachable: false, error: databaseError },
      usage,
      checked_at: new Date().toISOString(),
    });
  });

  app.get("/api/dashboard/database/diagnostics", auth, async (_req, res) => {
    try {
      const diagnostics = await getDatabaseDiagnostics();
      const usage = await getNeonUsage();
      return res.json({ ok: true, diagnostics, usage, checked_at: new Date().toISOString() });
    } catch (error) {
      return res.status(503).json({ ok: false, error: publicError(error), usage: await getNeonUsage() });
    }
  });

  app.get("/api/dashboard/database/tables", auth, async (_req, res) => {
    try {
      const result = await db.query(`
        SELECT t.table_name AS name,
          COALESCE(s.n_live_tup, 0)::bigint AS estimated_rows,
          COALESCE(pg_total_relation_size(quote_ident(t.table_schema) || '.' || quote_ident(t.table_name)), 0)::bigint AS total_size_bytes
        FROM information_schema.tables t
        LEFT JOIN pg_stat_user_tables s ON s.schemaname = t.table_schema AND s.relname = t.table_name
        WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name
      `);
      return res.json({
        ok: true,
        tables: result.rows.map(row => ({ ...row, restricted: SENSITIVE_TABLE_RE.test(row.name) })),
      });
    } catch (error) {
      return res.status(503).json({ ok: false, error: publicError(error) });
    }
  });

  app.get("/api/dashboard/database/tables/:table/rows", auth, async (req, res) => {
    const tableName = String(req.params.table || "").trim();
    const limit = Math.max(1, Math.min(MAX_ROWS, Number.parseInt(req.query.limit, 10) || 25));
    const offset = Math.max(0, Math.min(MAX_OFFSET, Number.parseInt(req.query.offset, 10) || 0));
    if (!/^[a-zA-Z_][a-zA-Z0-9_$]{0,62}$/.test(tableName)) {
      return res.status(400).json({ ok: false, error: "Invalid table name." });
    }
    if (SENSITIVE_TABLE_RE.test(tableName)) {
      return res.status(403).json({ ok: false, error: "This table is restricted because it may contain credentials, encrypted session data, or private settings." });
    }
    try {
      const table = await db.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name = $1 LIMIT 1",
        [tableName]
      );
      if (!table.rows?.length) return res.status(404).json({ ok: false, error: "Table not found in the public schema." });

      const columnsResult = await db.query(
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
        [tableName]
      );
      const columns = columnsResult.rows;
      if (!columns.length) return res.status(404).json({ ok: false, error: "No readable columns were found." });
      const projection = columns.map(column => SENSITIVE_COLUMN_RE.test(column.column_name)
        ? "'[REDACTED]'::text AS " + quoteIdentifier(column.column_name)
        : quoteIdentifier(column.column_name)).join(", ");
      const rows = await db.query(
        "SELECT " + projection + " FROM " + quoteIdentifier(tableName) + " LIMIT $1 OFFSET $2",
        [limit, offset]
      );
      const count = await db.query("SELECT COUNT(*)::bigint AS total FROM " + quoteIdentifier(tableName));
      return res.json({
        ok: true,
        table: tableName,
        columns: columns.map(column => ({ name: column.column_name, type: column.data_type, redacted: SENSITIVE_COLUMN_RE.test(column.column_name) })),
        rows: rows.rows,
        limit,
        offset,
        total: Number(count.rows?.[0]?.total || 0),
      });
    } catch (error) {
      return res.status(503).json({ ok: false, error: publicError(error) });
    }
  });
}

module.exports = { registerDatabaseAiCenterRoutes, getDatabaseDiagnostics, getNeonUsage };
