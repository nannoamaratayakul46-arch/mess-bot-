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
    resolveMembers: async () => ({ members: [{ user_id: "1111111111111111", name: "Member One" }, { user_id: "2222222222222222", name: "Member Two" }] }),
    send: async (_api, message, userId) => { sent.push({ message, userId }); return { messageID: "sent-1" }; },
    getHybridReply: async ({ text }) => "comeback: " + text,
    delay: async () => {},
    startTyping: () => true,
    stopTyping: () => true,
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
  assert.ok(h.battles.getDiagnostics().last_processing_delay_ms >= 300);
  assert.ok(h.battles.getDiagnostics().last_typing_started_at);
  assert.ok(h.battles.getDiagnostics().last_typing_stopped_at);
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
  const second = response();
  await start({ body: { confirmed: true, thread_id: "1234567890123456", user_id: "2222222222222222", opening_message: "yo" } }, second);
  assert.equal(second.statusCode, 409);
});


test("PM Battle self-laugh reacts to the exact sent message ID after a randomized delay", async () => {
  const routes = new Map();
  const timers = [];
  const reactions = [];
  const api = {
    getCurrentUserID: () => "9999999999999999",
    setMessageReactionMqtt: (reaction, messageId, threadId, callback) => {
      reactions.push({ reaction, messageId, threadId });
      callback(null);
    },
  };
  const battles = createPmBattles({
    getApi: () => api,
    isKnownGroup: id => id === "1234567890123456",
    resolveMembers: async () => ({ members: [{ user_id: "1111111111111111", name: "Member One" }] }),
    send: async () => ({ messageID: "exact-outgoing-id" }),
    getHybridReply: async () => "comeback",
    now: () => 1_700_000_000_000,
    random: () => 0.5,
    setTimer: (fn, delay) => timers.push({ fn, delay }),
  });
  const app = {
    post(path, auth, handler) { routes.set("POST " + path, handler); },
    get(path, auth, handler) { routes.set("GET " + path, handler); },
  };
  battles.registerRoutes(app, (_req, _res, next) => next());
  const started = response();
  await routes.get("POST /api/dashboard/pm/battles/start")({
    body: { confirmed: true, thread_id: "1234567890123456", user_id: "1111111111111111", opening_message: "hello" },
  }, started);
  assert.equal(started.statusCode, 201);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 2000);
  timers[0].fn();
  assert.deepEqual(reactions, [{ reaction: "😂", messageId: "exact-outgoing-id", threadId: "1111111111111111" }]);
});

test("PM Battle diagnostics report listener and the last incoming event stage", async () => {
  const h = harness();
  const diagnostics = h.routes.get("GET /api/dashboard/pm/diagnostics");
  const initial = response();
  diagnostics({}, initial);
  assert.equal(initial.payload.diagnostics.listener, "connected");
  await h.battles.handleIncoming({}, {
    type: "message", threadID: "2222222222222222", senderID: "2222222222222222", body: "hello",
  });
  const after = response();
  diagnostics({}, after);
  assert.equal(after.payload.diagnostics.last_stage, "EVENT_IGNORED_NO_MATCHING_SESSION");
  assert.equal(after.payload.diagnostics.last_sender_id, "2222222222222222");
});


test("PM cognitive delay scales with message complexity and stays bounded", () => {
  const { calculateCognitiveDelayMs, MIN_COGNITIVE_DELAY_MS, MAX_COGNITIVE_DELAY_MS } = require("../pmBattles");
  const short = calculateCognitiveDelayMs("ok");
  const detailed = calculateCognitiveDelayMs("Can you explain this? I have a few questions, and there are several details.\nFirst point.\nSecond point.");
  const veryLong = calculateCognitiveDelayMs("word ".repeat(500));
  assert.ok(short >= MIN_COGNITIVE_DELAY_MS);
  assert.ok(detailed > short);
  assert.ok(veryLong > detailed && veryLong <= MAX_COGNITIVE_DELAY_MS);
});

test("PM typing indicator is stopped when reply generation fails", async () => {
  let started = 0;
  let stopped = 0;
  const routes = new Map();
  const api = { getCurrentUserID: () => "9999999999999999" };
  const battles = createPmBattles({
    getApi: () => api,
    isKnownGroup: id => id === "1234567890123456",
    resolveMembers: async () => ({ members: [{ user_id: "1111111111111111", name: "Member One" }] }),
    send: async () => ({ messageID: "opening" }),
    getHybridReply: async () => { throw new Error("reply provider unavailable"); },
    delay: async () => {},
    startTyping: () => { started += 1; return true; },
    stopTyping: () => { stopped += 1; return true; },
    now: () => 1_700_000_000_000,
  });
  const app = {
    post(path, auth, handler) { routes.set("POST " + path, handler); },
    get(path, auth, handler) { routes.set("GET " + path, handler); },
  };
  battles.registerRoutes(app, (_req, _res, next) => next());
  await routes.get("POST /api/dashboard/pm/battles/start")({
    body: { confirmed: true, thread_id: "1234567890123456", user_id: "1111111111111111", opening_message: "hello" },
  }, response());
  await battles.handleIncoming(api, {
    type: "message", threadID: "1111111111111111", senderID: "1111111111111111", body: "why?",
  });
  assert.equal(started, 1);
  assert.equal(stopped, 1);
});


test("PM cognitive delay honors owner-configured bounds", () => {
  const { calculateCognitiveDelayMs } = require("../pmBattles");
  const short = calculateCognitiveDelayMs("ok", { min_ms: 650, max_ms: 2_600 });
  const detailed = calculateCognitiveDelayMs("Explain this? There are several points, and each one needs a careful response.", { min_ms: 650, max_ms: 2_600 });
  const veryLong = calculateCognitiveDelayMs(("word ".repeat(100) + "x".repeat(700)).slice(0, 1_200) + "????????????", { min_ms: 650, max_ms: 2_600 });
  assert.ok(short >= 650 && short < detailed);
  assert.ok(detailed > short && detailed < veryLong);
  assert.equal(veryLong, 2_600);
});
