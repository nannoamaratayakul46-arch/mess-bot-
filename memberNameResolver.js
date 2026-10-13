"use strict";

// Shared member-name resolver for dashboard member pickers and moderation logs.
// Numeric Facebook IDs are identity keys; names are display-only and are never
// passed to removeUserFromGroup.
const ID_RE = /^\d{6,20}$/;
const NAME_FIELDS = [
  "name", "fullName", "full_name", "displayName", "display_name",
  "profileName", "profile_name", "alternateName", "firstName", "first_name",
  "shortName", "short_name",
];
const BAD_NAME = /^(facebook user|messenger user|unknown|unnamed|user)$/i;
const CACHE_TTL = 24 * 60 * 60 * 1000;
const CACHE_MAX = 6000;
const LEARN_MAX = 10000;
const cache = new Map();
const learned = new Map();

function idOf(value) {
  const raw = value && typeof value === "object"
    ? (value.userID ?? value.userId ?? value.id ?? value.uid ?? value.user_id ??
       value.participantID ?? value.participantId ?? value.userFbId)
    : value;
  const id = String(raw ?? "").trim();
  return ID_RE.test(id) ? id : "";
}

function cleanName(value) {
  const name = String(value ?? "").replace(/^@/, "").replace(/\s+/g, " ").trim().slice(0, 100);
  if (!name || BAD_NAME.test(name) || ID_RE.test(name) || /^messenger user \d+$/i.test(name)) return "";
  return name;
}

function recordName(row) {
  if (!row || typeof row !== "object") return "";
  const first = row.firstName ?? row.first_name ?? "";
  const last = row.lastName ?? row.last_name ?? "";
  for (const field of NAME_FIELDS) {
    const name = cleanName(row[field]);
    if (name) return name;
  }
  return cleanName([first, last].filter(Boolean).join(" "));
}

function boundedSet(map, key, value, max) {
  map.delete(key);
  map.set(key, value);
  while (map.size > max) map.delete(map.keys().next().value);
}

function learn(threadID, userID, value, source) {
  const thread = String(threadID || "").trim();
  const id = idOf(userID);
  const name = cleanName(value);
  if (!thread || !id || !name) return;
  boundedSet(learned, thread + ":" + id, { name, source, at: Date.now() }, LEARN_MAX);
}

function noteEvent(event) {
  try {
    const threadID = String(event?.threadID || "").trim();
    if (!threadID) return;
    const senderID = idOf(event?.senderID);
    if (senderID) learn(threadID, senderID, event.senderName || event.name, "message");
    if (event.mentions && typeof event.mentions === "object") {
      for (const [id, name] of Object.entries(event.mentions)) learn(threadID, id, name, "mention");
    }
    if (event.type === "event") {
      const data = event.logMessageData || {};
      if (event.logMessageType === "log:subscribe" && Array.isArray(data.addedParticipants)) {
        for (const person of data.addedParticipants) {
          learn(threadID, person?.userFbId ?? person?.id, person?.fullName ?? person?.name, "join");
        }
      }
      if (event.logMessageType === "log:user-nickname" && data.participant_id) {
        learn(threadID, data.participant_id, data.nickname, "nickname-event");
      }
    }
  } catch (error) {
    // Name learning must never interrupt the message listener.
  }
}

function callApi(api, method, args, timeoutMs = 4500) {
  return new Promise((resolve, reject) => {
    const fn = api?.[method];
    if (typeof fn !== "function") return resolve(null);
    let settled = false;
    const finish = (error, data) => {
      if (settled) return;
      // Some FCA-compatible wrappers call callback(data); normal ws3-fca calls
      // callback(error, data). Distinguish a lone object payload from an Error.
      if (arguments.length === 1) { /* intentionally handled by callback below */ }
      settled = true;
      clearTimeout(timer);
      if (error instanceof Error || (error && arguments.length > 1)) reject(error);
      else resolve(error ?? data ?? null);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, timeoutMs);
    const callback = (...values) => {
      if (values.length >= 2) {
        const [error, data] = values;
        if (error) finish(error, null);
        else finish(null, data);
      } else {
        const [value] = values;
        if (value instanceof Error) finish(value, null);
        else finish(null, value);
      }
    };
    try {
      const result = fn.call(api, ...args, callback);
      if (result && typeof result.then === "function") {
        result.then(value => {
          if (value !== undefined && value !== null) callback(null, value);
        }, error => callback(error));
      } else if (result && typeof result === "object" && !Array.isArray(result)) {
        // Accept immediate payloads only when they look like data, not request handles.
        if (method === "getThreadInfo" && (result.participantIDs || result.userInfo || result.participants || result.threadID)) callback(null, result);
        if (method === "getUserInfo" && (recordName(result) || idOf(result) || Object.keys(result).some(key => ID_RE.test(key)))) callback(null, result);
      }
    } catch (error) {
      callback(error);
    }
  });
}

function indexUserRecords(data, requestedIDs) {
  const out = new Map();
  if (!data || typeof data !== "object") return out;
  const root = data.data && typeof data.data === "object" ? data.data : data;
  if (Array.isArray(root)) {
    for (const row of root) {
      const id = idOf(row);
      if (id) out.set(id, row);
    }
  } else {
    for (const [key, value] of Object.entries(root)) {
      if (ID_RE.test(key) && value && typeof value === "object") out.set(key, value);
      else {
        const id = idOf(value);
        if (id) out.set(id, value);
      }
    }
    if (requestedIDs.length === 1 && !out.has(requestedIDs[0]) && recordName(root)) out.set(requestedIDs[0], root);
  }
  return out;
}

function collectParticipants(info) {
  const ids = new Set();
  const names = new Map();
  const add = (value, key = "") => {
    const id = idOf(value) || idOf(key);
    if (!id) return;
    ids.add(id);
    if (value && typeof value === "object") {
      const name = recordName(value);
      if (name && !names.has(id)) names.set(id, { name, source: "threadInfo" });
    }
  };
  for (const source of [info?.participantIDs, info?.participants, info?.userInfo, info?.participantList, info?.participant_list]) {
    if (Array.isArray(source)) source.forEach(value => add(value));
    else if (source && typeof source === "object") {
      for (const [key, value] of Object.entries(source)) add(value, key);
    }
  }
  const nicknames = info?.nicknames && typeof info.nicknames === "object" ? info.nicknames : {};
  for (const [id, nickname] of Object.entries(nicknames)) {
    if (ID_RE.test(id)) {
      ids.add(id);
      if (!names.has(id) && cleanName(nickname)) names.set(id, { name: cleanName(nickname), source: "nickname" });
    }
  }
  return { ids, names };
}

async function resolveGroupMembers(api, threadID, options = {}) {
  const timeoutMs = Math.max(1000, Math.min(10000, Number(options.timeoutMs) || 4500));
  const info = await callApi(api, "getThreadInfo", [String(threadID)], timeoutMs);
  if (!info || typeof info !== "object") {
    return { members: [], diagnostics: { threadInfo: false, participantIds: 0, named: 0, unresolved: 0, error: "getThreadInfo returned no usable data" } };
  }
  const { ids, names } = collectParticipants(info);
  const currentID = String(api?.getCurrentUserID?.() || "");
  ids.delete(currentID);

  for (const id of ids) {
    const key = String(threadID) + ":" + id;
    const cached = cache.get(key);
    if (!names.has(id) && cached && Date.now() - cached.at < CACHE_TTL) names.set(id, { name: cached.name, source: "cache" });
    const seen = learned.get(key);
    if (!names.has(id) && seen && cleanName(seen.name)) names.set(id, { name: seen.name, source: seen.source });
  }

  const missing = [...ids].filter(id => !names.has(id));
  let batchCalls = 0;
  let singleCalls = 0;
  if (missing.length && typeof api?.getUserInfo === "function") {
    // Batch first. Keep chunks modest for FCA-compatible API variants.
    for (let offset = 0; offset < missing.length; offset += 25) {
      const chunk = missing.slice(offset, offset + 25);
      batchCalls++;
      const payload = await callApi(api, "getUserInfo", [chunk], timeoutMs);
      for (const [id, row] of indexUserRecords(payload, chunk)) {
        const name = recordName(row);
        if (name && ids.has(id) && !names.has(id)) names.set(id, { name, source: "userInfo" });
      }
    }
    // Some versions silently return no usable records for array lookups. Retry
    // missing IDs individually, bounded in small concurrent batches.
    const stillMissing = [...ids].filter(id => !names.has(id));
    for (let offset = 0; offset < stillMissing.length; offset += 8) {
      const chunk = stillMissing.slice(offset, offset + 8);
      const rows = await Promise.all(chunk.map(async id => {
        singleCalls++;
        const payload = await callApi(api, "getUserInfo", [id], timeoutMs);
        const records = indexUserRecords(payload, [id]);
        const row = records.get(id) || (recordName(payload) ? payload : null);
        return { id, name: recordName(row) };
      }));
      for (const row of rows) if (row.name && !names.has(row.id)) names.set(row.id, { name: row.name, source: "userInfo-single" });
    }
  }

  const members = [...ids].map(id => {
    const found = names.get(id);
    if (found?.name) boundedSet(cache, String(threadID) + ":" + id, { name: found.name, at: Date.now() }, CACHE_MAX);
    return {
      user_id: id,
      name: found?.name || ("Unnamed ····" + id.slice(-4)),
      resolved: !!found?.name,
      source: found?.source || "unresolved",
    };
  }).sort((a, b) => Number(b.resolved) - Number(a.resolved) || a.name.localeCompare(b.name));

  const diagnostics = {
    threadInfo: true,
    participantIds: ids.size,
    named: members.filter(member => member.resolved).length,
    unresolved: members.filter(member => !member.resolved).length,
    sources: members.reduce((result, member) => {
      result[member.source] = (result[member.source] || 0) + 1;
      return result;
    }, {}),
    batchCalls,
    singleCalls,
    threadInfoKeys: Object.keys(info).slice(0, 30),
  };
  return { members, diagnostics };
}

async function resolveMemberName(api, threadID, userID, fallback = "") {
  const id = idOf(userID);
  if (!id) return cleanName(fallback) || "";
  const key = String(threadID) + ":" + id;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.name;
  const learnedName = learned.get(key);
  if (learnedName?.name) return learnedName.name;
  const { members } = await resolveGroupMembers(api, threadID);
  const member = members.find(item => item.user_id === id);
  return member?.resolved ? member.name : (cleanName(fallback) || "");
}

module.exports = { resolveGroupMembers, resolveMemberName, noteEvent, cleanName, recordName, idOf };
