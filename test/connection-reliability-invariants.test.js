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
  const activityEnd = index.indexOf("\n}", activityStart);
  const activityHandler = index.slice(activityStart, activityEnd);
  assert.match(activityHandler, /mqttReconnectAttempt = 0/);
  assert.match(activityHandler, /real MQTT callbacks again/);

  const reattachStart = index.indexOf("function scheduleMqttListenerReattach(reason) {");
  const reattachEnd = index.indexOf("\nfunction startMqttActivityWatchdog(", reattachStart);
  const reattachHandler = index.slice(reattachStart, reattachEnd);
  assert.match(reattachHandler, /const scheduledGeneration = activeListenerGeneration/);
  assert.match(reattachHandler, /activeListenerGeneration !== scheduledGeneration/);
  assert.match(reattachHandler, /mqttReconnectAttempt \+= 1/);
});


test("Messenger supervisor recovery metadata is service-isolated and never stores session credentials", () => {
  const database = fs.readFileSync(path.join(__dirname, "..", "db.js"), "utf8");
  assert.match(database, /CREATE TABLE IF NOT EXISTS messenger_supervisor_states/);
  assert.match(database, /service_id TEXT PRIMARY KEY/);
  assert.match(database, /sanitizePersistedSnapshot\(supervisorState\)/);
  assert.match(database, /getMessengerSessionServiceId\(\)/);
  assert.match(database, /supervisor_state JSONB NOT NULL/);
  assert.doesNotMatch(database, /messenger_supervisor_states[^;]*encrypted_state/s);
});

test("Messenger supervisor restores before login and gates session-required and cooldown states", () => {
  assert.match(index, /await restoreMessengerSupervisorState\(\);\s*attemptLogin\(\);/);
  assert.match(index, /state === MESSENGER_SUPERVISOR_STATES\.SESSION_REQUIRED/);
  assert.match(index, /state === MESSENGER_SUPERVISOR_STATES\.COOLDOWN/);
  assert.match(index, /transitionMessengerSupervisor\(MESSENGER_SUPERVISOR_EVENTS\.COOLDOWN_END\)/);
  assert.match(index, /Could not persist recovery metadata/);
  assert.match(index, /Could not restore recovery metadata/);
});

test("active-listener auth rejection permits the existing one-time saved-session revalidation", () => {
  const listenerErrorBranch = index.slice(
    index.indexOf('if (authRejected) {', index.indexOf('const { authRejected, rateLimited } = classifyListenerError')),
    index.indexOf('// Recover a dead listener through one controlled fresh login')
  );
  assert.match(listenerErrorBranch, /EVENTS\.RECOVERY_BEGIN/);
  assert.doesNotMatch(listenerErrorBranch, /EVENTS\.AUTH_REJECTED/);
  assert.match(listenerErrorBranch, /Scheduling one controlled saved-session revalidation/);
  assert.match(index, /!pendingFacebookAppState/);
});

test("dead MQTT listener failures update durable supervisor cooldown state", () => {
  const listenerErrorBranch = index.slice(
    index.indexOf("// Recover a dead listener through one controlled fresh login"),
    index.indexOf("return;\n          }", index.indexOf("// Recover a dead listener through one controlled fresh login"))
  );
  assert.match(listenerErrorBranch, /EVENTS\.RATE_LIMIT : MESSENGER_SUPERVISOR_EVENTS\.TRANSIENT_FAILURE/);
  assert.match(listenerErrorBranch, /failureKind: rateLimited \? "facebook_rate_limit" : "mqtt_disconnect"/);
  assert.match(listenerErrorBranch, /cooldownUntil: rateLimited \? Date\.now\(\) \+ recoveryDelayMs : 0/);
});


test("MQTT reattach remains degraded until real event activity proves recovery", () => {
  const scheduler = index.slice(
    index.indexOf("function scheduleMqttListenerReattach"),
    index.indexOf("function startMqttActivityWatchdog")
  );
  assert.match(scheduler, /EVENTS\.RECOVERY_BEGIN/);
  assert.match(scheduler, /EVENTS\.AUTH_REJECTED/);
  assert.match(scheduler, /EVENTS\.TRANSIENT_FAILURE/);
  assert.doesNotMatch(scheduler, /EVENTS\.RECOVERY_SUCCESS/);
  const callback = index.slice(
    index.indexOf("activeMqttListenerCallback = ("),
    index.indexOf("// Learn sender, mention, join, and nickname names")
  );
  assert.match(callback, /event && typeof event === "object"[\s\S]*?EVENTS\.RECOVERY_SUCCESS/);
});

test("all Messenger login retries are owned by one bounded, shutdown-aware timer coordinator", () => {
  const helperStart = index.indexOf("function cancelLoginRetry(reason =");
  const helperEnd = index.indexOf("\nfunction attemptLogin()", helperStart);
  const helper = index.slice(helperStart, helperEnd);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, "login retry coordinator should exist");
  assert.match(helper, /clearTimeout\(loginRetryTimer\)/);
  assert.match(helper, /Math\.min\(30 \* 60 \* 1000, Math\.max\(1/);
  assert.match(helper, /if \(watchdogShuttingDown\) return null/);
  assert.match(helper, /if \(watchdogShuttingDown\) return/);
  assert.match(helper, /loginRetryTimer\.unref/);
  assert.match(helper, /loginRetryTimer = null/);
  assert.match(helper, /callback\(\)/);
  assert.equal((index.match(/loginRetryTimer\s*=\s*setTimeout\(/g) || []).length, 1,
    "only the coordinator may create a login retry timer");
  assert.equal((index.match(/clearTimeout\(loginRetryTimer\)/g) || []).length, 1,
    "only the coordinator may clear a login retry timer");
  assert.match(index, /scheduleLoginRetry\(remainingMs, "supervisor cooldown"/);
  assert.match(index, /scheduleLoginRetry\(retryDelayMs, "one-time auth revalidation"/);
  assert.match(index, /scheduleLoginRetry\(recoveryDelayMs, "listener recovery"/);
  assert.equal((index.match(/scheduleLoginRetry\(backoffMs, "login failure backoff"/g) || []).length, 2);
  assert.equal((index.match(/scheduleLoginRetry\(100, "durable-session fallback"/g) || []).length, 3);
});

test("proxy verification retries share the login retry coordinator and MQTT timer cancellation has one owner", () => {
  assert.doesNotMatch(index, /proxyGateRetryTimer/);
  assert.match(index, /if \(proxyGatePending \|\| loginRetryTimer\) return/);
  assert.match(index, /scheduleLoginRetry\(backoffMs, "proxy egress verification"\)/);

  const mqttCancelStart = index.indexOf("function cancelMqttReconnectTimer(reason =");
  const mqttScheduleStart = index.indexOf("function scheduleMqttListenerReattach(reason)", mqttCancelStart);
  const mqttCancel = index.slice(mqttCancelStart, mqttScheduleStart);
  assert.ok(mqttCancelStart >= 0 && mqttScheduleStart > mqttCancelStart);
  assert.match(mqttCancel, /clearTimeout\(mqttReconnectTimer\)/);
  assert.match(mqttCancel, /mqttReconnectTimer = null/);
  assert.equal((index.match(/mqttReconnectTimer\s*=\s*setTimeout\(/g) || []).length, 1,
    "only the MQTT reattach scheduler may create the timer");
  assert.equal((index.match(/clearTimeout\(mqttReconnectTimer\)/g) || []).length, 1,
    "only the MQTT cancellation helper may clear the timer");
  assert.match(index, /cancelMqttReconnectTimer\("watchdog stopped"\)/);
  assert.match(index, /cancelMqttReconnectTimer\("new Messenger session connected"\)/);
  assert.match(index, /cancelMqttReconnectTimer\("listener authentication rejected"\)/);
});
