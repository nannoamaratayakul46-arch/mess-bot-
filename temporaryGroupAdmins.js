"use strict";

// Temporary GC administrator policy. Dashboard access is restricted by the
// existing dashboard auth middleware; all state is persisted in PostgreSQL.
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
const KICK_LIMIT = 3;
const KICK_WINDOW_MS = 60_000;

function policyFor(role, expiresAt, now = Date.now()) {
  if (role !== "temporary" || !Number.isFinite(Date.parse(expiresAt || "")) || Date.parse(expiresAt) <= now) {
    return { active: false, canBan: false, canKick: false, canWarn: false, canReportSpam: false, canMassAction: false, canChangeRoles: false };
  }
  return { active: true, canBan: false, canKick: true, canWarn: true, canReportSpam: true, canMassAction: false, canChangeRoles: false };
}

function registerTemporaryAdminRoutes(app, { auth, db, isKnownGroup = () => false, audit = () => {} }) {
  if (!app || typeof app.get !== "function" || typeof app.post !== "function" || typeof app.delete !== "function") throw new TypeError("Express app required");
  if (typeof auth !== "function" || !db || typeof db.query !== "function") throw new TypeError("Dashboard auth and PostgreSQL db.query are required");

  const init = db.query(`
    CREATE TABLE IF NOT EXISTS dashboard_temp_admins (
      thread_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      granted_by TEXT NOT NULL DEFAULT 'dashboard-admin',
      granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','demoted')),
      reason TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (thread_id, user_id)
    )
  `);

  app.get("/api/dashboard/groups/:threadId/temp-admins", auth, async (req, res) => {
    try {
      await init;
      const threadId = String(req.params.threadId || "").trim();
      if (!/^\d{6,32}$/.test(threadId)) return res.status(400).json({ ok: false, error: "Invalid Messenger group ID." });
      if (!isKnownGroup(threadId)) return res.status(404).json({ ok: false, error: "Unknown group. Refresh groups first." });
      const result = await db.query(`SELECT thread_id, user_id, granted_by, granted_at, expires_at, status, reason,
        (status = 'active' AND expires_at > NOW()) AS active
        FROM dashboard_temp_admins WHERE thread_id = $1 ORDER BY granted_at DESC LIMIT 200`, [threadId]);
      return res.json({ ok: true, policy: { probation_days: 5, ban: "none", kick: "limited", warnings: true, spam_reports: true, mass_actions: "approval", sensitive_role_changes: "approval" }, admins: result.rows });
    } catch (error) {
      console.error("[TEMP ADMIN] list failed:", error);
      return res.status(500).json({ ok: false, error: "Could not load temporary administrators." });
    }
  });

  app.post("/api/dashboard/groups/:threadId/temp-admins", auth, async (req, res) => {
    try {
      await init;
      const threadId = String(req.params.threadId || "").trim();
      const userId = String(req.body?.user_id ?? req.body?.userId ?? "").trim();
      const reason = String(req.body?.reason || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 200);
      if (!/^\d{6,32}$/.test(threadId) || !/^\d{6,20}$/.test(userId)) return res.status(400).json({ ok: false, error: "Enter valid numeric group and member IDs." });
      if (!isKnownGroup(threadId)) return res.status(404).json({ ok: false, error: "Unknown group. Refresh groups first." });
      const result = await db.query(`INSERT INTO dashboard_temp_admins (thread_id,user_id,granted_by,granted_at,expires_at,status,reason)
        VALUES ($1,$2,'dashboard-admin',NOW(),NOW() + INTERVAL '5 days','active',$3)
        ON CONFLICT (thread_id,user_id) DO UPDATE SET granted_by='dashboard-admin', granted_at=NOW(),
        expires_at=NOW() + INTERVAL '5 days', status='active', reason=EXCLUDED.reason
        RETURNING thread_id,user_id,granted_by,granted_at,expires_at,status,reason`, [threadId,userId,reason]);
      audit("[TEMP ADMIN] " + JSON.stringify({ action: "grant", threadId, userId, expiresAt: result.rows[0].expires_at }));
      return res.status(201).json({ ok: true, admin: result.rows[0], message: "Temporary grant recorded for five days." });
    } catch (error) {
      console.error("[TEMP ADMIN] grant failed:", error);
      return res.status(500).json({ ok: false, error: "Could not save temporary administrator." });
    }
  });

  app.delete("/api/dashboard/groups/:threadId/temp-admins/:userId", auth, async (req, res) => {
    try {
      await init;
      const threadId = String(req.params.threadId || "").trim();
      const userId = String(req.params.userId || "").trim();
      if (!/^\d{6,32}$/.test(threadId) || !/^\d{6,20}$/.test(userId)) return res.status(400).json({ ok: false, error: "Invalid group or member ID." });
      if (!isKnownGroup(threadId)) return res.status(404).json({ ok: false, error: "Unknown group. Refresh groups first." });
      const result = await db.query(`UPDATE dashboard_temp_admins SET status='revoked'
        WHERE thread_id=$1 AND user_id=$2 AND status='active' RETURNING user_id`, [threadId,userId]);
      if (!result.rowCount) return res.status(404).json({ ok: false, error: "No active temporary grant found." });
      audit("[TEMP ADMIN] " + JSON.stringify({ action: "revoke", threadId, userId }));
      return res.json({ ok: true, message: "Temporary privileges revoked." });
    } catch (error) {
      console.error("[TEMP ADMIN] revoke failed:", error);
      return res.status(500).json({ ok: false, error: "Could not revoke temporary administrator." });
    }
  });
}

module.exports = { FIVE_DAYS_MS, policyFor, registerTemporaryAdminRoutes };
