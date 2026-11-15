"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyListenerError,
  getListenerRecoveryDelayMs,
  getLoginRetryDelayMs,
} = require("../messengerRecoveryPolicy");

test("listener errors distinguish authentication rejection from rate limiting", () => {
  assert.deepEqual(classifyListenerError("Facebook checkpoint required"), {
    authRejected: true,
    rateLimited: false,
  });
  assert.deepEqual(classifyListenerError("MQTT error 1675004: rate limit"), {
    authRejected: false,
    rateLimited: true,
  });
  assert.deepEqual(classifyListenerError("temporary socket timeout"), {
    authRejected: false,
    rateLimited: false,
  });
});

test("listener rate-limit retry delay escalates and caps at fifteen minutes", () => {
  assert.equal(getListenerRecoveryDelayMs({ rateLimited: true, failureCount: 1 }), 120_000);
  assert.equal(getListenerRecoveryDelayMs({ rateLimited: true, failureCount: 2 }), 240_000);
  assert.equal(getListenerRecoveryDelayMs({ rateLimited: true, failureCount: 3 }), 480_000);
  assert.equal(getListenerRecoveryDelayMs({ rateLimited: true, failureCount: 4 }), 900_000);
  assert.equal(getListenerRecoveryDelayMs({ rateLimited: true, failureCount: 50 }), 900_000);
  assert.equal(getListenerRecoveryDelayMs({ rateLimited: false, failureCount: 50 }), 30_000);
});

test("invalid retry counters cannot create NaN, zero, or unbounded delays", () => {
  assert.equal(getListenerRecoveryDelayMs({ rateLimited: true, failureCount: NaN }), 120_000);
  assert.equal(getListenerRecoveryDelayMs({ rateLimited: true, failureCount: 0 }), 120_000);
  assert.equal(getLoginRetryDelayMs(NaN), 2_000);
  assert.equal(getLoginRetryDelayMs(1, 0), 2_000);
});

test("login retry delay preserves exponential backoff and five-minute cap", () => {
  assert.equal(getLoginRetryDelayMs(1), 2_000);
  assert.equal(getLoginRetryDelayMs(2), 4_000);
  assert.equal(getLoginRetryDelayMs(3), 8_000);
  assert.equal(getLoginRetryDelayMs(20), 300_000);
});

test("hostile or nonnumeric values fall back to bounded retry delays", () => {
  const hostileNumber = { valueOf() { throw new Error("no coercion"); } };
  const hostileText = { [Symbol.toPrimitive]() { throw new Error("no coercion"); } };

  assert.equal(getListenerRecoveryDelayMs({ rateLimited: true, failureCount: Symbol("bad") }), 120_000);
  assert.equal(getListenerRecoveryDelayMs({ rateLimited: true, failureCount: hostileNumber }), 120_000);
  assert.equal(getLoginRetryDelayMs(Symbol("bad")), 2_000);
  assert.equal(getLoginRetryDelayMs(hostileNumber), 2_000);
  assert.equal(getLoginRetryDelayMs(2, Symbol("bad")), 4_000);
  assert.deepEqual(classifyListenerError(hostileText), {
    authRejected: false,
    rateLimited: false,
  });
});

test("fractional and extreme retry counters remain bounded and deterministic", () => {
  assert.equal(getListenerRecoveryDelayMs({ rateLimited: true, failureCount: 2.9 }), 240_000);
  assert.equal(getListenerRecoveryDelayMs({ rateLimited: true, failureCount: -100 }), 120_000);
  assert.equal(getLoginRetryDelayMs(2.9), 4_000);
  assert.equal(getLoginRetryDelayMs(-100), 2_000);
  assert.equal(getLoginRetryDelayMs(Number.MAX_VALUE), 300_000);
});

test("malformed listener recovery options fail safely without throwing", () => {
  const hostileOptions = {
    get rateLimited() {
      throw new Error("untrusted getter");
    },
  };
  assert.equal(getListenerRecoveryDelayMs(null), 30_000);
  assert.equal(getListenerRecoveryDelayMs("invalid"), 30_000);
  assert.equal(getListenerRecoveryDelayMs(hostileOptions), 30_000);
});
