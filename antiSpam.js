"use strict";

const express = require("express");
const { getAutoModSettings, setAutoModEnabled, removeFromGroup, isAdmin } = require("./moderation");

const DEFAULTS = Object.freeze({
  max_messages: 6,
  window_seconds: 8,
  repeat_max: 4,
  warn_first: true,
  warn_grace_seconds: 120,
  warn_text: "{{name}}, slow down. Spamming again within 2 minutes will get you removed.",
});

const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
};
const norm = value => String(value || "").toLowerCase().replace(/\s+/g, " ").trim();

function callbackCall(invoke, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, data) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(data);
    };
    const timer = setTimeout(() => finish(new Error("Messenger API timed out")), timeoutMs);
    try {
      const result = invoke((error, data) => finish(error, data));
      if (result && typeof result.then === "function") {
        result.then(data => finish(null, data), error => finish(error));
      }
    } catch (error) {
      finish(error);
    }
  });
}

function createAntiSpam({ db, getApi = () => null, isKnownGroup = () => true, log = () => {}, getSettings = getAutoModSettings, setEnabled = setAutoModEnabled }) {
  if (!db || typeof db.query !== "function") throw new TypeError("antiSpam requires the persistent db query interface");

  const hits = new Map();
  const queues = new Map();
  const removalFailures = new Map();
  let schemaPromise = null;

  async function ensureTables() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await db.query(`
          CREATE TABLE IF NOT EXISTS automod_spam_settings (
            thread_id TEXT PRIMARY KEY,
            max_messages INTEGER NOT NULL DEFAULT 6,
            window_seconds INTEGER NOT NULL DEFAULT 8,
            repeat_max INTEGER NOT NULL DEFAULT 4,
            warn_first BOOLEAN NOT NULL DEFAULT TRUE,
            warn_grace_seconds INTEGER NOT NULL DEFAULT 120,
            warn_text TEXT NOT NULL DEFAULT '{{name}}, slow down. Spamming again within 2 minutes will get you removed.',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        await db.query(`
          CREATE TABLE IF NOT EXISTS automod_spam_warnings (
            thread_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            warned_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (thread_id, user_id)
          )
        `);
        await db.query("CREATE INDEX IF NOT EXISTS idx_automod_spam_warnings_time ON automod_spam_warnings(warned_at)");
        await db.query(`
          CREATE TABLE IF NOT EXISTS automod_profile_abuse_events (
            id BIGSERIAL PRIMARY KEY,
            thread_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            event_key TEXT NOT NULL,
            event_type TEXT NOT NULL,
            created_at BIGINT NOT NULL,
            UNIQUE(thread_id, event_key)
          )
        `);
        await db.query("CREATE INDEX IF NOT EXISTS idx_automod_profile_abuse_recent ON automod_profile_abuse_events(thread_id, user_id, created_at)");
      })().catch(error => {
        schemaPromise = null;
        throw error;
      });
    }
    return schemaPromise;
  }

  async function getConfig(threadID) {
    await ensureTables();
    const result = await db.query(
      "SELECT max_messages, window_seconds, repeat_max, warn_first, warn_grace_seconds, warn_text FROM automod_spam_settings WHERE thread_id = $1",
      [String(threadID)],
    );
    return { ...DEFAULTS, ...(result.rows[0] || {}) };
  }

  async function sendMessage(api, threadID, text) {
    if (!api || typeof api.sendMessage !== "function") throw new Error("sendMessage is unavailable");
    await callbackCall(cb => api.sendMessage(text, threadID, cb), 12000);
  }

  async function removeMember(api, threadID, userID, name) {
    const failureKey = threadID + ":" + userID;
    const lastFailure = removalFailures.get(failureKey) || 0;
    if (Date.now() - lastFailure < 30000) return false;

    if (typeof removeFromGroup !== "function") {
      log("[AUTOMOD-SPAM] shared moderation removal helper is unavailable");
      removalFailures.set(failureKey, Date.now());
      return false;
    }

    let removal;
    try {
      // Use moderation.js as the single source of truth for role checks,
      // protected-admin handling, API timeouts, and Messenger error details.
      removal = await removeFromGroup(api, String(threadID), String(userID));
    } catch (error) {
      removalFailures.set(failureKey, Date.now());
      log(`[AUTOMOD-SPAM] shared removal helper failed for ${userID} in ${threadID}: ${String(error?.message || error).slice(0, 180)}`);
      return false;
    }

    if (!removal?.ok) {
      removalFailures.set(failureKey, Date.now());
      const detail = String(removal?.errorMessage || removal?.errorCode || "Unknown removal failure").slice(0, 180);
      log(`[AUTOMOD-SPAM] removal failed for ${userID} in ${threadID}: ${detail}`);
      return false;
    }

    try {
      await db.query(
        "DELETE FROM automod_spam_warnings WHERE thread_id = $1 AND user_id = $2",
        [String(threadID), String(userID)],
      );
      hits.delete(threadID + ":" + userID);
      removalFailures.delete(failureKey);
      log(`[AUTOMOD-SPAM] removed ${userID} (${name}) from ${threadID} after repeated spam`);
      return true;
    } catch (error) {
      // The Messenger removal already succeeded. Log cleanup failure separately
      // rather than reporting that the kick itself failed.
      log(`[AUTOMOD-SPAM] removed ${userID} from ${threadID}, but warning cleanup failed: ${String(error?.message || error).slice(0, 160)}`);
      return true;
    }
  }

  async function processMessage(api, event) {
    const threadID = String(event?.threadID || "").trim();
    const userID = String(event?.senderID || "").trim();
    const text = String(event?.body || "").trim();
    if (!threadID || !userID || !text) return;
    if (typeof api?.getCurrentUserID === "function" && userID === String(api.getCurrentUserID())) return;

    const autoSettings = await getSettings(threadID);
    if (autoSettings?.enabled !== true) return;

    const cfg = await getConfig(threadID);
    const now = Date.now();
    const key = threadID + ":" + userID;
    const windowMs = cfg.window_seconds * 1000;
    const list = (hits.get(key) || []).filter(hit => now - hit.at < windowMs * 2);
    const cleanText = norm(text);
    list.push({ at: now, text: cleanText });
    hits.set(key, list);

    const burst = list.filter(hit => now - hit.at < windowMs).length >= cfg.max_messages;
    const repeated = cleanText && list.filter(hit => hit.text === cleanText).length >= cfg.repeat_max;
    if (!burst && !repeated) return;

    hits.set(key, []);
    const warningResult = await db.query(
      "SELECT warned_at FROM automod_spam_warnings WHERE thread_id = $1 AND user_id = $2",
      [threadID, userID],
    );
    const warnedAt = warningResult.rows[0]?.warned_at ? new Date(warningResult.rows[0].warned_at).getTime() : 0;
    const warnedRecently = warnedAt > 0 && now - warnedAt < cfg.warn_grace_seconds * 1000;
    const name = String(event?.senderName || event?.name || "You").trim().slice(0, 60) || "You";

    if (cfg.warn_first && !warnedRecently) {
      await db.query(
        `INSERT INTO automod_spam_warnings(thread_id, user_id, warned_at)
         VALUES($1, $2, NOW())
         ON CONFLICT(thread_id, user_id) DO UPDATE SET warned_at = EXCLUDED.warned_at`,
        [threadID, userID],
      );
      const warning = String(cfg.warn_text || DEFAULTS.warn_text).replace(/\{\{\s*name\s*\}\}/gi, name);
      try {
        await sendMessage(api, threadID, warning);
        log(`[AUTOMOD-SPAM] warned ${userID} in ${threadID}`);
      } catch (error) {
        log(`[AUTOMOD-SPAM] warning send failed in ${threadID}: ${String(error?.message || error).slice(0, 160)}`);
      }
      return;
    }

    const removed = await removeMember(api, threadID, userID, name);
    if (!removed) {
      // Do not claim success or disable automod when Messenger refuses the kick.
      log(`[AUTOMOD-SPAM] kick not completed for ${userID} in ${threadID}; check that the bot is a group admin`);
    }
  }

  const PROFILE_ABUSE_THRESHOLD = 3;
  const PROFILE_ABUSE_WINDOW_MS = 60 * 1000;

  async function processGroupProfileEvent(api, event) {
    const eventType = String(event?.logMessageType || "");
    if (event?.type !== "event" || !["log:thread-image", "log:thread-name"].includes(eventType)) return;

    const threadID = String(event?.threadID || "").trim();
    const rawAuthor = event?.author ?? event?.authorID ?? event?.senderID;
    const userID = String(
      rawAuthor && typeof rawAuthor === "object"
        ? rawAuthor.id ?? rawAuthor.userID ?? rawAuthor.userId ?? ""
        : rawAuthor ?? ""
    ).trim();
    if (!threadID || !userID) {
      log("[AUTOMOD-PROFILE] Ignored profile change because the group or actor ID was missing.");
      return;
    }

    const botID = String(typeof api?.getCurrentUserID === "function" ? api.getCurrentUserID() : "").trim();
    if ((botID && userID === botID) || isAdmin(userID)) return;

    const settings = await getSettings(threadID);
    if (settings?.enabled !== true) return;

    await ensureTables();
    const data = event?.logMessageData && typeof event.logMessageData === "object"
      ? event.logMessageData
      : {};
    const messageID = String(
      event?.messageID || event?.messageId || event?.logMessageId ||
      data?.messageID || data?.messageId || ""
    ).trim();
    const timestamp = Number(event?.timestamp || event?.time || data?.timestamp || 0);
    const now = Date.now();
    const fingerprint = messageID
      ? "message:" + messageID
      : [eventType, userID, timestamp || Math.floor(now / 3000), JSON.stringify(data)].join(":").slice(0, 900);

    const inserted = await db.query(
      `INSERT INTO automod_profile_abuse_events(thread_id, user_id, event_key, event_type, created_at)
       VALUES($1, $2, $3, $4, $5)
       ON CONFLICT(thread_id, event_key) DO NOTHING
       RETURNING id`,
      [threadID, userID, fingerprint, eventType, now],
    );
    if (!inserted.rows?.length) return;

    // Keep the table bounded while retaining enough history to diagnose recent actions.
    await db.query(
      "DELETE FROM automod_profile_abuse_events WHERE thread_id = $1 AND created_at < $2",
      [threadID, now - 24 * 60 * 60 * 1000],
    );
    const recent = await db.query(
      "SELECT COUNT(*)::int AS count FROM automod_profile_abuse_events WHERE thread_id = $1 AND user_id = $2 AND created_at >= $3",
      [threadID, userID, now - PROFILE_ABUSE_WINDOW_MS],
    );
    const count = Number(recent.rows?.[0]?.count || 0);
    log(`[AUTOMOD-PROFILE] ${userID} made ${count}/${PROFILE_ABUSE_THRESHOLD} group photo/name changes in ${threadID} within 60 seconds.`);
    if (count < PROFILE_ABUSE_THRESHOLD) return;

    const removal = await removeFromGroup(api, threadID, userID);
    if (!removal?.ok) {
      log(`[AUTOMOD-PROFILE] kick not completed for ${userID} in ${threadID}: ${String(removal?.errorMessage || removal?.errorCode || "Unknown removal failure").slice(0, 180)}`);
      return;
    }

    await db.query(
      "DELETE FROM automod_profile_abuse_events WHERE thread_id = $1 AND user_id = $2",
      [threadID, userID],
    );
    log(`[AUTOMOD-PROFILE] removed ${userID} from ${threadID} after repeated group photo/name changes.`);
  }

  function onGroupEvent(apiOrEvent, maybeEvent) {
    const api = maybeEvent ? apiOrEvent : getApi();
    const event = maybeEvent || apiOrEvent;
    const threadID = String(event?.threadID || "").trim();
    const rawAuthor = event?.author ?? event?.authorID ?? event?.senderID;
    const userID = String(
      rawAuthor && typeof rawAuthor === "object"
        ? rawAuthor.id ?? rawAuthor.userID ?? rawAuthor.userId ?? ""
        : rawAuthor ?? ""
    ).trim();
    if (!threadID || !userID) return Promise.resolve();
    const key = threadID + ":" + userID;
    const previous = queues.get(key) || Promise.resolve();
    const next = previous.then(() => processGroupProfileEvent(api, event)).catch(error => {
      log(`[AUTOMOD-PROFILE] event check failed: ${String(error?.message || error).slice(0, 180)}`);
    });
    queues.set(key, next);
    return next.finally(() => {
      if (queues.get(key) === next) queues.delete(key);
    });
  }

  function onMessage(apiOrEvent, maybeEvent) {
    const api = maybeEvent ? apiOrEvent : getApi();
    const event = maybeEvent || apiOrEvent;
    const threadID = String(event?.threadID || "");
    const userID = String(event?.senderID || "");
    if (!threadID || !userID) return Promise.resolve();
    const key = threadID + ":" + userID;
    const previous = queues.get(key) || Promise.resolve();
    const next = previous.then(() => processMessage(api, event)).catch(error => {
      log(`[AUTOMOD-SPAM] message check failed: ${String(error?.message || error).slice(0, 180)}`);
    });
    queues.set(key, next);
    return next.finally(() => {
      if (queues.get(key) === next) queues.delete(key);
    });
  }

  function normalizeConfig(body = {}) {
    return {
      max_messages: clamp(body.max_messages, 3, 30, DEFAULTS.max_messages),
      window_seconds: clamp(body.window_seconds, 3, 60, DEFAULTS.window_seconds),
      repeat_max: DEFAULTS.repeat_max,
      warn_first: body.warn_first !== false,
      warn_grace_seconds: DEFAULTS.warn_grace_seconds,
      warn_text: DEFAULTS.warn_text,
    };
  }

  function registerRoutes(app, auth) {
    const route = "/api/dashboard/groups/:threadId/antispam";
    app.get(route, auth, async (req, res) => {
      try {
        const threadID = String(req.params.threadId || "").trim();
        if (!threadID || !isKnownGroup(threadID)) return res.status(404).json({ error: "Group not found in the bot's current group list." });
        const [cfg, settings] = await Promise.all([getConfig(threadID), getAutoModSettings(threadID)]);
        return res.json({ antispam: { ...cfg, enabled: settings.enabled === true } });
      } catch (error) {
        log(`[AUTOMOD-SPAM] settings load failed: ${String(error?.message || error).slice(0, 160)}`);
        return res.status(503).json({ error: "Could not load persistent automod settings." });
      }
    });

    app.put(route, auth, express.json({ limit: "10kb" }), async (req, res) => {
      try {
        const threadID = String(req.params.threadId || "").trim();
        if (!threadID || !isKnownGroup(threadID)) return res.status(404).json({ error: "Group not found in the bot's current group list." });
        const body = req.body || {};
        const cfg = normalizeConfig(body);
        await ensureTables();
        await db.query(
          `INSERT INTO automod_spam_settings(thread_id, max_messages, window_seconds, repeat_max, warn_first, warn_grace_seconds, warn_text, updated_at)
           VALUES($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT(thread_id) DO UPDATE SET max_messages = EXCLUDED.max_messages, window_seconds = EXCLUDED.window_seconds,
             repeat_max = EXCLUDED.repeat_max, warn_first = EXCLUDED.warn_first, warn_grace_seconds = EXCLUDED.warn_grace_seconds,
             warn_text = EXCLUDED.warn_text, updated_at = NOW()`,
          [threadID, cfg.max_messages, cfg.window_seconds, cfg.repeat_max, cfg.warn_first, cfg.warn_grace_seconds, cfg.warn_text],
        );
        const settings = await setEnabled(threadID, body.enabled === true);
        log(`[AUTOMOD-SPAM] ${settings.enabled ? "enabled" : "disabled"} for all members in ${threadID}`);
        return res.json({ antispam: { ...cfg, enabled: settings.enabled === true } });
      } catch (error) {
        log(`[AUTOMOD-SPAM] settings save failed: ${String(error?.message || error).slice(0, 160)}`);
        return res.status(503).json({ error: "Could not save persistent automod settings." });
      }
    });

    app.delete(route, auth, async (req, res) => {
      try {
        const threadID = String(req.params.threadId || "").trim();
        if (!threadID || !isKnownGroup(threadID)) return res.status(404).json({ error: "Group not found in the bot's current group list." });
        await setEnabled(threadID, false);
        await ensureTables();
        await db.query("DELETE FROM automod_spam_settings WHERE thread_id = $1", [threadID]);
        await db.query("DELETE FROM automod_spam_warnings WHERE thread_id = $1", [threadID]);
        for (const key of hits.keys()) if (key.startsWith(threadID + ":")) hits.delete(key);
        log(`[AUTOMOD-SPAM] cleared for ${threadID}`);
        return res.json({ ok: true });
      } catch (error) {
        log(`[AUTOMOD-SPAM] settings clear failed: ${String(error?.message || error).slice(0, 160)}`);
        return res.status(503).json({ error: "Could not clear persistent automod settings." });
      }
    });
  }

  return { onMessage, onGroupEvent, registerRoutes, ensureTables };
}

module.exports = { createAntiSpam, DEFAULTS };
