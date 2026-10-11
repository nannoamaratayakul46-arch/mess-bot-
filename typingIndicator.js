"use strict";

const ENABLED = !/^(false|0|no|off)$/i.test(String(process.env.TYPING_ENABLED || "true"));

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function callTyping(api, threadID, active) {
  if (!api || !threadID || !ENABLED) return false;
  const key = String(threadID);
  try {
    if (typeof api.sendTypingIndicator === "function") {
      api.sendTypingIndicator(key, active, (error) => {
        if (error) console.warn("[HUMAN-TYPING] " + (active ? "Start" : "Stop") + " failed:", error?.message || error);
      });
      return true;
    }
    if (typeof api.sendTyping === "function") {
      api.sendTyping(key, active);
      return true;
    }
    console.warn("[HUMAN-TYPING] No supported typing-indicator API is available.");
  } catch (error) {
    console.warn("[HUMAN-TYPING] " + (active ? "Start" : "Stop") + " failed:", error?.message || error);
  }
  return false;
}

function startTyping(api, threadID) { return callTyping(api, threadID, true); }
function stopTyping(api, threadID) { return callTyping(api, threadID, false); }

/**
 * Uses typingMs from the human-mimic calculation, so longer/more complex
 * replies keep the typing indicator active longer before the message is sent.
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
