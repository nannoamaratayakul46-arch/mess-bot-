"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

test("startup uses the canonical bootstrap path", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts.start, "node bootstrap.js");
  assert.doesNotMatch(pkg.scripts.start, /banat-runtime-fix/);
});

test("obsolete duplicate runtime wrappers are absent", () => {
  assert.equal(fs.existsSync(path.join(ROOT, "banat-runtime-fix.js")), false);
  assert.equal(fs.existsSync(path.join(ROOT, "broadcast-command.js")), false);
});

test("Messenger listener is installed exactly once", () => {
  const index = read("index.js");
  const installs = index.match(/\bapi\.listenMqtt\s*\(/g) || [];
  assert.equal(installs.length, 1);
});

test("Traffic Governor remains the single outbound send gate", () => {
  const index = read("index.js");

  for (const required of [
    "trafficQueueSend",
    "trafficSafetyStatus",
    "trafficEffectiveGapMs",
    "trafficMode",
  ]) {
    assert.match(index, new RegExp(required));
  }
});

test("Banat retains sender-aware queue protections", () => {
  const index = read("index.js");

  for (const required of [
    "senderId",
    "BANAT_STALE_JOB_MS",
    "runBanatBurstQueue",
    "clearBanatBurstState",
  ]) {
    assert.match(index, new RegExp(required));
  }
});

test("unknown process errors remain fatal, but Messenger auth rejections are isolated", () => {
  const index = read("index.js");
  assert.match(index, /gracefulShutdown\("uncaughtException",\s*1\)/);
  assert.match(index, /gracefulShutdown\("unhandledRejection",\s*1\)/);
  assert.match(index, /process\.on\("uncaughtException"/);
  assert.match(index, /process\.on\("unhandledRejection"/);
  assert.match(index, /handleRecoverableMessengerProcessFailure\("unhandled rejection", reason\)/);
  assert.match(index, /activeMqttListenerCallback\(reason, null\)/);
  assert.match(index, /dashboard remains online/);
});

test("repository has no second broadcast transport implementation", () => {
  const bootstrap = read("bootstrap.js");
  assert.doesNotMatch(bootstrap, /broadcast-command/);
  assert.doesNotMatch(bootstrap, /listenMqtt/);
});
