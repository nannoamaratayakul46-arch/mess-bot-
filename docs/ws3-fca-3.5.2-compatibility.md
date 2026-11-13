# ws3-fca 3.5.2 compatibility audit

This document records the compatibility boundary for the main bot migration from ws3-fca 2.0.1 to 3.5.2. The bot keeps its existing internal callback contracts where that avoids a risky repository-wide rewrite; the compatibility layer translates the current library's Promise results at the boundary.

## Version-specific transport calls

- Login receives the restored cookie/app-state data as `{ appState: loginInput }`; the login invocation's Promise rejection is observed in addition to the callback path.
- Standard `sendMessage` is called with `(message, threadID, replyToMessageID, isSingleUser)`.
- Private `sendMessageMqtt` is called with `(message, threadID, replyToMessageID)`; its Promise is bridged into the Traffic Governor's error-first callback exactly once.
- Group messages remain on standard `sendMessage`; explicit group classification is preserved.
- `setMessageReaction` returns a Promise in 3.5.2. `setMessageReactionMqtt` is a synchronous publish method: it throws when MQTT is unavailable and otherwise returns `undefined`; the shared adapter reports publish acceptance separately from server acknowledgement. The guarded API proxy preserves callback compatibility for older internal consumers.
- `editMessage` queue processing accepts either callback completion or Promise settlement.
- `sendTypingIndicator` accepts callback and Promise completion.
- Group nickname updates use ws3-fca 3.5.2's `api.nickname(nickname, threadID, participantID)` instead of the removed legacy `changeNickname` name.
- Group-name updates use `api.gcname(newName, threadID)` instead of the removed legacy `setTitle` name; both normal and cycling locks share this adapter.
- Group-photo updates use the authenticated upload transport exposed through `api.defaultFuncs` and `api.ctx`, because ws3-fca 3.5.2 does not export `changeGroupImage`.
- Group-admin role changes use `api.gcrule("admin"|"unadmin", userID, threadID)`. The compatibility adapter checks `error_gc_rule` results and polls fresh `getThreadInfo().adminIDs` before reporting the role change as verified.
- Member-name resolution retries generic payload placeholders through the separate profile-page lookup mode, while leaving genuinely unavailable names explicitly unresolved.

## Existing lookup and moderation compatibility

The following call paths already handle Promise-returning methods as well as callback completion:

- User lookups: `autoWelcome.js`, `games.js`, `triggers.js`, `targetName.js`, and `memberNameResolver.js`.
- Thread lookups: `messengerThreadList.js`, `moderation.js`, `temporaryGroupAdmins.js`, and `groupProfileRoutes.js`.
- Group membership add/remove operations—including dashboard group leave, manual moderation, AutoMod, and Raid Shield approval—use the 3.5.2 `api.gcmember(action, userIDs, threadID)` method through the shared adapter, with a bounded timeout and `error_gc` handling. The old `addUserToGroup` and `removeUserFromGroup` names are not exported by this package.
- Group-admin promotion/demotion is exposed by ws3-fca 3.5.2 through `api.gcrule("admin"|"unadmin", userID, threadID)`. The adapter verifies the resulting role using fresh `getThreadInfo().adminIDs`; an MQTT publish or `gc_rule_update` alone is not treated as confirmation. Dashboard temporary-admin records remain internal bot permissions and do not promote a member to Messenger group-admin status. Sensitive-admin restoration and spam escalation use this verified role-change path, and never substitute a kick for a failed demotion.
- Message editing: `index.js`, `exam-manager.js`, `games.js`, and `investigations/index.js`.

## Legacy patch removal

The former 2.0.1 source-rewriting helper and its package-parser fixture tests are removed from this migration branch. The postinstall now only validates the installed 3.5.2 package and does not modify dependency source files.

## Shared feature compatibility layer

Added `messengerApiCompat.js` as a single boundary for feature modules. It sends raw ws3-fca 3.5.2 group messages using the Promise signature `sendMessage(message, threadID, replyToMessageID, false)`, while preserving the Traffic Governor proxy callback contract when the guarded API is supplied. The same helper handles Promise/callback edit and reaction paths with single-settlement timeouts. Group-admin role changes use `gcrule` and are not reported successful until the updated role appears in fresh group info.

Migrated feature call sites include Burst & Roast, Games, Exams, Auto Welcome, Live Chat, Slots, Investigations, moderation, AntiSpam, picture delivery, and the shared reply utility. Attachment sends receive a longer timeout so the helper does not abandon a queued upload before the Traffic Governor's delivery window.

## Safety and verification boundaries

- The bot continues to use a personal account session; this change does not enable Page mode.
- The existing single-listener invariant remains enforced.
- No group-send path is redirected to the private MQTT path.
- Automated compatibility checks do not establish successful Facebook authentication or recipient-side delivery. Those still require a controlled live test using a separate service/session.
- This audit does not claim that Facebook's current login rejection or HTTP 404 behavior is fixed by a package upgrade.


## Additional regression hardening

- Group-photo restoration in the nickname guard now uses the same authenticated compatibility upload path as group-profile routes; no active nickname-guard path calls the removed `api.changeGroupImage()` method.
- Targeted laugh reactions and PM Battles use the shared MQTT reaction adapter so synchronous MQTT publish semantics are handled consistently.
- The compatibility audit checks for the removed group-photo and group-membership method names in active call paths.
- A Node.js 22 GitHub Actions workflow runs `npm ci` and `npm run verify` for pull requests targeting `main`.
