"use strict";

/**
 * Central ECLIPSE permission registry.
 *
 * Keep authorization parsing here so command modules do not each maintain
 * their own copy of ADMIN_IDS/TRUSTED_ADMIN_IDS.
 */

function parseIds(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((id) => id.trim())
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
