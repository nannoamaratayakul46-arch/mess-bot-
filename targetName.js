"use strict";

const cache = new Map();
const TTL_MS = 30 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 4000;

function cleanName(value) {
  const name = String(value || "").replace(/\s+/g, " ").trim().slice(0, 120);
  // A numeric Messenger ID or a generated placeholder is not a display name.
  if (!name || /^\d{6,32}$/.test(name) || /^Messenger user \d+$/i.test(name)) return "";
  return name;
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("lookup timeout")), ms);
      if (typeof timer.unref === "function") timer.unref();
    }),
  ]).finally(() => clearTimeout(timer));
}

function callApi(api, method, args, timeout = LOOKUP_TIMEOUT_MS) {
  return withTimeout(new Promise((resolve, reject) => {
    const fn = api && api[method];
    if (typeof fn !== "function") return resolve(null);
    let settled = false;
    const done = (error, value) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(value ?? null);
    };
    try {
      const result = fn.call(api, ...args, done);
      if (result && typeof result.then === "function") {
        result.then(value => done(null, value)).catch(done);
      } else if (result !== undefined && fn.length <= args.length) {
        done(null, result);
      }
    } catch (error) {
      done(error);
    }
  }), timeout);
}

function getUserRow(users, userID) {
  const wanted = String(userID);
  if (Array.isArray(users)) {
    return users.find(user => String(user?.id || user?.userID || user?.userId || user?.uid || "") === wanted) || null;
  }
  if (!users || typeof users !== "object") return null;
  const direct = users[wanted];
  if (direct && typeof direct === "object") return direct;
  for (const [key, value] of Object.entries(users)) {
    if (!value || typeof value !== "object") continue;
    const id = String(value.id || value.userID || value.userId || value.uid || key);
    if (id === wanted) return value;
  }
  return null;
}
function memberDisplayName(member) {
  if (!member || typeof member !== "object") return "";
  const first = member.firstName || member.first_name || "";
  const last = member.lastName || member.last_name || "";
  for (const value of [
    first, member.name, member.displayName, member.display_name,
    member.fullName, member.full_name, member.profileName, member.profile_name,
    [first, last].filter(Boolean).join(" "),
  ]) {
    const name = cleanName(value);
    if (name) return name;
  }
  return "";
}

async function resolveTargetName(api, threadID, userID, opts = {}) {
  const thread = String(threadID || "").trim();
  const user = String(userID || "").trim();
  const key = thread + ":" + user;
  const save = (value, source) => {
    const name = cleanName(value);
    if (!name) return null;
    cache.set(key, { name, at: Date.now() });
    return { name, source };
  };

  const saved = save(opts.savedName, "dashboard");
  if (saved) return saved;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return { name: hit.name, source: "cache" };
  if (hit) cache.delete(key);

  if (api && typeof api.getThreadInfo === "function") {
    try {
      const info = await callApi(api, "getThreadInfo", [thread]);
      const byNickname = save(info?.nicknames?.[user], "nickname");
      if (byNickname) return byNickname;
      for (const source of [info?.userInfo, info?.participants, info?.participantList, info?.participant_list]) {
        const member = getUserRow(source, user);
        const byThread = save(memberDisplayName(member), "threadInfo");
        if (byThread) return byThread;
      }
    } catch (error) {
      console.warn("[BANAT] Thread name lookup failed:", error?.message || error);
    }
  }

  if (api && typeof api.getUserInfo === "function") {
    try {
      const users = await callApi(api, "getUserInfo", [[user]]);
      const member = getUserRow(users, user);
      const byUser = save(memberDisplayName(member), "userInfo");
      if (byUser) return byUser;
      // Some API-compatible wrappers return the single record directly rather
      // than an ID-keyed map.
      const directName = save(memberDisplayName(users), "userInfo");
      if (directName) return directName;
    } catch (error) {
      console.warn("[BANAT] User name lookup failed:", error?.message || error);
    }
  }

  const seen = save(opts.seenName, "seen");
  return seen || { name: null, source: "none" };
}

const escapeRe = value => String(value).replace(/[.*+?^$\\{}()|[\]\\]/g, "\\$&");

function renderTargetReply(template, name) {
  const who = cleanName(name) || "you";
  return String(template || "")
    .replace(new RegExp("\\b" + escapeRe("Jaiden") + "\\b", "gi"), () => who)
    .replace(/\{\{\s*target\s*\}\}/gi, () => who);
}

function clearTargetNameCache(threadID, userID) {
  if (threadID == null) {
    cache.clear();
    return;
  }
  const prefix = String(threadID) + ":";
  if (userID != null) cache.delete(prefix + String(userID));
  else for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}

module.exports = { resolveTargetName, renderTargetReply, clearTargetNameCache };
