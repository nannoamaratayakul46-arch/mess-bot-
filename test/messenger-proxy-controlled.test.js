"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("proxy URL validation requires authenticated HTTP(S)", () => {
  const old = process.env.PROXY_URL;
  const keys = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"];
  const before = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  try {
    const { getMessengerProxyUrl } = require("../messengerProxy");
    delete process.env.PROXY_URL;
    assert.throws(() => getMessengerProxyUrl(), /PROXY_URL is required/);
    process.env.PROXY_URL = "socks5://user:pass@proxy.example:1080";
    assert.throws(() => getMessengerProxyUrl(), /HTTP\(S\)/);
    process.env.PROXY_URL = "http://proxy.example:8080";
    assert.throws(() => getMessengerProxyUrl(), /authentication credentials/);
    process.env.PROXY_URL = "http://user:pass@proxy.example:8080";
    assert.equal(getMessengerProxyUrl(), process.env.PROXY_URL);
    for (const key of keys) assert.equal(process.env[key], before[key], key + " must remain untouched");
  } finally {
    if (old === undefined) delete process.env.PROXY_URL; else process.env.PROXY_URL = old;
    for (const key of keys) {
      if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key];
    }
  }
});

test("every Messenger login is gated and ws3-fca receives explicit proxy option", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  assert.match(source, /if \(!proxyGateVerified\)/);
  assert.match(source, /verifyMessengerProxy\(\)\.then/);
  assert.match(source, /proxy:\s*getMessengerProxyUrl\(\)/);
  assert.doesNotMatch(source, /process\.env\.(?:HTTP_PROXY|HTTPS_PROXY|ALL_PROXY)/);
});

test("proxy diagnostics redact credentials", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "messengerProxy.js"), "utf8");
  assert.match(source, /replaceAll\(proxyUrl, "\[redacted proxy URL\]"\)/);
  assert.match(source, /\[redacted\]/);
});
