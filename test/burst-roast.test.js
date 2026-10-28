"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULTS, normalize } = require("../burstRoastSettings");

test("Burst & Roast defaults match the dashboard design", () => {
  assert.deepEqual(normalize(), {
    messages_per_burst: 5,
    delay_seconds: 3,
    cooldown_seconds: 60,
  });
  assert.deepEqual(DEFAULTS, {
    messages_per_burst: 5,
    delay_seconds: 3,
    cooldown_seconds: 60,
  });
});

test("Burst & Roast settings are bounded to safe ranges", () => {
  assert.deepEqual(normalize({
    messages_per_burst: 100,
    delay_seconds: 0,
    cooldown_seconds: 99999,
  }), {
    messages_per_burst: 20,
    delay_seconds: 1,
    cooldown_seconds: 3600,
  });
});

test("invalid Burst & Roast settings fall back to defaults", () => {
  assert.deepEqual(normalize({
    messages_per_burst: "not-a-number",
    delay_seconds: null,
    cooldown_seconds: Infinity,
  }), {
    messages_per_burst: 5,
    delay_seconds: 3,
    cooldown_seconds: 60,
  });
});
