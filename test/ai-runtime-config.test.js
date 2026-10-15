"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

function loadModule(key) {
  process.env.ECLIPSE_SETTINGS_ENCRYPTION_KEY = key;
  delete require.cache[require.resolve("../ai/runtime-config")];
  return require("../ai/runtime-config");
}

test("AI settings encryption round-trips and uses authenticated ciphertext", () => {
  const key = crypto.randomBytes(32).toString("hex");
  const config = { enabled: true, activeProvider: "groq", providers: { groq: { apiKey: "test-secret", model: "openai/gpt-oss-20b" } } };
  const { encryptConfig, decryptConfig } = loadModule(key);
  const encrypted = encryptConfig(config);
  assert.match(encrypted, /^v1:/);
  assert.ok(!encrypted.includes("test-secret"));
  assert.deepEqual(decryptConfig(encrypted), config);
  const changed = encrypted.slice(0, -2) + (encrypted.endsWith("AA") ? "BB" : "AA");
  assert.throws(() => decryptConfig(changed));
});

test("AI settings encryption rejects a missing or invalid encryption key", () => {
  const { encryptConfig } = loadModule("too-short");
  assert.throws(() => encryptConfig({ enabled: true }), /32-byte key/);
});
