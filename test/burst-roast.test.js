"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULTS, normalize, buildSpamMessage, randomDelaySeconds, formatTimeCheck, DOGMODE_BANATS, NORMAL_SPAM_BANATS } = require("../burstRoastSettings");

test("Burst & Roast defaults preserve the configured pacing", () => {
  const settings = normalize();
  assert.equal(settings.messages_per_burst, 700);
  assert.equal(settings.delay_seconds, 30);
  assert.equal(settings.cooldown_seconds, 120);
  assert.equal(settings.time_check_enabled, false);
  assert.equal(settings.content_mode, "normal");
  assert.equal(settings.custom_message, "moka ka aso");
  assert.equal(settings.emoji, "😂");
  assert.deepEqual(settings.suffix_names, ["rishan", "jam", "aselm"]);
  assert.equal(DEFAULTS.messages_per_burst, 700);
  assert.equal(DEFAULTS.delay_seconds, 30);
  assert.equal(DEFAULTS.cooldown_seconds, 120);
  assert.equal(DEFAULTS.time_check_enabled, false);
});

test("Burst & Roast settings are bounded and mode/name inputs are normalized", () => {
  assert.deepEqual(normalize({
    messages_per_burst: 999,
    delay_seconds: 999,
    cooldown_seconds: 99999,
    time_check_enabled: true,
    content_mode: "dogmode",
    custom_message: "moka ka aso",
    emoji: "🔥",
    suffix_names: ["-rishan", "jam", "jam", "aselm", "\nignore"],
  }), {
    messages_per_burst: 700,
    delay_seconds: 600,
    cooldown_seconds: 3600,
    time_check_enabled: true,
    content_mode: "dogmode",
    custom_message: "moka ka aso",
    emoji: "🔥",
    suffix_names: ["rishan", "jam", "aselm"],
  });
});

test("invalid Burst & Roast settings fall back to defaults", () => {
  assert.deepEqual(normalize({
    messages_per_burst: "not-a-number",
    delay_seconds: null,
    cooldown_seconds: Infinity,
    content_mode: "unknown",
    emoji: "\n",
    suffix_names: [],
  }), {
    messages_per_burst: 700,
    delay_seconds: 30,
    cooldown_seconds: 120,
    time_check_enabled: false,
    content_mode: "normal",
    custom_message: "moka ka aso",
    emoji: "😂",
    suffix_names: ["rishan", "jam", "aselm"],
  });
});

test("Normal Spam contains 700 supplied lines and randomly formats one with the chosen emoji", () => {
  assert.equal(NORMAL_SPAM_BANATS.length, 700);
  assert.equal(buildSpamMessage(normalize({ emoji: "💀" }), () => 0), NORMAL_SPAM_BANATS[0] + " 💀");
});

test("Dogmode Spam contains 200 source lines and formats a randomized name on a separate line", () => {
  assert.equal(DOGMODE_BANATS.length, 200);
  const settings = normalize({ content_mode: "dogmode", emoji: "😭", suffix_names: ["rishan", "jam"] });
  let calls = 0;
  const random = () => (calls++ === 0 ? 0 : 0.99);
  const cleanFirstLine = DOGMODE_BANATS[0].replace(/\s+😂\s+-ope\s*$/i, "").replace(/\s+-ope\s*$/i, "").trim();
  assert.equal(buildSpamMessage(settings, random), cleanFirstLine + " 😭\n\n-jam");
});


test("Custom Text is preserved exactly and validated", () => {
  const message = "moka ka aso @jah\\n-ope  "; 
  const settings = normalize({ content_mode: "custom", custom_message: message });
  assert.equal(settings.content_mode, "custom");
  assert.equal(buildSpamMessage(settings), message);
  assert.equal(normalize({ content_mode: "custom", custom_message: "" }).custom_message, DEFAULTS.custom_message);
  assert.equal(normalize({ content_mode: "custom", custom_message: "x".repeat(2001) }).custom_message, DEFAULTS.custom_message);
});

test("randomized delay stays within 15 seconds and the selected maximum", () => {
  assert.equal(randomDelaySeconds(600, () => 0), 15);
  assert.equal(randomDelaySeconds(600, () => 0.999999), 600);
  assert.equal(randomDelaySeconds(10, () => 0), 10);
  assert.equal(randomDelaySeconds(10, () => 0.999999), 10);
});

test("Time Check uses Asia/Manila and the exact requested message format", () => {
  assert.equal(
    formatTimeCheck(new Date("2026-01-01T00:00:00.000Z")),
    "time check: 8:00:00 AM, wag sana d.o isa jan"
  );
});
