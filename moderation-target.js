"use strict";

const FACEBOOK_USER_ID_RE = /^\d{6,20}$/;
const LOOKUP_TIMEOUT_MS = 5000;

function normalizeName(value) {
  return String(value || "")
    .replace(/^@/, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function validId(value) {
  const id = String(value ?? "").trim();
  return FACEBOOK_USER_ID_RE.test(id) ? id : null;
}

function callGetThreadInfo(api, threadID) {
  return new Promise((resolve, reject) => {
    if (typeof api?.getThreadInfo !== "function") {
      resolve(null);
      return;
    }

    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value ?? null);
    };
    const timer = setTimeout(
      () => finish(new Error("getThreadInfo timed out")),
      LOOKUP_TIMEOUT_MS
    );
    if (typeof timer.unref === "function") timer.unref();

    try {
      const result = api.getThreadInfo(threadID, (error, info) => {
        finish(error, info);
      });
      if (result && typeof result.then === "function") {
        result.then(info => finish(null, info), error => finish(error));
      } else if (result !== undefined && api.getThreadInfo.length < 2) {
        finish(null, result);
      }
    } catch (error) {
      finish(error);
    }
  });
}

function memberCandidates(info) {
  const candidates = [];
  const users = Array.isArray(info?.userInfo) ? info.userInfo
    : Array.isArray(info?.participants) ? info.participants
    : [];

  for (const member of users) {
    const id = validId(member?.id ?? member?.userID ?? member?.uid);
    if (!id) continue;
    for (const value of [member?.name, member?.fullName, member?.firstName]) {
      const name = normalizeName(value);
      if (name) candidates.push({ id, name });
    }
  }

  if (info?.nicknames && typeof info.nicknames === "object") {
    for (const [rawId, nickname] of Object.entries(info.nicknames)) {
      const id = validId(rawId);
      const name = normalizeName(nickname);
      if (id && name) candidates.push({ id, name });
    }
  }

  return candidates;
}

/**
 * Resolve a moderation target safely.
 * Supports one explicit mention, a numeric Facebook user ID, or an exact
 * member name/nickname from getThreadInfo. Name matching must be unique.
 * Returns { targetId, consumedArgs } or null when the target is ambiguous
 * or cannot be resolved.
 */
async function resolveModerationTarget(api, event, threadID, args = []) {
  const rawMentionIds = event?.mentions && typeof event.mentions === "object"
    ? Object.keys(event.mentions)
    : [];
  if (rawMentionIds.length > 1) return null;

  if (rawMentionIds.length === 1) {
    const mentionedId = validId(rawMentionIds[0]);
    if (!mentionedId) return null;
    return { targetId: mentionedId, consumedArgs: Math.min(args.length, 1) };
  }

  const first = String(args[0] || "").trim().replace(/^@/, "").replace(/[<>]/g, "");
  const directId = validId(first);
  if (directId) return { targetId: directId, consumedArgs: 1 };
  if (!first) return null;

  let info;
  try {
    info = await callGetThreadInfo(api, threadID);
  } catch {
    return null;
  }
  if (!info) return null;

  const candidates = memberCandidates(info);
  const normalizedArgs = args.map(value => String(value || "").trim());
  // Prefer the longest exact member-name prefix so multi-word names work
  // without consuming the remainder of the command as part of the name.
  for (let count = normalizedArgs.length; count >= 1; count -= 1) {
    const requested = normalizeName(normalizedArgs.slice(0, count).join(" "));
    if (!requested) continue;

    const ids = new Set(
      candidates.filter(candidate => candidate.name === requested).map(candidate => candidate.id)
    );
    if (ids.size > 1) return null;
    if (ids.size === 1) {
      return { targetId: [...ids][0], consumedArgs: count };
    }
  }

  return null;
}

module.exports = { resolveModerationTarget, normalizeName, validId };
