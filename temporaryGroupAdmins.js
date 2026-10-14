"use strict";

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
const KICK_LIMIT = 3;
const KICK_WINDOW_MS = 60_000;
const actionWindows = new Map();

function policyFor(role, expiresAt, now = Date.now()) {
  if (role !== "temporary" || !Number.isFinite(Date.parse(expiresAt || "")) || Date.parse(expiresAt) <= now) {
    return { active: false, canBan: false, canKick: false, canWarn: false, canReportSpam: false, canMassAction: false, canChangeRoles: false };
  }
  return { active: true, canBan: false, canKick: true, canWarn: true, canReportSpam: true, canMassAction: false, canChangeRoles: false };
}

function allowTemporaryKick(threadId, userId, now = Date.now()) {
  const key = String(threadId) + ":" + String(userId);
  const recent = actionWindows.get(key);
  const window = recent && now - recent.startedAt < KICK_WINDOW_MS ? recent : { startedAt: now, count: 0 };
  if (window.count >= KICK_LIMIT) return false;
  window.count += 1;
  actionWindows.set(key, window);
  if (actionWindows.size > 5000) {
    for (const [k, v] of actionWindows) if (now - v.startedAt >= KICK_WINDOW_MS) actionWindows.delete(k);
  }
  return true;
}

function registerTemporaryAdminRoutes(app, { auth, db, isKnownGroup = () => false, audit = () => {} }) {
  if (!app || typeof app.get !== "function" || typeof app.post !== "function" || typeof app.delete !== "function") throw new TypeError("Express app required");
  if (typeof auth !== "function" || !db || typeof db.query !== "function") throw new TypeError("Dashboard auth and PostgreSQL db.query are required");

  const init = db.query(`
    CREATE TABLE IF NOT EXISTS dashboard_temp_admins (
      thread_id TEXT NOT NULL, user_id TEXT NOT NULL,
      granted_by TEXT NOT NULL DEFAULT 'dashboard-admin',
      granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','demoted')),
      reason TEXT NOT NULL DEFAULT '', PRIMARY KEY (thread_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS dashboard_admin_approvals (
      id BIGSERIAL PRIMARY KEY, thread_id TEXT NOT NULL, requested_by TEXT NOT NULL,
      action_type TEXT NOT NULL CHECK (action_type IN ('mass_action','role_change')),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb, reason TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
      reviewed_by TEXT, reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_dashboard_admin_approvals_group
      ON dashboard_admin_approvals(thread_id,status,created_at DESC);
  `);

  // Never accept actor identity from request bodies: those fields are user-controlled.
  // The current shared-key dashboard auth does not identify individual operators, so
  // use an explicit server-attached principal when available and a neutral fallback.
  function actorId(req) {
    const candidate = req.dashboardUser?.id ?? req.user?.id ?? req.session?.user?.id;
    return String(candidate ?? "dashboard-api-key").trim().slice(0, 80) || "dashboard-api-key";
  }

  function validGroup(req, res) {
    const threadId = String(req.params.threadId || "").trim();
    if (!/^\d{6,32}$/.test(threadId)) { res.status(400).json({ ok:false, error:"Invalid Messenger group ID." }); return null; }
    if (!isKnownGroup(threadId)) { res.status(404).json({ ok:false, error:"Unknown group. Refresh groups first." }); return null; }
    return threadId;
  }

  app.get("/api/dashboard/groups/:threadId/temp-admins", auth, async (req, res) => {
    try {
      await init;
      const threadId = validGroup(req,res); if (!threadId) return;
      const result = await db.query(`SELECT thread_id,user_id,granted_by,granted_at,expires_at,status,reason,
        (status='active' AND expires_at>NOW()) AS active
        FROM dashboard_temp_admins WHERE thread_id=$1 ORDER BY granted_at DESC LIMIT 200`, [threadId]);
      return res.json({ ok:true, policy:{ probation_days:5, ban:"none", kick:"limited (3 per minute)", warnings:true, spam_reports:true, mass_actions:"approval", sensitive_role_changes:"approval" }, admins:result.rows });
    } catch (error) { console.error("[TEMP ADMIN] list failed:",error); return res.status(500).json({ok:false,error:"Could not load temporary administrators."}); }
  });

  app.post("/api/dashboard/groups/:threadId/temp-admins", auth, async (req, res) => {
    try {
      await init;
      const threadId=validGroup(req,res); if(!threadId) return;
      const userId=String(req.body?.user_id ?? req.body?.userId ?? "").trim();
      const reason=String(req.body?.reason||"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,200);
      if(!/^\d{6,20}$/.test(userId)) return res.status(400).json({ok:false,error:"Enter a valid numeric Messenger member ID."});
      const grantedBy=actorId(req);
      const result=await db.query(`INSERT INTO dashboard_temp_admins(thread_id,user_id,granted_by,granted_at,expires_at,status,reason)
        VALUES($1,$2,$3,NOW(),NOW()+INTERVAL '5 days','active',$4)
        ON CONFLICT(thread_id,user_id) DO UPDATE SET granted_by=EXCLUDED.granted_by,granted_at=NOW(),
        expires_at=NOW()+INTERVAL '5 days',status='active',reason=EXCLUDED.reason
        RETURNING thread_id,user_id,granted_by,granted_at,expires_at,status,reason`,[threadId,userId,grantedBy,reason]);
      audit("[TEMP ADMIN] "+JSON.stringify({action:"grant",threadId,userId,grantedBy,expiresAt:result.rows[0].expires_at}));
      return res.status(201).json({ok:true,admin:result.rows[0],message:"Temporary grant recorded for five days."});
    } catch(error){console.error("[TEMP ADMIN] grant failed:",error);return res.status(500).json({ok:false,error:"Could not save temporary administrator."});}
  });

  app.delete("/api/dashboard/groups/:threadId/temp-admins/:userId", auth, async (req,res)=>{
    try {
      await init; const threadId=validGroup(req,res); if(!threadId)return;
      const userId=String(req.params.userId||"").trim();
      if(!/^\d{6,20}$/.test(userId))return res.status(400).json({ok:false,error:"Invalid member ID."});
      const result=await db.query("UPDATE dashboard_temp_admins SET status='revoked' WHERE thread_id=$1 AND user_id=$2 AND status='active' RETURNING user_id",[threadId,userId]);
      if(!result.rowCount)return res.status(404).json({ok:false,error:"No active temporary grant found."});
      audit("[TEMP ADMIN] "+JSON.stringify({action:"revoke",threadId,userId}));
      return res.json({ok:true,message:"Temporary privileges revoked."});
    }catch(error){console.error("[TEMP ADMIN] revoke failed:",error);return res.status(500).json({ok:false,error:"Could not revoke temporary administrator."});}
  });

  app.get("/api/dashboard/groups/:threadId/admin-approvals", auth, async(req,res)=>{
    try{
      await init; const threadId=validGroup(req,res);if(!threadId)return;
      const result=await db.query(`SELECT id,thread_id,requested_by,action_type,payload,reason,status,reviewed_by,reviewed_at,created_at
        FROM dashboard_admin_approvals WHERE thread_id=$1 ORDER BY created_at DESC LIMIT 100`,[threadId]);
      return res.json({ok:true,approvals:result.rows});
    }catch(error){console.error("[ADMIN APPROVAL] list failed:",error);return res.status(500).json({ok:false,error:"Could not load approval queue."});}
  });

  app.post("/api/dashboard/groups/:threadId/admin-approvals", auth, async(req,res)=>{
    try{
      await init;const threadId=validGroup(req,res);if(!threadId)return;
      const actionType=String(req.body?.action_type||"");
      const requestedBy=actorId(req);
      const reason=String(req.body?.reason||"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,200);
      const payload=req.body?.payload && typeof req.body.payload==="object" && !Array.isArray(req.body.payload)?req.body.payload:{};
      if(!["mass_action","role_change"].includes(actionType))return res.status(400).json({ok:false,error:"Approval type must be mass_action or role_change."});
      const result=await db.query(`INSERT INTO dashboard_admin_approvals(thread_id,requested_by,action_type,payload,reason)
        VALUES($1,$2,$3,$4::jsonb,$5) RETURNING id,thread_id,requested_by,action_type,payload,reason,status,created_at`,
        [threadId,requestedBy,actionType,JSON.stringify(payload).slice(0,8000),reason]);
      audit("[ADMIN APPROVAL] "+JSON.stringify({action:"request",id:result.rows[0].id,threadId,actionType,requestedBy}));
      return res.status(201).json({ok:true,approval:result.rows[0]});
    }catch(error){console.error("[ADMIN APPROVAL] create failed:",error);return res.status(500).json({ok:false,error:"Could not create approval request."});}
  });

  app.post("/api/dashboard/groups/:threadId/admin-approvals/:approvalId/review", auth, async(req,res)=>{
    try{
      await init;const threadId=validGroup(req,res);if(!threadId)return;
      const id=String(req.params.approvalId||"");const decision=String(req.body?.decision||"");
      if(!/^\d+$/.test(id)||!["approved","rejected"].includes(decision))return res.status(400).json({ok:false,error:"Provide a valid approval ID and approved/rejected decision."});
      const reviewer=actorId(req);
      const result=await db.query(`UPDATE dashboard_admin_approvals SET status=$1,reviewed_by=$2,reviewed_at=NOW()
        WHERE id=$3 AND thread_id=$4 AND status='pending'
        RETURNING id,thread_id,action_type,payload,status,reviewed_by,reviewed_at`,[decision,reviewer,id,threadId]);
      if(!result.rowCount)return res.status(404).json({ok:false,error:"Pending approval not found."});
      audit("[ADMIN APPROVAL] "+JSON.stringify({action:decision,id,threadId,reviewer}));
      return res.json({ok:true,approval:result.rows[0],message:"Decision recorded. Approval does not execute the action automatically."});
    }catch(error){console.error("[ADMIN APPROVAL] review failed:",error);return res.status(500).json({ok:false,error:"Could not review approval."});}
  });
}

module.exports = { FIVE_DAYS_MS, KICK_LIMIT, KICK_WINDOW_MS, policyFor, allowTemporaryKick, registerTemporaryAdminRoutes };
