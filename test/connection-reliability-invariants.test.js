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

test("transient listener errors use controlled reconnect delays", () => {
  assert.match(index, /const recoveryDelayMs = rateLimited \? 120_000 : 30_000/);
  assert.match(index, /retrying the saved session in 30 seconds/i);
  assert.match(index, /waiting 2 minutes before reconnecting/i);
});

test("rejected Facebook sessions pause retries instead of hammering login", () => {
  const rejectionBlock = index.slice(index.indexOf("if (authRejected)"), index.indexOf("// Recover a dead listener", index.indexOf("if (authRejected)")));
  assert.ok(rejectionBlock.length > 0, "auth rejection handler should exist");
  assert.match(rejectionBlock, /Automatic retries are paused/);
  assert.doesNotMatch(rejectionBlock, /attemptLogin\(\)/);
});

test("stale listener generations cannot process events or attach duplicate listeners", () => {
  assert.match(index, /thisGeneration !== activeListenerGeneration/);
  assert.match(index, /listenerStartedApis\.has\(rawApiForListener\)/);
  assert.equal((index.match(/\bapi\.listenMqtt\s*\(/g) || []).length, 1);
});
