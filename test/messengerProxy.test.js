"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");

test("proxy verification falls back from ipinfo 429 and caches the result", async () => {
  const previousProxy = process.env.PROXY_URL;
  const originalGet = axios.get;
  const calls = [];

  process.env.PROXY_URL = "http://test-user:test-password@proxy.example:8080";
  axios.get = async (url, options) => {
    calls.push({ url, options });
    if (url === "https://ipinfo.io/json") {
      const error = new Error("Too Many Requests");
      error.response = { status: 429 };
      throw error;
    }
    if (url === "https://ipwho.is/") {
      return {
        data: {
          success: true,
          ip: "203.0.113.10",
          city: "Manila",
          country_code: "PH",
        },
      };
    }
    throw new Error("Unexpected geo-IP provider: " + url);
  };

  try {
    const { verifyMessengerProxy } = require("../messengerProxy");
    const first = await verifyMessengerProxy();
    const second = await verifyMessengerProxy();

    assert.deepEqual(first, {
      ip: "203.0.113.10",
      city: "Manila",
      country: "PH",
      provider: "ipwho.is",
    });
    assert.deepEqual(second, first);
    assert.equal(calls.length, 2, "cached verification must not call providers again");
    assert.equal(calls[0].options.proxy, false);
    assert.equal(calls[1].options.proxy, false);
    assert.ok(calls[0].options.httpsAgent);
    assert.ok(calls[1].options.httpsAgent);
  } finally {
    axios.get = originalGet;
    if (previousProxy === undefined) delete process.env.PROXY_URL;
    else process.env.PROXY_URL = previousProxy;
  }
});
