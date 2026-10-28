"use strict";

const express = require("express");

const DEFAULTS = Object.freeze({ messages_per_burst: 5, delay_seconds: 3, cooldown_seconds: 60 });
const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
};
function normalize(value = {}) {
  return {
    messages_per_burst: clamp(value.messages_per_burst, 1, 20, DEFAULTS.messages_per_burst),
    delay_seconds: clamp(value.delay_seconds, 1, 30, DEFAULTS.delay_seconds),
    cooldown_seconds: clamp(value.cooldown_seconds, 5, 3600, DEFAULTS.cooldown_seconds),
  };
}
function createBurstRoastSettings({ db }) {
  let settings = { ...DEFAULTS };
  let initialized = false;
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
  }
  return { registerRoutes, getSettings: () => ({ ...settings }) };
}
module.exports = { createBurstRoastSettings, DEFAULTS, normalize };
