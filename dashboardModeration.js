"use strict";

const USER_ID_RE = /^\d{6,20}$/;
const THREAD_ID_RE = /^\d{6,32}$/;
const MAX_ACTIONS_PER_GROUP_WINDOW = 5;
const ACTION_WINDOW_MS = 60_000;
const actionWindows = new Map();

function allowAction(threadId, now = Date.now()) {
  const key = String(threadId);
  const prior = actionWindows.get(key);
  const recent = prior && now - prior.startedAt < ACTION_WINDOW_MS
    ? prior
    : { startedAt: now, count: 0 };
  if (recent.count >= MAX_ACTIONS_PER_GROUP_WINDOW) {
    actionWindows.set(key, recent);
    return false;
  }
  recent.count += 1;
  actionWindows.set(key, recent);
  if (actionWindows.size > 2000) {
    for (const [groupId, window] of actionWindows) {
      if (now - window.startedAt >= ACTION_WINDOW_MS) actionWindows.delete(groupId);
    }
  }
  return true;
}

function cleanReason(value) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 200) || "Dashboard moderation action";
}

function registerModerationRoutes(app, {
  auth,
  getApi,
  isKnownGroup = () => false,
  removeFromGroup,
  createBan,
  logModeration,
  audit = () => {},
  db,
}) {
  if (!app || typeof app.post !== "function") throw new TypeError("An Express app is required.");
  if (typeof auth !== "function") throw new TypeError("Dashboard auth middleware is required.");
  if (typeof getApi !== "function") throw new TypeError("getApi callback is required.");
  if (!db || typeof db.query !== "function") throw new TypeError("PostgreSQL db is required for protected-role checks.");
  if (typeof removeFromGroup !== "function" || typeof createBan !== "function" || typeof logModeration !== "function") {
    throw new TypeError("Moderation helpers are required.");
  }

  for (const action of ["kick", "ban"]) {
    app.post("/api/dashboard/groups/:threadId/" + action, auth, async (req, res) => {
      const threadId = String(req.params.threadId || "").trim();
      const userId = String(req.body?.user_id ?? req.body?.userId ?? "").trim();
      const reason = cleanReason(req.body?.reason);

      if (!THREAD_ID_RE.test(threadId)) {
        return res.status(400).json({ ok: false, error: "Invalid Messenger group ID." });
      }
      if (!USER_ID_RE.test(userId)) {
        return res.status(400).json({ ok: false, error: "Choose a group member with a valid numeric Messenger ID." });
      }
      if (!isKnownGroup(threadId)) {
        return res.status(404).json({ ok: false, error: "This group is not in the dashboard's known group list. Refresh groups and try again." });
      }

      // A live temporary-admin grant protects the target from dashboard kick/ban.
      // Revoke the grant first, then perform a separate moderation action.
      const protectedGrant = await db.query(
        "SELECT 1 FROM dashboard_temp_admins WHERE thread_id=$1 AND user_id=$2 AND status='active' AND expires_at>NOW() LIMIT 1",
        [threadId, userId]
      ).catch(error => {
        console.error("[DASHBOARD MODERATION] protected-role lookup failed:", error);
        res.status(503).json({
          ok: false,
          error: "Protected-role status could not be verified. No moderation action was performed.",
          code: "PROTECTED_ROLE_CHECK_UNAVAILABLE",
        });
        return null;
      });
      if (!protectedGrant) return;
      if (protectedGrant.rows?.length) {
        return res.status(409).json({
          ok: false,
          error: "This member has an active temporary-admin grant. Revoke the grant and verify the role change before kicking or banning them.",
          code: "ACTIVE_TEMP_ADMIN_PROTECTED",
        });
      }

      if (!allowAction(threadId)) {
        return res.status(429).json({ ok: false, error: "Too many moderation actions for this group. Wait a minute and try again." });
      }

      const api = getApi();
      if (!api || typeof api.removeUserFromGroup !== "function") {
        return res.status(503).json({ ok: false, error: "Messenger is not connected or group removal is unavailable." });
      }

      let banSaved = null;
      try {
        if (action === "ban") {
          await createBan(threadId, userId, "dashboard", reason);
          banSaved = true;
        }

        const removal = await removeFromGroup(api, threadId, userId);
        const success = removal?.ok === true;
        await logModeration({
          threadID: threadId,
          moderatorId: "dashboard",
          targetId: userId,
          action,
          reason,
          success,
        });

        const message = success
          ? (action === "ban" ? "Member removed from the group and locally banned." : "Member removed from the group.")
          : String(removal?.errorMessage || removal?.errorCode || "Messenger refused the removal.");

        audit("[DASHBOARD MODERATION] " + JSON.stringify({
          action, threadId, targetId: userId, success, banSaved, errorCode: removal?.errorCode || null,
        }));

        return res.status(200).json({
          ok: success,
          action,
          thread_id: threadId,
          user_id: userId,
          ban_saved: banSaved,
          message,
          error: success ? undefined : message,
          error_code: success ? null : (removal?.errorCode || "REMOVAL_FAILED"),
          uncertain: removal?.uncertain === true,
        });
      } catch (error) {
        audit("[DASHBOARD MODERATION] " + JSON.stringify({
          action, threadId, targetId: userId, success: false, banSaved,
          error: String(error?.message || error).slice(0, 180),
        }));
        console.error("[DASHBOARD MODERATION] " + action + " failed:", error);
        return res.status(500).json({
          ok: false,
          action,
          ban_saved: banSaved,
          error: action === "ban" && banSaved !== true
            ? "The local ban could not be saved; the member was not removed."
            : "Moderation action failed. Check the bot logs before retrying.",
        });
      }
    });
  }
}

module.exports = { registerModerationRoutes };
