"use strict";

const CATEGORIES = Object.freeze(["general", "insult", "laugh", "command", "boast", "slow"]);
const PREFERENCE_KEY = "jaiden_auto_target_personality";
const MAX_LINES_PER_CATEGORY = 200;
const MAX_LINE_LENGTH = 300;

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function cloneDefaults(personality) {
  return personality.getDefaultJaidenAutoTargetPools();
}

function normalizeSettings(value, defaults) {
  const input = value && typeof value === "object" ? value : {};
  const inputLines = input.lines && typeof input.lines === "object" ? input.lines : {};
  const inputEnabled = input.enabledCategories && typeof input.enabledCategories === "object"
    ? input.enabledCategories
    : {};
  const lines = {};
  const enabledCategories = {};

  for (const category of CATEGORIES) {
    const candidate = Object.prototype.hasOwnProperty.call(inputLines, category)
      ? inputLines[category]
      : defaults[category];
    if (!Array.isArray(candidate)) {
      throw validationError("The " + category + " category must be an array of lines.");
    }
    const normalized = candidate.map((line) => {
      if (typeof line !== "string") throw validationError("Every " + category + " line must be text.");
      const clean = line.trim();
      if (!clean) throw validationError("The " + category + " category cannot contain blank lines.");
      if (clean.length > MAX_LINE_LENGTH) {
        throw validationError("Each " + category + " line must be " + MAX_LINE_LENGTH + " characters or fewer.");
      }
      return clean;
    });
    if (normalized.length < 1 || normalized.length > MAX_LINES_PER_CATEGORY) {
      throw validationError("The " + category + " category must contain between 1 and " + MAX_LINES_PER_CATEGORY + " lines.");
    }
    if (new Set(normalized).size !== normalized.length) {
      throw validationError("The " + category + " category contains duplicate lines.");
    }
    lines[category] = normalized;
    enabledCategories[category] = typeof inputEnabled[category] === "boolean"
      ? inputEnabled[category]
      : true;
  }

  if (!Object.values(enabledCategories).some(Boolean)) {
    throw validationError("Enable at least one Banat category.");
  }

  return { lines, enabledCategories };
}

function createJaidenTargetPersonalitySettings({ db, personality, log = console.warn } = {}) {
  if (!db || typeof db.query !== "function") throw new Error("A database query adapter is required.");
  if (!personality || typeof personality.setJaidenAutoTargetConfiguration !== "function") {
    throw new Error("The Jaiden Auto Target personality module is required.");
  }

  let tableReady = null;
  let writeVersion = 0;
  async function ensureTable() {
    if (!tableReady) {
      tableReady = db.query(`
        CREATE TABLE IF NOT EXISTS eclipse_jaiden_auto_target_personality (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          settings JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `).catch((error) => {
        tableReady = null;
        throw error;
      });
    }
    await tableReady;
  }

  async function readSettings() {
    const defaults = cloneDefaults(personality);
    await ensureTable();
    const result = await db.query(
      "SELECT settings FROM eclipse_jaiden_auto_target_personality WHERE id = 1 LIMIT 1"
    );
    if (!result.rows || !result.rows[0]) {
      return normalizeSettings({ lines: defaults }, defaults);
    }
    try {
      return normalizeSettings(result.rows[0].settings, defaults);
    } catch (error) {
      log("[JAIDEN BANAT] Saved personality settings were invalid; defaults are active: " + (error.message || error));
      return normalizeSettings({ lines: defaults }, defaults);
    }
  }

  async function load() {
    const versionAtStart = writeVersion;
    const settings = await readSettings();
    if (versionAtStart === writeVersion) {
      personality.setJaidenAutoTargetConfiguration(settings);
    }
    return settings;
  }

  async function save(value) {
    const defaults = cloneDefaults(personality);
    const settings = normalizeSettings(value, defaults);
    await ensureTable();
    await db.query(`
      INSERT INTO eclipse_jaiden_auto_target_personality (id, settings, updated_at)
      VALUES (1, $1::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = NOW()
    `, [JSON.stringify(settings)]);
    writeVersion += 1;
    personality.setJaidenAutoTargetConfiguration(settings);
    return settings;
  }

  function registerRoutes(app, auth) {
    app.get("/api/dashboard/jaiden-auto-target/personality", auth, async (_req, res) => {
      try {
        const settings = await load();
        return res.json({ ok: true, settings, defaults: cloneDefaults(personality) });
      } catch (error) {
        log("[JAIDEN BANAT] Could not load personality settings: " + (error.message || error));
        return res.status(500).json({ ok: false, error: "Could not load Jaiden Banat settings." });
      }
    });

    app.put("/api/dashboard/jaiden-auto-target/personality", auth, async (req, res) => {
      try {
        const settings = await save(req.body || {});
        return res.json({ ok: true, settings });
      } catch (error) {
        const status = Number(error.statusCode) === 400 ? 400 : 500;
        log("[JAIDEN BANAT] Could not save personality settings: " + (error.message || error));
        return res.status(status).json({
          ok: false,
          error: status === 400 ? error.message : "Could not save Jaiden Banat settings.",
        });
      }
    });

    app.post("/api/dashboard/jaiden-auto-target/personality/reset", auth, async (_req, res) => {
      try {
        const defaults = cloneDefaults(personality);
        const settings = await save({ lines: defaults, enabledCategories: Object.fromEntries(CATEGORIES.map((name) => [name, true])) });
        return res.json({ ok: true, settings });
      } catch (error) {
        log("[JAIDEN BANAT] Could not restore default personality settings: " + (error.message || error));
        return res.status(500).json({ ok: false, error: "Could not restore default Jaiden Banat settings." });
      }
    });
  }

  return { ensureTable, load, readSettings, save, registerRoutes };
}

module.exports = {
  CATEGORIES,
  MAX_LINES_PER_CATEGORY,
  MAX_LINE_LENGTH,
  normalizeSettings,
  createJaidenTargetPersonalitySettings,
};
