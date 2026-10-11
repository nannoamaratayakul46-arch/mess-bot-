"use strict";

const ENABLED = !/^(false|0|no|off)$/i.test(String(process.env.TYPING_ENABLED || "true"));
const activeEnds = new WeakMap();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getThreadEnds(api) {
  let ends = activeEnds.get(api);
  if (!ends) {
    ends = new Map();
    activeEnds.set(api, ends);
  }
  return ends;
}

function startTyping(api, threadID) {
  if (!ENABLED || !api || !threadID) return false;
  const key = String(threadID);

  try {
    if (typeof api.sendTypingIndicator === "function") {
      const ends = getThreadEnds(api);
      // Avoid repeatedly starting the same indicator for a thread.
      if (ends.has(key)) return true;

      // ws3-fca 2.x takes (threadID, callback) and returns an end function.
      const end = api.sendTypingIndicator(key, (error) => {
        if (error) {
          console.warn("[HUMAN-TYPING] Start failed:", error?.message || error);
        }
      });
      if (typeof end === "function") ends.set(key, end);
      return true;
    }

    if (typeof api.sendTyping === "function") {
      api.sendTyping(key, true);
      return true;
    }

    console.warn("[HUMAN-TYPING] No supported typing-indicator API is available.");
  } catch (error) {
    console.warn("[HUMAN-TYPING] Start failed:", error?.message || error);
  }
  return false;
}

function stopTyping(api, threadID) {
  if (!api || !threadID) return false;
  const key = String(threadID);

  try {
    if (typeof api.sendTypingIndicator === "function") {
      const ends = activeEnds.get(api);
      const end = ends?.get(key);
      if (typeof end === "function") {
        ends.delete(key);
        end();
        return true;
      }
      // The library auto-expires an indicator if no end function was returned.
      return true;
    }

    if (typeof api.sendTyping === "function") {
      api.sendTyping(key, false);
      return true;
    }
  } catch (error) {
    console.warn("[HUMAN-TYPING] Stop failed:", error?.message || error);
  }
  return false;
}

/**
 * Uses the human-mimic duration passed in opts.ms. ws3-fca's indicator is
 * ended via the function returned from sendTypingIndicator(threadID, callback).
 */
async function typeBeforeSend(api, threadID, message, opts = {}, send) {
  if (typeof send !== "function") return false;
  if (opts.skip) return send();

  const duration = Math.max(0, Number(opts.ms) || 0);
  if (!duration) return send();

  if (ENABLED) startTyping(api, threadID);
  try {
    let remaining = duration;
    while (remaining > 0) {
      // ws3-fca's indicator expires after ~30 seconds; refresh before then.
      const slice = Math.min(25000, remaining);
      await sleep(slice);
      remaining -= slice;
      if (ENABLED && remaining > 0) {
        stopTyping(api, threadID);
        startTyping(api, threadID);
      }
    }
    return await send();
  } finally {
    if (ENABLED) stopTyping(api, threadID);
  }
}

module.exports = { typeBeforeSend, startTyping, stopTyping };
