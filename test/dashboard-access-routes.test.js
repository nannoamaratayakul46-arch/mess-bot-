"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCookies, safeEqual, createDashboardAccessRoutes } = require("../dashboardAccessRoutes");
const { createDashboardAccess } = require("../dashboardAccess");

test("cookie parser handles encoded values and malformed cookies safely", () => {
  const cookies = parseCookies("a=one; eclipse_dashboard_session=abc%2F123; broken=%E0%A4%A");
  assert.equal(cookies.a, "one");
  assert.equal(cookies.eclipse_dashboard_session, "abc/123");
  assert.equal(cookies.broken, undefined);
});

test("CSRF comparison is constant-time for equal-length values and rejects missing values", () => {
  assert.equal(safeEqual("same-token", "same-token"), true);
  assert.equal(safeEqual("same-token", "other-token"), false);
  assert.equal(safeEqual("", ""), false);
  assert.equal(safeEqual("short", "longer"), false);
});

test("owner bootstrap creates the first owner with hashed Passkey and Secret Code credentials", async () => {
  const calls = [];
  const access = createDashboardAccess({
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ id: 1, email: params[0], role: "owner", status: "active" }], rowCount: 1 };
    },
  });
  const passkey = "owner-passkey-manually-entered-2026";
  const owner = await access.bootstrapOwner({ passkey });
  assert.equal(owner.role, "owner");
  assert.equal(owner.id, 1);
  assert.equal(typeof owner.secretCode, "string");
  assert.equal(owner.secretCode.length, 43);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /WHERE NOT EXISTS/);
  assert.match(calls[0].params[1], /^scrypt\\$16384\\$8\\$1\\$/);
  assert.match(calls[0].params[3], /^scrypt\\$16384\\$8\\$1\\$/);
  assert.match(calls[0].params[4], /^scrypt\\$16384\\$8\\$1\\$/);
});

test("only owners can list or update friend accounts; owner role cannot be assigned", async () => {
  const calls = [];
  const access = createDashboardAccess({
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ id: 2, email: "friend@example.com", role: "operator", status: "active" }], rowCount: 1 };
    },
  });
  await assert.rejects(
    () => access.listAccounts({ id: 2, role: "viewer", status: "active" }),
    error => error.code === "OWNER_REQUIRED"
  );
  await assert.rejects(
    () => access.updateAccount({ id: 1, role: "owner", status: "active" }, 2, { role: "owner" }),
    /owner cannot be assigned/
  );
  const changed = await access.updateAccount({ id: 1, role: "owner", status: "active" }, 2, { status: "disabled" });
  assert.equal(changed.status, "active");
  assert.match(calls[0].sql, /UPDATE eclipse_dashboard_accounts/);
});


function fakeResponse() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function fakeApp() {
  return { use() {}, post() {}, get() {}, patch() {}, delete() {} };
}

test("friend route policy allows Viewer reads but denies mutations", async () => {
  const previousOrigin = process.env.ECLIPSE_DASHBOARD_ORIGIN;
  process.env.ECLIPSE_DASHBOARD_ORIGIN = "https://dashboard.example";
  try {
    const db = {
      query: async sql => {
        if (/SELECT a\.id, a\.email, a\.role, a\.status, s\.id AS session_id/.test(sql)) {
          return { rows: [{ id: 7, email: "viewer@example.com", role: "viewer", status: "active", session_id: 9 }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      },
    };
    const routes = createDashboardAccessRoutes({ app: fakeApp(), db, legacyAuth: (_req, res) => res.status(401).json({ ok: false }) });
    const req = { method: "GET", path: "/api/dashboard/status", headers: { cookie: "eclipse_dashboard_session=" + "a".repeat(43) } };
    const res = fakeResponse();
    let continued = false;
    await routes.authorizeExistingRoute(req, res, () => { continued = true; });
    assert.equal(continued, true);
    assert.equal(req.dashboardAccount.role, "viewer");

    const mutationReq = { method: "POST", path: "/api/dashboard/bot/stop", headers: { cookie: "eclipse_dashboard_session=" + "a".repeat(43) } };
    const mutationRes = fakeResponse();
    let mutationContinued = false;
    await routes.authorizeExistingRoute(mutationReq, mutationRes, () => { mutationContinued = true; });
    assert.equal(mutationContinued, false);
    assert.equal(mutationRes.statusCode, 403);
  } finally {
    if (previousOrigin === undefined) delete process.env.ECLIPSE_DASHBOARD_ORIGIN;
    else process.env.ECLIPSE_DASHBOARD_ORIGIN = previousOrigin;
  }
});

test("Operator mutations require an allowed Origin and matching CSRF token", async () => {
  const previousOrigin = process.env.ECLIPSE_DASHBOARD_ORIGIN;
  process.env.ECLIPSE_DASHBOARD_ORIGIN = "https://dashboard.example";
  try {
    const db = {
      query: async sql => {
        if (/SELECT a\.id, a\.email, a\.role, a\.status, s\.id AS session_id/.test(sql)) {
          return { rows: [{ id: 8, email: "operator@example.com", role: "operator", status: "active", session_id: 10 }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      },
    };
    const routes = createDashboardAccessRoutes({ app: fakeApp(), db, legacyAuth: (_req, res) => res.status(401).json({ ok: false }) });
    const token = "c".repeat(43);
    const req = {
      method: "POST",
      path: "/api/dashboard/bot/stop",
      headers: {
        origin: "https://dashboard.example",
        cookie: "eclipse_dashboard_session=" + "b".repeat(43) + "; eclipse_dashboard_csrf=" + token,
        "x-eclipse-csrf-token": token,
      },
    };
    const res = fakeResponse();
    let continued = false;
    await routes.authorizeExistingRoute(req, res, () => { continued = true; });
    assert.equal(continued, true);

    const badOriginReq = { ...req, headers: { ...req.headers, origin: "https://evil.example" } };
    const badOriginRes = fakeResponse();
    await routes.authorizeExistingRoute(badOriginReq, badOriginRes, () => {});
    assert.equal(badOriginRes.statusCode, 403);
  } finally {
    if (previousOrigin === undefined) delete process.env.ECLIPSE_DASHBOARD_ORIGIN;
    else process.env.ECLIPSE_DASHBOARD_ORIGIN = previousOrigin;
  }
});


test("only owners can list invitations and invitation listings never expose token hashes", async () => {
  const calls = [];
  const access = createDashboardAccess({
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ id: 4, role: "viewer", status: "pending", expires_at: "2026-11-08T12:00:00Z" }], rowCount: 1 };
    },
    now: () => Date.parse("2026-11-07T12:00:00Z"),
  });
  await assert.rejects(
    () => access.listInvitations({ id: 2, role: "operator", status: "active" }),
    error => error.code === "OWNER_REQUIRED"
  );
  const invitations = await access.listInvitations({ id: 1, role: "owner", status: "active" });
  assert.equal(invitations[0].status, "pending");
  assert.doesNotMatch(calls[0].sql, /token_hash/i);
  assert.equal(calls[0].params[0], Date.parse("2026-11-07T12:00:00Z"));
});

test("invitation revocation is owner-only and only revokes unused invitations", async () => {
  const calls = [];
  const access = createDashboardAccess({
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ id: 5, role: "operator", revoked_at: "2026-11-07T12:00:00Z" }], rowCount: 1 };
    },
    now: () => Date.parse("2026-11-07T12:00:00Z"),
  });
  await assert.rejects(
    () => access.revokeInvitation({ id: 2, role: "viewer", status: "active" }, 5),
    error => error.code === "OWNER_REQUIRED"
  );
  const revoked = await access.revokeInvitation({ id: 1, role: "owner", status: "active" }, "5");
  assert.equal(revoked.status, "revoked");
  assert.match(calls[0].sql, /redeemed_at IS NULL AND revoked_at IS NULL/);
  assert.deepEqual(calls[0].params, [5, Date.parse("2026-11-07T12:00:00Z")]);
});

test("revoked invitations cannot be redeemed", async () => {
  let redemptionSql = "";
  const access = createDashboardAccess({
    query: async sql => {
      redemptionSql = sql;
      return { rows: [], rowCount: 0 };
    },
  });
  await assert.rejects(
    () => access.redeemInvitation({
      token: "x".repeat(48),
      passkey: "friend-passkey-manually-entered-2026",
    }),
    error => error.code === "INVITATION_INVALID"
  );
  assert.match(redemptionSql, /revoked_at IS NULL/);
});
