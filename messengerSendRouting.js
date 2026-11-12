"use strict";

/**
 * Resolve explicit thread intent before sending. Known groups and explicit
 * caller intent win; unknown short numeric IDs retain the legacy private fallback.
 */
function resolveMessengerIsGroup(threadID, requestedIsGroup, knownGroupIds) {
  if (typeof requestedIsGroup === "boolean") return requestedIsGroup;
  const id = String(threadID == null ? "" : threadID).trim();
  if (id && knownGroupIds && typeof knownGroupIds.has === "function" && knownGroupIds.has(id)) {
    return true;
  }
  return null;
}

/**
 * ws3-fca 3.5.2 exposes Promise-based sendMessage and sendMessageMqtt.
 *
 * sendMessage(msg, threadID, replyToMessage, isSingleUser)
 * sendMessageMqtt(msg, threadID, replyToMessage, callback?)
 *
 * The Traffic Governor still uses an error-first callback contract. Bridge the
 * Promise result exactly once so its queue records the real rejection/result.
 */
function invokeMessengerSend(api, job, callback) {
  if (!api || typeof api.sendMessage !== "function") {
    throw new TypeError("Messenger sendMessage is unavailable.");
  }
  if (typeof callback !== "function") {
    throw new TypeError("Messenger send callback is required.");
  }

  let settled = false;
  const finish = (error, info) => {
    if (settled) return;
    settled = true;
    callback(error || null, info || null);
  };

  let result;
  try {
    if (job.isGroup === false && typeof api.sendMessageMqtt === "function") {
      // In 3.5.2 the third parameter is replyToMessage, not callback.
      result = api.sendMessageMqtt(
        job.message,
        job.threadID,
        job.replyToMessageID || undefined
      );
    } else {
      // Keep group sends on the standard sendMessage path. Preserve the
      // legacy <=15-digit private-thread fallback only when callers supplied
      // no explicit classification; known groups and explicit intent win.
      const threadKey = String(job.threadID == null ? "" : job.threadID);
      const legacyPrivateFallback =
        job.isGroup == null && /^\d{6,15}$/.test(threadKey);
      const isSingleUser = job.isGroup === false || legacyPrivateFallback;
      result = api.sendMessage(
        job.message,
        job.threadID,
        job.replyToMessageID || undefined,
        isSingleUser
      );
    }
  } catch (error) {
    finish(error);
    return undefined;
  }

  if (!result || typeof result.then !== "function") {
    const error = new TypeError("ws3-fca 3.5.2 send API did not return a Promise.");
    finish(error);
    return result;
  }

  return Promise.resolve(result).then(
    info => {
      finish(null, info);
      return info;
    },
    error => {
      finish(error);
      return undefined;
    }
  );
}

module.exports = { invokeMessengerSend, resolveMessengerIsGroup };
