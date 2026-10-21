"use strict";

const INACTIVITY_MS = 5 * 60 * 1000;
const COUNT_DELAY_MS = 2 * 1000;
const COMPLETION_PHRASE = "D.O SI TABA AAAAAA DI MAKATAGOS SA BOSS OMA NIYA";

function createJaidenTargetCountdown(options = {}) {
  const getTarget = options.getTarget;
  const send = options.send;
  const inactivityMs = Number.isFinite(options.inactivityMs) ? Math.max(1, options.inactivityMs) : INACTIVITY_MS;
  const countDelayMs = Number.isFinite(options.countDelayMs) ? Math.max(0, options.countDelayMs) : COUNT_DELAY_MS;
  const states = new Map();
  let stopped = false;

  const clearTimer = (state) => {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
  };

  const cancel = (threadId, targetId = null) => {
    const state = states.get(String(threadId || "").trim());
    if (!state) return false;
    if (targetId && state.targetId !== String(targetId).trim()) return false;
    state.generation += 1;
    clearTimer(state);
    state.counting = false;
    return true;
  };

  const wait = (ms) => new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === "function") timer.unref();
  });

  function scheduleInactivity(threadId, state, generation) {
    clearTimer(state);
    state.timer = setTimeout(() => {
      state.timer = null;
      void runCountdown(threadId, state, generation);
    }, inactivityMs);
    if (typeof state.timer.unref === "function") state.timer.unref();
  }

  async function verifySelectedTarget(threadId, state, generation) {
    try {
      const target = typeof getTarget === "function" ? await getTarget(threadId) : null;
      const currentTargetId = String(target?.target_user_id || "").trim();
      if (currentTargetId === state.targetId) return true;
      if (state.generation === generation && states.get(threadId) === state) {
        state.generation += 1;
        clearTimer(state);
        state.counting = false;
        states.delete(threadId);
      }
      return false;
    } catch (error) {
      console.warn("[JAIDEN COUNTDOWN] Could not verify selected target for thread " + threadId + ":", error?.message || error);
      if (!stopped && state.generation === generation && states.get(threadId) === state) {
        state.counting = false;
        scheduleInactivity(threadId, state, generation);
      }
      return false;
    }
  }

  async function runCountdown(threadId, state, generation) {
    if (stopped || state.generation !== generation || state.counting) return;
    state.counting = true;
    try {
      for (let number = 1; number <= 100; number += 1) {
        if (stopped || state.generation !== generation || states.get(threadId) !== state) return;
        // Dashboard target changes happen outside this process. Recheck at
        // count start and every five numbers so stale targets are discarded.
        if ((number === 1 || number % 5 === 0) && !(await verifySelectedTarget(threadId, state, generation))) return;
        const result = await send(state.api, String(number), threadId, () => !stopped && state.generation === generation && states.get(threadId) === state);
        if (result === false || (result && result.sent === false)) {
          console.warn("[JAIDEN COUNTDOWN] Number send failed for thread " + threadId + "; countdown stopped.");
          if (!stopped && state.generation === generation && states.get(threadId) === state) {
            state.counting = false;
            scheduleInactivity(threadId, state, generation);
          }
          return;
        }
        if (number < 100) {
          await wait(countDelayMs);
          if (stopped || state.generation !== generation || states.get(threadId) !== state) return;
        }
      }
      if (stopped || state.generation !== generation || states.get(threadId) !== state) return;
      if (!(await verifySelectedTarget(threadId, state, generation))) return;
      const result = await send(state.api, COMPLETION_PHRASE, threadId, () => !stopped && state.generation === generation && states.get(threadId) === state);
      if (result === false || (result && result.sent === false)) {
        console.warn("[JAIDEN COUNTDOWN] Completion phrase send failed for thread " + threadId + ".");
        if (!stopped && state.generation === generation && states.get(threadId) === state) {
          state.counting = false;
          scheduleInactivity(threadId, state, generation);
        }
        return;
      }
      if (stopped || state.generation !== generation || states.get(threadId) !== state) return;
      state.counting = false;
      scheduleInactivity(threadId, state, generation);
    } catch (error) {
      console.error("[JAIDEN COUNTDOWN] Failed for thread " + threadId + ":", error?.message || error);
      if (!stopped && state.generation === generation && states.get(threadId) === state) {
        state.counting = false;
        scheduleInactivity(threadId, state, generation);
      }
    } finally {
      if (state.generation === generation) state.counting = false;
    }
  }

  async function onMessage({ api, threadId, senderId }) {
    if (stopped || !api || !String(threadId || "").trim()) return;
    const threadKey = String(threadId).trim();
    const senderKey = String(senderId || "").trim();

    // Invalidate a running count synchronously on the target's message,
    // before awaiting the database lookup for the current saved target.
    const currentState = states.get(threadKey);
    if (currentState && senderKey === currentState.targetId) {
      currentState.generation += 1;
      clearTimer(currentState);
      currentState.counting = false;
    }

    let target = null;
    try {
      target = typeof getTarget === "function" ? await getTarget(threadKey) : null;
    } catch (error) {
      console.warn("[JAIDEN COUNTDOWN] Could not load selected target for thread " + threadKey + ":", error?.message || error);
      return;
    }
    const targetId = String(target?.target_user_id || "").trim();
    let state = states.get(threadKey);
    if (!targetId) {
      if (state) {
        state.generation += 1;
        clearTimer(state);
        states.delete(threadKey);
      }
      return;
    }
    if (state && state.targetId !== targetId) {
      state.generation += 1;
      clearTimer(state);
      states.delete(threadKey);
      state = null;
    }
    if (senderKey !== targetId) return;
    if (!state) {
      state = { targetId, timer: null, generation: 0, counting: false, api };
      states.set(threadKey, state);
    }
    state.api = api;
    state.generation += 1;
    state.counting = false;
    scheduleInactivity(threadKey, state, state.generation);
  }

  function stop() {
    stopped = true;
    for (const state of states.values()) {
      state.generation += 1;
      clearTimer(state);
      state.counting = false;
    }
    states.clear();
  }

  return { onMessage, cancel, stop };
}

module.exports = {
  INACTIVITY_MS,
  COUNT_DELAY_MS,
  COMPLETION_PHRASE,
  createJaidenTargetCountdown,
};
