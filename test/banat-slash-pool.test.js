"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../banat-slash-pool");
const slashBanats = require("../slash-banats");

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
