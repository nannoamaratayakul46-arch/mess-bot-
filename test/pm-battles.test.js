"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPmBattles } = require("../pmBattles");

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.payload = value; return this; } };
}

function harness() {
  const routes = new Map();
  const sent = [];
  let clock = 1_700_000_000_000;
  const battles = createPmBattles({
    getApi: () => ({ getCurrentUserID: () => "9999999999999999" }),
    isKnownGroup: id => id === "1234567890123456",
    resolveMembers: async () => ({ members: [{ user_id: "1111111111111111", name: "Member One" }] }),
    send: async (_api, message, userId) => { sent.push({ message, userId }); return { messageID: "sent-1" }; },
    getHybridReply: async ({ text }) => "comeback: " + text,
    now: () => clock,
  });
  const app = {
    post(path, auth, handler) { routes.set("POST " + path, handler); },
    get(path, auth, handler) { routes.set("GET " + path, handler); },
  };
  battles.registerRoutes(app, (_req, _res, next) => next());
  return { battles, routes, sent, setTime: value => { clock = value; } };
}

test("PM Battle start requires confirmation and revalidates one GC member", async () => {
  const h = harness();
  const handler = h.routes.get("POST /api/dashboard/pm/battles/start");
  const bad = response();
  await handler({ body: { thread_id: "1234567890123456", user_id: "1111111111111111", opening_message: "yo" } }, bad);
  assert.equal(bad.statusCode, 400);
  const ok = response();
  await handler({ body: { confirmed: true, thread_id: "1234567890123456", user_id: "1111111111111111", opening_message: "yo" } }, ok);
  assert.equal(ok.statusCode, 201);
  assert.equal(h.sent.length, 1);
  assert.deepEqual(h.sent[0], { message: "yo", userId: "1111111111111111" });
});

test("PM Battle responds only to the selected recipient's private reply", async () => {
  const h = harness();
  await h.routes.get("POST /api/dashboard/pm/battles/start")({ body: { confirmed: true, thread_id: "1234567890123456", user_id: "1111111111111111", opening_message: "yo" } }, response());
  const handled = await h.battles.handleIncoming({ getCurrentUserID: () => "9999999999999999" }, {
    type: "message", threadID: "1111111111111111", senderID: "1111111111111111", body: "you bot",
  });
  assert.equal(handled, true);
  assert.equal(h.sent.length, 2);
  assert.equal(h.sent[1].message, "comeback: you bot");
});

test("PM Battle stops when the recipient asks it to stop and blocks a restart", async () => {
  const h = harness();
  const start = h.routes.get("POST /api/dashboard/pm/battles/start");
  await start({ body: { confirmed: true, thread_id: "1234567890123456", user_id: "1111111111111111", opening_message: "yo" } }, response());
  await h.battles.handleIncoming({ getCurrentUserID: () => "9999999999999999" }, {
    type: "message", threadID: "1111111111111111", senderID: "1111111111111111", body: "stop",
  });
  const restart = response();
  await start({ body: { confirmed: true, thread_id: "1234567890123456", user_id: "1111111111111111", opening_message: "again" } }, restart);
  assert.equal(restart.statusCode, 403);
});

test("PM Battle ignores unrelated private conversations", async () => {
  const h = harness();
  const handled = await h.battles.handleIncoming({}, {
    type: "message", threadID: "2222222222222222", senderID: "2222222222222222", body: "hello",
  });
  assert.equal(handled, false);
  assert.equal(h.sent.length, 0);
});

test("only one PM Battle can be active at a time", async () => {
  const h = harness();
  const start = h.routes.get("POST /api/dashboard/pm/battles/start");
  const first = response();
  await start({ body: { confirmed: true, thread_id: "1234567890123456", user_id: "1111111111111111", opening_message: "yo" } }, first);
  assert.equal(first.statusCode, 201);
  // A different recipient cannot be substituted through an arbitrary ID.
  const second = response();
  await start({ body: { confirmed: true, thread_id: "1234567890123456", user_id: "2222222222222222", opening_message: "yo" } }, second);
  assert.equal(second.statusCode, 400);
});
