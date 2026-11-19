"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const APP_ID = "mess-bot";
const DEFAULT_OFFLINE_GRACE_MS = 24 * 60 * 60 * 1000;
const MAX_OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

function enabled(value) {
  return /^(1|true|yes|on)$/i.test(String(value || ""));
}

function createLicenseClient(options = {}) {
  const enforcementEnabled = enabled(process.env.ECLIPSE_LICENSE_ENFORCEMENT);
  const serverUrl = String(process.env.ECLIPSE_LICENSE_SERVER_URL || "").trim().replace(/\/+$/, "");
  const publicKey = String(process.env.ECLIPSE_LICENSE_PUBLIC_KEY || "").trim();
  const heartbeatMs = Math.max(30_000, Number(process.env.ECLIPSE_LICENSE_HEARTBEAT_MS || 60_000));
  const requestTimeoutMs = Math.min(60_000, Math.max(5_000, Number(process.env.ECLIPSE_LICENSE_REQUEST_TIMEOUT_MS || 30_000)));
  const configuredGrace = Number(process.env.ECLIPSE_LICENSE_OFFLINE_GRACE_MS);
  const offlineGraceMs = Number.isFinite(configuredGrace)
    ? Math.min(MAX_OFFLINE_GRACE_MS, Math.max(0, configuredGrace))
    : DEFAULT_OFFLINE_GRACE_MS;
  const dataDir = path.resolve(process.env.ECLIPSE_SECURITY_DATA_DIR || path.join(process.cwd(), ".eclipse-security"));
  const identityPath = path.resolve(process.env.ECLIPSE_INSTALLATION_ID_FILE || path.join(dataDir, "installation-id"));
  const leasePath = path.resolve(process.env.ECLIPSE_LICENSE_CACHE_PATH || path.join(dataDir, "license-lease"));
  const now = options.now || Date.now;
  const fetchImpl = options.fetch || global.fetch;

  let installationId = "";
  let lease = null;
  let authorized = !enforcementEnabled;
  let lastCheckAt = null;
  let lastError = null;
  let timer = null;

  function ensureDataDir() {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  }

  function getInstallationId() {
    if (installationId) return installationId;
    ensureDataDir();
    const configured = String(process.env.ECLIPSE_INSTALLATION_ID || "").trim();
    if (configured) {
      if (!/^[a-f0-9-]{32,64}$/i.test(configured)) {
        throw new Error("ECLIPSE_INSTALLATION_ID must be a UUID or 32-64 character hexadecimal/hyphen ID.");
      }
      installationId = configured;
      return installationId;
    }
    try {
      installationId = fs.readFileSync(identityPath, "utf8").trim();
    } catch (error) {
      if (!error || error.code !== "ENOENT") throw error;
    }
    if (!/^[a-f0-9-]{32,64}$/i.test(installationId)) {
      installationId = crypto.randomUUID();
      fs.writeFileSync(identityPath, installationId + "\n", { mode: 0o600 });
    }
    return installationId;
  }

  function readCachedLease() {
    try { return fs.readFileSync(leasePath, "utf8").trim() || null; }
    catch (error) { if (error && error.code === "ENOENT") return null; throw error; }
  }

  function writeCachedLease(token) {
    ensureDataDir();
    const temporary = leasePath + ".tmp";
    fs.writeFileSync(temporary, String(token) + "\n", { mode: 0o600 });
    fs.renameSync(temporary, leasePath);
  }

  function clearCachedLease() {
    try { fs.unlinkSync(leasePath); }
    catch (error) { if (!error || error.code !== "ENOENT") throw error; }
  }

  function verifyLease(token, allowOfflineGrace = false) {
    if (!publicKey || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    try {
      const signature = Buffer.from(parts[1], "base64url");
      if (!crypto.verify(null, Buffer.from(parts[0]), publicKey, signature)) return null;
      const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
      if (payload.app !== APP_ID || payload.installation_id !== getInstallationId() || payload.status !== "approved") return null;
      if (!Number.isFinite(payload.exp)) return null;
      const deadline = payload.exp * 1000 + (allowOfflineGrace ? offlineGraceMs : 0);
      if (deadline <= now() + (allowOfflineGrace ? 0 : 15_000)) return null;
      return payload;
    } catch {
      return null;
    }
  }

  async function checkAuthority() {
    if (!serverUrl) throw new Error("ECLIPSE_LICENSE_SERVER_URL is missing.");
    if (!publicKey) throw new Error("ECLIPSE_LICENSE_PUBLIC_KEY is missing.");
    if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable in this Node.js runtime.");
    const id = getInstallationId();
    const url = new URL("/api/license/verify", serverUrl).toString();
    let response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          app: APP_ID,
          installation_id: id,
          repository: process.env.ECLIPSE_FORK_REPOSITORY || process.env.GITHUB_REPOSITORY || "akobudoy20011-dev/mess-bot",
          fork_repository: process.env.ECLIPSE_FORK_REPOSITORY || process.env.GITHUB_REPOSITORY || "",
          version: process.env.npm_package_version || "unknown"
        }),
        signal: AbortSignal.timeout(requestTimeoutMs)
      });
    } catch (error) {
      throw new Error("Could not reach the ECLIPSE license authority: " + String(error && error.message || error).slice(0, 180));
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status !== "approved") {
      lease = null;
      clearCachedLease();
      const reason = result.status === "pending"
        ? "Installation is pending owner approval."
        : result.status === "revoked"
          ? "This installation license has been revoked."
          : String(result.error || "Installation is not approved.");
      const error = new Error(reason + " Installation ID: " + id);
      error.explicitDenial = true;
      throw error;
    }
    const verified = verifyLease(result.token);
    if (!verified) {
      lease = null;
      clearCachedLease();
      const error = new Error("The license authority returned an invalid or expired signature.");
      error.explicitDenial = true;
      throw error;
    }
    lease = result.token;
    writeCachedLease(lease);
    authorized = true;
    lastError = null;
    lastCheckAt = new Date(now()).toISOString();
    return true;
  }

  async function initialize() {
    if (!enforcementEnabled) {
      authorized = true;
      lastCheckAt = new Date(now()).toISOString();
      lastError = "License enforcement is disabled for this deployment.";
      return true;
    }
    try {
      getInstallationId();
      await checkAuthority();
      return true;
    } catch (error) {
      const message = String(error && error.message || error);
      const cached = readCachedLease();
      const cachedPayload = cached && verifyLease(cached, true);
      const isTransportFailure = /Could not reach the ECLIPSE license authority/i.test(message);
      if (isTransportFailure && cachedPayload && offlineGraceMs > 0) {
        lease = cached;
        authorized = true;
        lastError = "Authority unreachable; cached approval is valid until " + new Date(cachedPayload.exp * 1000 + offlineGraceMs).toISOString();
        lastCheckAt = new Date(now()).toISOString();
        return true;
      }
      if (!isTransportFailure) clearCachedLease();
      authorized = false;
      lastError = message.slice(0, 300);
      lastCheckAt = new Date(now()).toISOString();
      return false;
    }
  }

  function startHeartbeat(onDenied) {
    if (!enforcementEnabled) return;
    if (timer) clearInterval(timer);
    timer = setInterval(async () => {
      try {
        await checkAuthority();
      } catch (error) {
        const message = String(error && error.message || error);
        lastError = message.slice(0, 300);
        const stillLeased = verifyLease(lease, true);
        if (error && error.explicitDenial || !stillLeased) {
          const wasAuthorized = authorized;
          authorized = false;
          if (wasAuthorized && typeof onDenied === "function") onDenied(lastError);
        }
      }
    }, heartbeatMs);
    timer.unref?.();
  }

  return {
    initialize,
    startHeartbeat,
    getInstallationId,
    getStatus() {
      const payload = lease && verifyLease(lease, true);
      return {
        enabled: enforcementEnabled,
        app: APP_ID,
        installation_id: installationId || null,
        authorized,
        status: !enforcementEnabled ? "disabled" : authorized ? (lastError ? "offline-authorized" : "authorized") : "blocked",
        offline_grace_until: payload && offlineGraceMs > 0
          ? new Date(payload.exp * 1000 + offlineGraceMs).toISOString()
          : null,
        last_check_at: lastCheckAt,
        last_error: lastError
      };
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    }
  };
}

module.exports = { createLicenseClient, APP_ID };
