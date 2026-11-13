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


function rawApi(api) {
  return api && api.__eclipseTrafficRawApi ? api.__eclipseTrafficRawApi : api;
}

function hasMethod(api, names) {
  const raw = rawApi(api);
  return names.some(name => typeof raw?.[name] === "function");
}

function canSetGroupTitle(api) {
  return hasMethod(api, ["setTitle", "gcname"]);
}

function canChangeNickname(api) {
  return hasMethod(api, ["changeNickname", "nickname"]);
}

function canChangeGroupImage(api) {
  const raw = rawApi(api);
  return typeof raw?.changeGroupImage === "function" ||
    Boolean(raw?.ctx && raw?.defaultFuncs &&
      typeof raw.defaultFuncs.postFormData === "function" &&
      typeof raw.defaultFuncs.post === "function");
}

async function invokeCompatMethod(api, names, args, label) {
  const raw = rawApi(api);
  const name = names.find(candidate => typeof raw?.[candidate] === "function");
  if (!name) throw new Error("Messenger API method unavailable: " + label);
  return await raw[name](...args);
}

function setGroupTitle(api, title, threadID) {
  return invokeCompatMethod(api, ["setTitle", "gcname"], [String(title), String(threadID)], "setTitle/gcname");
}

function changeNickname(api, nickname, threadID, participantID) {
  return invokeCompatMethod(
    api,
    ["changeNickname", "nickname"],
    [String(nickname), String(threadID), String(participantID)],
    "changeNickname/nickname"
  );
}

function parseMessengerResponse(response, label) {
  const status = Number(response?.statusCode ?? response?.status ?? 200);
  if (status < 200 || status >= 300) {
    throw new Error(label + " failed with HTTP " + status);
  }
  let body = response?.body ?? response?.data ?? response;
  if (typeof body === "string") {
    const cleaned = body
      .replace(/^\\s*(?:for\\s*\\(\\s*;\\s*;\\s*\\)\\s*;|while\\s*\\(\\s*1\\s*\\)\\s*;)/, "")
      .trim();
    try {
      body = JSON.parse(cleaned);
    } catch (error) {
      throw new Error(label + " returned an unreadable Messenger response.");
    }
  }
  if (!body || typeof body !== "object") {
    throw new Error(label + " returned an empty Messenger response.");
  }
  if (body.error) {
    const detail = body.errorSummary || body.errorDescription?.__html || body.errorDescription || body.error;
    throw new Error(label + " rejected by Messenger: " + String(detail).replace(/<[^>]*>/g, " ").replace(/\\s+/g, " ").slice(0, 180));
  }
  return body;
}

/**
 * ws3-fca 3.5.2 removed the legacy changeGroupImage export. Preserve the
 * supported upload + set_thread_image flow using the authenticated request
 * functions already exposed on the API context.
 */
async function changeGroupImage(api, image, threadID) {
  const raw = rawApi(api);
  const ctx = raw?.ctx;
  const defaults = raw?.defaultFuncs;
  if (!ctx?.jar || !ctx?.userID || typeof defaults?.postFormData !== "function" || typeof defaults?.post !== "function") {
    throw new Error("This ws3-fca session does not expose the authenticated group-photo upload transport.");
  }
  if (!image || typeof image.pipe !== "function") {
    throw new TypeError("Group photo must be supplied as a readable stream.");
  }

  const uploadResponse = await defaults.postFormData(
    "https://upload.facebook.com/ajax/mercury/upload.php",
    ctx.jar,
    { images_only: "true", "attachment[]": image },
    {},
    ctx
  );
  const upload = parseMessengerResponse(uploadResponse, "Group photo upload");
  const metadata = upload?.payload?.metadata?.[0];
  const imageId = String(metadata?.image_id || "").trim();
  if (!imageId) throw new Error("Messenger photo upload did not return an image ID.");

  const updateResponse = await defaults.post(
    "https://www.facebook.com/messaging/set_thread_image/",
    ctx.jar,
    { thread_image_id: imageId, thread_id: String(threadID) },
    ctx
  );
  parseMessengerResponse(updateResponse, "Group photo update");
  return { ok: true, threadID: String(threadID), imageID: imageId };
}

module.exports = {
  sendGroupMessage,
  editMessage,
  setMessageReaction,
  setMessageReactionMqtt,
  rawApi,
  canSetGroupTitle,
  canChangeNickname,
  canChangeGroupImage,
  setGroupTitle,
  changeNickname,
  changeGroupImage,
};
