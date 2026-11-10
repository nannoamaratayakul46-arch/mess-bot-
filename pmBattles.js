"use strict";

const MEMBER_ID_RE = /^\d{6,32}$/;
const STOP_RE = /^(?:stop|stop bot|tama na|tigil|ayoko na|wag na|huwag na|leave me alone|don't message me|do not message me|stop messaging me|dont pm me|don't pm me|please stop|enough)$/i;
const MAX_TURNS = 20;
const IDLE_TIMEOUT_MS = 30 * 60_000;
const MIN_REPLY_GAP_MS = 8_000;
const MIN_COGNITIVE_DELAY_MS = 300;
const MAX_COGNITIVE_DELAY_MS = 1_800;
const ALLOWED_REACTIONS = new Set(["😂", "😆", "🤣", "😭", "💀", "❤️", "🔥", "👍"]);

function calculateCognitiveDelayMs(text, options = {}) {
  const value = String(text || "").trim();
  const words = value ? value.split(/\s+/).length : 0;
  const lines = value ? value.split(/\n+/).length : 0;
  const clauses = (value.match(/[,.!?;:]/g) || []).length;
  const estimated = 220 + Math.min(value.length, 1_200) * 0.75 +
    Math.min(words, 100) * 5 + Math.min(Math.max(0, lines - 1), 4) * 90 +
    Math.min(clauses, 12) * 18;
  const minMs = Number.isFinite(Number(options.min_ms)) ? Number(options.min_ms) : MIN_COGNITIVE_DELAY_MS;
  const maxMs = Number.isFinite(Number(options.max_ms)) ? Number(options.max_ms) : MAX_COGNITIVE_DELAY_MS;
  const boundedMin = Math.max(100, Math.min(2_000, Math.round(minMs)));
  const boundedMax = Math.max(boundedMin, Math.min(5_000, Math.round(maxMs)));
  const progress = Math.max(0, Math.min(1, (estimated - 220) / (1_800 - 220)));
  return Math.round(boundedMin + progress * (boundedMax - boundedMin));
}

function createPmBattles({
  getApi, isKnownGroup, resolveMembers, send, getHybridReply, db,
  now = Date.now, random = Math.random, setTimer = setTimeout,
  delay = ms => new Promise(resolve => setTimeout(resolve, ms)),
  startTyping = () => false, stopTyping = () => false,
} = {}) {
  if (typeof getApi !== "function" || typeof isKnownGroup !== "function" ||
      typeof resolveMembers !== "function" || typeof send !== "function" ||
      typeof getHybridReply !== "function") {
    throw new TypeError("PM Battles requires API, group validation, member resolution, send, and hybrid reply handlers.");
  }

  const sessions = new Map();
  const optedOut = new Set();
  const processing = new Set();
  const settings = {
    self_laugh_enabled: true, self_laugh_reaction: "😂",
    cognitive_delay_min_ms: MIN_COGNITIVE_DELAY_MS,
    cognitive_delay_max_ms: MAX_COGNITIVE_DELAY_MS,
  };
  const diagnostics = {
    listener: "unknown", last_event_at: null, last_sender_id: null,
    last_stage: "waiting", last_error: null, last_error_at: null,
    last_message_id: null, last_reaction_at: null,
    last_processing_delay_ms: null, last_typing_started_at: null,
    last_typing_stopped_at: null,
  };

  function mark(stage, details = {}) {
    Object.assign(diagnostics, details, { last_stage: stage });
    console.log("[PM-BATTLES] " + stage, details);
  }
  function normalizePmError(error) {
    if (error === null || error === undefined) return "Unknown error";
    if (typeof error === "string") return error.trim().slice(0, 300) || "Unknown error";
    if (typeof error !== "object") return String(error).slice(0, 300);

    // Read only data descriptors. This captures non-enumerable/prototype fields
    // without invoking arbitrary getters on library error objects.
    const readSafe = (target, key) => {
      let current = target;
      for (let depth = 0; current && depth < 4; depth++) {
        let descriptor;
        try { descriptor = Object.getOwnPropertyDescriptor(current, key); } catch { return undefined; }
        if (descriptor) return Object.prototype.hasOwnProperty.call(descriptor, "value")
          ? descriptor.value : undefined;
        try { current = Object.getPrototypeOf(current); } catch { return undefined; }
      }
      return undefined;
    };
    const safeValue = value => (
      typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ) ? String(value).trim().slice(0, 160) : "";
    const safe = {};
    const allowed = [
      "message", "errorDescription", "error_description", "errorSummary",
      "error_user_title", "error_user_msg", "code", "errorCode",
      "errorSubcode", "error_subcode", "status", "statusCode", "responseSummary", "type", "name",
    ];
    for (const key of allowed) {
      const value = safeValue(readSafe(error, key));
      if (value) safe[key] = value;
    }

    for (const nestedKey of ["error", "cause", "response", "data"]) {
      const nested = readSafe(error, nestedKey);
      if (nestedKey === "error") {
        const scalar = safeValue(nested);
        if (scalar) safe.nested_error = scalar;
      }
      if (!nested || typeof nested !== "object" || Array.isArray(nested)) continue;
      for (const key of allowed) {
        const value = safeValue(readSafe(nested, key));
        if (value && safe["nested_" + nestedKey + "_" + key] === undefined) {
          safe["nested_" + nestedKey + "_" + key] = value;
        }
      }
    }

    const detail = safe.message || safe.errorDescription || safe.error_description ||
      safe.errorSummary || safe.error_user_msg || safe.error_user_title;
    if (detail) {
      const codes = [safe.code || safe.errorCode, safe.errorSubcode || safe.error_subcode,
        safe.statusCode ? "HTTP " + safe.statusCode : ""]
        .filter(Boolean);
      const responseDetail = safe.responseSummary ? " response=" + safe.responseSummary : "";
      return (detail + (codes.length ? " (" + codes.join("/") + ")" : "") + responseDetail).slice(0, 300);
    }

    // Report shape, not values, when the library supplies an opaque object.
    const shape = [];
    try { shape.push(...Object.getOwnPropertyNames(error).slice(0, 24)); } catch {}
    let proto = null;
    try { proto = Object.getPrototypeOf(error); } catch {}
    if (proto && proto !== Object.prototype) {
      try { shape.push(...Object.getOwnPropertyNames(proto).slice(0, 12).map(key => "prototype:" + key)); } catch {}
    }
    if (Object.keys(safe).length) safe.fields = Object.keys(safe).slice(0, 20);
    if (shape.length) safe.available_properties = [...new Set(shape)].slice(0, 30);
    return Object.keys(safe).length
      ? JSON.stringify(safe).slice(0, 300)
      : "Structured Messenger error; property inspection unavailable";
  }

  function markError(stage, error) {
    const message = normalizePmError(error);
    const codeValue = error && typeof error === "object"
      ? error.code || error.errorCode || error.error?.code || error.error?.errorCode ||
        error.errorSubcode || error.error_subcode || error.cause?.code
      : null;
    const code = String(codeValue || "PM_SEND_FAILED").slice(0, 80);
    Object.assign(diagnostics, {
      last_stage: stage,
      last_error: message,
      last_error_code: code,
      last_error_at: new Date(now()).toISOString(),
    });
    console.warn("[PM-BATTLES] " + stage + ":", message, "code=" + code);
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
      const savedMin = Number(saved.cognitive_delay_min_ms);
      const savedMax = Number(saved.cognitive_delay_max_ms);
      if (Number.isFinite(savedMin)) settings.cognitive_delay_min_ms = Math.max(100, Math.min(2_000, Math.round(savedMin)));
      if (Number.isFinite(savedMax)) settings.cognitive_delay_max_ms = Math.max(settings.cognitive_delay_min_ms, Math.min(5_000, Math.round(savedMax)));
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
      const nextMin = req.body?.cognitive_delay_min_ms === undefined
        ? settings.cognitive_delay_min_ms : Number(req.body.cognitive_delay_min_ms);
      const nextMax = req.body?.cognitive_delay_max_ms === undefined
        ? settings.cognitive_delay_max_ms : Number(req.body.cognitive_delay_max_ms);
      if (!Number.isInteger(nextMin) || nextMin < 100 || nextMin > 2_000 ||
          !Number.isInteger(nextMax) || nextMax < 300 || nextMax > 5_000 || nextMax < nextMin) {
        return res.status(400).json({ ok: false, error: "Cognitive delay must be between 100–2,000 ms minimum and 300–5,000 ms maximum, with maximum at least the minimum." });
      }
      const previous = { ...settings };
      if (req.body?.self_laugh_enabled !== undefined) settings.self_laugh_enabled = req.body.self_laugh_enabled === true;
      settings.self_laugh_reaction = nextReaction;
      settings.cognitive_delay_min_ms = nextMin;
      settings.cognitive_delay_max_ms = nextMax;
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
        return res.status(502).json({
          ok: false,
          error: "Messenger could not confirm the opening message. Check PM diagnostics before retrying.",
          diagnostic_code: diagnostics.last_error_code,
        });
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
    let typingStarted = false;
    try {
      const cognitiveDelayMs = calculateCognitiveDelayMs(body, {
        min_ms: settings.cognitive_delay_min_ms,
        max_ms: settings.cognitive_delay_max_ms,
      });
      diagnostics.last_processing_delay_ms = cognitiveDelayMs;
      mark("MESSAGE_PROCESSING_DELAY", {
        recipient_id: userId, delay_ms: cognitiveDelayMs, message_length: body.length,
      });
      await delay(cognitiveDelayMs);
      if (session.status !== "active") {
        mark("REPLY_CANCELLED_SESSION_STOPPED", { recipient_id: userId, stage: "before-generation" });
        return true;
      }

      // Show typing only while a reply is actually being composed/sent.
      typingStarted = Boolean(startTyping(api, threadId));
      if (typingStarted) diagnostics.last_typing_started_at = new Date(now()).toISOString();
      mark("REPLY_GENERATION_STARTED", {
        recipient_id: userId, turn: session.turns + 1, typing_indicator: typingStarted,
      });
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
    } finally {
      if (typingStarted) {
        try { stopTyping(api, threadId); }
        catch (error) { markError("TYPING_INDICATOR_STOP_FAILED", error); }
        diagnostics.last_typing_stopped_at = new Date(now()).toISOString();
      }
      processing.delete(userId);
    }
    return true;
  }

  return {
    registerRoutes, handleIncoming, stopSession,
    getSessions: () => [...sessions.values()].map(publicSession),
    getDiagnostics: () => ({ ...diagnostics }),
  };
}

module.exports = {
  createPmBattles, calculateCognitiveDelayMs, STOP_RE, MAX_TURNS,
  IDLE_TIMEOUT_MS, ALLOWED_REACTIONS, MIN_COGNITIVE_DELAY_MS, MAX_COGNITIVE_DELAY_MS,
};
