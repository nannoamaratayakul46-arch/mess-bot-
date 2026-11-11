"use strict";

/**
 * Resolve the ws3-fca thread type without relying only on its legacy ID-length
 * heuristic. Explicit caller intent wins; otherwise known dashboard groups
 * are sent as group threads. Unknown IDs retain ws3-fca's default behavior.
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
 * Invoke ws3-fca 2.0.1 sendMessage using its callback API:
 * sendMessage(message, threadID, callback, replyToMessage, isGroup).
 *
 * For explicit private messages (job.isGroup === false), prefer
 * api.sendMessageMqtt(msg, threadID, callback, replyToMessage) when exposed
 * by ws3-fca 2.0.1 so 1-on-1 PMs bypass the retired /messaging/send/ HTTP path.
 */
function invokeMessengerSend(api, job, callback) {
  if (!api || typeof api.sendMessage !== "function") {
    throw new TypeError("Messenger sendMessage is unavailable.");
  }

  // Targeted PM-only MQTT path (leaves group sends and unknown IDs completely untouched)
  if (job.isGroup === false && typeof api.sendMessageMqtt === "function") {
    const mqttArgs = [job.message, job.threadID, callback];
    if (job.replyToMessageID) {
      mqttArgs.push(job.replyToMessageID);
    }
    return api.sendMessageMqtt(...mqttArgs);
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

module.exports = { invokeMessengerSend, resolveMessengerIsGroup };
