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
  const raw = rawApi(api);
  const method = api?.__eclipseTrafficProxy === true ? api.setMessageReactionMqtt : raw?.setMessageReactionMqtt;
  if (typeof method !== "function") {
    return Promise.reject(new Error("Messenger API method unavailable: setMessageReactionMqtt"));
  }

  // ws3-fca 3.5.2 MQTT reaction publishing is synchronous and returns undefined.
  // For the Traffic Governor proxy, preserve its callback-based queue contract.
  if (api?.__eclipseTrafficProxy === true) {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
    return createCall(api, "setMessageReactionMqtt", finish =>
      [reaction, String(messageID), String(threadID), finish], timeoutMs);
  }

  try {
    method.call(raw, reaction, String(messageID), String(threadID));
    return Promise.resolve({ published: true, acknowledged: false, transport: "mqtt" });
  } catch (error) {
    return Promise.reject(error);
  }
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

async function waitForMqttClient(api, timeoutMs = 15000) {
  const raw = rawApi(api);
  const ctx = raw?.ctx;
  if (!ctx) return;
  const client = ctx.mqttClient;
  if (!client) {
    throw new Error("Messenger MQTT listener is not active. Wait for the bot to reconnect before changing nicknames or GC names.");
  }
  if (client.connected) return;
  if (typeof client.once !== "function") {
    throw new Error("Messenger MQTT connection is not ready for nickname or GC-name changes.");
  }
  await new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      client.removeListener?.("connect", onConnect);
      client.removeListener?.("error", onError);
      client.removeListener?.("close", onClose);
    };
    const finish = error => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onConnect = () => finish();
    const onError = error => finish(error || new Error("Messenger MQTT connection failed."));
    const onClose = () => finish(new Error("Messenger MQTT connection closed before the change could be sent."));
    const timer = setTimeout(() => finish(new Error("Timed out waiting for Messenger MQTT to reconnect.")), timeoutMs);
    timer.unref?.();
    client.once("connect", onConnect);
    client.once("error", onError);
    client.once("close", onClose);
  });
}

async function invokeCompatMethod(api, names, args, label) {
  const raw = rawApi(api);
  const name = names.find(candidate => typeof raw?.[candidate] === "function");
  if (!name) throw new Error("Messenger API method unavailable: " + label);
  return await raw[name](...args);
}

async function setGroupTitle(api, title, threadID) {
  await waitForMqttClient(api);
  return invokeCompatMethod(api, ["setTitle", "gcname"], [String(title), String(threadID)], "setTitle/gcname");
}

async function changeNickname(api, nickname, threadID, participantID) {
  await waitForMqttClient(api);
  return invokeCompatMethod(
    api,
    ["changeNickname", "nickname"],
    [String(nickname), String(threadID), String(participantID)],
    "changeNickname/nickname"
  );
}

async function changeGroupMember(api, action, userIDs, threadID, options = {}) {
  const raw = rawApi(api);
  if (typeof raw?.gcmember !== "function") {
    throw new Error("This ws3-fca build does not expose the gcmember group-membership API.");
  }
  const normalizedAction = String(action || "").toLowerCase();
  if (!["add", "remove"].includes(normalizedAction)) {
    throw new TypeError("Group membership action must be add or remove.");
  }
  const ids = Array.isArray(userIDs) ? userIDs.map(String) : String(userIDs || "");
  if ((Array.isArray(ids) && !ids.length) || (!Array.isArray(ids) && !ids)) {
    throw new TypeError("At least one group member ID is required.");
  }
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  let timeout;
  try {
    const result = await Promise.race([
      Promise.resolve(raw.gcmember(normalizedAction, ids, String(threadID))),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Messenger group membership request timed out.")), timeoutMs);
        // Keep the deadline referenced so callers and tests always settle.
      }),
    ]);
    if (result?.type === "error_gc" || result?.error) {
      throw new Error(String(result.error || "Messenger rejected the group membership change."));
    }
    return result;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function invokeCallbackOrPromise(api, method, args, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish(new Error("Messenger API timed out: " + method)), timeoutMs);
    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value ?? null);
    }
    try {
      const result = api[method](...args, (error, value) => finish(error, value));
      if (result && typeof result.then === "function") result.then(value => finish(null, value), error => finish(error));
      else if (result !== undefined) finish(null, result);
    } catch (error) { finish(error); }
  });
}

function isGroupAdmin(threadInfo, userID) {
  const admins = Array.isArray(threadInfo?.adminIDs) ? threadInfo.adminIDs : [];
  return admins.some(admin => {
    const id = admin && typeof admin === "object" ? admin.id ?? admin.userID ?? admin.userId : admin;
    return String(id ?? "") === String(userID);
  });
}

async function changeGroupAdminStatus(api, action, userID, threadID, options = {}) {
  const raw = rawApi(api);
  if (typeof raw?.gcrule !== "function") throw new Error("This ws3-fca build does not expose the gcrule group-admin API.");
  if (typeof raw?.getThreadInfo !== "function") throw new Error("Cannot verify group-admin changes: getThreadInfo is unavailable.");
  const normalized = String(action || "").toLowerCase();
  const rule = normalized === "promote" || normalized === "admin" ? "admin" :
    normalized === "demote" || normalized === "unadmin" ? "unadmin" : null;
  if (!rule) throw new TypeError("Group-admin action must be promote/admin or demote/unadmin.");
  const targetID = String(userID || "").trim();
  const groupID = String(threadID || "").trim();
  if (!targetID || !groupID) throw new TypeError("Group-admin changes require user and thread IDs.");

  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 12000;
  const attempts = Number.isInteger(options.attempts) ? Math.max(1, options.attempts) : 5;
  const intervalMs = Number.isFinite(options.intervalMs) ? Math.max(0, options.intervalMs) : 600;
  let timer;
  let request;
  try {
    request = await Promise.race([
      Promise.resolve(raw.gcrule(rule, targetID, groupID)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Messenger group-admin request timed out.")), timeoutMs); })
    ]);
  } finally { if (timer) clearTimeout(timer); }
  if (request?.type === "error_gc_rule" || request?.error) {
    throw new Error(String(request.error || "Messenger rejected the group-admin change."));
  }

  const expected = rule === "admin";
  for (let attempt = 0; attempt < attempts; attempt++) {
    const info = await invokeCallbackOrPromise(raw, "getThreadInfo", [groupID], timeoutMs);
    if (isGroupAdmin(info, targetID) === expected) {
      return { action: rule, userID: targetID, threadID: groupID, verified: true, request };
    }
    if (attempt + 1 < attempts && intervalMs > 0) await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error("Messenger did not confirm " + (expected ? "admin promotion" : "admin demotion") +
    " for " + targetID + " in " + groupID + " after " + attempts + " checks.");
}

function parseMessengerResponse(response, label) {
  const status = Number(response?.statusCode ?? response?.status ?? 200);
  if (status < 200 || status >= 300) {
    throw new Error(label + " failed with HTTP " + status);
  }
  let body = response?.body ?? response?.data ?? response;
  if (typeof body === "string") {
    const cleaned = body
      .replace(/^\s*(?:for\s*\(\s*;\s*;\s*\)\s*;|while\s*\(\s*1\s*\)\s*;)/, "")
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
    throw new Error(label + " rejected by Messenger: " + String(detail).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 180));
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
  if (typeof raw?.changeGroupImage === "function") {
    return await raw.changeGroupImage(image, String(threadID));
  }
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
  waitForMqttClient,
  setGroupTitle,
  changeNickname,
  changeGroupImage,
  changeGroupMember,
  changeGroupAdminStatus,
};
