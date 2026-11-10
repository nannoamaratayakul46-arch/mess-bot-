"use strict";

const MEMBER_ID_RE = /^\d{6,32}$/;
const STOP_RE = /^(?:stop|stop bot|tama na|tigil|ayoko na|wag na|huwag na|leave me alone|don't message me|do not message me|stop messaging me|dont pm me|don't pm me|please stop|enough)$/i;
const MAX_TURNS = 20;
const IDLE_TIMEOUT_MS = 30 * 60_000;
const MIN_REPLY_GAP_MS = 8_000;
const ALLOWED_REACTIONS = new Set(["😂", "😆", "🤣", "😭", "💀", "❤️", "🔥", "👍"]);

function createPmBattles({
  getApi, isKnownGroup, resolveMembers, send, getHybridReply, db,
  now = Date.now, random = Math.random, setTimer = setTimeout,
} = {}) {
  if (typeof getApi !== "function" || typeof isKnownGroup !== "function" ||
      typeof resolveMembers !== "function" || typeof send !== "function" ||
      typeof getHybridReply !== "function") {
    throw new TypeError("PM Battles requires API, group validation, member resolution, send, and hybrid reply handlers.");
  }

  const sessions = new Map();
  const optedOut = new Set();
  const processing = new Set();
  const settings = { self_laugh_enabled: true, self_laugh_reaction: "😂" };
  const diagnostics = {
    listener: "unknown", last_event_at: null, last_sender_id: null,
    last_stage: "waiting", last_error: null, last_error_at: null,
    last_message_id: null, last_reaction_at: null,
  };

  function mark(stage, details = {}) {
    Object.assign(diagnostics, details, { last_stage: stage });
    console.log("[PM-BATTLES] " + stage, details);
  }
  function markError(stage, error) {
    const message = String(error?.message || error || "Unknown error").slice(0, 180);
    Object.assign(diagnostics, {
      last_stage: stage, last_error: message,
      last_error_at: new Date(now()).toISOString(),
    });
    console.warn("[PM-BATTLES] " + stage + ":", message);
  }
  function publicSession(session) {
    return {
      thread_id: session.threadId, recipient_id: session.userId,
      recipient_name: session.name, status: session.status,
      turns: session.turns, max_turns: MAX_TURNS,
      started_at: new Date(session.startedAt).toISOString(),
      last_activity_at: new Date(session.lastActivityAt).toISOString(),
      stopped_at: session.stoppedAt ? new Date(session.stoppedAt).toISOString() : null,
      stop_reason: session.stopReason || null,
    };
  }
  function expireIdleSessions() {
    const stamp = now();
    for (const [userId, session] of sessions) {
      if (session.status === "active" && stamp - session.lastActivityAt > IDLE_TIMEOUT_MS) stopSession(userId, "idle-timeout");
    }
  }
  function stopSession(userId, reason) {
    const session = sessions.get(String(userId));
    if (!session || session.status !== "active") return null;
    session.status = "stopped";
    session.stoppedAt = now();
    session.stopReason = String(reason || "stopped").slice(0, 80);
    if (reason === "recipient-request") optedOut.add(String(userId));
    mark("SESSION_STOPPED", { recipient_id: String(userId), reason: session.stopReason });
    return publicSession(session);
  }

  function reactToOwnMessage(api, messageInfo, threadId) {
    if (!settings.self_laugh_enabled) return;
    const messageId = String(messageInfo?.messageID || messageInfo?.messageId || messageInfo?.message_id || "").trim();
    if (!messageId) {
      mark("SELF_LAUGH_SKIPPED_NO_MESSAGE_ID", { thread_id: threadId });
      return;
    }
    diagnostics.last_message_id = messageId;
    const delayMs = 1000 + Math.floor(random() * 2001);
    setTimer(() => {
      try {
        const callback = error => {
          if (error) return markError("SELF_LAUGH_FAILED", error);
          diagnostics.last_reaction_at = new Date(now()).toISOString();
          mark("SELF_LAUGH_SENT", { thread_id: threadId, message_id: messageId, delay_ms: delayMs });
        };
        if (typeof api?.setMessageReactionMqtt === "function") {
          api.setMessageReactionMqtt(settings.self_laugh_reaction, messageId, String(threadId), callback);
        } else if (typeof api?.setMessageReaction === "function") {
          api.setMessageReaction(settings.self_laugh_reaction, messageId, callback, true);
        } else {
          mark("SELF_LAUGH_UNAVAILABLE", { thread_id: threadId, message_id: messageId });
        }
      } catch (error) { markError("SELF_LAUGH_FAILED", error); }
    }, delayMs);
  }

  async function sendBattleMessage(api, message, userId) {
    const info = await send(api, message, userId);
    mark("MESSAGE_SENT", {
      recipient_id: userId,
      message_id: String(info?.messageID || info?.messageId || info?.message_id || "") || null,
    });
    reactToOwnMessage(api, info, userId);
    return info;
  }

  async function loadSettings() {
    if (!db?.connect || !db?.query) return;
    try {
      await db.connect();
      const result = await db.query(
        "SELECT preference_value FROM eclipse_dashboard_preferences WHERE preference_key = $1 LIMIT 1",
        ["pm_battle_settings"]
      );
      const saved = result?.rows?.[0]?.preference_value || {};
      settings.self_laugh_enabled = saved.self_laugh_enabled !== false;
      if (ALLOWED_REACTIONS.has(String(saved.self_laugh_reaction || ""))) {
        settings.self_laugh_reaction = String(saved.self_laugh_reaction);
      }
      mark("SETTINGS_LOADED", { ...settings });
    } catch (error) {
      markError("SETTINGS_LOAD_FAILED", error);
    }
  }

  async function persistSettings() {
    if (!db?.connect || !db?.query) return false;
    await db.connect();
    await db.query(
      `INSERT INTO eclipse_dashboard_preferences (preference_key, preference_value, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (preference_key) DO UPDATE
       SET preference_value = EXCLUDED.preference_value, updated_at = NOW()`,
      ["pm_battle_settings", JSON.stringify(settings)]
    );
    return true;
  }

  void loadSettings();

  function registerRoutes(app, auth) {
    const ownerAuth = (req, res, next) => auth(req, res, () => {
      if (req.dashboardAccount && req.dashboardAccount.role !== "owner") {
        return res.status(403).json({ ok: false, error: "Owner access is required for PM Battles." });
      }
      return next();
    });

    app.get("/api/dashboard/pm/battles/settings", ownerAuth, (_req, res) => res.json({ ok: true, settings: { ...settings } }));
    app.post("/api/dashboard/pm/battles/settings", ownerAuth, async (req, res) => {
      const nextReaction = req.body?.self_laugh_reaction === undefined
        ? settings.self_laugh_reaction : String(req.body.self_laugh_reaction || "");
      if (!ALLOWED_REACTIONS.has(nextReaction)) return res.status(400).json({ ok: false, error: "Choose a supported reaction." });
      const previous = { ...settings };
      if (req.body?.self_laugh_enabled !== undefined) settings.self_laugh_enabled = req.body.self_laugh_enabled === true;
      settings.self_laugh_reaction = nextReaction;
      try {
        await persistSettings();
        mark("SETTINGS_UPDATED", { ...settings });
        return res.json({ ok: true, settings: { ...settings } });
      } catch (error) {
        Object.assign(settings, previous);
        markError("SETTINGS_SAVE_FAILED", error);
        return res.status(502).json({ ok: false, error: "Could not save PM Battle settings. Previous settings were kept." });
      }
    });

    app.post("/api/dashboard/pm/battles/start", ownerAuth, async (req, res) => {
      const threadId = String(req.body?.thread_id || "").trim();
      const userId = String(req.body?.user_id || "").trim();
      const opening = String(req.body?.opening_message || "").trim();
      const name = String(req.body?.recipient_name || "Selected member").trim().slice(0, 100) || "Selected member";
      if (req.body?.confirmed !== true) return res.status(400).json({ ok: false, error: "Confirm the selected recipient and opening message before starting." });
      if (!/^\d{6,32}$/.test(threadId) || !isKnownGroup(threadId)) return res.status(400).json({ ok: false, error: "Choose a group from the refreshed group list." });
      if (!MEMBER_ID_RE.test(userId) || !opening || opening.length > 1200) return res.status(400).json({ ok: false, error: "Choose one valid member and an opening message of 1–1200 characters." });
      if (optedOut.has(userId)) return res.status(403).json({ ok: false, error: "This member previously asked the bot to stop PMing them. A new battle cannot be started." });
      const api = getApi();
      if (!api) return res.status(409).json({ ok: false, error: "Messenger is not connected." });
      expireIdleSessions();
      if (sessions.get(userId)?.status === "active") return res.status(409).json({ ok: false, error: "This member already has an active PM Battle." });
      if ([...sessions.values()].some(row => row.status === "active")) return res.status(409).json({ ok: false, error: "Only one PM Battle can run at a time." });
      try {
        const result = await resolveMembers(api, threadId);
        const members = Array.isArray(result?.members) ? result.members : [];
        const member = members.find(row => String(row?.user_id || "") === userId);
        if (!member) return res.status(400).json({ ok: false, error: "That member is no longer in the selected group. Reload the member list." });
        const session = {
          threadId, userId, name: String(member.name || name).slice(0, 100),
          status: "active", turns: 0, startedAt: now(), lastActivityAt: now(),
          lastReplyAt: 0, stoppedAt: 0, stopReason: "",
        };
        sessions.set(userId, session);
        try { await sendBattleMessage(api, opening, userId); }
        catch (error) { sessions.delete(userId); throw error; }
        mark("BATTLE_STARTED", { thread_id: threadId, recipient_id: userId });
        return res.status(201).json({ ok: true, session: publicSession(session) });
      } catch (error) {
        markError("BATTLE_START_FAILED", error);
        return res.status(502).json({ ok: false, error: "Messenger could not confirm the opening message. Check the conversation before retrying." });
      }
    });

    app.post("/api/dashboard/pm/battles/stop", ownerAuth, (req, res) => {
      const userId = String(req.body?.user_id || "").trim();
      const session = stopSession(userId, "owner-stopped");
      if (!session) return res.status(404).json({ ok: false, error: "No active PM Battle exists for this member." });
      return res.json({ ok: true, session });
    });

    app.get("/api/dashboard/pm/battles", ownerAuth, (_req, res) => {
      expireIdleSessions();
      return res.json({ ok: true, sessions: [...sessions.values()].map(publicSession).sort((a, b) => b.started_at.localeCompare(a.started_at)) });
    });

    app.get("/api/dashboard/pm/diagnostics", ownerAuth, (_req, res) => {
      const api = getApi();
      diagnostics.listener = api ? "connected" : "disconnected";
      expireIdleSessions();
      return res.json({
        ok: true, diagnostics: { ...diagnostics, active_battles: [...sessions.values()].filter(row => row.status === "active").length },
        settings: { ...settings },
      });
    });
  }

  async function handleIncoming(api, event) {
    const userId = String(event?.senderID || "").trim();
    const threadId = String(event?.threadID || "").trim();
    const body = String(event?.body || "").trim();
    if (!userId || !threadId || !body || (event?.type !== "message" && event?.type !== "message_reply")) return false;

    diagnostics.last_event_at = new Date(now()).toISOString();
    diagnostics.last_sender_id = userId;
    diagnostics.listener = "connected";
    mark("EVENT_RECEIVED", { sender_id: userId, thread_id: threadId, event_type: event.type });

    const session = sessions.get(userId);
    if (!session || session.status !== "active" || threadId !== userId) {
      mark("EVENT_IGNORED_NO_MATCHING_SESSION", { sender_id: userId, thread_id: threadId });
      return false;
    }
    if (String(api?.getCurrentUserID?.() || "") === userId) return false;
    mark("SENDER_MATCHED", { recipient_id: userId, thread_id: threadId });

    const stamp = now();
    if (stamp - session.lastActivityAt > IDLE_TIMEOUT_MS) { stopSession(userId, "idle-timeout"); return true; }
    if (STOP_RE.test(body)) { stopSession(userId, "recipient-request"); return true; }
    if (session.turns >= MAX_TURNS) { stopSession(userId, "turn-limit"); return true; }
    if (processing.has(userId) || stamp - session.lastReplyAt < MIN_REPLY_GAP_MS) {
      mark("REPLY_THROTTLED", { recipient_id: userId });
      return true;
    }

    processing.add(userId);
    session.lastActivityAt = stamp;
    try {
      mark("REPLY_GENERATION_STARTED", { recipient_id: userId, turn: session.turns + 1 });
      const reply = await getHybridReply({
        api, event, text: body, senderId: userId, threadId,
        turn: session.turns + 1, recipientName: session.name,
      });
      const message = String(reply || "").trim().slice(0, 1200);
      if (!message) { mark("REPLY_GENERATION_EMPTY", { recipient_id: userId }); return true; }
      mark("REPLY_GENERATED", { recipient_id: userId, turn: session.turns + 1 });
      if (session.status !== "active") { mark("REPLY_CANCELLED_SESSION_STOPPED", { recipient_id: userId }); return true; }
      await sendBattleMessage(api, message, userId);
      session.turns += 1;
      session.lastReplyAt = now();
      session.lastActivityAt = session.lastReplyAt;
      if (session.turns >= MAX_TURNS) stopSession(userId, "turn-limit");
    } catch (error) {
      markError("REPLY_FAILED", error);
    } finally { processing.delete(userId); }
    return true;
  }

  return {
    registerRoutes, handleIncoming, stopSession,
    getSessions: () => [...sessions.values()].map(publicSession),
    getDiagnostics: () => ({ ...diagnostics }),
  };
}

module.exports = { createPmBattles, STOP_RE, MAX_TURNS, IDLE_TIMEOUT_MS, ALLOWED_REACTIONS };
