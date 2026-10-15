"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createDashboardSecurity } = require("../dashboardSecurity");

function response() {
  return { statusCode: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    sendStatus(code) { this.statusCode = code; return this; },
  };
}
function request({ origin, ip = "203.0.113.10", method = "GET", key = "", host = "bot.example.test", protocol = "https" } = {}) {
  return { headers: { ...(origin ? { origin } : {}), "x-eclipse-dashboard-key": key }, ip, method, protocol,
    get(name) { return name.toLowerCase() === "host" ? host : undefined; }, socket: { remoteAddress: ip } };
}

test("dashboard auth accepts a valid key", () => {
  const security = createDashboardSecurity({ apiKey: "a".repeat(48) });
  let continued = false;
  const res = response();
  security.requireAccess(request({ key: "a".repeat(48) }), res, () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(res.statusCode, 200);
});
test("dashboard auth fails closed when the key is missing", () => {
  const security = createDashboardSecurity({ apiKey: "" });
  const res = response();
  security.requireAccess(request(), res, () => assert.fail("must not continue"));
  assert.equal(res.statusCode, 503);
});
test("dashboard auth rate-limits repeated invalid keys per client", () => {
  const security = createDashboardSecurity({ apiKey: "a".repeat(48), maxFailures: 3, now: () => 1000 });
  for (let i = 0; i < 2; i += 1) {
    const res = response();
    security.requireAccess(request({ key: "wrong" }), res, () => assert.fail("must not continue"));
    assert.equal(res.statusCode, 401);
  }
  const blocked = response();
  security.requireAccess(request({ key: "wrong" }), blocked, () => assert.fail("must not continue"));
  assert.equal(blocked.statusCode, 429);
  assert.ok(Number(blocked.headers["Retry-After"]) > 0);
});
test("valid dashboard auth clears the failure counter", () => {
  const security = createDashboardSecurity({ apiKey: "a".repeat(48), maxFailures: 2, now: () => 1000 });
  security.requireAccess(request({ key: "wrong" }), response(), () => {});
  const good = response();
  security.requireAccess(request({ key: "a".repeat(48) }), good, () => {});
  assert.equal(good.statusCode, 200);
  const next = response();
  security.requireAccess(request({ key: "wrong" }), next, () => {});
  assert.equal(next.statusCode, 401);
});
test("CORS allows same-origin requests but rejects arbitrary browser origins", () => {
  const security = createDashboardSecurity({ apiKey: "a".repeat(48) });
  const same = response();
  let continued = false;
  security.cors(request({ origin: "https://bot.example.test" }), same, () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(same.headers["Access-Control-Allow-Origin"], "https://bot.example.test");
  const hostile = response();
  security.cors(request({ origin: "https://attacker.example" }), hostile, () => assert.fail("must reject origin"));
  assert.equal(hostile.statusCode, 403);
  assert.equal(hostile.headers["Access-Control-Allow-Origin"], undefined);
});
test("CORS supports configured extension origins", () => {
  const security = createDashboardSecurity({ apiKey: "a".repeat(48), allowedOrigins: "chrome-extension://abc,https://dashboard.example" });
  const res = response();
  security.cors(request({ origin: "chrome-extension://abc" }), res, () => {});
  assert.equal(res.headers["Access-Control-Allow-Origin"], "chrome-extension://abc");
});
test("preflight from a disallowed origin is rejected", () => {
  const security = createDashboardSecurity({ apiKey: "a".repeat(48) });
  const res = response();
  security.cors(request({ origin: "https://attacker.example", method: "OPTIONS" }), res, () => {});
  assert.equal(res.statusCode, 403);
});
