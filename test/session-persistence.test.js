"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const test = require("node:test");
const db = require("../db");

const indexSource = fs.readFileSync(
  path.join(__dirname, "..", "index.js"),
  "utf8"
);
const dbSource = fs.readFileSync(
  path.join(__dirname, "..", "db.js"),
  "utf8"
);

assert(indexSource.includes("loadPersistedFacebookSessionState"));
assert(indexSource.includes("persistFacebookSessionState(appState)"));
assert(indexSource.includes("encryptSessionState"));
assert(indexSource.includes("decryptSessionState"));
assert(indexSource.includes("Replacement session was rejected; the existing Messenger session remains active."));
assert(indexSource.includes("void initializeMessengerSession();"));

assert(dbSource.includes("messenger_session_states"));
assert(dbSource.includes("RENDER_SERVICE_ID"));
assert(dbSource.includes("getMessengerSessionServiceId"));
assert(dbSource.includes("WHERE service_id = $1"));
assert(dbSource.includes("ON CONFLICT (service_id)"));
assert(dbSource.includes("getMessengerSessionState"));
assert(dbSource.includes("setMessengerSessionState"));
assert(dbSource.includes("clearMessengerSessionState"));
assert(dbSource.includes("DELETE FROM messenger_session_states WHERE service_id = $1"));
assert(!/FROM messenger_session_state\s+WHERE id = 1/.test(dbSource));
assert(!/INSERT INTO messenger_session_state \(id, encrypted_state/.test(dbSource));

test("Messenger session checkpoints use an independent key for each Render service", () => {
  const previousId = process.env.RENDER_SERVICE_ID;
  const previousName = process.env.RENDER_SERVICE_NAME;
  try {
    process.env.RENDER_SERVICE_ID = "srv-main-bot-1";
    delete process.env.RENDER_SERVICE_NAME;
    const mainBotKey = db.getMessengerSessionServiceId();

    process.env.RENDER_SERVICE_ID = "srv-older-mess-bot";
    const olderBotKey = db.getMessengerSessionServiceId();

    assert.equal(mainBotKey, "srv-main-bot-1");
    assert.equal(olderBotKey, "srv-older-mess-bot");
    assert.notEqual(mainBotKey, olderBotKey);
  } finally {
    if (previousId === undefined) delete process.env.RENDER_SERVICE_ID;
    else process.env.RENDER_SERVICE_ID = previousId;
    if (previousName === undefined) delete process.env.RENDER_SERVICE_NAME;
    else process.env.RENDER_SERVICE_NAME = previousName;
  }
});

test("Messenger session service key falls back to Render service name and is bounded", () => {
  const previousId = process.env.RENDER_SERVICE_ID;
  const previousName = process.env.RENDER_SERVICE_NAME;
  try {
    delete process.env.RENDER_SERVICE_ID;
    process.env.RENDER_SERVICE_NAME = "mess-bot-1";
    assert.equal(db.getMessengerSessionServiceId(), "mess-bot-1");

    delete process.env.RENDER_SERVICE_NAME;
    process.env.RENDER_SERVICE_ID = "x".repeat(250);
    assert.equal(db.getMessengerSessionServiceId().length, 200);
  } finally {
    if (previousId === undefined) delete process.env.RENDER_SERVICE_ID;
    else process.env.RENDER_SERVICE_ID = previousId;
    if (previousName === undefined) delete process.env.RENDER_SERVICE_NAME;
    else process.env.RENDER_SERVICE_NAME = previousName;
  }
});

console.log("session persistence source checks passed");
