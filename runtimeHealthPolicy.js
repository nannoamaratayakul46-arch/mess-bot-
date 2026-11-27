"use strict";

/**
 * Process liveness and application readiness are intentionally independent of
 * external Messenger connectivity. A Facebook outage must not cause Render to
 * restart a healthy Node process that is keeping the dashboard available.
 */
function isProcessLivenessHealthy({ eventLoopAgeMs, maxEventLoopAgeMs, shuttingDown = false } = {}) {
  if (shuttingDown) return false;
  const age = Number(eventLoopAgeMs);
  const max = Number(maxEventLoopAgeMs);
  return Number.isFinite(age) && Number.isFinite(max) && max >= 0 && age <= max;
}

function isCoreReadinessHealthy({ databaseHealthy, shuttingDown = false } = {}) {
  return !shuttingDown && databaseHealthy === true;
}


module.exports = { isProcessLivenessHealthy, isCoreReadinessHealthy };
