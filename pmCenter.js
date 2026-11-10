"use strict";

const MEMBER_ID_RE = /^\d{6,32}$/;
const THREAD_ID_RE = /^\d{6,32}$/;
const MAX_MESSAGE_LENGTH = 2000;
const RECIPIENT_COOLDOWN_MS = 60_000;
const GLOBAL_WINDOW_MS = 60 * 60_000;
const GLOBAL_MAX_SENDS = 10;

function createPmCenter({ getApi, isKnownGroup, resolveMembers, send, now = Date.now } = {}) {
  if (typeof getApi !== "function" || typeof isKnownGroup !== "function" ||
      typeof resolveMembers !== "function" || typeof send !== "function") {
    throw new TypeError("PM Center requires API, group validation, member resolution, and send handlers.");
  }

  const recipientLastSent = new Map();
  const recentSends = [];

  function prune() {
    const cutoff = now() - GLOBAL_WINDOW_MS;
    while (recentSends.length && recentSends[0] <= cutoff) recentSends.shift();
    for (const [key, sentAt] of recipientLastSent) {
      if (now() - sentAt > GLOBAL_WINDOW_MS) recipientLastSent.delete(key);
    }
  }

  function ownerOnly(req, res, next) {
    if (req.dashboardAccount && req.dashboardAccount.role !== "owner") {
      return res.status(403).json({ ok: false, error: "Owner access is required for private messaging." });
    }
    return next();
  }

  function registerRoutes(app, auth) {
    const ownerAuth = (req, res, next) => auth(req, res, () => ownerOnly(req, res, next));
    app.get("/api/dashboard/pm/:threadId/members", ownerAuth, async (req, res) => {
      const threadId = String(req.params.threadId || "").trim();
      if (!THREAD_ID_RE.test(threadId) || !isKnownGroup(threadId)) {
        return res.status(400).json({ ok: false, error: "Choose a group from the refreshed group list." });
      }
      const api = getApi();
      if (!api) return res.status(409).json({ ok: false, error: "Messenger is not connected." });
      try {
        const result = await resolveMembers(api, threadId);
        const members = Array.isArray(result?.members) ? result.members : [];
        return res.json({
          ok: true,
          thread_id: threadId,
          members: members.map(member => ({
            user_id: String(member.user_id || ""),
            name: String(member.name || "").slice(0, 100),
            resolved: member.resolved === true,
          })).filter(member => MEMBER_ID_RE.test(member.user_id)),
        });
      } catch (error) {
        console.warn("[PM-CENTER] Member lookup failed:", String(error?.message || error).slice(0, 180));
        return res.status(502).json({ ok: false, error: "Could not load this group's members. Refresh and try again." });
      }
    });

    app.post("/api/dashboard/pm/send", ownerAuth, async (req, res) => {
      const threadId = String(req.body?.thread_id || "").trim();
      const userId = String(req.body?.user_id || "").trim();
      const message = String(req.body?.message || "").trim();
      if (req.body?.confirmed !== true) {
        return res.status(400).json({ ok: false, error: "Confirm the selected recipient and message before sending." });
      }
      if (!THREAD_ID_RE.test(threadId) || !isKnownGroup(threadId)) {
        return res.status(400).json({ ok: false, error: "Choose a group from the refreshed group list." });
      }
      if (!MEMBER_ID_RE.test(userId)) {
        return res.status(400).json({ ok: false, error: "Choose one valid member from the selected group." });
      }
      if (!message || message.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ ok: false, error: "Message must be between 1 and 2000 characters." });
      }

      const api = getApi();
      if (!api) return res.status(409).json({ ok: false, error: "Messenger is not connected." });

      try {
        // Re-check membership immediately before sending. A stale dashboard
        // selection must never become an arbitrary Messenger user ID.
        const result = await resolveMembers(api, threadId);
        const members = Array.isArray(result?.members) ? result.members : [];
        if (!members.some(member => String(member?.user_id || "") === userId)) {
          return res.status(400).json({ ok: false, error: "That member is no longer in the selected group. Reload the member list." });
        }

        prune();
        const recipientKey = userId;
        const lastSent = recipientLastSent.get(recipientKey) || 0;
        if (now() - lastSent < RECIPIENT_COOLDOWN_MS) {
          return res.status(429).json({ ok: false, error: "Please wait before sending another PM to this member." });
        }
        if (recentSends.length >= GLOBAL_MAX_SENDS) {
          return res.status(429).json({ ok: false, error: "PM sending is temporarily rate-limited. Try again later." });
        }

        // Reserve the rate-limit slot before the network call to prevent
        // concurrent dashboard clicks from producing duplicate DMs.
        const reservedAt = now();
        recipientLastSent.set(recipientKey, reservedAt);
        recentSends.push(reservedAt);
        try {
          const messageInfo = await send(api, message, userId);
          return res.json({
            ok: true,
            recipient_id: userId,
            message_id: String(messageInfo?.messageID || messageInfo?.messageId || ""),
            sent_at: new Date(reservedAt).toISOString(),
          });
        } catch (error) {
          // A failed delivery should not consume the recipient cooldown.
          recipientLastSent.delete(recipientKey);
          const index = recentSends.lastIndexOf(reservedAt);
          if (index >= 0) recentSends.splice(index, 1);
          throw error;
        }
      } catch (error) {
        console.warn("[PM-CENTER] Send failed:", String(error?.message || error).slice(0, 180));
        return res.status(502).json({ ok: false, error: "Messenger could not confirm delivery. Check the conversation before retrying." });
      }
    });
  }

  return { registerRoutes };
}

module.exports = { createPmCenter };
