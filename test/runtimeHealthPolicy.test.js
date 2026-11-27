"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { isProcessLivenessHealthy, isCoreReadinessHealthy } = require("../runtimeHealthPolicy");

test("Messenger disconnection does not enter process liveness policy", () => {
  assert.equal(isProcessLivenessHealthy({ eventLoopAgeMs: 1000, maxEventLoopAgeMs: 90000 }), true);
});

test("process liveness fails on event-loop stall", () => {
  assert.equal(isProcessLivenessHealthy({ eventLoopAgeMs: 90001, maxEventLoopAgeMs: 90000 }), false);
});

test("process liveness fails during intentional shutdown", () => {
  assert.equal(isProcessLivenessHealthy({ eventLoopAgeMs: 10, maxEventLoopAgeMs: 90000, shuttingDown: true }), false);
});

test("core readiness requires database healthy", () => {
  assert.equal(isCoreReadinessHealthy({ databaseHealthy: true }), true);
  assert.equal(isCoreReadinessHealthy({ databaseHealthy: false }), false);
  assert.equal(isCoreReadinessHealthy({ databaseHealthy: null }), false);
});
