"use strict";

/**
 * Coordinates the visible Messenger typing indicator with the duration
 * calculated by human-delay.js. The actual message send happens only after
 * that same duration; indicator API failures never block the send.
 */

const ENABLED = !/^(false|0|no|off)$/i.test(
  String(process.env.TYPING_ENABLED || "true")
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reportTypingError(action, error) {
  if (error) {
    console.warn("[HUMAN-TYPING] " + action + " failed:", error?.message || error);
  }
}

function stopTyping(api, threadID) {
  if (!api || !threadID || !ENABLED) return false;
  try {
    // ws3-fca uses (threadID, isTyping, callback); false explicitly clears
    // the indicator. Prefer the same API used to start it.
    if (typeof api.sendTypingIndicator === "function") {
      api.sendTypingIndicator(String(threadID), false, (error) => {
        reportTypingError("Stop", error);
      });
      return true;
    }
    if (typeof api.sendTyping === "function") {
      api.sendTyping(String(threadID), false);
      return true;
    }
  } catch (error) {
    reportTypingError("Stop", error);
  }
  return false;
}

function startTyping(api, threadID) {
  if (!api || !threadID || !ENABLED) return () => {};
  try {
    // ws3-fca signature: sendTypingIndicator(threadID, isTyping, callback).
    if (typeof api.sendTypingIndicator === "function") {
      api.sendTypingIndicator(String(threadID), true, (error) => {
        reportTypingError("Start", error);
      });
      return () => stopTyping(api, threadID);
    }
    if (typeof api.sendTyping === "function") {
      api.sendTyping(String(threadID), true);
      return () => stopTyping(api, threadID);
    }
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
