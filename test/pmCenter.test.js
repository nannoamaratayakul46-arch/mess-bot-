"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPmCenter } = require("../pmCenter");

function setup(overrides = {}) {
  const routes = {};
  const app = {
    get(path, ...handlers) { routes["GET " + path] = handlers.at(-1); },
    post(path, ...handlers) { routes["POST " + path] = handlers.at(-1); },
  };
  const state = {
    api: {},
    members: [{ user_id: "1234567890123456", name: "Member One", resolved: true }],
    sent: [],
    ...overrides,
  };
  const pm = createPmCenter({
    getApi: () => state.api,
    isKnownGroup: id => id === "9876543210987654",
    resolveMembers: state.resolveMembers || (async () => ({ members: state.members })),
    send: state.send || (async (_api, message, recipientId) => {
      state.sent.push({ message, recipientId });
      return { messageID: "message-1" };
    }),
  });
  pm.registerRoutes(app, (_req, _res, next) => next());
  return { routes, state };
}

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test("PM member route returns valid participants and counts", async () => {
  const { routes } = setup();
  const res = response();
  await routes["GET /api/dashboard/pm/:threadId/members"]({ params: { threadId: "9876543210987654" } }, res);
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.members.length, 1);
  assert.equal(res.payload.diagnostics.total, 1);
});

test("PM member route returns actionable diagnostics when lookup throws", async () => {
  const { routes } = setup({ resolveMembers: async () => { throw new Error("thread lookup failed"); } });
  const res = response();
  await routes["GET /api/dashboard/pm/:threadId/members"]({ params: { threadId: "9876543210987654" } }, res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.payload.diagnostic.code, "MEMBER_LOOKUP_FAILED");
  assert.equal(res.payload.diagnostic.stage, "member-resolution");
});

test("PM member route explains empty participant results", async () => {
  const { routes } = setup({ members: [] });
  const res = response();
  await routes["GET /api/dashboard/pm/:threadId/members"]({ params: { threadId: "9876543210987654" } }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.diagnostic.code, "NO_PARTICIPANT_IDS");
});

test("PM send revalidates membership and sends to the selected member", async () => {
  const { routes, state } = setup();
  const res = response();
  await routes["POST /api/dashboard/pm/send"]({
    body: { thread_id: "9876543210987654", user_id: "1234567890123456", message: "Hello", confirmed: true },
  }, res);
  assert.equal(res.payload.ok, true);
  assert.deepEqual(state.sent, [{ message: "Hello", recipientId: "1234567890123456" }]);
});

test("PM send refuses recipients not in the selected group", async () => {
  const { routes, state } = setup({ members: [] });
  const res = response();
  await routes["POST /api/dashboard/pm/send"]({
    body: { thread_id: "9876543210987654", user_id: "1234567890123456", message: "Hello", confirmed: true },
  }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.diagnostic.code, "RECIPIENT_NOT_IN_GROUP");
  assert.equal(state.sent.length, 0);
});
