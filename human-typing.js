"use strict";

/**
 * Shared typing-indicator lifecycle for generic and Banat replies.
 * Durations should come from the human-mimic timing calculation.
 */
const { startTyping, stopTyping } = require("./typingIndicator");

function withTyping(api, threadID, durationMs, send) {
  const duration = Math.max(0, Number(durationMs) || 0);
  if (typeof send !== "function") return Promise.resolve(false);
  if (duration > 0) startTyping(api, threadID);

  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        resolve(await send());
      } catch (error) {
        reject(error);
      } finally {
        if (duration > 0) stopTyping(api, threadID);
      }
    }, duration);
  });
}

module.exports = { startTyping, stopTyping, withTyping };
