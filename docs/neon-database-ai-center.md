# Neon Database Center and AI settings

## Render environment

Set these variables on the **bot service** in Render:

- `ECLIPSE_SETTINGS_ENCRYPTION_KEY`: a random 32-byte encryption key. Generate one locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Keep it only in Render's private environment settings; never commit it or paste it into the dashboard.
- `NEON_API_KEY`, `NEON_PROJECT_ID`, and `NEON_ORG_ID` (optional): enable billed usage metrics from the Neon consumption API on supported plans (Launch, Scale, Agent, Business, or Enterprise). Neon may return HTTP 403 on the Free plan; the database health, size, connection, table, and record tools do not require these variables when the database is reachable.

The database center and AI settings are served by the existing authenticated bot API and reuse `ECLIPSE_DASHBOARD_API_KEY`. API keys are encrypted with AES-256-GCM before storage in Neon. The encryption key is never sent to the browser. Provider keys are never returned by the settings API and are never written to browser storage.

Supported AI providers: Groq, OpenAI, Google Gemini, and Anthropic. Configure the provider, model, API key, and enabled state from Operations → Database & AI. A blank API-key field preserves the saved key; use the clear-key control to remove it. Use “Test provider” after saving.

## Database inspection safeguards

- Inspection is read-only and limited to the `public` schema.
- Table row previews are capped at 50 records per request; offsets are bounded.
- Session/auth/credential/secret/token/cookie/API-key tables are blocked.
- Columns with names indicating credentials, tokens, sessions, encryption, or secrets are redacted.
- Neon billed usage metrics are cached for 15 minutes; the dashboard does not poll this data in the background.

## Important quota note

This feature does not bypass a Neon plan's network-transfer or compute limits. If Neon has suspended or restricted the project, the dashboard reports the failure and avoids repeated polling; resolve the quota in Neon Console → Billing → Usage or wait for the plan reset.

## Storage breakdown and history

- The table list reports total relation size, main table size, index size, and the remaining TOAST/auxiliary estimate.
- The per-table **Storage** action uses PostgreSQL statistics (`avg_width × estimated live rows`) to estimate each column's data contribution. Estimates are not exact disk allocation and may be stale until PostgreSQL runs `ANALYZE`; do not treat them as a sum that must equal the table size.
- On the first successful database overview, the backend creates a separate `dashboard_monitoring` schema and records database/table size snapshots at most every six hours. Snapshots are retained for 30 days and older snapshots are automatically removed. This schema is excluded from the public-schema table inspector.
- The growth panel ranks tables by observed size change between their oldest and latest retained snapshots. History starts only after deployment and cannot reconstruct earlier growth. A restarted service may record a snapshot sooner than six hours after a previous process's snapshot.
- Snapshot writes are intentionally low frequency. If the database is quota-suspended, no snapshot can be recorded until it is reachable again.
