"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Messenger login is gated on successful proxy verification", () => {
  const source = read("index.js");

  assert.match(source, /const \{ verifyMessengerProxy, getMessengerProxyUrl \} = require\("\.\/messengerProxy"\)/);
  assert.match(source, /let proxyGateVerified = false/);
  assert.match(source, /if \(!proxyGateVerified\)\s*\{[\s\S]*?verifyMessengerProxy\(\)\.then\(\(\) => \{[\s\S]*?proxyGateVerified = true;[\s\S]*?attemptLogin\(\);/);
  assert.match(source, /proxyGateRetryTimer = setTimeout/);
  assert.match(source, /proxyGateRetryAttempt/);
  assert.doesNotMatch(source, /proxyGateFailed = true/);
  assert.match(source, /proxy: getMessengerProxyUrl\(\)/);
});

test("proxy verification validates credentials and probes through the explicit proxy agent", () => {
  const source = read("messengerProxy.js");

  assert.match(source, /\[["']http:["'], ["']https:["']\]/);
  assert.match(source, /parsed\.username \|\| !parsed\.password/);
  assert.match(source, /new HttpsProxyAgent\(proxyUrl\)/);
  assert.match(source, /httpsAgent: agent/);
  assert.match(source, /proxy: false/);
  assert.match(source, /Proxy egress verification failed/);
  assert.match(source, /verificationPromise = null/);
  assert.match(source, /currentVerification/);
});

test("ws3-fca compatibility patch routes both HTTP and MQTT through proxy agents", () => {
  const source = read("scripts/patch-ws3-fca.js");

  assert.match(source, /ECLIPSE_WS3_FCA_COOKIE_AWARE_PROXY_V1/);
  assert.match(source, /new HttpsProxyCookieAgent\(proxyUrl, \{ cookies: \{ jar \} \}\)/);
  assert.match(source, /ECLIPSE_WS3_FCA_MQTT_ROOT_PROXY_AGENT_V1/);
  assert.match(source, /options\.wsOptions\.agent = new HttpsProxyAgent\(ctx\.globalOptions\.proxy\)/);
  assert.match(source, /refusing to patch/);
});
