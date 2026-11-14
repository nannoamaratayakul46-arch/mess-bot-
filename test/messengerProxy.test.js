"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("Messenger runtime remains proxy-free", () => {
  const source = fs.readFileSync(path.join(root, "index.js"), "utf8");

  assert.doesNotMatch(
    source,
    /verifyMessengerProxy|proxyGateVerified|process\.env\.PROXY_URL/,
    "Messenger login must not depend on an external network proxy"
  );
  assert.equal(
    fs.existsSync(path.join(root, "messengerProxy.js")),
    false,
    "the removed external proxy module must stay absent"
  );
});
