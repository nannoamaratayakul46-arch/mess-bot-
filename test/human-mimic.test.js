"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const human = require("../human-mimic");

function fixedRandom(value = 0) {
  return () => value;
}

test("human mimic exposes one facade for text, delay, and typing", () => {
  assert.equal(typeof human.humanize, "function");
  assert.equal(typeof human.calculateHumanDelay, "function");
  assert.equal(typeof human.startTyping, "function");
  assert.equal(typeof human.stopTyping, "function");
  assert.equal(typeof human.prepareReply, "function");
});

test("human mimic can abbreviate without changing the original", () => {
  const original = "you are right now laughing because you really know";
  const result = human.humanize(original, {
    random: fixedRandom(0),
    typos: false,
    punctuation: false,
  });

  assert.equal(original, "you are right now laughing because you really know");
  assert.match(result, /u/);
  assert.match(result, /r/);
  assert.match(result, /rn/);
  assert.match(result, /lmao/);
  assert.match(result, /bc/);
  assert.match(result, /rlly/);
});

test("human delay stays bounded", () => {
  const result = human.calculateHumanDelay("this is a test message", {}, {
    random: fixedRandom(0.5),
  });

  assert.ok(result.reactionMs >= 220 && result.reactionMs <= 2200);
  assert.ok(result.typingMs >= 350 && result.typingMs <= 6500);
  assert.equal(result.totalMs, result.reactionMs + result.typingMs);
});

test("prepareReply keeps text and timing together", () => {
  const result = human.prepareReply("you are here", {
    random: fixedRandom(0),
    typos: false,
    punctuation: false,
    context: { recentMessages: 1 },
  });

  assert.equal(typeof result.text, "string");
  assert.ok(result.timing.totalMs > 0);
});
