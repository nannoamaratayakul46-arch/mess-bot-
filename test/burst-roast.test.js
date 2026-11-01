"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULTS, normalize, buildSpamMessage, DOGMODE_BANATS, NORMAL_SPAM_BANATS } = require("../burstRoastSettings");

test("Burst & Roast defaults preserve the configured pacing", () => {
  const settings = normalize();
  assert.equal(settings.messages_per_burst, 5);
  assert.equal(settings.delay_seconds, 3);
  assert.equal(settings.cooldown_seconds, 60);
  assert.equal(settings.content_mode, "normal");
  assert.equal(settings.custom_message, "moka ka aso");
  assert.equal(settings.emoji, "😂");
  assert.deepEqual(settings.suffix_names, ["rishan", "jam", "aselm"]);
  assert.equal(DEFAULTS.messages_per_burst, 5);
  assert.equal(DEFAULTS.delay_seconds, 3);
  assert.equal(DEFAULTS.cooldown_seconds, 60);
});

test("Burst & Roast settings are bounded and mode/name inputs are normalized", () => {
  assert.deepEqual(normalize({
    messages_per_burst: 100,
    delay_seconds: 0,
    cooldown_seconds: 99999,
    content_mode: "dogmode",
    custom_message: "moka ka aso",
    emoji: "🔥",
    suffix_names: ["-rishan", "jam", "jam", "aselm", "\nignore"],
  }), {
    messages_per_burst: 20,
    delay_seconds: 1,
    cooldown_seconds: 3600,
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
    messages_per_burst: 5,
    delay_seconds: 3,
    cooldown_seconds: 60,
    content_mode: "normal",
    custom_message: "moka ka aso",
    emoji: "😂",
    suffix_names: ["rishan", "jam", "aselm"],
  });
});

test("Normal Spam contains 100 supplied lines and randomly formats one with the chosen emoji", () => {
  assert.equal(NORMAL_SPAM_BANATS.length, 100);
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
