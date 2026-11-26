"use strict";

const DEFAULT_LOGIN_RETRY_CAP_MS = 5 * 60_000;
const DEFAULT_RATE_LIMIT_RETRY_BASE_MS = 2 * 60_000;
const MAX_RATE_LIMIT_RETRY_MS = 15 * 60_000;
const TRANSIENT_LISTENER_RETRY_MS = 30_000;

function toFiniteNumber(value, fallback) {
  try {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  } catch {
    return fallback;
  }
}

function getClassificationText(value) {
  const parts = [];
  const visited = new Set();

  function visit(item, depth = 0) {
    if (item === null || item === undefined || depth > 5 || parts.length >= 80) return;
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      parts.push(String(item));
      return;
    }
    if (typeof item !== "object" || visited.has(item)) return;
    visited.add(item);
    if (Array.isArray(item)) {
      for (const child of item) visit(child, depth + 1);
      return;
    }
    for (const key of [
      "name", "message", "code", "error", "errorCode", "errorSummary",
      "errorDescription", "error_description", "description", "reason",
      "type", "cause"
    ]) {
      try {
        if (key in item) visit(item[key], depth + 1);
      } catch {
        // Ignore hostile getters from third-party error objects.
      }
    }
  }

  visit(value);
  return parts.join(" | ");
}

function classifyListenerError(value) {
  const text = getClassificationText(value);
  return {
    authRejected: /checkpoint|two.factor|2fa|invalid cookie|cookie.*(?:invalid|expired|rejected)|session.*(?:expired|invalid|rejected)|not logged in|login required|authentication failed|account disabled|confirm your identity|facebook blocked the login|error retrieving user.?id/i.test(text),
    rateLimited: /1675004|3252001|rate.?limit|too many requests|temporarily blocked|misusing this feature|going too fast/i.test(text),
  };
}

function getListenerRecoveryDelayMs(options = {}) {
  let rateLimited = false;
  let failureCount = 1;
  try {
    rateLimited = Boolean(options?.rateLimited);
    failureCount = options?.failureCount ?? 1;
  } catch {
    return TRANSIENT_LISTENER_RETRY_MS;
  }
  if (!rateLimited) return TRANSIENT_LISTENER_RETRY_MS;
  const count = Math.max(1, Math.floor(toFiniteNumber(failureCount, 1)));
  const exponent = Math.min(count - 1, 3);
  return Math.min(
    MAX_RATE_LIMIT_RETRY_MS,
    DEFAULT_RATE_LIMIT_RETRY_BASE_MS * (2 ** exponent)
  );
}

function getLoginRetryDelayMs(attempt, maxDelayMs = DEFAULT_LOGIN_RETRY_CAP_MS) {
  const safeAttempt = Math.max(1, Math.floor(toFiniteNumber(attempt, 1)));
  const parsedCap = toFiniteNumber(maxDelayMs, DEFAULT_LOGIN_RETRY_CAP_MS);
  const safeCap = parsedCap > 0 ? parsedCap : DEFAULT_LOGIN_RETRY_CAP_MS;
  return Math.min(2 ** Math.min(safeAttempt, 30) * 1000, safeCap);
}

module.exports = {
  classifyListenerError,
  getListenerRecoveryDelayMs,
  getLoginRetryDelayMs,
};
