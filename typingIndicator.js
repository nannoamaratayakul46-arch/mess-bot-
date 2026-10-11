"use strict";

/**
 * Coordinates Messenger's typing indicator with the reply delay.
 *
 * ws3-fca 2.0.1 uses sendTypingIndicator(threadID, callback) and returns an
 * end() function. It does NOT accept an isTyping boolean as its second
 * argument. Keep the returned end function so the indicator can be stopped
 * explicitly after the message is sent.
 */

const ENABLED = !/^(false|0|no|off)$/i.test(
  String(process.env.TYPING_ENABLED || "true")
);
const activeEnds = new WeakMap();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reportTypingError(action, error) {
  if (error) {
    console.warn("[HUMAN-TYPING] " + action + " failed:", error?.message || error);
  }
}

function getThreadEnds(api) {
  let ends = activeEnds.get(api);
  if (!ends) {
    ends = new Map();
    activeEnds.set(api, ends);
  }
  return ends;
}

function stopTyping(api, threadID) {
  if (!api || !threadID || !ENABLED) return false;

  const key = String(threadID);
  const ends = activeEnds.get(api);
  const end = ends?.get(key);

  if (typeof end === "function") {
    ends.delete(key);
    try {
      end((error) => reportTypingError("Stop", error));
      return true;
    } catch (error) {
      reportTypingError("Stop", error);
      return false;
    }
  }

  // Compatibility fallback for clients exposing a boolean-style sendTyping.
  if (typeof api.sendTyping === "function") {
    try {
      api.sendTyping(key, false);
      return true;
    } catch (error) {
      reportTypingError("Stop", error);
    }
  }
  return false;
}

function startTyping(api, threadID) {
  if (!api || !threadID || !ENABLED) return () => {};

  const key = String(threadID);
  try {
    if (typeof api.sendTypingIndicator === "function") {
      const end = api.sendTypingIndicator(key, (error) => {
        reportTypingError("Start", error);
      });

      if (typeof end === "function") {
        getThreadEnds(api).set(key, end);
        return () => stopTyping(api, key);
      }

      console.warn(
        "[HUMAN-TYPING] sendTypingIndicator did not return its stop function."
      );
      return () => stopTyping(api, key);
    }

    if (typeof api.sendTyping === "function") {
      api.sendTyping(key, true);
      return () => stopTyping(api, key);
    }

    console.warn("[HUMAN-TYPING] No supported typing-indicator API is available.");
  } catch (error) {
    reportTypingError("Start", error);
  }

  return () => {};
}

/**
 * opts.ms must be the typingMs value returned by prepareBanatReply().
 * opts.skip bypasses both the visible indicator and the typing wait for
 * explicitly rapid replies. TYPING_ENABLED=false hides the indicator while
 * preserving the human-calculated delay.
 */
async function typeBeforeSend(api, threadID, message, opts = {}, send) {
  if (typeof send !== "function") return false;
  if (opts.skip) return send();

  const duration = Math.max(0, Number(opts.ms) || 0);
  if (!duration) return send();

  let stop = ENABLED ? startTyping(api, threadID) : () => {};
  try {
    let remaining = duration;
    while (remaining > 0) {
      const slice = Math.min(4000, remaining);
      await sleep(slice);
      remaining -= slice;
      if (ENABLED && remaining > 0) {
        stop();
        stop = startTyping(api, threadID);
      }
    }
    return await send();
  } finally {
    stop();
  }
}

module.exports = { typeBeforeSend, startTyping, stopTyping };
