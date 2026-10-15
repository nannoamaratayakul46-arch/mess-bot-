"use strict";

const crypto = require("node:crypto");
const db = require("../db");

const TABLE = "eclipse_ai_settings";
// Cache provider settings for five minutes to avoid unnecessary Neon reads.
const CACHE_TTL_MS = 5 * 60_000;
const PROVIDERS = Object.freeze({
  groq: { model: "openai/gpt-oss-20b" },
  openai: { model: "gpt-4o-mini" },
  gemini: { model: "gemini-3.8-flash" },
  anthropic: { model: "claude-haiku-4-5" },
});

let tablePromise = null;
let cachedAt = 0;
let cachedConfig = null;
let cachedExists = false;

function encryptionKey() {
  const raw = String(process.env.ECLIPSE_SETTINGS_ENCRYPTION_KEY || "").trim();
  if (!raw) throw new Error("ECLIPSE_SETTINGS_ENCRYPTION_KEY is not configured.");
  let key = null;
  if (/^[a-f0-9]{64}$/i.test(raw)) key = Buffer.from(raw, "hex");
  else {
    try {
      const decoded = Buffer.from(raw, "base64");
      if (decoded.length === 32) key = decoded;
    } catch {}
    if (!key && Buffer.byteLength(raw, "utf8") === 32) key = Buffer.from(raw, "utf8");
  }
  if (!key || key.length !== 32) {
    throw new Error("ECLIPSE_SETTINGS_ENCRYPTION_KEY must be a 32-byte key encoded as 64 hex characters, base64, or 32 UTF-8 bytes.");
  }
  return key;
}

function encryptConfig(config) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(config), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

function decryptConfig(value) {
  const parts = String(value || "").split(":");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Stored AI settings have an unsupported encryption format.");
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const ciphertext = Buffer.from(parts[3], "base64");
  if (iv.length !== 12 || tag.length !== 16 || !ciphertext.length) throw new Error("Stored AI settings are malformed.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  const config = JSON.parse(plain);
  if (!config || typeof config !== "object" || !PROVIDERS[config.activeProvider] || typeof config.providers !== "object") {
    throw new Error("Stored AI settings are invalid.");
  }
  return config;
}

function defaultConfigFromEnvironment() {
  return {
    enabled: /^true$/i.test(String(process.env.ECLIPSE_GROQ_ENABLED || "false").trim()),
    activeProvider: "groq",
    providers: {
      groq: {
        apiKey: String(process.env.GROQ_API_KEY || "").trim(),
        model: (() => { const configured = String(process.env.AI_MODEL || "").trim().replace(/^models\//, ""); return !configured || /^gemini(?:[-_]|$)/i.test(configured) ? PROVIDERS.groq.model : configured; })(),
      },
      openai: { apiKey: "", model: PROVIDERS.openai.model },
      gemini: { apiKey: "", model: PROVIDERS.gemini.model },
      anthropic: { apiKey: "", model: PROVIDERS.anthropic.model },
    },
  };
}

async function ensureTable() {
  if (!tablePromise) {
    tablePromise = db.query(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        encrypted_config TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).catch(error => {
      tablePromise = null;
      throw error;
    });
  }
  return tablePromise;
}

async function readStoredConfig() {
  await ensureTable();
  const result = await db.query("SELECT encrypted_config, updated_at FROM " + TABLE + " WHERE id = 1");
  if (!result.rows?.length) return null;
  try {
    return decryptConfig(result.rows[0].encrypted_config);
  } catch (error) {
    error.code = "AI_SETTINGS_DECRYPTION_FAILED";
    throw error;
  }
}

async function getRuntimeAiConfig({ forceRefresh = false } = {}) {
  if (!forceRefresh && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedExists ? { ...cachedConfig, configured: true } : { configured: false };
  }
  try {
    const stored = await readStoredConfig();
    cachedAt = Date.now();
    cachedExists = Boolean(stored);
    cachedConfig = stored;
    return stored ? { ...stored, configured: true } : { configured: false };
  } catch (error) {
    if (error?.code === "AI_SETTINGS_DECRYPTION_FAILED") {
      // Fail closed if the encryption key is missing, rotated, or ciphertext is damaged.
      cachedAt = Date.now();
      cachedExists = true;
      cachedConfig = { enabled: false, activeProvider: "groq", providers: { groq: { apiKey: "", model: PROVIDERS.groq.model } } };
      return { ...cachedConfig, configured: true, invalid: true };
    }
    // Keep the last successfully decrypted settings if Neon becomes unavailable.
    // A saved dashboard "disabled" setting must not fall back to old env settings.
    if (cachedExists && cachedConfig) {
      cachedAt = Date.now();
      return { ...cachedConfig, configured: true, stale: true };
    }
    cachedAt = Date.now();
    return { configured: false, unavailable: true };
  }
}

function publicSettings(config, configured) {
  const providers = {};
  for (const [id, defaults] of Object.entries(PROVIDERS)) {
    const entry = config.providers?.[id] || {};
    providers[id] = {
      configured: Boolean(String(entry.apiKey || "").trim()),
      model: String(entry.model || defaults.model),
    };
  }
  return {
    configured: Boolean(configured),
    enabled: Boolean(config.enabled),
    activeProvider: PROVIDERS[config.activeProvider] ? config.activeProvider : "groq",
    providers,
  };
}

async function getPublicAiSettings() {
  await ensureTable();
  const result = await db.query("SELECT encrypted_config FROM " + TABLE + " WHERE id = 1");
  if (!result.rows?.length) return publicSettings(defaultConfigFromEnvironment(), false);
  return publicSettings(decryptConfig(result.rows[0].encrypted_config), true);
}

function validateModel(model) {
  const value = String(model || "").trim();
  if (!value || value.length > 120 || !/^[a-zA-Z0-9._:/-]+$/.test(value)) {
    throw new Error("Model must be 1–120 characters and contain only letters, numbers, dots, underscores, colons, slashes, or hyphens.");
  }
  return value;
}

async function saveAiSettings(input = {}) {
  await ensureTable();
  const result = await db.query("SELECT encrypted_config FROM " + TABLE + " WHERE id = 1");
  const current = result.rows?.length
    ? decryptConfig(result.rows[0].encrypted_config)
    : defaultConfigFromEnvironment();

  const activeProvider = String(input.activeProvider || current.activeProvider);
  if (!PROVIDERS[activeProvider]) throw new Error("Choose a supported AI provider.");
  if (typeof input.enabled !== "boolean") throw new Error("AI enabled must be a boolean.");

  const next = {
    enabled: input.enabled,
    activeProvider,
    providers: {},
  };
  for (const [id, defaults] of Object.entries(PROVIDERS)) {
    const existing = current.providers?.[id] || {};
    next.providers[id] = {
      apiKey: String(existing.apiKey || ""),
      model: String(existing.model || defaults.model),
    };
  }

  const provider = String(input.provider || activeProvider);
  if (!PROVIDERS[provider]) throw new Error("Choose a supported AI provider.");
  const existing = next.providers[provider];
  if (input.clearKey === true) existing.apiKey = "";
  else if (typeof input.apiKey === "string" && input.apiKey.trim()) {
    if (input.apiKey.length > 4096 || /[\u0000-\u001f\u007f]/.test(input.apiKey)) {
      throw new Error("API key has an invalid format or is too long.");
    }
    existing.apiKey = input.apiKey.trim();
  }
  if (input.model !== undefined) existing.model = validateModel(input.model);

  const encrypted = encryptConfig(next);
  await db.query(
    "INSERT INTO " + TABLE + " (id, encrypted_config, updated_at) VALUES (1, $1, NOW()) ON CONFLICT (id) DO UPDATE SET encrypted_config = EXCLUDED.encrypted_config, updated_at = NOW()",
    [encrypted]
  );
  cachedConfig = next;
  cachedExists = true;
  cachedAt = Date.now();
  return publicSettings(next, true);
}

module.exports = {
  PROVIDERS,
  encryptConfig,
  decryptConfig,
  getRuntimeAiConfig,
  getPublicAiSettings,
  saveAiSettings,
};
