"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createBurstRoastSettings, DEFAULTS } = require("../burstRoastSettings");

function makeHarness(savedSettings = { ...DEFAULTS }, options = {}) {
  const routes = {};
  const writes = [];
  const sent = [];
  const api = { sendTypingIndicator() {} };
  const db = {
    async query(sql, params) {
      if (/SELECT preference_value/.test(sql)) return { rows: [{ preference_value: savedSettings }] };
      if (/INSERT INTO eclipse_dashboard_preferences/.test(sql)) {
        writes.push({ sql, params });
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  const app = {
    get(path, ...args) { routes["GET " + path] = args[args.length - 1]; },
    put(path, ...args) { routes["PUT " + path] = args[args.length - 1]; },
    post(path, ...args) { routes["POST " + path] = args[args.length - 1]; },
  };
  const service = createBurstRoastSettings({
    db,
    getApi: () => api,
    isKnownGroup: id => id === "gc-1",
    random: options.random,
    getNow: options.now,
    send: async (_api, message, threadID) => {
      sent.push({ message, threadID });
      return { messageID: "msg-1" };
    },
  });
  service.registerRoutes(app, (_req, _res, next) => next());
  function response() {
    return {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
  }
  return { routes, writes, sent, response, service };
}

test("run uses validated editor snapshot without persisting it", async () => {
  const saved = { ...DEFAULTS, messages_per_burst: 5 };
  const h = makeHarness(saved);
  const res = h.response();
  await h.routes["POST /api/dashboard/burst-roast/run"]({
    body: {
      mode: "burst",
      thread_ids: ["gc-1"],
      settings: { ...DEFAULTS, messages_per_burst: 1 },
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.started, true);
  assert.equal(res.body.messages_per_burst, 1);
  await new Promise(resolve => setTimeout(resolve, 2100));
  assert.equal(h.sent.length, 1);
  assert.equal(h.writes.length, 0);
  assert.equal(saved.messages_per_burst, 5);
});

test("run rejects invalid snapshot instead of silently using saved settings", async () => {
  const h = makeHarness({ ...DEFAULTS, messages_per_burst: 5 });
  const res = h.response();
  await h.routes["POST /api/dashboard/burst-roast/run"]({
    body: {
      mode: "burst",
      thread_ids: ["gc-1"],
      settings: { ...DEFAULTS, messages_per_burst: 0 },
    },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /messages_per_burst/);
  assert.equal(h.sent.length, 0);
  assert.equal(h.writes.length, 0);
});


test("stop endpoint cancels a run during its typing lead-in", async () => {
  const h = makeHarness({ ...DEFAULTS, messages_per_burst: 2 });
  const runRes = h.response();
  await h.routes["POST /api/dashboard/burst-roast/run"]({
    body: { mode: "burst", thread_ids: ["gc-1"], settings: { ...DEFAULTS, messages_per_burst: 2 } },
  }, runRes);
  assert.equal(runRes.statusCode, 200);

  const stopRes = h.response();
  await h.routes["POST /api/dashboard/burst-roast/stop"]({ body: { thread_ids: ["gc-1"] } }, stopRes);
  assert.equal(stopRes.statusCode, 200);
  assert.equal(stopRes.body.stopped, 1);

  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(h.sent.length, 0);
});

test("shutdown stopAllRuns cancels active runs during typing lead-in", async () => {
  const h = makeHarness({ ...DEFAULTS, messages_per_burst: 2 });
  const runRes = h.response();
  await h.routes["POST /api/dashboard/burst-roast/run"]({
    body: { mode: "burst", thread_ids: ["gc-1"], settings: { ...DEFAULTS, messages_per_burst: 2 } },
  }, runRes);
  assert.equal(runRes.statusCode, 200);
  assert.equal(h.service.stopAllRuns(), 1);
  assert.equal(h.service.stopAllRuns(), 0, "stop should be idempotent");
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(h.sent.length, 0, "shutdown cancellation should prevent the pending send");
});

test("run rejects a cooldown shorter than two minutes", async () => {
  const h = makeHarness();
  const res = h.response();
  await h.routes["POST /api/dashboard/burst-roast/run"]({
    body: { mode: "burst", thread_ids: ["gc-1"], settings: { ...DEFAULTS, cooldown_seconds: 60 } },
  }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /cooldown_seconds/);
  assert.equal(h.sent.length, 0);
});

test("Time Check replaces a burst cycle with the exact Manila time message at the configured random threshold", async () => {
  const h = makeHarness({ ...DEFAULTS, messages_per_burst: 1, time_check_enabled: true }, {
    random: () => 0,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  });
  const res = h.response();
  await h.routes["POST /api/dashboard/burst-roast/run"]({
    body: {
      mode: "burst",
      thread_ids: ["gc-1"],
      settings: { ...DEFAULTS, messages_per_burst: 1, time_check_enabled: true },
    },
  }, res);
  assert.equal(res.statusCode, 200);
  await new Promise(resolve => setTimeout(resolve, 2100));
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].message, "time check: 8:00:00 AM, wag sana d.o isa jan");
});

test("run accepts 700 messages and a 600-second delay in the execution snapshot", async () => {
  const h = makeHarness();
  const res = h.response();
  await h.routes["POST /api/dashboard/burst-roast/run"]({
    body: {
      mode: "burst",
      thread_ids: ["gc-1"],
      settings: { ...DEFAULTS, messages_per_burst: 700, delay_seconds: 600 },
    },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.messages_per_burst, 700);
  assert.equal(res.body.delay_seconds, 600);
  const stopRes = h.response();
  await h.routes["POST /api/dashboard/burst-roast/stop"]({ body: { thread_ids: ["gc-1"] } }, stopRes);
  assert.equal(stopRes.body.stopped, 1);
});
