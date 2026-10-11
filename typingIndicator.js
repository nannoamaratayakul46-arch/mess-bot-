"use strict";

const ENABLED = !/^(false|0|no|off)$/i.test(String(process.env.TYPING_ENABLED || "true"));
const activeStates = new WeakMap();
const REFRESH_MS = 25000;

function getThreadStates(api) {
  let states = activeStates.get(api);
  if (!states) {
    states = new Map();
    activeStates.set(api, states);
  }
  return states;
}

function requestTyping(api, key, state) {
  if (state.stopped) return false;
  try {
    if (typeof api.sendTypingIndicator === "function") {
      console.log("[BANAT-TYPING] Requesting Messenger indicator for thread " + key);
      const end = api.sendTypingIndicator(key, (error) => {
        if (error) {
          console.warn("[BANAT-TYPING] API callback error for thread " + key + ":", error?.message || error);
        } else {
          console.log("[BANAT-TYPING] API callback completed without error for thread " + key);
        }
      });
      state.end = typeof end === "function" ? end : null;
      if (typeof end !== "function") {
        console.warn("[BANAT-TYPING] API returned no end function for thread " + key + "; indicator may expire automatically.");
      }
      return true;
    }
    if (typeof api.sendTyping === "function") {
      console.log("[BANAT-TYPING] Requesting fallback typing indicator for thread " + key);
      api.sendTyping(key, true);
      state.end = null;
      return true;
    }
    console.warn("[BANAT-TYPING] No supported typing-indicator API for thread " + key);
  } catch (error) {
    console.warn("[BANAT-TYPING] Request threw for thread " + key + ":", error?.message || error);
  }
  return false;
}

function startTyping(api, threadID) {
  if (!ENABLED || !api || !threadID) return false;
  const key = String(threadID);
  try {
    const states = getThreadStates(api);
    const existing = states.get(key);
    if (existing && !existing.stopped) return true;

    const state = { end: null, timer: null, stopped: false };
    states.set(key, state);
    if (!requestTyping(api, key, state)) {
      states.delete(key);
      return false;
    }

    const refresh = () => {
      if (state.stopped || states.get(key) !== state) return;
      try {
        if (typeof state.end === "function") state.end();
      } catch (error) {
        console.warn("[BANAT-TYPING] Refresh stop failed for thread " + key + ":", error?.message || error);
      }
      state.end = null;
      requestTyping(api, key, state);
      state.timer = setTimeout(refresh, REFRESH_MS);
      if (state.timer && typeof state.timer.unref === "function") state.timer.unref();
    };
    state.timer = setTimeout(refresh, REFRESH_MS);
    if (state.timer && typeof state.timer.unref === "function") state.timer.unref();
    return true;
  } catch (error) {
    console.warn("[BANAT-TYPING] Start failed for thread " + key + ":", error?.message || error);
    return false;
  }
}

function stopTyping(api, threadID) {
  if (!api || !threadID) return false;
  const key = String(threadID);
  try {
    const states = activeStates.get(api);
    const state = states?.get(key);
    if (state) {
      state.stopped = true;
      if (state.timer) clearTimeout(state.timer);
      states.delete(key);
      if (typeof state.end === "function") {
        state.end();
      } else if (typeof api.sendTyping === "function" && typeof api.sendTypingIndicator !== "function") {
        api.sendTyping(key, false);
      }
      state.end = null;
      console.log("[BANAT-TYPING] Indicator stopped for thread " + key);
      return true;
    }
    if (typeof api.sendTyping === "function" && typeof api.sendTypingIndicator !== "function") {
      api.sendTyping(key, false);
      return true;
    }
    return false;
  } catch (error) {
    console.warn("[BANAT-TYPING] Stop failed for thread " + key + ":", error?.message || error);
    return false;
  }
}

async function typeBeforeSend(api, threadID, message, opts = {}, send) {
  if (typeof send !== "function") return false;
  const duration = Math.max(0, Number(opts.ms) || 0);
  if (!opts.skip && duration > 0) startTyping(api, threadID);
  try {
    if (!opts.skip && duration > 0) {
      await new Promise((resolve) => setTimeout(resolve, duration));
    }
    return await send();
  } finally {
    stopTyping(api, threadID);
  }
}

module.exports = { typeBeforeSend, startTyping, stopTyping };
