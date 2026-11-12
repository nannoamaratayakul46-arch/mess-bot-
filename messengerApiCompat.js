"use strict";

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_SEND_TIMEOUT_MS = 70000;

function createCall(api, method, buildArgs, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (!api || typeof api[method] !== "function") {
      reject(new Error("Messenger API method unavailable: " + method));
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      finish(new Error("Messenger API timed out: " + method));
    }, timeoutMs);
    timer.unref?.();

    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value ?? null);
    }

    try {
      const isTrafficProxy = api.__eclipseTrafficProxy === true;
      const args = buildArgs(finish, isTrafficProxy);
      const result = api[method](...args);
      if (result && typeof result.then === "function") {
        result.then(value => finish(null, value), error => finish(error));
      } else if (!isTrafficProxy && result !== undefined) {
        finish(null, result);
      }
    } catch (error) {
      finish(error);
    }
  });
}

/**
 * Send through the bot's Traffic Governor when present. The proxy preserves
 * its callback contract; a raw ws3-fca 3.5.2 API receives the Promise signature:
 * sendMessage(message, threadID, replyToMessageID, isSingleUser).
 */
function sendGroupMessage(api, message, threadID, options = {}) {
  const replyToMessageID = options.replyToMessageID || undefined;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_SEND_TIMEOUT_MS;
  return createCall(api, "sendMessage", (finish, isTrafficProxy) => (
    isTrafficProxy
      ? [message, String(threadID), finish, replyToMessageID, true]
      : [message, String(threadID), replyToMessageID, false]
  ), timeoutMs);
}

function editMessage(api, message, messageID, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  return createCall(api, "editMessage", (finish, isTrafficProxy) => (
    isTrafficProxy
      ? [message, String(messageID), finish]
      : [message, String(messageID)]
  ), timeoutMs);
}

function setMessageReaction(api, reaction, messageID, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  return createCall(api, "setMessageReaction", (finish, isTrafficProxy) => (
    isTrafficProxy
      ? [reaction, String(messageID), finish]
      : [reaction, String(messageID)]
  ), timeoutMs);
}

function setMessageReactionMqtt(api, reaction, messageID, threadID, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  return createCall(api, "setMessageReactionMqtt", (finish, isTrafficProxy) => (
    isTrafficProxy
      ? [reaction, String(messageID), String(threadID), finish]
      : [reaction, String(messageID), String(threadID)]
  ), timeoutMs);
}

module.exports = {
  sendGroupMessage,
  editMessage,
  setMessageReaction,
  setMessageReactionMqtt,
};
