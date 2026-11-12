# ws3-fca 3.5.2 compatibility audit

This document records the compatibility boundary for the main bot migration from ws3-fca 2.0.1 to 3.5.2. The bot keeps its existing internal callback contracts where that avoids a risky repository-wide rewrite; the compatibility layer translates the current library's Promise results at the boundary.

## Version-specific transport calls

- Login receives the restored cookie/app-state data as `{ appState: loginInput }`; the login invocation's Promise rejection is observed in addition to the callback path.
- Standard `sendMessage` is called with `(message, threadID, replyToMessageID, isSingleUser)`.
- Private `sendMessageMqtt` is called with `(message, threadID, replyToMessageID)`; its Promise is bridged into the Traffic Governor's error-first callback exactly once.
- Group messages remain on standard `sendMessage`; explicit group classification is preserved.
- `setMessageReaction` and `setMessageReactionMqtt` are Promise-based in 3.5.2. The guarded API proxy bridges their results to existing callback consumers.
- `editMessage` queue processing accepts either callback completion or Promise settlement.
- `sendTypingIndicator` accepts callback and Promise completion.

## Existing lookup and moderation compatibility

The following call paths already handle Promise-returning methods as well as callback completion:

- User lookups: `autoWelcome.js`, `games.js`, `triggers.js`, `targetName.js`, and `memberNameResolver.js`.
- Thread lookups: `messengerThreadList.js`, `moderation.js`, `temporaryGroupAdmins.js`, and `groupProfileRoutes.js`.
- Membership operations: `antiSpam.js` and `moderation.js`.
- Message editing: `index.js`, `exam-manager.js`, `games.js`, and `investigations/index.js`.

## Legacy patch removal

The former 2.0.1 source-rewriting helper and its package-parser fixture tests are removed from this migration branch. The postinstall now only validates the installed 3.5.2 package and does not modify dependency source files.

## Shared feature compatibility layer

Added `messengerApiCompat.js` as a single boundary for feature modules. It sends raw ws3-fca 3.5.2 group messages using the Promise signature `sendMessage(message, threadID, replyToMessageID, false)`, while preserving the Traffic Governor proxy callback contract when the guarded API is supplied. The same helper handles Promise/callback edit and reaction paths with single-settlement timeouts.

Migrated feature call sites include Burst & Roast, Games, Exams, Auto Welcome, Live Chat, Slots, Investigations, moderation, AntiSpam, picture delivery, and the shared reply utility. Attachment sends receive a longer timeout so the helper does not abandon a queued upload before the Traffic Governor's delivery window.

## Safety and verification boundaries

- The bot continues to use a personal account session; this change does not enable Page mode.
- The existing single-listener invariant remains enforced.
- No group-send path is redirected to the private MQTT path.
- Automated compatibility checks do not establish successful Facebook authentication or recipient-side delivery. Those still require a controlled live test using a separate service/session.
- This audit does not claim that Facebook's current login rejection or HTTP 404 behavior is fixed by a package upgrade.
