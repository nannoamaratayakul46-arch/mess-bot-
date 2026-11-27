"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const index = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");

test("listener staleness recovery remains opt-in to avoid restarting quiet healthy groups", () => {
  assert.match(index, /const WATCHDOG_LISTENER_STALE_ENABLED =\s*\/\^\(1\|true\|yes\|on\)\$\/i\.test\(/);
  assert.match(index, /process\.env\.ECLIPSE_WATCHDOG_LISTENER_STALE_ENABLED/);
  assert.match(index, /watchdogMessengerConnected\s*\?\s*now\s*-\s*watchdogLastListenerActivityAt\s*:\s*0/);
});

test("array-wrapped ws3-fca listener errors are normalized before classification", () => {
  const policy = require("../messengerRecoveryPolicy");
  assert.ok(index.includes("depth > 5"));
  assert.ok(index.includes("Array.isArray(value)"));
  assert.ok(index.includes("visit(item, depth + 1)"));
  assert.ok(index.includes("normalizedListenerError = getFacebookLoginErrorMessage(listenError)"));
  assert.ok(index.includes("classifyListenerError(listenerErrorText)"));
  assert.deepEqual(policy.classifyListenerError("MQTT error 1675004"), {
    authRejected: false,
    rateLimited: true,
  });
});

test("known Messenger process-level auth failures use listener recovery", () => {
  assert.match(index, /function handleRecoverableMessengerProcessFailure/);
  assert.ok(index.includes("const { authRejected, rateLimited } = classifyListenerError(reason);"));
  assert.match(index, /activeMqttListenerCallback\(reason, null\)/);
  assert.match(index, /process\.on\("unhandledRejection"/);
});

test("stale Messenger watchdog reattaches the listener without exiting the Render process", () => {
  const start = index.indexOf("function watchdogCleanRestartForDeadListener(reason) {");
  const end = index.indexOf("\nfunction watchdogSetShuttingDown(", start);
  const handler = index.slice(start, end);
  assert.ok(start >= 0 && end > start, "stale-listener handler should exist");
  assert.match(handler, /scheduleMqttListenerReattach\(/);
  assert.doesNotMatch(handler, /process\.exit/);
  assert.doesNotMatch(handler, /watchdogShuttingDown\s*=\s*true/);
});

test("transient listener errors use escalating rate-limit backoff", () => {
  const policy = require("../messengerRecoveryPolicy");
  assert.equal(policy.getListenerRecoveryDelayMs({ rateLimited: true, failureCount: 1 }), 120_000);
  assert.equal(policy.getListenerRecoveryDelayMs({ rateLimited: true, failureCount: 2 }), 240_000);
  assert.equal(policy.getListenerRecoveryDelayMs({ rateLimited: true, failureCount: 3 }), 480_000);
  assert.equal(policy.getListenerRecoveryDelayMs({ rateLimited: true, failureCount: 4 }), 900_000);
  assert.equal(policy.getListenerRecoveryDelayMs({ rateLimited: true, failureCount: 50 }), 900_000);
  assert.equal(policy.getListenerRecoveryDelayMs({ rateLimited: false, failureCount: 50 }), 30_000);
  assert.match(index, /retrying the saved session in 30 seconds/i);
  assert.match(index, /rateLimitFailureCount\+\+/);
  assert.match(index, /rateLimitFailureCount = 0/);
});
test("listener auth rejection permits one delayed saved-session revalidation, then fails closed", () => {
  const start = index.indexOf("if (authRejected) {");
  const end = index.indexOf("// Recover a dead listener", start);
  const rejectionBlock = index.slice(start, end);
  assert.ok(start >= 0 && end > start, "auth rejection handler should exist");
  assert.match(rejectionBlock, /authRejectionRetryUsed/);
  assert.match(rejectionBlock, /const retryDelayMs = 30_000/);
  assert.match(rejectionBlock, /attemptLogin\(\)/);
  assert.match(rejectionBlock, /activeListenerGeneration <= 0/);
  assert.match(index, /Saved-session revalidation was rejected\. Automatic retries are paused/);
  assert.match(index, /authRejectionRetryUsed = false/);
});

test("stale listener generations cannot process events or attach duplicate listeners", () => {
  assert.match(index, /thisGeneration !== activeListenerGeneration/);
  assert.match(index, /listenerStartedApis\.has\(rawApiForListener\)/);
  assert.equal((index.match(/\bapi\.listenMqtt\s*\(/g) || []).length, 1);
});

test("login callback and invocation failures share the same bounded backoff policy", () => {
  assert.equal(
    (index.match(/getLoginRetryDelayMs\(loginAttempt, MAX_LOGIN_BACKOFF_MS\)/g) || []).length,
    2
  );
  assert.doesNotMatch(index, /Math\.min\(\s*2 \*\* loginAttempt \* 1000/);
});

test("login rate-limit failures use the longer escalating cooldown in both failure paths", () => {
  const classification = "const { rateLimited: loginRateLimited } = classifyListenerError(dashboardLoginError);";
  const cooldown = "getListenerRecoveryDelayMs({ rateLimited: true, failureCount: rateLimitFailureCount })";
  assert.equal(index.split(classification).length - 1, 2);
  assert.equal(index.split(cooldown).length - 1, 2);
  assert.ok(index.includes("rateLimitFailureCount = 0;"));
});


test("MQTT reattach backoff resets only after real listener activity and stale generations are fenced", () => {
  const activityStart = index.indexOf("function watchdogRecordListenerActivity() {");
  const activityEnd = index.indexOf("\\n}", activityStart);
  const activityHandler = index.slice(activityStart, activityEnd);
  assert.match(activityHandler, /mqttReconnectAttempt = 0/);
  assert.match(activityHandler, /real MQTT callbacks again/);

  const reattachStart = index.indexOf("function scheduleMqttListenerReattach(reason) {");
  const reattachEnd = index.indexOf("\\nfunction startMqttActivityWatchdog(", reattachStart);
  const reattachHandler = index.slice(reattachStart, reattachEnd);
  assert.match(reattachHandler, /const scheduledGeneration = activeListenerGeneration/);
  assert.match(reattachHandler, /activeListenerGeneration !== scheduledGeneration/);
  assert.match(reattachHandler, /mqttReconnectAttempt \+= 1/);
});
