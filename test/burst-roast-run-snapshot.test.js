"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createBurstRoastSettings, DEFAULTS } = require("../burstRoastSettings");

function makeHarness(savedSettings = { ...DEFAULTS }) {
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
  return { routes, writes, sent, response };
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
  await new Promise(resolve => setTimeout(resolve, 10));
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
