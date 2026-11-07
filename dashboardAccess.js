"use strict";

const crypto = require("node:crypto");
const { promisify } = require("node:util");

const scrypt = promisify(crypto.scrypt);
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 1024;
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid email address is required.");
  }
  return email;
}

function createOpaqueToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || ""), "utf8").digest("hex");
}

async function hashPassword(password) {
  const value = String(password || "");
  if (value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH) {
    throw new Error("Password must be between 12 and 1024 characters.");
  }
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return "scrypt$16384$8$1$" + salt.toString("base64url") + "$" + Buffer.from(derived).toString("base64url");
}

async function verifyPassword(password, encoded) {
  const parts = String(encoded || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]), r = Number(parts[2]), p = Number(parts[3]);
  if (N !== 16384 || r !== 8 || p !== 1) return false;
  let salt, expected;
  try {
    salt = Buffer.from(parts[4], "base64url");
    expected = Buffer.from(parts[5], "base64url");
  } catch {
    return false;
  }
  if (salt.length !== 16 || expected.length !== 64) return false;
  const actual = Buffer.from(await scrypt(String(password || ""), salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 }));
  return crypto.timingSafeEqual(actual, expected);
}

function createDashboardAccess({ query, now = Date.now, sessionTtlMs = DEFAULT_SESSION_TTL_MS } = {}) {
  if (typeof query !== "function") throw new TypeError("A database query function is required.");

  async function ensureSchema() {
    await query(`
      CREATE TABLE IF NOT EXISTS eclipse_dashboard_accounts (
        id BIGSERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('owner', 'operator', 'viewer')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS eclipse_dashboard_invitations (
        id BIGSERIAL PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL CHECK (role IN ('operator', 'viewer')),
        created_by BIGINT NOT NULL REFERENCES eclipse_dashboard_accounts(id),
        expires_at TIMESTAMPTZ NOT NULL,
        redeemed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE eclipse_dashboard_invitations ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
      CREATE TABLE IF NOT EXISTS eclipse_dashboard_sessions (
        id BIGSERIAL PRIMARY KEY,
        session_hash TEXT NOT NULL UNIQUE,
        account_id BIGINT NOT NULL REFERENCES eclipse_dashboard_accounts(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS eclipse_dashboard_single_owner_idx
        ON eclipse_dashboard_accounts ((role)) WHERE role = 'owner';
      CREATE INDEX IF NOT EXISTS eclipse_dashboard_sessions_account_idx
        ON eclipse_dashboard_sessions(account_id, expires_at);
      CREATE TABLE IF NOT EXISTS eclipse_dashboard_access_audit (
        id BIGSERIAL PRIMARY KEY,
        actor_account_id BIGINT REFERENCES eclipse_dashboard_accounts(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        target_account_id BIGINT REFERENCES eclipse_dashboard_accounts(id) ON DELETE SET NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS eclipse_dashboard_access_audit_created_idx
        ON eclipse_dashboard_access_audit(created_at DESC);
    `);
  }

  function requireOwner(actor) {
    if (!actor || actor.role !== "owner" || actor.status !== "active") {
      const error = new Error("Owner access is required.");
      error.code = "OWNER_REQUIRED";
      throw error;
    }
  }

  async function bootstrapOwner({ email, password } = {}) {
    const normalizedEmail = normalizeEmail(email);
    const passwordHash = await hashPassword(password);
    const result = await query(
      "INSERT INTO eclipse_dashboard_accounts (email, password_hash, role, status) SELECT $1, $2, 'owner', 'active' WHERE NOT EXISTS (SELECT 1 FROM eclipse_dashboard_accounts) RETURNING id, email, role, status",
      [normalizedEmail, passwordHash]
    );
    if (!result.rows?.[0]) {
      const error = new Error("Owner account has already been initialized.");
      error.code = "OWNER_ALREADY_INITIALIZED";
      throw error;
    }
    return result.rows[0];
  }

  async function listAccounts(actor) {
    requireOwner(actor);
    const result = await query("SELECT id, email, role, status, created_at, updated_at FROM eclipse_dashboard_accounts ORDER BY created_at ASC");
    return result.rows || [];
  }

  async function updateAccount(actor, accountId, { role, status } = {}) {
    requireOwner(actor);
    const id = Number(accountId);
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("A valid account ID is required.");
    if (role !== undefined && !["operator", "viewer"].includes(role)) throw new Error("Role must be operator or viewer; owner cannot be assigned here.");
    if (status !== undefined && !["active", "disabled"].includes(status)) throw new Error("Status must be active or disabled.");
    if (role === undefined && status === undefined) throw new Error("No account changes were provided.");
    const result = await query("UPDATE eclipse_dashboard_accounts SET role = COALESCE($2, role), status = COALESCE($3, status), updated_at = NOW() WHERE id = $1 AND role <> 'owner' RETURNING id, email, role, status, created_at, updated_at", [id, role ?? null, status ?? null]);
    if (!result.rows?.[0]) throw new Error("Account not found or owner account cannot be modified here.");
    if (status === "disabled") await revokeAllSessions(id);
    return result.rows[0];
  }
  async function createInvitation({ actor, role = "viewer", ttlMs = 24 * 60 * 60 * 1000 } = {}) {
    requireOwner(actor);
    if (!["operator", "viewer"].includes(role)) throw new Error("Invitation role must be operator or viewer.");
    const ttl = Math.min(MAX_INVITE_TTL_MS, Math.max(60_000, Number(ttlMs) || 0));
    const token = createOpaqueToken();
    const expiresAt = new Date(now() + ttl);
    await query(
      "INSERT INTO eclipse_dashboard_invitations (token_hash, role, created_by, expires_at) VALUES ($1, $2, $3, $4)",
      [hashToken(token), role, actor.id, expiresAt]
    );
    return { token, role, expiresAt: expiresAt.toISOString() };
  }

  async function listInvitations(actor) {
    requireOwner(actor);
    const result = await query(`
      SELECT id, role, created_by, expires_at, redeemed_at, revoked_at, created_at,
        CASE
          WHEN redeemed_at IS NOT NULL THEN 'redeemed'
          WHEN revoked_at IS NOT NULL THEN 'revoked'
          WHEN expires_at <= to_timestamp($1 / 1000.0) THEN 'expired'
          ELSE 'pending'
        END AS status
      FROM eclipse_dashboard_invitations
      ORDER BY created_at DESC
    `, [now()]);
    return result.rows || [];
  }

  async function revokeInvitation(actor, invitationId) {
    requireOwner(actor);
    const id = Number(invitationId);
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("A valid invitation ID is required.");
    const result = await query(`
      UPDATE eclipse_dashboard_invitations
      SET revoked_at = to_timestamp($2 / 1000.0)
      WHERE id = $1 AND redeemed_at IS NULL AND revoked_at IS NULL
      RETURNING id, role, expires_at, redeemed_at, revoked_at, created_at
    `, [id, now()]);
    if (!result.rows?.[0]) {
      const error = new Error("Invitation not found or it has already been redeemed or revoked.");
      error.code = "INVITATION_NOT_FOUND";
      throw error;
    }
    return { ...result.rows[0], status: "revoked" };
  }

  async function redeemInvitation({ token, email, password } = {}) {
    const rawToken = String(token || "").trim();
    if (rawToken.length < 40 || rawToken.length > 100) throw new Error("Invitation is invalid or expired.");
    const normalizedEmail = normalizeEmail(email);
    const passwordHash = await hashPassword(password);
    const result = await query(`
      WITH redeemed AS (
        UPDATE eclipse_dashboard_invitations
        SET redeemed_at = to_timestamp($4 / 1000.0)
        WHERE token_hash = $1 AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > to_timestamp($4 / 1000.0)
        RETURNING role
      )
      INSERT INTO eclipse_dashboard_accounts (email, password_hash, role)
      SELECT $2, $3, role FROM redeemed
      RETURNING id, email, role, status
    `, [hashToken(rawToken), normalizedEmail, passwordHash, now()]);
    if (!result.rows?.[0]) {
      const error = new Error("Invitation is invalid or expired, or the email is already registered.");
      error.code = "INVITATION_INVALID";
      throw error;
    }
    return result.rows[0];
  }

  async function login({ email, password } = {}) {
    const normalizedEmail = normalizeEmail(email);
    const result = await query(
      "SELECT id, email, password_hash, role, status FROM eclipse_dashboard_accounts WHERE email = $1 LIMIT 1",
      [normalizedEmail]
    );
    const account = result.rows?.[0];
    if (!account || account.status !== "active" || !(await verifyPassword(password, account.password_hash))) {
      const error = new Error("Email or password is incorrect.");
      error.code = "AUTH_INVALID";
      throw error;
    }
    const token = createOpaqueToken();
    const expiresAt = new Date(now() + Math.max(60_000, Number(sessionTtlMs) || DEFAULT_SESSION_TTL_MS));
    await query(
      "INSERT INTO eclipse_dashboard_sessions (session_hash, account_id, expires_at) VALUES ($1, $2, $3)",
      [hashToken(token), account.id, expiresAt]
    );
    return {
      token,
      expiresAt: expiresAt.toISOString(),
      account: { id: account.id, email: account.email, role: account.role, status: account.status },
    };
  }

  async function authenticate(token) {
    const rawToken = String(token || "").trim();
    if (rawToken.length < 40 || rawToken.length > 100) return null;
    const result = await query(`
      SELECT a.id, a.email, a.role, a.status, s.id AS session_id
      FROM eclipse_dashboard_sessions s
      JOIN eclipse_dashboard_accounts a ON a.id = s.account_id
      WHERE s.session_hash = $1 AND s.revoked_at IS NULL
        AND s.expires_at > to_timestamp($2 / 1000.0) AND a.status = 'active'
      LIMIT 1
    `, [hashToken(rawToken), now()]);
    const account = result.rows?.[0];
    if (!account) return null;
    await query("UPDATE eclipse_dashboard_sessions SET last_seen_at = to_timestamp($2 / 1000.0) WHERE id = $1", [account.session_id, now()]);
    return { id: account.id, email: account.email, role: account.role, status: account.status };
  }

  async function revokeSession(token) {
    const rawToken = String(token || "").trim();
    if (rawToken.length < 40 || rawToken.length > 100) return false;
    const result = await query(
      "UPDATE eclipse_dashboard_sessions SET revoked_at = to_timestamp($2 / 1000.0) WHERE session_hash = $1 AND revoked_at IS NULL",
      [hashToken(rawToken), now()]
    );
    return Number(result.rowCount || 0) > 0;
  }

  async function revokeAllSessions(accountId) {
    const result = await query(
      "UPDATE eclipse_dashboard_sessions SET revoked_at = to_timestamp($2 / 1000.0) WHERE account_id = $1 AND revoked_at IS NULL",
      [accountId, now()]
    );
    return Number(result.rowCount || 0);
  }

  return { ensureSchema, bootstrapOwner, listAccounts, updateAccount, createInvitation, listInvitations, revokeInvitation, redeemInvitation, login, authenticate, revokeSession, revokeAllSessions };
}

module.exports = {
  createDashboardAccess,
  createOpaqueToken,
  hashToken,
  hashPassword,
  verifyPassword,
  normalizeEmail,
};
