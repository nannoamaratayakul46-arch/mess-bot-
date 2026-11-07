"use strict";

const crypto = require("node:crypto");

const SESSION_COOKIE = "eclipse_dashboard_session";
const CSRF_COOKIE = "eclipse_dashboard_csrf";

function parseCookies(header = "") {
  const result = Object.create(null);
  for (const part of String(header).split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { result[key] = decodeURIComponent(value); } catch { /* ignore malformed cookie */ }
  }
  return result;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function cookieOptions(maxAge) {
  return ["Path=/", "HttpOnly", "Secure", "SameSite=None", "Max-Age=" + maxAge];
}

function createDashboardAccessRoutes({ app, db, legacyAuth, sessionTtlMs = 7 * 24 * 60 * 60 * 1000 } = {}) {
  if (!app || !db || typeof db.query !== "function") throw new TypeError("Express app and database are required.");
  const { createDashboardAccess } = require("./dashboardAccess");
  const access = createDashboardAccess({ query: db.query, sessionTtlMs });
  const schemaReady = access.ensureSchema();
  const attempts = new Map();

  function rateLimit(req, res, next) {
    const now = Date.now();
    const ip = String(req.ip || req.socket?.remoteAddress || "unknown").slice(0, 128);
    for (const [key, item] of attempts) if (now - item.startedAt > 15 * 60 * 1000) attempts.delete(key);
    const item = attempts.get(ip) || { startedAt: now, count: 0 };
    if (item.count >= 10) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((15 * 60 * 1000 - (now - item.startedAt)) / 1000))));
      return res.status(429).json({ ok: false, error: "Too many access attempts. Try again later." });
    }
    item.count += 1;
    attempts.set(ip, item);
    if (attempts.size > 5000) attempts.delete(attempts.keys().next().value);
    return next();
  }

  app.use("/api/access", async (_req, res, next) => {
    try { await schemaReady; return next(); }
    catch { return res.status(503).json({ ok: false, error: "Dashboard access service is unavailable." }); }
  });

  function sendError(res, error, fallback = "Dashboard access request failed.") {
    const code = error?.code;
    if (code === "AUTH_INVALID" || code === "INVITATION_INVALID") return res.status(401).json({ ok: false, error: error.message });
    if (code === "OWNER_REQUIRED") return res.status(403).json({ ok: false, error: error.message });
    if (code === "OWNER_ALREADY_INITIALIZED") return res.status(409).json({ ok: false, error: error.message });
    if (code === "INVITATION_NOT_FOUND") return res.status(404).json({ ok: false, error: error.message });
    if (typeof code === "string" && /^(?:23|42|08)/.test(code)) {
      return res.status(500).json({ ok: false, error: fallback });
    }
    return res.status(400).json({ ok: false, error: error?.message || fallback });
  }

  function readSession(req) {
    return parseCookies(req.headers?.cookie)[SESSION_COOKIE] || "";
  }

  async function requireSession(req, res, next) {
    try {
      const account = await access.authenticate(readSession(req));
      if (!account) return res.status(401).json({ ok: false, error: "Dashboard login required." });
      req.dashboardAccount = account;
      return next();
    } catch {
      return res.status(503).json({ ok: false, error: "Dashboard access service is unavailable." });
    }
  }

  function requireCsrf(req, res, next) {
    if (!isAllowedOrigin(req)) return res.status(403).json({ ok: false, error: "Request origin is not allowed." });
    const cookies = parseCookies(req.headers?.cookie);
    const cookieToken = cookies[CSRF_COOKIE];
    const headerToken = req.headers?.["x-eclipse-csrf-token"];
    if (!safeEqual(cookieToken, headerToken)) return res.status(403).json({ ok: false, error: "CSRF validation failed." });
    return next();
  }

  function requireOwner(req, res, next) {
    if (req.dashboardAccount?.role !== "owner") return res.status(403).json({ ok: false, error: "Owner access is required." });
    return next();
  }

  const safeReadPatterns = [
    /^\/api\/dashboard\/(?:status|snapshot|health|delivery-analytics|events(?:\/stream)?|analytics|groups(?:\/[^/]+\/members)?|jaiden-target-countdown\/settings|setnn\/(?:status|completion-message)|removenn\/status|preferences\/(?:reaction|appearance))$/,
  ];
  const operatorMutationPatterns = [
    ["POST", /^\/api\/dashboard\/bot\/(?:start|stop)$/],
    ["POST", /^\/api\/dashboard\/music\/(?:pause|resume)$/],
    ["POST", /^\/api\/dashboard\/setnn\/(?:start|stop)$/],
    ["POST", /^\/api\/dashboard\/removenn\/start$/],
    ["PUT", /^\/api\/dashboard\/groups\/[^/]+\/(?:settings|target)$/],
    ["DELETE", /^\/api\/dashboard\/groups\/[^/]+\/target$/],
    ["PUT", /^\/api\/dashboard\/jaiden-target-countdown\/settings$/],
    ["PUT", /^\/api\/dashboard\/setnn\/completion-message$/],
  ];

  function isAllowedOrigin(req) {
    const origin = String(req.headers?.origin || "").trim();
    if (!origin) return false;
    const allowed = String(process.env.ECLIPSE_DASHBOARD_ORIGIN || "")
      .split(",").map(value => value.trim()).filter(Boolean);
    return allowed.includes(origin);
  }

  async function authorizeExistingRoute(req, res, next) {
    const token = readSession(req);
    if (!token) return legacyAuth ? legacyAuth(req, res, next) : res.status(401).json({ ok: false, error: "Dashboard login required." });
    try {
      const account = await access.authenticate(token);
      if (!account) return res.status(401).json({ ok: false, error: "Dashboard login required." });
      req.dashboardAccount = account;
      const method = String(req.method || "GET").toUpperCase();
      const path = String(req.path || req.originalUrl || "").split("?")[0];
      if (account.role === "owner") {
        if (["GET", "HEAD", "OPTIONS"].includes(method)) return next();
        return requireCsrf(req, res, next);
      }

      const isSafeRead = method === "GET" &&
        !/(?:\/debug|\/deployment|\/location|\/user(?:\/|$)|\/temporary-admin|\/moderation|\/database-ai|\/ai-center)/i.test(path) &&
        safeReadPatterns.some(pattern => pattern.test(path));
      if (isSafeRead) {
        res.setHeader("Cache-Control", "no-store");
        return next();
      }

      const isOperatorMutation = account.role === "operator" &&
        operatorMutationPatterns.some(([allowedMethod, pattern]) => method === allowedMethod && pattern.test(path));
      if (!isOperatorMutation) return res.status(403).json({ ok: false, error: "Your dashboard role cannot perform this action." });
      return requireCsrf(req, res, next);
    } catch {
      return res.status(503).json({ ok: false, error: "Dashboard access service is unavailable." });
    }
  }

  function setSessionCookies(res, token, csrfToken, expiresAt) {
    const maxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
    res.setHeader("Set-Cookie", [
      SESSION_COOKIE + "=" + encodeURIComponent(token) + "; " + cookieOptions(maxAge).join("; "),
      CSRF_COOKIE + "=" + encodeURIComponent(csrfToken) + "; " + cookieOptions(maxAge).filter(part => part !== "HttpOnly").join("; "),
    ]);
  }

  function clearSessionCookies(res) {
    res.setHeader("Set-Cookie", [
      SESSION_COOKIE + "=; " + cookieOptions(0).join("; "),
      CSRF_COOKIE + "=; " + cookieOptions(0).filter(part => part !== "HttpOnly").join("; "),
    ]);
  }

  app.post("/api/access/bootstrap", rateLimit, legacyAuth, async (req, res) => {
    try {
      const owner = await access.setupOwnerCredentials({ passkey: req.body?.passkey });
      res.setHeader("Cache-Control", "no-store");
      return res.status(201).json({ ok: true, account: owner });
    } catch (error) { return sendError(res, error); }
  });

  app.post("/api/access/login", rateLimit, async (req, res) => {
    try {
      const result = await access.login({ passkey: req.body?.passkey, secretCode: req.body?.secretCode });
      const csrfToken = crypto.randomBytes(32).toString("base64url");
      setSessionCookies(res, result.token, csrfToken, result.expiresAt);
      res.setHeader("Cache-Control", "no-store");
      return res.json({ ok: true, account: result.account, expiresAt: result.expiresAt, csrfToken });
    } catch (error) { return sendError(res, error); }
  });

  app.post("/api/access/invitations/redeem", rateLimit, async (req, res) => {
    try {
      const account = await access.redeemInvitation({ token: req.body?.token, passkey: req.body?.passkey });
      res.setHeader("Cache-Control", "no-store");
      return res.status(201).json({ ok: true, account });
    } catch (error) { return sendError(res, error); }
  });

  app.get("/api/access/me", requireSession, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.json({ ok: true, account: req.dashboardAccount });
  });

  app.post("/api/access/logout", requireSession, requireCsrf, async (req, res) => {
    try {
      await access.revokeSession(readSession(req));
      clearSessionCookies(res);
      res.setHeader("Cache-Control", "no-store");
      return res.json({ ok: true });
    } catch (error) { return sendError(res, error); }
  });

  app.post("/api/access/invitations", requireSession, requireCsrf, requireOwner, async (req, res) => {
    try {
      const invitation = await access.createInvitation({
        actor: req.dashboardAccount,
        role: req.body?.role,
        ttlMs: req.body?.ttlMs,
      });
      res.setHeader("Cache-Control", "no-store");
      return res.status(201).json({ ok: true, invitation });
    } catch (error) { return sendError(res, error); }
  });

  app.get("/api/access/invitations", requireSession, requireOwner, async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      return res.json({ ok: true, invitations: await access.listInvitations(req.dashboardAccount) });
    } catch (error) { return sendError(res, error); }
  });

  app.delete("/api/access/invitations/:id", requireSession, requireCsrf, requireOwner, async (req, res) => {
    try {
      const invitation = await access.revokeInvitation(req.dashboardAccount, req.params.id);
      res.setHeader("Cache-Control", "no-store");
      return res.json({ ok: true, invitation });
    } catch (error) { return sendError(res, error); }
  });

  app.get("/api/access/accounts", requireSession, requireOwner, async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      return res.json({ ok: true, accounts: await access.listAccounts(req.dashboardAccount) });
    } catch (error) { return sendError(res, error); }
  });

  app.patch("/api/access/accounts/:id", requireSession, requireCsrf, requireOwner, async (req, res) => {
    try {
      const account = await access.updateAccount(req.dashboardAccount, req.params.id, {
        role: req.body?.role,
        status: req.body?.status,
      });
      res.setHeader("Cache-Control", "no-store");
      return res.json({ ok: true, account });
    } catch (error) { return sendError(res, error); }
  });

  return { access, requireSession, requireCsrf, authorizeExistingRoute, schemaReady };
}

module.exports = { createDashboardAccessRoutes, parseCookies, safeEqual };
