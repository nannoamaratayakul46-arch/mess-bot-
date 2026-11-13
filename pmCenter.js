"use strict";

const MEMBER_ID_RE = /^\d{6,32}$/;
const THREAD_ID_RE = /^\d{6,32}$/;
const MAX_MESSAGE_LENGTH = 2000;
const RECIPIENT_COOLDOWN_MS = 60_000;
const GLOBAL_WINDOW_MS = 60 * 60_000;
const GLOBAL_MAX_SENDS = 10;
let diagnosticSequence = 0;

function makeDiagnostic(stage, code, reason, detail = "") {
  diagnosticSequence += 1;
  return {
    id: "pm-" + Date.now().toString(36) + "-" + diagnosticSequence.toString(36),
    stage, code, reason,
    ...(detail ? { detail: String(detail).replace(/[\r\n]+/g, " ").slice(0, 180) } : {}),
  };
}

function diagnosticError(diagnostic) {
  const detail = diagnostic.detail ? " Detail: " + diagnostic.detail : "";
  return diagnostic.reason + " Diagnostic: " + diagnostic.code + " at " + diagnostic.stage + "." + detail;
}

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
        const diagnostic = makeDiagnostic("group-validation", "INVALID_OR_STALE_GROUP", "The selected group is invalid or is no longer in the refreshed group list.");
        return res.status(400).json({ ok: false, error: diagnosticError(diagnostic), diagnostic });
      }
      const api = getApi();
      if (!api) {
        const diagnostic = makeDiagnostic("messenger-connection", "MESSENGER_DISCONNECTED", "The bot does not currently have an active Messenger connection.");
        return res.status(409).json({ ok: false, error: diagnostic.reason, diagnostic });
      }
      let stage = "member-resolution";
      try {
        const result = await resolveMembers(api, threadId);
        const rawMembers = Array.isArray(result?.members) ? result.members : [];
        stage = "member-validation";
        const members = rawMembers.map(member => ({
          user_id: String(member?.user_id || ""),
          name: String(member?.name || "").slice(0, 100),
          resolved: member?.resolved === true,
        })).filter(member => MEMBER_ID_RE.test(member.user_id));
        if (!members.length) {
          const diagnostic = makeDiagnostic("member-resolution", "NO_PARTICIPANT_IDS", "Messenger returned no usable participant IDs for this group. Check group access and inspect the bot service logs.", "rawMembers=" + rawMembers.length);
          console.warn("[PM-CENTER] No usable participant IDs:", JSON.stringify({ threadId, diagnostic }));
          return res.status(503).json({ ok: false, error: diagnostic.reason, members: [], diagnostic });
        }
        const unresolved = members.filter(member => !member.resolved).length;
        return res.json({
          ok: true,
          thread_id: threadId,
          members,
          diagnostics: {
            stage: "complete",
            total: members.length,
            named: members.length - unresolved,
            unresolved,
            fallbackLabelsUsed: unresolved > 0,
          },
        });
      } catch (error) {
        const diagnostic = makeDiagnostic(stage, "MEMBER_LOOKUP_FAILED", "PM Mode could not retrieve this group's participants. Check Messenger connectivity, group access, and the underlying API response.", error?.message || error);
        console.warn("[PM-CENTER] Member lookup failed:", JSON.stringify({ threadId, diagnostic }));
        return res.status(502).json({ ok: false, error: diagnostic.reason, diagnostic });
      }
    });

    app.post("/api/dashboard/pm/send", ownerAuth, async (req, res) => {
      const threadId = String(req.body?.thread_id || "").trim();
      const userId = String(req.body?.user_id || "").trim();
      const message = String(req.body?.message || "").trim();
      if (req.body?.confirmed !== true) {
        const diagnostic = makeDiagnostic("confirmation", "SEND_NOT_CONFIRMED", "Confirm the selected recipient and message before sending.");
        return res.status(400).json({ ok: false, error: diagnostic.reason, diagnostic });
      }
      if (!THREAD_ID_RE.test(threadId) || !isKnownGroup(threadId)) {
        const diagnostic = makeDiagnostic("group-validation", "INVALID_OR_STALE_GROUP", "Choose a group from the refreshed group list.");
        return res.status(400).json({ ok: false, error: diagnostic.reason, diagnostic });
      }
      if (!MEMBER_ID_RE.test(userId)) {
        const diagnostic = makeDiagnostic("recipient-validation", "INVALID_RECIPIENT_ID", "Choose one valid member from the selected group.");
        return res.status(400).json({ ok: false, error: diagnostic.reason, diagnostic });
      }
      if (!message || message.length > MAX_MESSAGE_LENGTH) {
        const diagnostic = makeDiagnostic("message-validation", "INVALID_MESSAGE", "Message must be between 1 and 2000 characters.");
        return res.status(400).json({ ok: false, error: diagnostic.reason, diagnostic });
      }
      const api = getApi();
      if (!api) {
        const diagnostic = makeDiagnostic("messenger-connection", "MESSENGER_DISCONNECTED", "The bot does not currently have an active Messenger connection.");
        return res.status(409).json({ ok: false, error: diagnostic.reason, diagnostic });
      }
      let stage = "membership-recheck";
      try {
        const result = await resolveMembers(api, threadId);
        const members = Array.isArray(result?.members) ? result.members : [];
        if (!members.some(member => String(member?.user_id || "") === userId)) {
          const diagnostic = makeDiagnostic(stage, "RECIPIENT_NOT_IN_GROUP", "That member is no longer in the selected group. Reload the member list.");
          return res.status(400).json({ ok: false, error: diagnostic.reason, diagnostic });
        }
        stage = "rate-limit-check";
        prune();
        const lastSent = recipientLastSent.get(userId) || 0;
        if (now() - lastSent < RECIPIENT_COOLDOWN_MS) {
          const diagnostic = makeDiagnostic("rate-limit", "RECIPIENT_COOLDOWN", "Please wait before sending another PM to this member.");
          return res.status(429).json({ ok: false, error: diagnostic.reason, diagnostic });
        }
        if (recentSends.length >= GLOBAL_MAX_SENDS) {
          const diagnostic = makeDiagnostic("rate-limit", "GLOBAL_RATE_LIMIT", "PM sending is temporarily rate-limited. Try again later.");
          return res.status(429).json({ ok: false, error: diagnostic.reason, diagnostic });
        }
        const reservedAt = now();
        recipientLastSent.set(userId, reservedAt);
        recentSends.push(reservedAt);
        try {
          stage = "messenger-send";
          const messageInfo = await send(api, message, userId);
          return res.json({
            ok: true,
            recipient_id: userId,
            message_id: String(messageInfo?.messageID || messageInfo?.messageId || ""),
            sent_at: new Date(reservedAt).toISOString(),
            diagnostics: { stage: "complete", membershipVerified: true, deliveryCallCompleted: true },
          });
        } catch (error) {
          recipientLastSent.delete(userId);
          const index = recentSends.lastIndexOf(reservedAt);
          if (index >= 0) recentSends.splice(index, 1);
          throw error;
        }
      } catch (error) {
        const diagnostic = makeDiagnostic(stage, "PM_OPERATION_FAILED", "PM sending failed at the " + stage + " stage. Check the diagnostic detail and bot service logs.", error?.message || error);
        console.warn("[PM-CENTER] Send failed:", JSON.stringify({ threadId, recipientId: userId, diagnostic }));
        return res.status(502).json({ ok: false, error: diagnostic.reason, diagnostic });
      }
    });
  }

  return { registerRoutes };
}

module.exports = { createPmCenter };
