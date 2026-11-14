"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const proxyKeys = [
  "PROXY_URL",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "NO_PROXY",
  "no_proxy",
];
const original = Object.fromEntries(proxyKeys.map(key => [key, process.env[key]]));
const fs = require("node:fs");
const path = require("node:path");

test.after(() => {
  for (const key of proxyKeys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

test("Messenger proxy URL requires authenticated HTTP(S) configuration", () => {
  const { getMessengerProxyUrl } = require("../messengerProxy");
  delete process.env.PROXY_URL;
  assert.throws(() => getMessengerProxyUrl(), /PROXY_URL is required/);

  process.env.PROXY_URL = "socks5://user:pass@proxy.example:1080";
  assert.throws(() => getMessengerProxyUrl(), /HTTP\(S\) scheme/);

  process.env.PROXY_URL = "http://proxy.example:8080";
  assert.throws(() => getMessengerProxyUrl(), /username and password/);
});

test("Messenger proxy configuration does not mutate process-wide proxy variables", () => {
  const { getMessengerProxyUrl } = require("../messengerProxy");
  const url = "http://residential-user:secret@proxy.example:3128";
  process.env.PROXY_URL = url;

  for (const key of proxyKeys.slice(1)) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }

  assert.equal(getMessengerProxyUrl(), url);
  for (const key of proxyKeys.slice(1)) {
    assert.equal(process.env[key], original[key], key + " must remain unchanged");
  }

  const indexSource = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  assert.match(indexSource, /proxy:\\s*getMessengerProxyUrl\\(\\)/, "ws3-fca must receive the proxy explicitly");
});
