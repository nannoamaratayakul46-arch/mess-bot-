"use strict";

const cache = new Map();
const TTL_MS = 30 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 4000;

function cleanName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 120);
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
  if (Array.isArray(users)) {
    return users.find(user => String(user?.id || user?.userID || user?.uid || "") === String(userID)) || null;
  }
  return users?.[String(userID)] || null;
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
      const member = getUserRow(info?.userInfo || info?.participants, user);
      const byThread = save(member?.firstName || member?.name || member?.fullName, "threadInfo");
      if (byThread) return byThread;
    } catch (error) {
      console.warn("[BANAT] Thread name lookup failed:", error?.message || error);
    }
  }

  if (api && typeof api.getUserInfo === "function") {
    try {
      const users = await callApi(api, "getUserInfo", [[user]]);
      const member = getUserRow(users, user);
      const byUser = save(member?.firstName || member?.name || member?.fullName, "userInfo");
      if (byUser) return byUser;
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
    .replace(/\{\{\s*target\s*\}\}/gi, () => who)
    .replace(new RegExp("\\b" + escapeRe("Jaiden") + "\\b", "gi"), () => who);
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
