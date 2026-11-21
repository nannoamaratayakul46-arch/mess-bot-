"use strict";

const crypto = require("node:crypto");
const DEFAULT_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX_FAILURES = 10;
const MAX_TRACKED_IPS = 5000;

function parseOrigins(value) {
  return new Set(String(value || "").split(",").map(origin => {
    const trimmed = origin.trim().replace(/\/$/, "");
    if (!trimmed || trimmed === "*") return "";
    try {
      const parsed = new URL(trimmed);
      return parsed.origin === "null" ? parsed.protocol + "//" + parsed.host : parsed.origin;
    } catch { return ""; }
  }).filter(Boolean));
}

function createDashboardSecurity({ apiKey = "", allowedOrigins = "", now = Date.now, maxFailures = DEFAULT_MAX_FAILURES, windowMs = DEFAULT_FAILURE_WINDOW_MS } = {}) {
  const expectedKey = String(apiKey || "").trim();
  const origins = parseOrigins(allowedOrigins);
  const failures = new Map();

  function applySecurityHeaders(res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  }

  function isAllowedOrigin(req, origin) {
    if (!origin) return true;
    if (origins.has(origin)) return true;
    const host = typeof req.get === "function" ? req.get("host") : req.headers?.host;
    if (!host) return false;
    const protocol = String(req.protocol || "https").replace(/:$/, "");
    return origin === protocol + "://" + host;
  }

  function cors(req, res, next) {
    applySecurityHeaders(res);
    const origin = String(req.headers?.origin || "").trim();
    if (origin && !isAllowedOrigin(req, origin)) return res.status(403).json({ ok: false, error: "Origin is not allowed." });
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-ECLIPSE-DASHBOARD-KEY, X-ECLIPSE-CSRF-TOKEN, X-ECLIPSE-PHOTO-TOKEN");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.setHeader("Access-Control-Max-Age", "600");
      return res.sendStatus(204);
    }
    return next();
  }

  function requireAccess(req, res, next) {
    if (!expectedKey) return res.status(503).json({ ok: false, error: "Dashboard API key is not configured on the server." });
    const ip = String(req.ip || req.socket?.remoteAddress || "unknown").slice(0, 128);
    const time = now();
    for (const [key, entry] of failures) if (time - entry.startedAt >= windowMs) failures.delete(key);
    const current = failures.get(ip);
    if (current && time - current.startedAt < windowMs && current.count >= maxFailures) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((windowMs - (time - current.startedAt)) / 1000))));
      return res.status(429).json({ ok: false, error: "Too many failed dashboard authentication attempts. Try again later." });
    }
    const bearer = String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "").trim();
    const provided = String(req.headers?.["x-eclipse-dashboard-key"] || bearer).trim();
    const actualBuffer = Buffer.from(provided, "utf8");
    const expectedBuffer = Buffer.from(expectedKey, "utf8");
    const matches = actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
    if (!matches) {
      const entry = current && time - current.startedAt < windowMs ? current : { startedAt: time, count: 0 };
      entry.count += 1;
      if (failures.size >= MAX_TRACKED_IPS && !failures.has(ip)) {
        const oldestKey = failures.keys().next().value;
        if (oldestKey !== undefined) failures.delete(oldestKey);
      }
      failures.set(ip, entry);
      if (entry.count >= maxFailures) {
        res.setHeader("Retry-After", String(Math.ceil(windowMs / 1000)));
        return res.status(429).json({ ok: false, error: "Too many failed dashboard authentication attempts. Try again later." });
      }
      return res.status(401).json({ ok: false, error: "Dashboard authorization required." });
    }
    failures.delete(ip);
    return next();
  }
  return { cors, requireAccess };
}

module.exports = { createDashboardSecurity };
