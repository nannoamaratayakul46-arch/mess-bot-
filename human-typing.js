"use strict";

/**
 * ECLIPSE Human Typing
 * --------------------
 * Owns only the Messenger typing-indicator lifecycle. It deliberately has
 * no text-generation or delay-calculation logic.
 */

function reportTypingError(action, error) {
  if (error) {
    console.warn("[HUMAN-TYPING] " + action + " failed:", error?.message || error);
  }
}

function startTyping(api, threadID) {
  if (!api || !threadID) return false;
  try {
    if (typeof api.sendTypingIndicator === "function") {
      // ws3-fca signature: (threadID, isTyping, callback).
      api.sendTypingIndicator(String(threadID), true, (error) => {
        reportTypingError("Start", error);
      });
      return true;
    }
    if (typeof api.sendTyping === "function") {
      api.sendTyping(String(threadID), true);
      return true;
    }
  } catch (error) {
    reportTypingError("Start", error);
  }
  return false;
}

function stopTyping(api, threadID) {
  if (!api || !threadID) return false;
  try {
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

function withTyping(api, threadID, durationMs, send) {
  const duration = Math.max(0, Number(durationMs) || 0);
  startTyping(api, threadID);

  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        const result = await send();
        stopTyping(api, threadID);
        resolve(result);
      } catch (error) {
        stopTyping(api, threadID);
        reject(error);
      }
    }, duration);
  });
}

module.exports = {
  startTyping,
  stopTyping,
  withTyping,
};
