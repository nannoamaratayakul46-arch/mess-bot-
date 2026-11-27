"use strict";

const STATES = Object.freeze({
  STARTING: "starting", CONNECTING: "connecting", CONNECTED: "connected",
  DEGRADED: "degraded", COOLDOWN: "cooldown", SESSION_REQUIRED: "session_required",
  STOPPING: "stopping", FATAL: "fatal",
});
const EVENTS = Object.freeze({
  START: "start", CONNECT_BEGIN: "connect_begin", CONNECT_SUCCESS: "connect_success",
  TRANSIENT_FAILURE: "transient_failure", RATE_LIMIT: "rate_limit",
  AUTH_REJECTED: "auth_rejected", RECOVERY_BEGIN: "recovery_begin",
  RECOVERY_SUCCESS: "recovery_success", RECOVERY_FAILURE: "recovery_failure",
  COOLDOWN_END: "cooldown_end", SESSION_REPLACED: "session_replaced",
  STOP: "stop", FATAL: "fatal",
});
const TRANSITIONS = Object.freeze({
  [STATES.STARTING]: { [EVENTS.START]: STATES.CONNECTING, [EVENTS.STOP]: STATES.STOPPING, [EVENTS.FATAL]: STATES.FATAL },
  [STATES.CONNECTING]: { [EVENTS.CONNECT_SUCCESS]: STATES.CONNECTED, [EVENTS.TRANSIENT_FAILURE]: STATES.DEGRADED, [EVENTS.RATE_LIMIT]: STATES.COOLDOWN, [EVENTS.AUTH_REJECTED]: STATES.SESSION_REQUIRED, [EVENTS.STOP]: STATES.STOPPING, [EVENTS.FATAL]: STATES.FATAL },
  [STATES.CONNECTED]: { [EVENTS.TRANSIENT_FAILURE]: STATES.DEGRADED, [EVENTS.RATE_LIMIT]: STATES.COOLDOWN, [EVENTS.AUTH_REJECTED]: STATES.SESSION_REQUIRED, [EVENTS.RECOVERY_BEGIN]: STATES.DEGRADED, [EVENTS.STOP]: STATES.STOPPING, [EVENTS.FATAL]: STATES.FATAL },
  [STATES.DEGRADED]: { [EVENTS.CONNECT_BEGIN]: STATES.CONNECTING, [EVENTS.CONNECT_SUCCESS]: STATES.CONNECTED, [EVENTS.TRANSIENT_FAILURE]: STATES.DEGRADED, [EVENTS.RATE_LIMIT]: STATES.COOLDOWN, [EVENTS.AUTH_REJECTED]: STATES.SESSION_REQUIRED, [EVENTS.RECOVERY_BEGIN]: STATES.DEGRADED, [EVENTS.RECOVERY_SUCCESS]: STATES.CONNECTED, [EVENTS.RECOVERY_FAILURE]: STATES.COOLDOWN, [EVENTS.STOP]: STATES.STOPPING, [EVENTS.FATAL]: STATES.FATAL },
  [STATES.COOLDOWN]: { [EVENTS.COOLDOWN_END]: STATES.CONNECTING, [EVENTS.CONNECT_SUCCESS]: STATES.CONNECTED, [EVENTS.AUTH_REJECTED]: STATES.SESSION_REQUIRED, [EVENTS.SESSION_REPLACED]: STATES.CONNECTING, [EVENTS.STOP]: STATES.STOPPING, [EVENTS.FATAL]: STATES.FATAL },
  [STATES.SESSION_REQUIRED]: { [EVENTS.SESSION_REPLACED]: STATES.CONNECTING, [EVENTS.STOP]: STATES.STOPPING, [EVENTS.FATAL]: STATES.FATAL },
  [STATES.STOPPING]: {}, [STATES.FATAL]: {},
});
function bounded(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
}
function createMessengerSupervisorState(options = {}) {
  const now = typeof options.now === "function" ? options.now : Date.now;
  const validStates = Object.values(STATES);
  const state = {
    state: validStates.includes(options.initialState) ? options.initialState : STATES.STARTING,
    generation: bounded(options.generation, 0, 0, Number.MAX_SAFE_INTEGER),
    attempts: bounded(options.attempts, 0, 0, 1000000),
    consecutiveFailures: bounded(options.consecutiveFailures, 0, 0, 1000000),
    cooldownUntil: bounded(options.cooldownUntil, 0, 0, Number.MAX_SAFE_INTEGER),
    lastFailureKind: options.lastFailureKind ? String(options.lastFailureKind).slice(0, 80) : null,
    lastTransitionAt: bounded(options.lastTransitionAt, now(), 0, Number.MAX_SAFE_INTEGER),
    lastConnectedAt: bounded(options.lastConnectedAt, 0, 0, Number.MAX_SAFE_INTEGER),
  };
  const snapshot = () => ({ ...state });
  function transition(event, metadata = {}) {
    const next = TRANSITIONS[state.state]?.[event];
    if (!next) return { ok: false, reason: "invalid_transition", state: snapshot() };
    state.state = next;
    state.lastTransitionAt = now();
    if ([EVENTS.CONNECT_BEGIN, EVENTS.COOLDOWN_END, EVENTS.SESSION_REPLACED].includes(event)) {
      state.generation += 1;
      state.attempts += 1;
    }
    if ([EVENTS.CONNECT_SUCCESS, EVENTS.RECOVERY_SUCCESS].includes(event)) {
      state.consecutiveFailures = 0; state.cooldownUntil = 0;
      state.lastFailureKind = null; state.lastConnectedAt = now();
    }
    if ([EVENTS.TRANSIENT_FAILURE, EVENTS.RATE_LIMIT, EVENTS.RECOVERY_FAILURE].includes(event)) {
      state.consecutiveFailures += 1;
      state.lastFailureKind = String(metadata.failureKind || event).slice(0, 80);
      if (metadata.cooldownUntil !== undefined) state.cooldownUntil = bounded(metadata.cooldownUntil, 0, now(), Number.MAX_SAFE_INTEGER);
    }
    return { ok: true, state: snapshot() };
  }
  function restore(saved = {}) {
    if (!saved || !validStates.includes(saved.state)) return false;
    const restored = createMessengerSupervisorState({ ...saved, now });
    Object.assign(state, restored.snapshot());
    return true;
  }
  return { transition, snapshot, isCurrentGeneration: generation => Number(generation) === state.generation, restore };
}
module.exports = { STATES, EVENTS, createMessengerSupervisorState };
