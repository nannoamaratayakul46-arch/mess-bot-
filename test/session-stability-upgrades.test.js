"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");

assert.equal((source.match(/\bapi\.listenMqtt\s*\(/g) || []).length, 1,
  "the bot must retain one centralized MQTT listener installation");

assert.match(source, /appstate\.tmp\.json/);
assert.match(source, /fsp\.writeFile\([\s\S]{0,250}temporaryPath/);
assert.match(source, /fsp\.rename\(temporaryPath, targetPath\)/);
assert.match(source, /20 \* 60_000/);
assert.match(source, /await persistAppStateFile\(\)/);

assert.match(source, /Chrome\/131\.0\.0\.0 Safari\/537\.36/);
assert.match(source, /autoMarkDelivery: true/);
assert.match(source, /autoReconnect: true/);
assert.match(source, /selfListen: false/);
assert.match(source, /forceLogin: false/);

assert.match(source, /minGapMs: 1200/);
assert.match(source, /maxGapMs: 2400/);
assert.match(source, /trafficNextGapMs[\s\S]{0,220}Math\.random\(\)/);
assert.match(source, /api\.markAsRead\(threadID/);
assert.match(source, /500 \+ Math\.floor\(Math\.random\(\) \* 601\)/);

assert.match(source, /lastMqttActivity = Date\.now\(\)/);
assert.match(source, /MQTT_ACTIVITY_CHECK_INTERVAL_MS = 5 \* 60_000/);
assert.match(source, /MQTT_ACTIVITY_STALE_AFTER_MS = 15 \* 60_000/);
assert.match(source, /MQTT_RECONNECT_BASE_DELAY_MS = 10_000/);
assert.match(source, /MQTT_RECONNECT_MAX_DELAY_MS = 60_000/);
assert.match(source, /activeMqttStopHandle/);
assert.match(source, /Automatic MQTT reattach is paused/);
assert.doesNotMatch(source, /api\.logout\s*\(/);

console.log("Messenger session stability upgrade invariants passed.");
