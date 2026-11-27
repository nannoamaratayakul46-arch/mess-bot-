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
  assert.match(index, /await db\.close\(\)/);
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

test("Messenger login survives a failed durable session checkpoint", () => {
  const source = read("index.js");
  assert.match(source, /let sessionCheckpointSaved = false/);
  assert.match(source, /await persistFacebookSessionState\\(appState\\);/);
  assert.match(source, /catch \\(checkpointError\\)/);
  assert.match(source, /failure_kind: "session_checkpoint_failed"/);
  assert.match(source, /appStateSource = sessionCheckpointSaved \\? "durable" : "memory"/);
});
