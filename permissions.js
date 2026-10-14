"use strict";

/**
 * Central ECLIPSE permission registry.
 *
 * Keep authorization parsing here so command modules do not each maintain
 * their own copy of ADMIN_IDS/TRUSTED_ADMIN_IDS.
 */

function parseIds(value) {
  let raw = String(value ?? "").trim();

  // Accept normal Render env values as well as accidentally quoted/JSON-ish
  // comma-separated values, without ever logging or hardcoding the IDs.
  raw = raw.replace(/^['"]|['"]$/g, "").trim();

  if (raw.startsWith("[") && raw.endsWith("]")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) raw = parsed.join(",");
    } catch {
      // Fall back to the normal comma-separated parser.
    }
  }

  return new Set(
    raw
      .split(",")
      .map((id) => id.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean)
  );
}

const ADMIN_IDS = parseIds(process.env.ADMIN_IDS);
const TRUSTED_ADMIN_IDS = parseIds(process.env.TRUSTED_ADMIN_IDS);

// Dashboard-managed permanent admins are scoped by Messenger group thread ID.
const GROUP_TRUSTED_ADMIN_IDS = new Map();
function replaceGroupTrustedAdmins(rows) {
  GROUP_TRUSTED_ADMIN_IDS.clear();
  for (const row of rows || []) {
    const threadId = String(row.thread_id || "");
    const userId = String(row.user_id || "");
    if (!threadId || !userId) continue;
    if (!GROUP_TRUSTED_ADMIN_IDS.has(threadId)) GROUP_TRUSTED_ADMIN_IDS.set(threadId, new Set());
    GROUP_TRUSTED_ADMIN_IDS.get(threadId).add(userId);
  }
}
function isGroupTrustedAdmin(userId, threadId) {
  return Boolean(GROUP_TRUSTED_ADMIN_IDS.get(String(threadId || ""))?.has(String(userId || "")));
}
function isGroupAdmin(userId, threadId) {
  return isOwner(userId) || isTrustedAdmin(userId) || isGroupTrustedAdmin(userId, threadId);
}

function isOwner(userId) {
  return ADMIN_IDS.has(String(userId || ""));
}

function isTrustedAdmin(userId) {
  return TRUSTED_ADMIN_IDS.has(String(userId || ""));
}

function isAdmin(userId) {
  return isOwner(userId) || isTrustedAdmin(userId);
}

function getAdminLevel(userId) {
  if (isOwner(userId)) return 3;
  if (isTrustedAdmin(userId)) return 2;
  return 1;
}

module.exports = {
  ADMIN_IDS,
  TRUSTED_ADMIN_IDS,
  GROUP_TRUSTED_ADMIN_IDS,
  replaceGroupTrustedAdmins,
  isGroupTrustedAdmin,
  isGroupAdmin,
  isOwner,
  isTrustedAdmin,
  isAdmin,
  getAdminLevel,
};
