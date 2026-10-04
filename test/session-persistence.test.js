"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

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

assert(dbSource.includes("messenger_session_state"));
assert(dbSource.includes("getMessengerSessionState"));
assert(dbSource.includes("setMessengerSessionState"));
assert(dbSource.includes("clearMessengerSessionState"));

console.log("session persistence source checks passed");
