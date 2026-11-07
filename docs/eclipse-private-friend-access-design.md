# ECLIPSE Private Friend Access — Implementation Design

Status: design proposal; no runtime behavior changes in this change.

## Goals

Allow the ECLIPSE owner to invite selected friends to the existing dashboard while keeping bot credentials and the current shared dashboard API key out of friend browsers. Support individual revocation and server-enforced roles.

Non-goals:
- Public self-registration.
- Giving friends the Messenger session, Render credentials, Neon credentials, or dashboard API key.
- Treating CORS, a hidden UI button, or a hard-to-guess URL as authentication.
- Changing Messenger bot behavior or existing group permissions.

## Current security boundary

The dashboard frontend currently asks for the shared dashboard API key and stores it in `sessionStorage`. It sends that key in `X-ECLIPSE-DASHBOARD-KEY` requests directly to the bot API. The bot API's `dashboardSecurity.js` validates the shared key, checks allowed origins, and rate-limits failed key attempts.

This proves possession of one shared secret, not the identity of a person. Any friend given that key can make requests allowed to the dashboard key. Therefore do not distribute the current key or ship a client-only role selector.

## Target architecture

The bot service becomes the authentication authority because it already owns the protected dashboard API and database connection.

1. Owner bootstrap: retain the existing shared key as a temporary owner-only bootstrap credential during migration. It must never be embedded in a friend build or returned by an endpoint.
2. Invite: owner creates a one-time invitation with a role and expiry. Generate a cryptographically random token; store only its SHA-256 hash, expiry, role, creator, and used/revoked timestamps.
3. Redeem: friend opens the invite, sets an account credential, and redeems the token once. Do not accept a role or owner flag from the browser during redemption.
4. Login: authenticate a named account with a modern password hash (Argon2id preferred; use a maintained, supported implementation already compatible with the runtime). Apply per-account and per-IP rate limits and generic failure messages.
5. Session: issue a cryptographically random opaque session token in a Secure, HttpOnly, SameSite cookie. Store only a hash of the token in the database. Rotate on login and privilege changes. Enforce absolute and idle expiry. Never place session tokens in localStorage, sessionStorage, URLs, or logs.
6. Authorization: resolve the active account and role on every protected request. Enforce permissions in backend route middleware, not just React rendering.
7. Revocation: owner can disable an account, revoke all its sessions, and revoke outstanding invitations. Logout revokes the current session.
8. Audit: record actor, action, target, timestamp, and outcome for invitation, account, session, and privileged bot-control events. Never log credentials, raw invitation tokens, cookies, or the dashboard key.

## Roles and least privilege

- Owner: manage invitations, accounts, roles, revocations, and all dashboard capabilities.
- Operator: use explicitly approved operational controls; no account administration, secret/session management, license administration, or destructive owner-only settings by default.
- Viewer: read-only dashboard data. All write endpoints must reject Viewer requests server-side.

Create a centralized permission map (e.g. `dashboard:read`, `bot:operate`, `groups:configure`, `moderation:review`, `accounts:manage`, `secrets:manage`). Map each route to one or more permissions. Default-deny any route not explicitly classified. Destructive and irreversible actions should be Owner-only unless separately reviewed.

## Proposed API surface

All endpoints are same bot origin and use JSON except cookie-based session handling.

- `POST /api/access/login` — authenticate account, issue session cookie.
- `POST /api/access/logout` — revoke current session and clear cookie.
- `GET /api/access/me` — return account id, display name, role, and effective permissions (never secrets).
- `POST /api/access/invitations` — Owner-only; create invite with role and expiry; return raw invite token exactly once.
- `GET /api/access/invitations` — Owner-only; list invite metadata without token hashes or raw tokens.
- `POST /api/access/invitations/redeem` — validate one-time invite and create account.
- `GET /api/access/accounts` — Owner-only; list account metadata.
- `PATCH /api/access/accounts/:id` — Owner-only; change role or disable account; changing role/disabled state revokes existing sessions.
- `DELETE /api/access/invitations/:id` — Owner-only; revoke unused invite.
- `POST /api/access/sessions/revoke-all` — Owner-only; revoke all sessions for a selected account.

Avoid returning the raw invitation token after its initial creation response. Invitation links should use a short-lived, single-use token and must not contain account passwords or role overrides.

## Database model (PostgreSQL / Neon)

Use additive migrations and transactions. Suggested tables:

- `eclipse_dashboard_accounts`: id, normalized_email (unique), display_name, password_hash, role, status, created_at, updated_at, last_login_at.
- `eclipse_dashboard_invitations`: id, token_hash (unique), normalized_email, role, expires_at, created_by_account_id, redeemed_at, revoked_at, created_at.
- `eclipse_dashboard_sessions`: id, account_id, token_hash (unique), created_at, last_seen_at, expires_at, revoked_at, user_agent_hash (optional), ip_prefix_hash (optional).
- `eclipse_dashboard_access_audit`: id, actor_account_id, action, target_type, target_id, outcome, metadata JSONB (allowlisted fields only), created_at.

Add indexes for token hashes, normalized email, active sessions by account, invitation expiry, and audit chronology. Enforce role/status constraints in SQL where practical. Never store plaintext passwords, invite tokens, or session tokens.

## Browser and CSRF protections

- Use HTTPS only; cookies must be Secure and HttpOnly in production.
- Use SameSite=Lax or Strict based on the actual navigation flow. If cross-site deployment requires SameSite=None, require Secure and implement strict CSRF protection.
- Because the dashboard UI and bot API may be on separate origins, configure an exact origin allowlist and credentialed CORS only for the dashboard origin. Never use wildcard origins with credentials.
- Protect state-changing cookie-authenticated requests with a CSRF token (synchronizer token or robust double-submit pattern) plus Origin/Referer validation. OPTIONS preflight must not mutate state.
- Set no-store on authentication, account, invitation, and session responses.
- Keep API keys and session cookies out of service-worker caches. The PWA should never cache API/auth responses.
- Apply Content Security Policy and existing security headers after verifying current app requirements.

## Migration and compatibility

1. Add the account/session system behind a disabled-by-default feature flag. Existing shared-key access continues for the owner during implementation and staging.
2. Bootstrap the first Owner account through a one-time server-side operation requiring the existing high-entropy dashboard key; never expose a public first-user registration route.
3. Verify every dashboard API route is classified and protected by the new auth/permission middleware.
4. Update the dashboard frontend to use cookie sessions and `/api/access/me`; remove the key-entry UI and all client-side handling of `ECLIPSE_DASHBOARD_API_KEY` only after the session API is deployed and verified.
5. Validate Owner, Operator, Viewer, disabled account, expired invite, reused invite, expired session, revoked session, CSRF failure, wrong origin, and rate-limit cases.
6. Only after production validation, disable legacy shared-key access for browser dashboard requests. Keep any machine-to-machine key path separately scoped and server-side.
7. Rotate the existing shared key if it has ever been shared with friends or exposed in browser storage, screenshots, logs, or source.

Do not run an irreversible migration or remove the legacy path until a rollback plan and owner recovery path are tested.

## Acceptance criteria

- No friend browser receives the legacy dashboard API key.
- A Viewer cannot perform any write operation by calling the API directly.
- An Operator cannot manage accounts, invitations, secrets, or Owner-only actions.
- Revoking an account or session takes effect on the next protected request.
- Invitation tokens are single-use, expire, and are stored hashed.
- Passwords and tokens are never logged or returned by account-list endpoints.
- CSRF and origin tests pass for all state-changing session-authenticated routes.
- Existing bot functionality and the current owner workflow remain intact during staged migration.
- Automated tests cover all permission decisions and negative authorization cases.

## Deployment safety

This document is a design checkpoint only. Implementation must be split into reviewable backend and frontend PRs. No merge, production deployment, credential rotation, database migration, or environment-variable change is authorized by this document.
