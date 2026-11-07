"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createDashboardAccess,
  createOpaqueToken,
  hashToken,
  hashPassword,
  verifyPassword,
  normalizeEmail,
} = require("../dashboardAccess");

test("opaque tokens are high entropy and only hashes are persisted", () => {
  const token = createOpaqueToken();
  assert.equal(token.length, 43);
  assert.notEqual(hashToken(token), token);
  assert.equal(hashToken(token), hashToken(token));
});

test("password hashes verify without storing plaintext", async () => {
  const password = "correct horse battery staple";
  const encoded = await hashPassword(password);
  assert.match(encoded, /^scrypt\$16384\$8\$1\$/);
  assert.notEqual(encoded, password);
  assert.equal(await verifyPassword(password, encoded), true);
  assert.equal(await verifyPassword("wrong password", encoded), false);
  assert.equal(await verifyPassword(password, "invalid"), false);
});

test("password and email validation reject weak or malformed input", async () => {
  await assert.rejects(() => hashPassword("short"), /9 and 1024/);
  assert.equal(normalizeEmail("  FRIEND@EXAMPLE.COM "), "friend@example.com");
  assert.throws(() => normalizeEmail("not-an-email"), /valid email/);
});

test("invitation creation is owner-only and persists only a token hash", async () => {
  const calls = [];
  const access = createDashboardAccess({
    now: () => 1_800_000_000_000,
    query: async (sql, params) => { calls.push({ sql, params }); return { rows: [], rowCount: 1 }; },
  });
  await assert.rejects(
    () => access.createInvitation({ actor: { id: 2, role: "operator", status: "active" } }),
    error => error.code === "OWNER_REQUIRED"
  );
  const invitation = await access.createInvitation({
    actor: { id: 1, role: "owner", status: "active" },
    role: "viewer",
  });
  assert.equal(invitation.token.length, 43);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params[0], hashToken(invitation.token));
  assert.notEqual(calls[0].params[0], invitation.token);
  assert.equal(calls[0].params[1], "viewer");
});

test("invitation roles cannot grant owner privileges", async () => {
  const access = createDashboardAccess({ query: async () => ({ rows: [], rowCount: 1 }) });
  await assert.rejects(
    () => access.createInvitation({ actor: { id: 1, role: "owner", status: "active" }, role: "owner" }),
    /operator or viewer/
  );
});
