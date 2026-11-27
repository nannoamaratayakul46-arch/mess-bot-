"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { STATES, EVENTS, createMessengerSupervisorState } = require("../messengerSupervisorState");

test("starts and transitions to connecting", () => {
  const supervisor = createMessengerSupervisorState({ now: () => 10 });
  assert.equal(supervisor.snapshot().state, STATES.STARTING);
  assert.equal(supervisor.transition(EVENTS.START).state.state, STATES.CONNECTING);
});
test("successful connection clears failure and cooldown metadata", () => {
  let now = 100;
  const supervisor = createMessengerSupervisorState({ now: () => now });
  supervisor.transition(EVENTS.START);
  supervisor.transition(EVENTS.CONNECT_SUCCESS);
  assert.equal(supervisor.snapshot().state, STATES.CONNECTED);
  supervisor.transition(EVENTS.TRANSIENT_FAILURE, { failureKind: "mqtt_disconnect" });
  assert.equal(supervisor.snapshot().state, STATES.DEGRADED);
  assert.equal(supervisor.snapshot().consecutiveFailures, 1);
  now = 150;
  supervisor.transition(EVENTS.RECOVERY_SUCCESS);
  const saved = supervisor.snapshot();
  assert.equal(saved.state, STATES.CONNECTED);
  assert.equal(saved.consecutiveFailures, 0);
  assert.equal(saved.lastFailureKind, null);
  assert.equal(saved.lastConnectedAt, 150);
});
test("rate limit enters cooldown and tracks recovery deadline", () => {
  const supervisor = createMessengerSupervisorState({ now: () => 500 });
  supervisor.transition(EVENTS.START);
  const result = supervisor.transition(EVENTS.RATE_LIMIT, { failureKind: "facebook_rate_limit", cooldownUntil: 1000 });
  assert.equal(result.state.state, STATES.COOLDOWN);
  assert.equal(result.state.cooldownUntil, 1000);
  assert.equal(result.state.consecutiveFailures, 1);
  assert.equal(supervisor.transition(EVENTS.COOLDOWN_END).state.state, STATES.CONNECTING);
});
test("auth rejection requires explicit session replacement", () => {
  const supervisor = createMessengerSupervisorState();
  supervisor.transition(EVENTS.START);
  supervisor.transition(EVENTS.AUTH_REJECTED, { failureKind: "session_expired" });
  assert.equal(supervisor.snapshot().state, STATES.SESSION_REQUIRED);
  assert.equal(supervisor.transition(EVENTS.CONNECT_BEGIN).ok, false);
  assert.equal(supervisor.transition(EVENTS.SESSION_REPLACED).state.state, STATES.CONNECTING);
});
test("generation fences stale callbacks after reconnect attempts", () => {
  const supervisor = createMessengerSupervisorState();
  supervisor.transition(EVENTS.START);
  const firstGeneration = supervisor.snapshot().generation;
  supervisor.transition(EVENTS.TRANSIENT_FAILURE);
  supervisor.transition(EVENTS.CONNECT_BEGIN);
  assert.equal(supervisor.isCurrentGeneration(firstGeneration), false);
  assert.equal(supervisor.isCurrentGeneration(supervisor.snapshot().generation), true);
});
test("restore accepts valid snapshots and rejects malformed states", () => {
  const supervisor = createMessengerSupervisorState();
  assert.equal(supervisor.restore({ state: STATES.COOLDOWN, generation: 7, attempts: 4, consecutiveFailures: 3, cooldownUntil: 999, lastFailureKind: "rate_limit" }), true);
  assert.equal(supervisor.snapshot().generation, 7);
  assert.equal(supervisor.snapshot().cooldownUntil, 999);
  assert.equal(supervisor.restore({ state: "unknown" }), false);
});
test("terminal states reject accidental transitions", () => {
  const supervisor = createMessengerSupervisorState();
  supervisor.transition(EVENTS.STOP);
  assert.equal(supervisor.snapshot().state, STATES.STOPPING);
  assert.equal(supervisor.transition(EVENTS.START).ok, false);
});
