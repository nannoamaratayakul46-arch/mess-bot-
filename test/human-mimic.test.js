"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const human = require("../human-mimic/index");

function fixedRandom(value = 0) {
  return () => value;
}

test("human facade exposes text, delay, typing, and reply preparation", () => {
  for (const name of ["humanize", "calculateHumanDelay", "startTyping", "stopTyping", "prepareReply", "createHumanContext"]) {
    assert.equal(typeof human[name], "function", name + " should be exposed");
  }
});

test("human mimic can abbreviate deterministically without mutating the original", () => {
  const original = "you are right now laughing because you really know";
  const result = human.humanize(original, {
    random: fixedRandom(0),
    abbreviations: [["right now", "rn"]],
    abbreviationRate: 1,
    typoRate: 0,
    caseVariationRate: 0,
    spaceVariationRate: 0,
    repeatedLetterRate: 0,
    reactionStyleRate: 0,
    punctuation: false,
  });

  assert.equal(original, "you are right now laughing because you really know");
  assert.match(result, /rn/);
  assert.doesNotMatch(result, /right now/);
});

test("human delay stays bounded", () => {
  const result = human.calculateHumanDelay("this is a test message", {}, {
    random: fixedRandom(0.5),
  });

  assert.ok(result.reactionMs >= 120 && result.reactionMs <= 2200);
  assert.ok(result.typingMs >= 350 && result.typingMs <= 6500);
  assert.equal(result.totalMs, result.reactionMs + result.typingMs);
});

test("prepareReply keeps transformed text and timing together", () => {
  const result = human.prepareReply("you are here", {
    random: fixedRandom(0),
    abbreviations: [["you", "u"]],
    abbreviationRate: 1,
    typoRate: 0,
    caseVariationRate: 0,
    spaceVariationRate: 0,
    repeatedLetterRate: 0,
    reactionStyleRate: 0,
    punctuation: false,
    context: { recentMessages: 1 },
  });

  assert.equal(typeof result.text, "string");
  assert.ok(result.timing.totalMs > 0);
  assert.equal(result.context.recentMessages, 1);
});
