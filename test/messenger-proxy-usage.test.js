"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

test("proxy usage meter accounts for instrumented sockets and hard-stops at 1.8 GB", async () => {
  const meter = require("../messengerProxyUsage");
  let limitCalled = false;
  const db = {
    async query(sql) {
      if (/SELECT uploaded_bytes/.test(sql)) return { rows: [] };
      return { rows: [] };
    }
  };
  await meter.initialize(db, { onLimit: () => { limitCalled = true; } });
  const socket = new EventEmitter();
  socket.bytesRead = 0;
  socket.bytesWritten = 0;
  socket.destroyed = false;
  socket.destroy = function destroy() { this.destroyed = true; this.emit("close"); };

  const agent = {
    callback: async () => socket
  };
  meter.instrumentAgent(agent);
  const returned = await agent.callback();
  assert.equal(returned, socket);

  socket.bytesWritten = 1_000_000_000;
  socket.bytesRead = 800_000_000;
  meter.sampleSockets();

  const status = meter.getStatus();
  assert.equal(status.blocked, true);
  assert.equal(status.hard_stop_bytes, 1_800_000_000);
  assert.ok(status.used_bytes >= 1_800_000_000);
  assert.equal(socket.destroyed, true);
  assert.equal(limitCalled, true);
});

test("proxy bandwidth policy reserves 10 percent of the 2 GB allowance", () => {
  const meter = require("../messengerProxyUsage");
  assert.deepEqual(meter.constants, {
    MONTHLY_ALLOWANCE_BYTES: 2_000_000_000,
    HARD_STOP_BYTES: 1_800_000_000,
    WARNING_BYTES: 1_400_000_000,
    CRITICAL_BYTES: 1_700_000_000
  });
});
