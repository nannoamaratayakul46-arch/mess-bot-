"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../banat-slash-pool");

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
