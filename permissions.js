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
  isOwner,
  isTrustedAdmin,
  isAdmin,
  getAdminLevel,
};
