"use strict";

/**
 * Invoke ws3-fca 2.0.1 sendMessage using its callback API:
 * sendMessage(message, threadID, callback, replyToMessage, isGroup).
 *
 * When isGroup is explicitly supplied, preserve the positional placeholder
 * for replyToMessage so the routing override reaches the fifth argument.
 */
function invokeMessengerSend(api, job, callback) {
  if (!api || typeof api.sendMessage !== "function") {
    throw new TypeError("Messenger sendMessage is unavailable.");
  }
  const args = [job.message, job.threadID, callback];
  if (job.replyToMessageID) {
    args.push(job.replyToMessageID);
  } else if (typeof job.isGroup === "boolean") {
    args.push(null);
  }
  if (typeof job.isGroup === "boolean") args.push(job.isGroup);
  return api.sendMessage(...args);
}

module.exports = { invokeMessengerSend };
