"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPmCenter } = require("../pmCenter");

function harness() {
  const routes = new Map();
  const app = {
    get(path, auth, handler) { routes.set("GET " + path, handler); },
    post(path, auth, handler) { routes.set("POST " + path, handler); },
  };
  const sent = [];
  let clock = 1_000_000;
  const center = createPmCenter({
    getApi: () => ({ connected: true }),
    isKnownGroup: id => id === "1234567890123456",
    resolveMembers: async () => ({ members: [
      { user_id: "1111111111111111", name: "Member One", resolved: true },
      { user_id: "2222222222222222", name: "Member Two", resolved: true },
    ] }),
    send: async (_api, message, userId) => {
      sent.push({ message, userId });
      return { messageID: "message-1" };
    },
    now: () => clock,
  });
  center.registerRoutes(app, (_req, _res, next) => next());
  return { routes, sent, setTime: value => { clock = value; } };
}

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
  };
}

test("PM member picker returns only valid group member IDs and display names", async () => {
  const h = harness();
  const res = response();
  await h.routes.get("GET /api/dashboard/pm/:threadId/members")(
    { params: { threadId: "1234567890123456" } }, res
  );
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.members.length, 2);
  assert.equal(res.payload.members[0].name, "Member One");
});

test("PM send requires explicit confirmation and selected group membership", async () => {
  const h = harness();
  const handler = h.routes.get("POST /api/dashboard/pm/send");
  const unconfirmed = response();
  await handler({ body: { thread_id: "1234567890123456", user_id: "1111111111111111", message: "Hello" } }, unconfirmed);
  assert.equal(unconfirmed.statusCode, 400);
  const wrongGroup = response();
  await handler({ body: { confirmed: true, thread_id: "9999999999999999", user_id: "1111111111111111", message: "Hello" } }, wrongGroup);
  assert.equal(wrongGroup.statusCode, 400);
  assert.equal(h.sent.length, 0);
});

test("PM sends to exactly one revalidated member and reports delivery", async () => {
  const h = harness();
  const res = response();
  await h.routes.get("POST /api/dashboard/pm/send")({
    body: { confirmed: true, thread_id: "1234567890123456", user_id: "1111111111111111", message: "Hello there" },
  }, res);
  assert.equal(res.payload.ok, true);
  assert.deepEqual(h.sent, [{ message: "Hello there", userId: "1111111111111111" }]);
});

test("PM send is rate-limited per recipient and globally", async () => {
  const h = harness();
  const handler = h.routes.get("POST /api/dashboard/pm/send");
  const body = { confirmed: true, thread_id: "1234567890123456", user_id: "1111111111111111", message: "Hello" };
  const first = response();
  await handler({ body }, first);
  const second = response();
  await handler({ body }, second);
  assert.equal(second.statusCode, 429);
  h.setTime(1_061_000);
  const third = response();
  await handler({ body }, third);
  assert.equal(third.payload.ok, true);
});

test("PM rejects oversized message and does not send", async () => {
  const h = harness();
  const res = response();
  await h.routes.get("POST /api/dashboard/pm/send")({
    body: { confirmed: true, thread_id: "1234567890123456", user_id: "1111111111111111", message: "x".repeat(2001) },
  }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(h.sent.length, 0);
});
