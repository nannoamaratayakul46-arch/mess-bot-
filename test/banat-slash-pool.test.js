"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../banat-slash-pool");
const slashBanats = require("../slash-banats");
const triggers = require("../triggers");


function normalizePhrase(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\\s+/g, " ")
    .trim();
}

test("normal Banat pool has no duplicate phrases", () => {
  const group = triggers.groups.find((item) => item.name === "banat-natural");
  assert.ok(group, "natural Banat group should exist");
  const normalized = group.replies.map(normalizePhrase);
  assert.equal(new Set(normalized).size, normalized.length);
});

test("normal Banat phrases do not duplicate slash or backslash pools", () => {
  const group = triggers.groups.find((item) => item.name === "banat-natural");
  const normalPhrases = new Set(group.replies.map(normalizePhrase));
  const otherPhrases = [
    ...slashBanats.onReplies,
    ...slashBanats.offReplies,
    ...slashBanats.unauthorizedReplies,
    ...pool.INSULTS
  ].map(normalizePhrase);

  for (const phrase of otherPhrases) {
    assert.equal(
      normalPhrases.has(phrase),
      false,
      "duplicate phrase found across Banat pools: " + phrase
    );
  }
});

test("slash pool has unique phrases", () => {
  assert.ok(pool.INSULTS.length >= 190 && pool.INSULTS.length <= 250);
  assert.equal(new Set(pool.INSULTS).size, pool.INSULTS.length);
});

test("randomizer does not repeat until pool is exhausted", () => {
  const results = [];
  for (let i = 0; i < pool.INSULTS.length; i++) {
    results.push(pool.pickSlashPoolInsult("test-thread", "test-sender"));
  }
  assert.equal(new Set(results).size, pool.INSULTS.length);
});


test("slash on replies do not repeat until the pool is exhausted", () => {
  const results = [];
  for (let i = 0; i < slashBanats.onReplies.length; i++) {
    results.push(slashBanats("on", "slash-test-thread", "slash-test-sender"));
  }
  assert.equal(new Set(results).size, slashBanats.onReplies.length);
});

test("slash off replies do not repeat until the pool is exhausted", () => {
  const results = [];
  for (let i = 0; i < slashBanats.offReplies.length; i++) {
    results.push(slashBanats("off", "slash-test-thread", "slash-test-sender"));
  }
  assert.equal(new Set(results).size, slashBanats.offReplies.length);
});

test("unauthorized backslash pool has 20 unique insults", () => {
  assert.equal(slashBanats.unauthorizedReplies.length, 20);
  assert.equal(new Set(slashBanats.unauthorizedReplies).size, 20);
});

test("unauthorized randomizer avoids repeats until its pool is exhausted", () => {
  const results = [];
  for (let i = 0; i < slashBanats.unauthorizedReplies.length; i++) {
    results.push(slashBanats.pickUnauthorizedSlashBanat("test-thread", "test-non-admin"));
  }
  assert.equal(new Set(results).size, 20);
});
