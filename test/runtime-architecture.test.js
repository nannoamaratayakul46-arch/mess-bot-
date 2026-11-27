"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

test("permission registry is centralized", () => {
  const permissions = read("permissions.js");
  assert.match(permissions, /function isAdmin/);
  assert.match(permissions, /process\.env\.ADMIN_IDS/);

  for (const file of [
    "economy.js",
    "games.js",
    "moderation.js",
    "debate/manager.js",
  ]) {
    const source = read(file);
    assert.doesNotMatch(
      source,
      /process\.env\.ADMIN_IDS/,
      file + " should not parse ADMIN_IDS itself"
    );
  }
});

test("database exposes graceful shutdown and transaction primitives", () => {
  const db = require("../db");
  assert.equal(typeof db.close, "function");
  assert.equal(typeof db.withTransaction, "function");
});

test("main process contains one shutdown path", () => {
  const index = read("index.js");
  assert.match(index, /async function gracefulShutdown/);
  assert.match(index, /process\.once\(\s*"SIGTERM"/);
  assert.match(index, /process\.once\(\s*"SIGINT"/);
  assert.match(index, /awaitShutdownTask\("Database pool close", \(\) => db\.close\(\), 8_000\)/);
  assert.match(index, /stopTrafficGovernor\(\)/);
  assert.match(index, /shutdownGames\(\)/);
});

test("games exposes shutdown hook instead of leaving timers orphaned", () => {
  const games = require("../games");
  assert.equal(typeof games.shutdownGames, "function");
  games.shutdownGames();
});


test("startup does not mutate source or patch the Node module loader", () => {
  const packageJson = read("package.json");
  const index = read("index.js");

  assert.match(packageJson, /"start": "node bootstrap\.js"/);
  assert.doesNotMatch(packageJson, /repo-hotfix|rpg-help-preload|broadcast-runtime-fix/);
  assert.doesNotMatch(packageJson, /postinstall.*repo-hotfix/);

  assert.match(index, /assertTrafficGovernorApi\(api, "MESSAGE ROUTER"\)/);
  assert.match(index, /function getBroadcastImageAttachment\(event\)/);
  assert.match(index, /AbortSignal\.timeout\(30_000\)/);
  assert.match(index, /getRandomRoastReply\(\s*threadID,\s*body,\s*senderId\s*\)/);
});

test("broadcast uses the requested speech prefix", () => {
  const source = read("index.js");
  assert.match(
    source,
    /makinig kayong mga gago kayo sa talata ko:/
  );
  assert.match(
    source,
    /const outgoingMessage = imagePath\s*\?\s*\{/
  );
});

test("HTTP shutdown drain is bounded and force-closes lingering connections", () => {
  const index = read("index.js");
  const start = index.indexOf("async function gracefulShutdown(");
  const end = index.indexOf("\nfunction handleRecoverableMessengerProcessFailure", start);
  const shutdown = index.slice(start, end);
  assert.ok(start >= 0 && end > start, "graceful shutdown should be present");
  assert.match(shutdown, /server\.close\(finish\)/);
  assert.match(shutdown, /setTimeout\(\(\) => \{/);
  assert.match(shutdown, /8_000/);
  assert.match(shutdown, /server\.closeAllConnections\(\)/);
  assert.match(shutdown, /clearTimeout\(drainTimer\)/);
  assert.ok(
    shutdown.indexOf("server.close(finish)") < shutdown.indexOf('awaitShutdownTask("Database pool close"'),
    "HTTP drain must complete or hit its deadline before database shutdown"
  );
});


test("graceful shutdown bounds persistence, music cleanup, and database close", () => {
  const index = read("index.js");
  const start = index.indexOf("async function gracefulShutdown(");
  const end = index.indexOf("\nfunction handleRecoverableMessengerProcessFailure", start);
  const shutdown = index.slice(start, end);
  assert.ok(index.includes("async function awaitShutdownTask(label, task, timeoutMs)"));
  assert.ok(shutdown.includes('awaitShutdownTask("Session persistence", persistAppStateFile, 8_000)'));
  assert.ok(shutdown.includes('awaitShutdownTask("Music file cleanup", cleanupMusicFiles, 3_000)'));
  assert.ok(shutdown.includes('awaitShutdownTask("Database pool close", () => db.close(), 8_000)'));
  assert.ok(index.includes("if (timer) clearTimeout(timer)"));
});
