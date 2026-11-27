"use strict";

const express = require("express");
const { startTyping, stopTyping } = require("./typingIndicator");
const { sendGroupMessage, setMessageReaction } = require("./messengerApiCompat");
const DOGMODE_BANATS = require("./dogmodeBanats");
const NORMAL_SPAM_BANATS = require("./normalSpamBanats");

const DEFAULTS = Object.freeze({
  messages_per_burst: 700,
  delay_seconds: 30,
  cooldown_seconds: 120,
  time_check_enabled: false,
  content_mode: "normal",
  custom_message: "moka ka aso",
  emoji: "😂",
  suffix_names: Object.freeze(["rishan", "jam", "aselm"]),
});
const clamp = (value, min, max, fallback) => {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
};
function normalize(value = {}) {
  const rawNames = Array.isArray(value.suffix_names)
    ? value.suffix_names
    : typeof value.suffix_names === "string"
      ? value.suffix_names.split(",")
      : DEFAULTS.suffix_names;
  const suffix_names = [...new Set(rawNames
    .filter(name => !/[\r\n]/.test(String(name || "")))
    .map(name => String(name || "").trim().replace(/^[-@]+/, "").slice(0, 40))
    .filter(Boolean))].slice(0, 50);
  const rawEmoji = String(value.emoji ?? DEFAULTS.emoji).trim();
  return {
    messages_per_burst: clamp(value.messages_per_burst, 1, 700, DEFAULTS.messages_per_burst),
    delay_seconds: clamp(value.delay_seconds, 1, 600, DEFAULTS.delay_seconds),
    cooldown_seconds: clamp(value.cooldown_seconds, 120, 3600, DEFAULTS.cooldown_seconds),
    time_check_enabled: value.time_check_enabled === true,
    content_mode: ["normal", "dogmode", "custom"].includes(value.content_mode) ? value.content_mode : "normal",
    custom_message: typeof value.custom_message === "string" && value.custom_message.trim() && value.custom_message.length <= 2000 ? value.custom_message : DEFAULTS.custom_message,
    emoji: rawEmoji && !/[\r\n]/.test(rawEmoji) ? rawEmoji.slice(0, 16) : DEFAULTS.emoji,
    suffix_names: suffix_names.length ? suffix_names : [...DEFAULTS.suffix_names],
  };
}
function pickIndex(length, random = Math.random) {
  return Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
}
function buildSpamMessage(config, random = Math.random) {
  if (config.content_mode === "custom") return config.custom_message;
  if (config.content_mode !== "dogmode") {
    const line = NORMAL_SPAM_BANATS[pickIndex(NORMAL_SPAM_BANATS.length, random)];
    return line + " " + config.emoji;
  }
  const line = DOGMODE_BANATS[pickIndex(DOGMODE_BANATS.length, random)]
    .replace(/\s+😂\s+-ope\s*$/i, "")
    .replace(/\s+-ope\s*$/i, "")
    .trim();
  const name = config.suffix_names[pickIndex(config.suffix_names.length, random)];
  return line + " " + config.emoji + "\n\n-" + name;
}
function randomDelaySeconds(maxDelaySeconds, random = Math.random) {
  const max = clamp(maxDelaySeconds, 1, 600, DEFAULTS.delay_seconds);
  const min = Math.min(15, max);
  return min + Math.floor(random() * (max - min + 1));
}
function formatTimeCheck(date = new Date()) {
  const formattedTime = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
  return "time check: " + formattedTime + ", wag sana d.o isa jan";
}
function createRunController() {
  const waiters = new Set();
  return {
    stopped: false,
    waiters,
    stop() {
      if (this.stopped) return;
      this.stopped = true;
      for (const wake of waiters) wake();
      waiters.clear();
    },
  };
}
function waitOrStop(ms, controller) {
  if (controller.stopped) return Promise.resolve(true);
  return new Promise(resolve => {
    let timer;
    const onStop = () => {
      clearTimeout(timer);
      controller.waiters.delete(onStop);
      resolve(true);
    };
    timer = setTimeout(() => {
      controller.waiters.delete(onStop);
      resolve(false);
    }, ms);
    controller.waiters.add(onStop);
  });
}
function sendMessage(api, text, threadID) {
  return sendGroupMessage(api, text, threadID);
}
function reactLaugh(api, messageID) {
  if (!messageID || typeof api?.setMessageReaction !== "function") return;
  setMessageReaction(api, "😂", String(messageID), { timeoutMs: 8000 }).catch(error => {
    console.warn("[BURST-ROAST] Auto-laugh reaction failed:", error?.message || error);
  });
}
function createBurstRoastSettings({ db, getApi = () => null, isKnownGroup = () => false, send = null, random = Math.random, getNow = () => new Date() }) {
  let settings = { ...DEFAULTS };
  let initialized = false;
  const lastRunAt = new Map();
  const activeRuns = new Map();
  async function load() {
    await db.query(`CREATE TABLE IF NOT EXISTS eclipse_dashboard_preferences (
      preference_key TEXT PRIMARY KEY,
      preference_value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const { rows } = await db.query(
      "SELECT preference_value FROM eclipse_dashboard_preferences WHERE preference_key = $1 LIMIT 1",
      ["burst_roast"]
    );
    settings = normalize(rows[0]?.preference_value || DEFAULTS);
    initialized = true;
    return settings;
  }
  async function ensureLoaded() { if (!initialized) await load(); return settings; }
  function registerRoutes(app, auth) {
    app.get("/api/dashboard/burst-roast/settings", auth, async (_req, res) => {
      try { res.json({ ok: true, settings: await ensureLoaded() }); }
      catch (error) { res.status(500).json({ ok: false, error: "Could not load Burst & Roast settings." }); }
    });
    app.put("/api/dashboard/burst-roast/settings", auth, express.json({ limit: "8kb" }), async (req, res) => {
      try {
        const next = normalize(req.body || {});
        await db.query(`CREATE TABLE IF NOT EXISTS eclipse_dashboard_preferences (
          preference_key TEXT PRIMARY KEY,
          preference_value JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
        await db.query(
          `INSERT INTO eclipse_dashboard_preferences (preference_key, preference_value, updated_at)
           VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (preference_key) DO UPDATE SET preference_value = EXCLUDED.preference_value, updated_at = NOW()`,
          ["burst_roast", JSON.stringify(next)]
        );
        settings = next;
        initialized = true;
        res.json({ ok: true, settings });
      } catch (error) {
        res.status(500).json({ ok: false, error: "Could not save Burst & Roast settings." });
      }
    });
    app.post("/api/dashboard/burst-roast/stop", auth, async (req, res) => {
      const rawIds = Array.isArray(req.body?.thread_ids) ? req.body.thread_ids : [];
      const threadIDs = [...new Set(rawIds.map(id => String(id || "").trim()).filter(Boolean))];
      if (!threadIDs.length || threadIDs.length > 20 || rawIds.length > 20) {
        return res.status(400).json({ ok: false, error: "Select between 1 and 20 groups to stop." });
      }
      for (const id of threadIDs) {
        if (!isKnownGroup(id)) return res.status(400).json({ ok: false, error: "Refresh the group list and select a known group." });
      }
      let stopped = 0;
      for (const id of threadIDs) {
        const controller = activeRuns.get(id);
        if (controller && !controller.stopped) { controller.stop(); stopped += 1; }
      }
      return res.json({ ok: true, stopped });
    });
    app.post("/api/dashboard/burst-roast/run", auth, async (req, res) => {
      const mode = String(req.body?.mode || "");
      const rawIds = Array.isArray(req.body?.thread_ids) ? req.body.thread_ids : [];
      const threadIDs = [...new Set(rawIds.map(id => String(id || "").trim()).filter(Boolean))].slice(0, 20);
      if (!["burst", "roast"].includes(mode)) return res.status(400).json({ ok: false, error: "Choose Burst or Roast." });
      if (!threadIDs.length) return res.status(400).json({ ok: false, error: "Select at least one group." });
      if (rawIds.length > 20) return res.status(400).json({ ok: false, error: "Select no more than 20 groups at once." });
      for (const id of threadIDs) {
        if (!isKnownGroup(id)) return res.status(400).json({ ok: false, error: "Refresh the group list and select a known group." });
      }
      const api = getApi();
      if (!api || typeof send !== "function") return res.status(503).json({ ok: false, error: "Messenger is not connected." });
      // A run may supply an editor snapshot. Validate and use it for this execution only;
      // never persist it implicitly. Older clients without a snapshot retain saved-settings behavior.
      let config;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, "settings")) {
        const snapshot = req.body.settings;
        if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
          return res.status(400).json({ ok: false, error: "Invalid Burst & Roast settings snapshot." });
        }
        const allowed = new Set(["messages_per_burst", "delay_seconds", "cooldown_seconds", "time_check_enabled", "content_mode", "custom_message", "emoji", "suffix_names"]);
        if (Object.keys(snapshot).some(key => !allowed.has(key))) {
          return res.status(400).json({ ok: false, error: "Unsupported field in Burst & Roast settings." });
        }
        const ranges = [
          ["messages_per_burst", 1, 700],
          ["delay_seconds", 1, 600],
          ["cooldown_seconds", 120, 3600],
        ];
        for (const [key, min, max] of ranges) {
          if (!Number.isInteger(snapshot[key]) || snapshot[key] < min || snapshot[key] > max) {
            return res.status(400).json({ ok: false, error: "Invalid " + key + " in Burst & Roast settings." });
          }
        }
        if (snapshot.time_check_enabled != null && typeof snapshot.time_check_enabled !== "boolean") {
          return res.status(400).json({ ok: false, error: "Invalid time_check_enabled in Burst & Roast settings." });
        }
        if (!["normal", "dogmode", "custom"].includes(snapshot.content_mode)) {
          return res.status(400).json({ ok: false, error: "Invalid content_mode in Burst & Roast settings." });
        }
        if (typeof snapshot.custom_message !== "string" || !snapshot.custom_message.trim() || snapshot.custom_message.length > 2000) {
          return res.status(400).json({ ok: false, error: "Invalid custom_message in Burst & Roast settings." });
        }
        if (typeof snapshot.emoji !== "string" || !snapshot.emoji.trim() || snapshot.emoji.length > 16 || /[\r\n]/.test(snapshot.emoji)) {
          return res.status(400).json({ ok: false, error: "Invalid emoji in Burst & Roast settings." });
        }
        if (!Array.isArray(snapshot.suffix_names) || snapshot.suffix_names.length > 50 ||
            snapshot.suffix_names.some(name => typeof name !== "string" || !name.trim() || name.length > 40 || /[\r\n]/.test(name))) {
          return res.status(400).json({ ok: false, error: "Invalid suffix_names in Burst & Roast settings." });
        }
        config = normalize(snapshot);
      } else {
        config = await ensureLoaded().catch(() => null);
        if (!config) return res.status(503).json({ ok: false, error: "Burst & Roast settings are unavailable." });
      }
      const now = Date.now();
      for (const id of threadIDs) {
        if (activeRuns.has(id)) return res.status(409).json({ ok: false, error: "A Burst & Roast run is already active in one of the selected groups." });
        const remaining = config.cooldown_seconds * 1000 - (now - (lastRunAt.get(id) || 0));
        if (remaining > 0) return res.status(429).json({ ok: false, error: "Cooldown active for a selected group. Try again in " + Math.ceil(remaining / 1000) + " seconds." });
      }
      const controllers = new Map(threadIDs.map(id => [id, createRunController()]));
      for (const id of threadIDs) { activeRuns.set(id, controllers.get(id)); lastRunAt.set(id, now); }
      res.json({ ok: true, started: true, groups: threadIDs.length, mode, content_mode: config.content_mode, messages_per_burst: config.messages_per_burst, delay_seconds: config.delay_seconds, cooldown_seconds: config.cooldown_seconds });
      void (async () => {
        await Promise.all(threadIDs.map(async threadID => {
          const controller = controllers.get(threadID);
          try {
            const count = mode === "burst" ? config.messages_per_burst : 1;
            for (let i = 0; i < count && !controller.stopped; i += 1) {
              startTyping(api, threadID);
              try {
                // Keep the short typing lead-in; randomized pacing is applied between sends.
                if (await waitOrStop(2000, controller)) break;
              } finally {
                stopTyping(api, threadID);
              }
              if (controller.stopped) break;
              try {
                const useTimeCheck = mode === "burst" && config.time_check_enabled && random() < 0.2;
                const message = useTimeCheck ? formatTimeCheck(getNow()) : buildSpamMessage(config, random);
                const info = typeof send === "function"
                  ? await send(api, message, threadID)
                  : await sendMessage(api, message, threadID);
                reactLaugh(api, info.messageID || info.messageId);
              } catch (error) {
                console.warn("[BURST-ROAST] Send failed in group " + threadID + ":", error?.message || error);
                controller.stop();
                break;
              }
              if (i + 1 < count && await waitOrStop(randomDelaySeconds(config.delay_seconds, random) * 1000, controller)) break;
            }
          } finally {
            stopTyping(api, threadID);
            if (activeRuns.get(threadID) === controller) activeRuns.delete(threadID);
          }
        }));
      })().catch(error => {
        console.warn("[BURST-ROAST] Run failed:", error?.message || error);
        for (const id of threadIDs) {
          const controller = controllers.get(id);
          controller.stop();
          if (activeRuns.get(id) === controller) activeRuns.delete(id);
          stopTyping(api, id);
        }
      });
    });
  }
  function stopAllRuns() {
    let stopped = 0;
    for (const controller of activeRuns.values()) {
      if (!controller.stopped) {
        controller.stop();
        stopped += 1;
      }
    }
    return stopped;
  }
  return { registerRoutes, getSettings: () => ({ ...settings }), stopAllRuns };
}
module.exports = { createBurstRoastSettings, DEFAULTS, normalize, buildSpamMessage, randomDelaySeconds, formatTimeCheck, DOGMODE_BANATS, NORMAL_SPAM_BANATS };
