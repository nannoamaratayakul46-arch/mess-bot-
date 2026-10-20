"use strict";

// One shared gate for every getThreadList caller. Messenger rate limits are
// session-wide, so separate caches in the dashboard, profile guard, and member
// resolver would otherwise still issue overlapping requests.
const sessions = new WeakMap();
const DEFAULT_CACHE_MS = 60_000;
const DEFAULT_COOLDOWN_MS = 30_000;
const RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;

function isRateLimit(error) {
  let text = "";
  try { text = JSON.stringify(error); } catch {}
  text += " " + String(error?.message || error || "");
  return /1675004|rate[\s_-]*limit|too many requests/i.test(text);
}

function getThreadList(api, options = {}) {
  if (!api || (typeof api !== "object" && typeof api !== "function") ||
      typeof api.getThreadList !== "function") {
    return Promise.resolve([]);
  }

  let state = sessions.get(api);
  if (!state) {
    state = { value: null, expiresAt: 0, blockedUntil: 0, promise: null, lastErrorLogAt: 0 };
    sessions.set(api, state);
  }

  const now = Date.now();
  if (Array.isArray(state.value) && now < state.expiresAt) {
    return Promise.resolve(state.value);
  }
  if (state.promise) return state.promise;
  if (now < state.blockedUntil) return Promise.resolve(state.value || []);

  const timeoutMs = Math.max(1000, Math.min(15000, Number(options.timeoutMs) || 8000));
  const cacheMs = Math.max(5000, Math.min(5 * 60_000, Number(options.cacheMs) || DEFAULT_CACHE_MS));
  state.promise = new Promise(resolve => {
    let settled = false;
    let timer;
    const finish = (...args) => {
      let [error, payload] = args;
      // Accept both Node-style (error, value) callbacks and wrappers that
      // return the thread array as their sole callback argument.
      if (args.length === 1 && Array.isArray(error)) {
        payload = error;
        error = null;
      }
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (error) {
        const rateLimited = isRateLimit(error);
        state.blockedUntil = Date.now() + (rateLimited ? RATE_LIMIT_COOLDOWN_MS : DEFAULT_COOLDOWN_MS);
        if (Date.now() - state.lastErrorLogAt > 30_000) {
          state.lastErrorLogAt = Date.now();
          console.warn("[THREAD-LIST-GATE] getThreadList failed; cooling down for " +
            Math.round((rateLimited ? RATE_LIMIT_COOLDOWN_MS : DEFAULT_COOLDOWN_MS) / 1000) +
            "s. " + String(error?.message || error).replace(/[\r\n]+/g, " ").slice(0, 160));
        }
        resolve(state.value || []);
        return;
      }

      const threads = Array.isArray(payload) ? payload : [];
      if (threads.length) {
        state.value = threads;
        state.expiresAt = Date.now() + cacheMs;
        state.blockedUntil = 0;
        resolve(threads);
      } else {
        state.blockedUntil = Date.now() + DEFAULT_COOLDOWN_MS;
        resolve(state.value || []);
      }
    };

    timer = setTimeout(() => finish(new Error("getThreadList timed out")), timeoutMs);
    timer.unref?.();

    try {
      const result = api.getThreadList(1000, null, [], finish);
      if (result && typeof result.then === "function") {
        result.then(value => { if (value != null) finish(null, value); }, error => finish(error));
      } else if (Array.isArray(result)) {
        finish(null, result);
      }
    } catch (error) {
      finish(error);
    }
  }).finally(() => { state.promise = null; });

  return state.promise;
}

module.exports = { getThreadList };
