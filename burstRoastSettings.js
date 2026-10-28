"use strict";

const express = require("express");
const { startTyping, stopTyping } = require("./typingIndicator");
const DOGMODE_BANATS = require("./dogmodeBanats");

const DEFAULTS = Object.freeze({
  messages_per_burst: 5,
  delay_seconds: 3,
  cooldown_seconds: 60,
  content_mode: "normal",
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
    .map(name => String(name || "").trim().replace(/^[-@]+/, "").slice(0, 40))
    .filter(name => name && !/[\r\n]/.test(name)))].slice(0, 50);
  const rawEmoji = String(value.emoji ?? DEFAULTS.emoji).trim();
  return {
    messages_per_burst: clamp(value.messages_per_burst, 1, 20, DEFAULTS.messages_per_burst),
    delay_seconds: clamp(value.delay_seconds, 1, 30, DEFAULTS.delay_seconds),
    cooldown_seconds: clamp(value.cooldown_seconds, 5, 3600, DEFAULTS.cooldown_seconds),
    content_mode: value.content_mode === "dogmode" ? "dogmode" : "normal",
    emoji: rawEmoji && !/[\r\n]/.test(rawEmoji) ? rawEmoji.slice(0, 16) : DEFAULTS.emoji,
    suffix_names: suffix_names.length ? suffix_names : [...DEFAULTS.suffix_names],
  };
}
function pickIndex(length, random = Math.random) {
  return Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
}
function buildSpamMessage(config, random = Math.random) {
  if (config.content_mode !== "dogmode") return "moka ka aso " + config.emoji;
  const line = DOGMODE_BANATS[pickIndex(DOGMODE_BANATS.length, random)];
  const name = config.suffix_names[pickIndex(config.suffix_names.length, random)];
  return line + " " + config.emoji + "\n\n-" + name;
}
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function sendMessage(api, text, threadID) {
  return new Promise((resolve, reject) => {
    try {
      api.sendMessage(text, threadID, (error, info) => error ? reject(error) : resolve(info || {}));
    } catch (error) { reject(error); }
  });
}
function reactLaugh(api, messageID) {
  if (!messageID || typeof api.setMessageReaction !== "function") return;
  try {
    api.setMessageReaction("😂", String(messageID), error => {
      if (error) console.warn("[BURST-ROAST] Auto-laugh reaction failed:", error?.message || error);
    }, true);
  } catch (error) {
    console.warn("[BURST-ROAST] Auto-laugh reaction failed:", error?.message || error);
  }
}
function createBurstRoastSettings({ db, getApi = () => null, isKnownGroup = () => false, send = null }) {
  let settings = { ...DEFAULTS };
  let initialized = false;
  const lastRunAt = new Map();
  const activeRuns = new Set();
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
      const config = await ensureLoaded().catch(() => null);
      if (!config) return res.status(503).json({ ok: false, error: "Burst & Roast settings are unavailable." });
      const now = Date.now();
      for (const id of threadIDs) {
        if (activeRuns.has(id)) return res.status(409).json({ ok: false, error: "A Burst & Roast run is already active in one of the selected groups." });
        const remaining = config.cooldown_seconds * 1000 - (now - (lastRunAt.get(id) || 0));
        if (remaining > 0) return res.status(429).json({ ok: false, error: "Cooldown active for a selected group. Try again in " + Math.ceil(remaining / 1000) + " seconds." });
      }
      for (const id of threadIDs) { activeRuns.add(id); lastRunAt.set(id, now); }
      res.json({ ok: true, started: true, groups: threadIDs.length, mode });
      void (async () => {
        try {
          await Promise.all(threadIDs.map(async threadID => {
            startTyping(api, threadID);
            try {
              const count = mode === "burst" ? config.messages_per_burst : 1;
              for (let i = 0; i < count; i += 1) {
                try {
                  const message = buildSpamMessage(config);
                  const info = typeof send === "function"
                    ? await send(api, message, threadID)
                    : await sendMessage(api, message, threadID);
                  reactLaugh(api, info.messageID || info.messageId);
                } catch (error) {
                  console.warn("[BURST-ROAST] Send failed in group " + threadID + ":", error?.message || error);
                  break;
                }
                if (i + 1 < count) await wait(config.delay_seconds * 1000);
              }
            } finally { stopTyping(api, threadID); activeRuns.delete(threadID); }
          }));
        } catch (error) {
          console.warn("[BURST-ROAST] Run failed:", error?.message || error);
          for (const id of threadIDs) { activeRuns.delete(id); stopTyping(api, id); }
        }
      })();
    });
  }
  return { registerRoutes, getSettings: () => ({ ...settings }) };
}
module.exports = { createBurstRoastSettings, DEFAULTS, normalize, buildSpamMessage, DOGMODE_BANATS };
