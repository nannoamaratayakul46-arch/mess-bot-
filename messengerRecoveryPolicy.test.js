"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyListenerError,
  getListenerRecoveryDelayMs,
} = require("./messengerRecoveryPolicy");

test("classifies nested Facebook temporary action blocks", () => {
  const result = classifyListenerError({
    error: 3252001,
    errorSummary: "You’re Temporarily Blocked",
    errorDescription: {
      __html: "It looks like you were misusing this feature by going too fast.",
    },
  });
  assert.equal(result.rateLimited, true);
  assert.equal(result.authRejected, false);
});


test("classifies a nested Facebook restriction description without a code", () => {
  assert.equal(
    classifyListenerError({ errorDescription: { __html: "You’re temporarily blocked for going too fast." } }).rateLimited,
    true
  );
});

test("classifies nested Facebook rate-limit errors", () => {
  assert.equal(
    classifyListenerError({ error: 1675004 }).rateLimited,
    true
  );
});

test("keeps authentication rejection classification", () => {
  assert.equal(
    classifyListenerError({ message: "Error retrieving userID" }).authRejected,
    true
  );
});

test("uses escalating cooldowns for repeated rate-limit failures", () => {
  assert.equal(getListenerRecoveryDelayMs({ rateLimited: true, failureCount: 1 }), 120000);
  assert.equal(getListenerRecoveryDelayMs({ rateLimited: true, failureCount: 2 }), 240000);
  assert.equal(getListenerRecoveryDelayMs({ rateLimited: true, failureCount: 3 }), 480000);
  assert.equal(getListenerRecoveryDelayMs({ rateLimited: true, failureCount: 4 }), 900000);
  assert.equal(getListenerRecoveryDelayMs({ rateLimited: true, failureCount: 8 }), 900000);
});
