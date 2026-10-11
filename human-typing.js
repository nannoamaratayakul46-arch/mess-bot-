"use strict";

/**
 * Shared typing-indicator lifecycle for generic and Banat replies.
 * The API-specific start/end handling lives in typingIndicator.js so all
 * reply paths use the same ws3-fca-compatible implementation.
 */

const {
  startTyping,
  stopTyping,
} = require("./typingIndicator");

function withTyping(api, threadID, durationMs, send) {
  const duration = Math.max(0, Number(durationMs) || 0);
  const stop = startTyping(api, threadID);

  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        resolve(await send());
      } catch (error) {
        reject(error);
      } finally {
        stop();
        // Keep compatibility for callers that independently use stopTyping.
        stopTyping(api, threadID);
      }
    }, duration);
  });
}

module.exports = {
  startTyping,
  stopTyping,
  withTyping,
};
