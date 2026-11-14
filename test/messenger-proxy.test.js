"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getMessengerProxyUrl } = require("../messengerProxy");

const proxyKeys = ["PROXY_URL", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"];
const original = Object.fromEntries(proxyKeys.map(key => [key, process.env[key]]));

test.after(() => {
  for (const key of proxyKeys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

test("Main Bot requires authenticated HTTP(S) proxy credentials", () => {
  delete process.env.PROXY_URL;
  assert.throws(() => getMessengerProxyUrl(), /PROXY_URL is required/);
  process.env.PROXY_URL = "socks5://user:pass@proxy.example:1080";
  assert.throws(() => getMessengerProxyUrl(), /HTTP\(S\) scheme/);
  process.env.PROXY_URL = "http://proxy.example:8080";
  assert.throws(() => getMessengerProxyUrl(), /username and password/);
});

test("Main Bot exports the configured proxy to common outbound HTTP clients", () => {
  const url = "http://residential-user:secret@proxy.example:3128";
  process.env.PROXY_URL = url;
  assert.equal(getMessengerProxyUrl(), url);
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) {
    assert.equal(process.env[key], url);
  }
  assert.equal(process.env.NO_PROXY, "");
  assert.equal(process.env.no_proxy, "");
});
