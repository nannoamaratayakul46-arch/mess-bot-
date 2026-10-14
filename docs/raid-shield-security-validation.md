# Raid Shield Security and Production Validation

This checklist documents the security boundary and the production checks required before relying on Raid Shield for moderation actions.

## Authentication model

- Dashboard API routes are protected by `requireDashboardAccess` and the shared `ECLIPSE_DASHBOARD_API_KEY`.
- The current shared-key model authenticates possession of the dashboard key, not an individual human administrator.
- Raid Shield records `authenticated_dashboard` as the reviewer label. Do not interpret it as a verified person, account, or individual-admin identity.
- Do not accept a reviewer name or administrator ID from request JSON as proof of identity. Per-admin attribution requires a trusted identity provider/session and a server-verified identity claim.
- Keep the dashboard key only in server-side configuration and the dashboard's intended secret configuration. Rotate it immediately if it appears in logs, source control, screenshots, or an exposed URL.
- Send credentials only in the `Authorization: Bearer` or `X-ECLIPSE-DASHBOARD-KEY` header. Query-string authentication is rejected because URLs can leak through browser history, proxy logs, analytics, and referrer handling. The dashboard uses authenticated polling for events instead of placing its key in an EventSource URL.
- Configure `ECLIPSE_DASHBOARD_ORIGIN` to the exact trusted dashboard origin rather than `*` for production. CORS is not authentication and does not prevent non-browser clients from calling the API.


- The controller must confirm the live API exposes either `changeThreadApprovalMode(threadID, enabled)` or the legacy `changeGroupApprovalMode(enabled, threadID)`, plus at least one of `getThreadInfo` or `getThreadList`, before changing settings. It must require a boolean `approvalMode` from the selected group record.
- A confirmed join burst is 5 joins in 30 seconds. When the feature is enabled and Messenger approval was OFF, the controller enables it and stores the prior state plus a two-minute quiet-period restore deadline.
- If approval was already ON before the burst, the controller must not claim ownership or automatically turn it OFF later.
- Verify persistent setting and audit rows in `raid_shield_approval_mode` and `raid_shield_approval_mode_audit`. Simulate missing API methods, read failures, failed writes, restart recovery, a quiet-period restore, and a manual override.

## Approval safety

- A removal proposal is not an instruction to remove a member. It must remain pending until an authenticated dashboard reviewer approves it.
- Approval state transitions must be conditional on the action still being pending and scoped to the expected group/thread.
- If Messenger times out or database finalization fails after an approval attempt, preserve an explicit uncertain state/note. Do not mark it definitively failed or blindly retry the removal.
- Before retrying an uncertain action, verify current membership in Messenger and reconcile the action record.
- Never treat Raid Shield's local lockdown flag as a Messenger permission change; it is a temporary application-side protection state only.

## Production validation checklist

Perform these checks in a staging group first, then repeat a small controlled subset in production.

- [ ] Confirm the deployed backend commit SHA matches the intended reviewed commit.
- [ ] Confirm database connectivity and that Raid Shield tables/indexes can be created or migrated with the production database role.
- [ ] Confirm missing `ECLIPSE_DASHBOARD_API_KEY` fails closed with HTTP 503.
- [ ] Confirm missing/wrong dashboard credentials fail with HTTP 401, while a valid key can access only known groups.
- [ ] Confirm group IDs and action IDs are scoped together; an action from one group cannot be reviewed through another group's route.
- [ ] Confirm duplicate review attempts do not transition an already-reviewed action.
- [ ] In a test group, approve one proposed removal and verify the member's actual membership plus the persisted terminal action status.
- [ ] Simulate or safely induce an API timeout/response loss and confirm the UI shows the uncertainty note; reconcile membership before any retry.
- [ ] Confirm rejection never calls the Messenger removal operation.
- [ ] Confirm lockdown expiry and release survive the expected restart/reload path.
- [ ] Confirm the dashboard displays the stored review note and timestamps.
- [ ] Verify logs contain useful action/group identifiers but no API keys, cookies, or message contents.
- [ ] Record the exact tested commit, database migration outcome, and test group used.

## Not proven by repository CI

Passing unit tests and dashboard builds do not prove production environment variables, schema permissions, real Messenger event payloads, network/API timeout behavior, restart recovery, or live group membership behavior. Those require environment-level testing. Do not claim the feature is production-validated until the checklist results are recorded.
