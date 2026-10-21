"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "backups",
  ".next",
  "dist",
  "coverage",
]);

const JS_EXTENSIONS = new Set([".js", ".cjs", ".mjs"]);
const failures = [];
const warnings = [];
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;

    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(full);
      continue;
    }

    if (JS_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
}

function rel(file) {
  return path.relative(ROOT, file).replaceAll(path.sep, "/");
}

function source(file) {
  return fs.readFileSync(file, "utf8");
}

function fail(message) {
  failures.push(`❌ ${message}`);
}

function warn(message) {
  warnings.push(`⚠️ ${message}`);
}

walk(ROOT);

// 1. Every tracked runtime JS file must parse.
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: ROOT,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    fail(`${rel(file)} failed node --check.`);
    if (result.stderr) {
      console.error(result.stderr.trim());
    }
  }
}

const indexPath = path.join(ROOT, "index.js");
const packagePath = path.join(ROOT, "package.json");
const bootstrapPath = path.join(ROOT, "bootstrap.js");

const index = source(indexPath);
const bootstrap = source(bootstrapPath);
const pkg = JSON.parse(source(packagePath));

// 2. There must be exactly one real Messenger listener installation.
// stopListenMqtt is allowed; listenMqtt is not duplicated.
const listenInstallations = (index.match(/\bapi\.listenMqtt\s*\(/g) || []).length;
if (listenInstallations !== 1) {
  fail(`Expected exactly one api.listenMqtt() installation in index.js; found ${listenInstallations}.`);
}

// 2a. Preserve conservative Messenger recovery safeguards.
const listenerRecoveryChecks = [
  [/const WATCHDOG_LISTENER_STALE_ENABLED =\\s*\\/\\^\\(1\\|true\\|yes\\|on\\)\\$\\/i\\.test\\(/, "listener stale detection must remain explicitly opt-in"],
  [/const recoveryDelayMs = rateLimited \\? 120_000 : 30_000/, "rate limits must use a longer reconnect cool-off"],
  [/if \\(authRejected\\) \\{[\\s\\S]{0,700}Automatic retries are paused/, "rejected sessions must pause automatic retries"],
  [/thisGeneration !== activeListenerGeneration/, "stale listener generations must be ignored"],
  [/watchdogMessengerConnected \\? now - watchdogLastListenerActivityAt : 0/, "listener inactivity must only be measured while connected"],
];
for (const [pattern, message] of listenerRecoveryChecks) {
  if (!pattern.test(index)) fail("Messenger recovery invariant missing: " + message + ".");
}
if (!/WATCHDOG_LISTENER_STALE_ENABLED[\\s\\S]{0,120}process\\.env\\.ECLIPSE_WATCHDOG_LISTENER_STALE_ENABLED/.test(index)) {
  fail("Listener-staleness watchdog must remain explicitly configurable rather than silently enabled.");
}

// 3. Startup must use bootstrap.js, not a runtime source-rewriter.
if (pkg.scripts?.start !== "node bootstrap.js") {
  fail(`package.json start script must be exactly "node bootstrap.js".`);
}

if (/banat-runtime-fix|banat-runtime-hotfix/.test(pkg.scripts?.start || "") || /banat-runtime-fix|banat-runtime-hotfix/.test(bootstrap)) {
  fail("Obsolete Banat runtime patch is still referenced by startup.");
}

const banatHumanPath = path.join(ROOT, "banat-human.js");
if (!fs.existsSync(banatHumanPath)) {
  fail("banat-human.js is missing; Banat replies cannot use the humanizer.");
} else {
  const banatHuman = source(banatHumanPath);
  for (const required of [
    "humanize(",
    "BANAT_SHORTHANDS",
    "calculateHumanDelay",
    "trafficSendMessage(",
  ]) {
    if (!banatHuman.includes(required)) {
      fail("Banat humanizer wiring missing: " + required);
    }
  }

  if (!index.includes("sendBanatReplyWithTyping(")) {
    fail("index.js is not wired to the Banat human send layer.");
  }
}

if (fs.existsSync(path.join(ROOT, "banat-runtime-hotfix.js"))) {
  fail("banat-runtime-hotfix.js must not exist; routing belongs in the real source path.");
}

// 4. Keep the single transport governor intact.
for (const required of [
  "trafficQueueSend",
  "trafficSafetyStatus",
  "trafficEffectiveGapMs",
  "trafficMode",
]) {
  if (!index.includes(required)) {
    fail(`Traffic Governor invariant missing: ${required}.`);
  }
}

// 5. Banat must retain sender-aware queueing and stale-job protection.
for (const required of [
  "senderId",
  "BANAT_STALE_JOB_MS",
  "runBanatBurstQueue",
  "clearBanatBurstState",
]) {
  if (!index.includes(required)) {
    fail(`Banat queue invariant missing: ${required}.`);
  }
}

// 6. Fatal process errors must exit non-zero so Render can restart them.
if (!index.includes('gracefulShutdown("uncaughtException", 1)')) {
  fail("uncaughtException does not use fatal exit code 1.");
}

if (!index.includes('gracefulShutdown("unhandledRejection", 1)')) {
  fail("unhandledRejection does not use fatal exit code 1.");
}

// 7. Do not allow the old duplicate broadcast runtime wrapper to return.
const duplicateBroadcast = path.join(ROOT, "broadcast-command.js");
if (fs.existsSync(duplicateBroadcast)) {
  fail("Obsolete duplicate broadcast-command.js exists.");
}

// 8. Warn about direct transport calls outside the core router. These are
// reviewed manually instead of being made fatal because some modules may
// intentionally receive the guarded API.
const directSendFiles = [];
for (const file of files) {
  const name = rel(file);
  if (name === "index.js") continue;

  const text = source(file);
  if (/\bapi\.sendMessage\s*\(/.test(text) || /\bapi\.editMessage\s*\(/.test(text)) {
    directSendFiles.push(name);
  }
}

if (directSendFiles.length) {
  warn(
    `Modules still call api.sendMessage/editMessage directly: ${directSendFiles.join(", ")}. ` +
    "They must receive the guarded API; do not add another transport wrapper."
  );
}

// 9. Make sure tests exist; this prevents the repository from silently
// drifting back into an untested state.
const testDir = path.join(ROOT, "test");
if (!fs.existsSync(testDir) || !fs.readdirSync(testDir).some((name) => name.endsWith(".test.js"))) {
  fail("No node:test regression suite was found under test/.");
}

console.log("\nECLIPSE REPOSITORY AUDIT");
console.log("=======================");
console.log(`JavaScript files checked: ${files.length}`);
console.log(`Failures: ${failures.length}`);
console.log(`Warnings: ${warnings.length}`);

for (const item of warnings) console.log(item);
for (const item of failures) console.log(item);

if (failures.length) {
  process.exitCode = 1;
} else {
  console.log("\n✅ Repository invariants passed.");
}
