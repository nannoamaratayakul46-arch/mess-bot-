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

function startTyping(api, threadID) {
  if (!api || !threadID || !ENABLED) return false;
  try {
    if (typeof api.sendTypingIndicator === "function") {
      api.sendTypingIndicator(String(threadID), (error) => {
        if (error) {
          console.warn("[HUMAN-TYPING] Start failed:", error?.message || error);
        }
      });
      return true;
    }
    if (typeof api.sendTyping === "function") {
      api.sendTyping(String(threadID), true);
      return true;
    }
  } catch (error) {
    console.warn("[HUMAN-TYPING] Start failed:", error?.message || error);
  }
  return false;
}

function stopTyping(api, threadID) {
  if (!api || !threadID || !ENABLED) return false;
  try {
    if (typeof api.sendTyping === "function") {
      api.sendTyping(String(threadID), false);
      return true;
    }
  } catch (error) {
    console.warn("[HUMAN-TYPING] Stop failed:", error?.message || error);
  }
  return false;
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

  if (ENABLED) startTyping(api, threadID);
  try {
    let remaining = duration;
    while (remaining > 0) {
      const slice = Math.min(4000, remaining);
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
