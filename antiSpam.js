"use strict";

const { createRaidShield } = require("./raidShield");
const { createRaidShieldStore } = require("./raidShieldStore");

const express = require("express");
const { getAutoModSettings, setAutoModEnabled, removeFromGroup, isAdmin, isBotOwner } = require("./moderation");
const { resolveMemberName, idOf } = require("./memberNameResolver");

const DEFAULTS = Object.freeze({
  max_messages: 6,
  window_seconds: 8,
  repeat_max: 4,
  warn_first: true,
  warn_grace_seconds: 120,
  warn_text: "{{name}}, slow down. Spamming again within 2 minutes will get you removed.",
  sensitive_admin_enabled: true,
  profile_abuse_enabled: true,
});

const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
};
const norm = value => String(value || "").toLowerCase().replace(/\s+/g, " ").trim();

function callbackCall(invoke, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, data) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(data);
    };
    const timer = setTimeout(() => finish(new Error("Messenger API timed out")), timeoutMs);
    try {
      const result = invoke((error, data) => finish(error, data));
      if (result && typeof result.then === "function") {
        result.then(data => finish(null, data), error => finish(error));
      }
    } catch (error) {
      finish(error);
    }
  });
}

function createAntiSpam({ db, getApi = () => null, isKnownGroup = () => true, log = () => {}, getSettings = getAutoModSettings, setEnabled = setAutoModEnabled, isBotOwnerId = isBotOwner, removeFromGroupFn = removeFromGroup }) {
  if (!db || typeof db.query !== "function") throw new TypeError("antiSpam requires the persistent db query interface");

  const hits = new Map();
  const queues = new Map();
  const removalFailures = new Map();
  const raidShieldStore = createRaidShieldStore(db, { retentionDays: 7 });
  const raidShield = createRaidShield({
    persistIncident: incident => raidShieldStore.persistIncident(incident),
    persistState: state => raidShieldStore.persistState(state),
    onIncident: async incident => {
      log(`[AUTOMOD-RAID] ${incident.severity} signal=${incident.event_type} group=${incident.thread_id} score=${incident.score}`);
      const targetID = String(incident.evidence?.sender_id || "").trim();
      if (targetID && ["elevated", "lockdown"].includes(incident.severity)) {
        try {
          await raidShieldStore.proposeAction({ thread_id: incident.thread_id, target_id: targetID, reason: "risk_signal:" + incident.event_type, proposed_by: "raid_shield" });
          log("[AUTOMOD-RAID] elevated risk queued for admin review in group " + incident.thread_id);
        } catch (error) {
          log("[AUTOMOD-RAID] could not queue review action: " + String(error?.message || error).slice(0, 140));
        }
      }
    },
  });
  let schemaPromise = null;
  let raidShieldReadyPromise = null;

  async function ensureRaidShieldReady() {
    if (!raidShieldReadyPromise) {
      raidShieldReadyPromise = (async () => {
        const states = await raidShieldStore.loadStates({ limit: 1000 });
        raidShield.restoreStates(states);
        await raidShieldStore.prune();
      })().catch(error => { raidShieldReadyPromise = null; throw error; });
    }
    return raidShieldReadyPromise;
  }

  async function ensureTables() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await db.query(`
          CREATE TABLE IF NOT EXISTS automod_spam_settings (
            thread_id TEXT PRIMARY KEY,
            max_messages INTEGER NOT NULL DEFAULT 6,
            window_seconds INTEGER NOT NULL DEFAULT 8,
            repeat_max INTEGER NOT NULL DEFAULT 4,
            warn_first BOOLEAN NOT NULL DEFAULT TRUE,
            warn_grace_seconds INTEGER NOT NULL DEFAULT 120,
            warn_text TEXT NOT NULL DEFAULT '{{name}}, slow down. Spamming again within 2 minutes will get you removed.',
            sensitive_admin_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            profile_abuse_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        await db.query("ALTER TABLE automod_spam_settings ADD COLUMN IF NOT EXISTS sensitive_admin_enabled BOOLEAN NOT NULL DEFAULT TRUE");
        await db.query("ALTER TABLE automod_spam_settings ADD COLUMN IF NOT EXISTS profile_abuse_enabled BOOLEAN NOT NULL DEFAULT TRUE");
        await db.query(`
          CREATE TABLE IF NOT EXISTS automod_spam_warnings (
            thread_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            warned_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (thread_id, user_id)
          )
        `);
        await db.query("CREATE INDEX IF NOT EXISTS idx_automod_spam_warnings_time ON automod_spam_warnings(warned_at)");
        await db.query(`
          CREATE TABLE IF NOT EXISTS automod_profile_abuse_events (
            id BIGSERIAL PRIMARY KEY,
            thread_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            event_key TEXT NOT NULL,
            event_type TEXT NOT NULL,
            created_at BIGINT NOT NULL,
            UNIQUE(thread_id, event_key)
          )
        `);
        await db.query("CREATE INDEX IF NOT EXISTS idx_automod_profile_abuse_recent ON automod_profile_abuse_events(thread_id, user_id, created_at)");
      })().catch(error => {
        schemaPromise = null;
        throw error;
      });
    }
    return schemaPromise;
  }

  async function getConfig(threadID) {
    await ensureTables();
    const result = await db.query(
      "SELECT max_messages, window_seconds, repeat_max, warn_first, warn_grace_seconds, warn_text, sensitive_admin_enabled, profile_abuse_enabled FROM automod_spam_settings WHERE thread_id = $1",
      [String(threadID)],
    );
    return { ...DEFAULTS, ...(result.rows[0] || {}) };
  }

  async function sendMessage(api, threadID, text) {
    if (!api || typeof api.sendMessage !== "function") throw new Error("sendMessage is unavailable");
    await callbackCall(cb => api.sendMessage(text, threadID, cb), 12000);
  }

  async function removeMember(api, threadID, userID, name) {
    const failureKey = threadID + ":" + userID;
    const lastFailure = removalFailures.get(failureKey) || 0;
    if (Date.now() - lastFailure < 30000) return false;

    if (typeof removeFromGroupFn !== "function") {
      log("[AUTOMOD-SPAM] shared moderation removal helper is unavailable");
      removalFailures.set(failureKey, Date.now());
      return false;
    }

    let removal;
    try {
      // Use moderation.js as the single source of truth for role checks,
      // protected-admin handling, API timeouts, and Messenger error details.
      removal = await removeFromGroupFn(api, String(threadID), String(userID));
    } catch (error) {
      removalFailures.set(failureKey, Date.now());
      log(`[AUTOMOD-SPAM] shared removal helper failed for ${userID} in ${threadID}: ${String(error?.message || error).slice(0, 180)}`);
      return false;
    }

    if (
      !removal?.ok &&
      (
        String(removal?.errorCode || "") === "TARGET_IS_GROUP_ADMIN" ||
        /target is a group admin/i.test(String(removal?.errorMessage || ""))
      ) &&
      !isBotOwner(userID) &&
      !isAdmin(userID) &&
      api &&
      typeof api.changeAdminStatus === "function"
    ) {
      // Repeated-spam escalation for a group-admin spammer. Never demote the
      // configured bot owner or a trusted bot admin; only act in this group.
      try {
        await callbackCall(cb => api.changeAdminStatus(String(threadID), String(userID), false, cb), 12000);
        log(`[AUTOMOD-SPAM] Demotion request succeeded for spammer ${userID} in ${threadID}; retrying removal.`);
        removal = await removeFromGroupFn(api, String(threadID), String(userID));
      } catch (error) {
        removalFailures.set(failureKey, Date.now());
        log(`[AUTOMOD-SPAM] admin-spammer demotion/removal failed for ${userID} in ${threadID}: ${String(error?.message || error).slice(0, 180)}`);
        return false;
      }
    }

    if (!removal?.ok) {
      removalFailures.set(failureKey, Date.now());
      const detail = String(removal?.errorMessage || removal?.errorCode || "Unknown removal failure").slice(0, 180);
      log(`[AUTOMOD-SPAM] removal failed for ${userID} in ${threadID}: ${detail}`);
      return false;
    }

    try {
      await db.query(
        "DELETE FROM automod_spam_warnings WHERE thread_id = $1 AND user_id = $2",
        [String(threadID), String(userID)],
      );
      hits.delete(threadID + ":" + userID);
      removalFailures.delete(failureKey);
      log(`[AUTOMOD-SPAM] removed ${userID} (${name}) from ${threadID} after repeated spam`);
      return true;
    } catch (error) {
      // The Messenger removal already succeeded. Log cleanup failure separately
      // rather than reporting that the kick itself failed.
      log(`[AUTOMOD-SPAM] removed ${userID} from ${threadID}, but warning cleanup failed: ${String(error?.message || error).slice(0, 160)}`);
      return true;
    }
  }

  async function processMessage(api, event) {
    const threadID = String(event?.threadID || "").trim();
    const eventType = String(event?.type || "").toLowerCase();
    const reactionEvent = ["message_reaction", "messagereactionadd", "reaction"].includes(eventType);
    // Reactions are interactions with existing messages, not chat messages.
    // Ignore them before they can affect either the spam counter or Raid Shield.
    if (reactionEvent) return;
    const userID = String(
      (reactionEvent ? event?.userID ?? event?.senderID : event?.senderID ?? event?.userID) ??
      event?.authorID ?? ""
    ).trim();
    const bodyText = String(event?.body || "").trim();
    const attachments = Array.isArray(event?.attachments) ? event.attachments : [];
    const sticker = attachments.find(item =>
      String(item?.type || item?.attachmentType || "").toLowerCase() === "sticker" ||
      Boolean(item?.stickerID || item?.stickerId || item?.packID && item?.spriteUrl)
    );
    const isSticker = Boolean(sticker);
    // Only text messages and sticker-only messages are spam candidates.
    // Reactions have already been excluded above.
    const text = bodyText ||
      (isSticker ? "[sticker:" + String(sticker?.ID ?? sticker?.id ?? sticker?.stickerID ?? sticker?.stickerId ?? "unknown") + "]" : "");
    if (!threadID || !userID || !text) return;
    if (typeof api?.getCurrentUserID === "function" && userID === String(api.getCurrentUserID())) return;

    const autoSettings = await getSettings(threadID);
    if (autoSettings?.enabled !== true) return;

    // Raid Shield augments the existing AutoMod signal path. Existing warning
    // and removal policy below remains authoritative; this layer never kicks.
    try {
      await ensureRaidShieldReady();
      await raidShield.observeMessage({
        threadID,
        senderID: userID,
        body: text,
        isTrustedAdmin: isAdmin(userID) || isBotOwnerId(userID),
        isBot: false,
      });
    } catch (error) {
      log(`[AUTOMOD-RAID] signal processing failed in ${threadID}: ${String(error?.message || error).slice(0, 160)}`);
    }

    const cfg = await getConfig(threadID);
    const now = Date.now();
    const key = threadID + ":" + userID;
    const windowMs = cfg.window_seconds * 1000;
    const list = (hits.get(key) || []).filter(hit => now - hit.at < windowMs * 2);
    const cleanText = norm(text);
    const spamSignature = cleanText
      .replace(/[!?.,;:…]+/g, "")
      .replace(/\\s+/g, " ")
      .trim();

    list.push({ at: now, text: spamSignature });
    hits.set(key, list);

    // Emit a low-volume breadcrumb when a member starts a fresh spam window,
    // so a missing threshold/action can be distinguished from a missing event
    // listener without logging every ordinary message.
    if (list.length === 1) {
      log(`[AUTOMOD-SPAM] monitoring member ${userID} in ${threadID}; threshold=${cfg.max_messages} messages/${cfg.window_seconds}s, repeat=${cfg.repeat_max}`);
    }

    const burstCount = list.filter(hit => now - hit.at < windowMs).length;
    // High message volume alone is normal conversation. Enforcement requires
    // the same normalized content to recur repeatedly within the configured
    // window; punctuation/case/spacing variations share one signature.
    const repeatedCount = spamSignature
      ? list.filter(hit => now - hit.at < windowMs && hit.text === spamSignature).length
      : 0;
    hits.set(key, list);
    const repeated = repeatedCount >= cfg.repeat_max;
    if (!repeated) return;

    log(`[AUTOMOD-SPAM] repeated-message threshold reached for ${userID} in ${threadID}: repeated=${repeatedCount}/${cfg.repeat_max}, totalInWindow=${burstCount}`);
    hits.set(key, []);
    const warningResult = await db.query(
      "SELECT warned_at FROM automod_spam_warnings WHERE thread_id = $1 AND user_id = $2",
      [threadID, userID],
    );
    const warnedAt = warningResult.rows[0]?.warned_at ? new Date(warningResult.rows[0].warned_at).getTime() : 0;
    const warnedRecently = warnedAt > 0 && now - warnedAt < cfg.warn_grace_seconds * 1000;
    const fallbackName = String(event?.senderName || event?.name || "").trim().slice(0, 60);
    const resolvedName = await resolveMemberName(api, threadID, userID, fallbackName);
    const name = resolvedName || ("Member ····" + userID.slice(-4));

    if (cfg.warn_first && !warnedRecently) {
      await db.query(
        `INSERT INTO automod_spam_warnings(thread_id, user_id, warned_at)
         VALUES($1, $2, NOW())
         ON CONFLICT(thread_id, user_id) DO UPDATE SET warned_at = EXCLUDED.warned_at`,
        [threadID, userID],
      );
      const warning = String(cfg.warn_text || DEFAULTS.warn_text).replace(/\{\{\s*name\s*\}\}/gi, name);
      try {
        await sendMessage(api, threadID, warning);
        log(`[AUTOMOD-SPAM] warned ${userID} in ${threadID}`);
      } catch (error) {
        log(`[AUTOMOD-SPAM] warning send failed in ${threadID}: ${String(error?.message || error).slice(0, 160)}`);
      }
      return;
    }

    const removed = await removeMember(api, threadID, userID, name);
    if (!removed) {
      // Do not claim success or disable automod when Messenger refuses the kick.
      log(`[AUTOMOD-SPAM] kick not completed for ${userID} in ${threadID}; check that the bot is a group admin`);
    }
  }

  const PROFILE_ABUSE_THRESHOLD = 3;
  const PROFILE_ABUSE_WINDOW_MS = 60 * 1000;

  async function processSensitiveAdminEvent(api, event) {
    if (event?.type !== "event") return;

    const eventType = String(event?.logMessageType || "");
    const threadID = String(event?.threadID || "").trim();
    const data = event?.logMessageData && typeof event.logMessageData === "object"
      ? event.logMessageData
      : {};

    if (eventType === "log:unsubscribe" || eventType === "log:thread-admins") {
      const payloadKeys = Object.keys(data).slice(0, 20);
      log(`[AUTOMOD-SENSITIVE] Received group security event: ${JSON.stringify({
        threadID,
        eventType,
        authorPresent: Boolean(event?.author ?? event?.authorID ?? event?.senderID),
        payloadKeys,
        adminEvent: data.ADMIN_EVENT ?? data.admin_event ?? null,
        targetPresent: Boolean(data.TARGET_ID ?? data.target_id),
        removedParticipantPresent: Boolean(
          data.leftParticipantFbId ?? data.leftParticipantID ?? data.leftParticipantId ??
          data.removedParticipantFbId ?? data.removedParticipantID
        )
      })}`);
    }

    // If the configured owner is removed from a group, attempt to re-add them
    // only when the event explicitly identifies the owner as the removed member.
    if (eventType === "log:unsubscribe") {
      const removedID = String(
        data.leftParticipantFbId ?? data.leftParticipantFBID ?? data.leftParticipantID ??
        data.leftParticipantId ?? data.removedParticipantFbId ?? data.removedParticipantFBID ??
        data.removedParticipantID ?? data.removedParticipantId ?? data.TARGET_ID ?? data.target_id ?? ""
      ).trim();
      if (!threadID || !removedID || !isBotOwnerId(removedID)) return;
      const settings = await getSettings(threadID);
      if (settings?.enabled !== true) return;
      const config = await getConfig(threadID);
      if (config.sensitive_admin_enabled !== true) return;
      if (typeof api?.addUserToGroup !== "function") {
        log("[AUTOMOD-SENSITIVE] Owner was removed, but addUserToGroup is unavailable; cannot attempt rejoin.");
        return;
      }
      try {
        await callbackCall(cb => api.addUserToGroup(removedID, threadID, cb), 12000);
        log(`[AUTOMOD-SENSITIVE] Re-add request sent for bot owner ${removedID} to ${threadID} after removal event.`);
        try {
          await sendMessage(api, threadID, "Sensitive AutoMod: the bot owner was removed. A re-add request was sent.");
        } catch (_) {}
      } catch (error) {
        log(`[AUTOMOD-SENSITIVE] Could not re-add bot owner to ${threadID}: ${String(error?.message || error).slice(0, 160)}`);
      }
      return;
    }

    if (eventType !== "log:thread-admins") return;
    const adminEvent = String(data.ADMIN_EVENT || data.admin_event || "").toLowerCase();
    const targetID = String(data.TARGET_ID ?? data.target_id ?? "").trim();
    const actorRaw = event?.author ?? event?.authorID ?? event?.senderID;
    const actorID = idOf(actorRaw) || String(actorRaw ?? "").trim();

    // Diagnostic-only gates: log the failed condition without exposing account IDs.
    // This makes silent early returns actionable while preserving existing safety checks.
    if (!threadID) {
      log("[AUTOMOD-SENSITIVE] Restoration skipped: missing thread ID.");
      return;
    }
    if (adminEvent !== "remove_admin") return;
    if (!targetID) {
      log("[AUTOMOD-SENSITIVE] Restoration skipped: remove_admin event has no target ID.");
      return;
    }
    if (!actorID) {
      log("[AUTOMOD-SENSITIVE] Restoration skipped: remove_admin event has no actor ID.");
      return;
    }
    if (!isBotOwnerId(targetID)) {
      log("[AUTOMOD-SENSITIVE] Restoration skipped: removed admin does not match configured ADMIN_IDS owner (targetIsConfiguredOwner=false). Check ADMIN_IDS and the account ID being demoted.");
      return;
    }
    if (actorID === targetID) {
      log("[AUTOMOD-SENSITIVE] Restoration skipped: actor and target are the same account.");
      return;
    }
    if (isBotOwnerId(actorID)) {
      log("[AUTOMOD-SENSITIVE] Restoration skipped: event actor matches configured bot owner.");
      return;
    }

    const settings = await getSettings(threadID);
    if (settings?.enabled !== true) {
      log(`[AUTOMOD-SENSITIVE] Restoration skipped in ${threadID}: AutoMod settings are not enabled for this thread.`);
      return;
    }
    const config = await getConfig(threadID);
    if (config.sensitive_admin_enabled !== true) {
      log(`[AUTOMOD-SENSITIVE] Restoration skipped in ${threadID}: sensitive_admin_enabled is not true.`);
      return;
    }
    log(`[AUTOMOD-SENSITIVE] Restoration checks passed in ${threadID}; proceeding to verify bot admin status and restore owner.`);
    const actorName = await resolveMemberName(api, threadID, actorID);
    const actorLabel = actorName ? actorName + " (" + actorID + ")" : actorID;

    // This is a targeted remove_admin event for the configured owner. Avoid
    // getThreadInfo/getThreadInfoDeprecated here: ws3-fca currently throws
    // inside those lookups, and reading thread lists would add expensive API work.
    // Request promotion directly; Messenger will reject it if the bot lacks
    // permission or the owner is no longer a participant.
    try {
      if (!api || typeof api.changeAdminStatus !== "function") {
        log("[AUTOMOD-SENSITIVE] Cannot restore owner admin status: changeAdminStatus is unavailable.");
      } else {
        await callbackCall(cb => api.changeAdminStatus(threadID, targetID, true, cb), 12000);
        log(`[AUTOMOD-SENSITIVE] Owner admin restoration request succeeded in ${threadID}.`);
      }
    } catch (error) {
      log(`[AUTOMOD-SENSITIVE] Owner admin restoration failed in ${threadID}: ${String(error?.message || error).slice(0, 160)}`);
    }

    // Optional, narrowly scoped enforcement: demote only the verified event
    // actor in this same group, and never the configured owner or the target.
    // This is opt-in via sensitive_admin_demote_actor_enabled.
    if (
      String(config?.sensitive_admin_demote_actor_enabled ?? process.env.SENSITIVE_ADMIN_DEMOTE_ACTOR_ENABLED ?? "").toLowerCase() === "true" &&
      actorID &&
      actorID !== targetID &&
      !isBotOwnerId(actorID) &&
      api &&
      typeof api.changeAdminStatus === "function"
    ) {
      try {
        await callbackCall(cb => api.changeAdminStatus(threadID, actorID, false, cb), 12000);
        log(`[AUTOMOD-SENSITIVE] Event actor demotion request succeeded in ${threadID}.`);
      } catch (error) {
        log(`[AUTOMOD-SENSITIVE] Event actor demotion failed in ${threadID}: ${String(error?.message || error).slice(0, 160)}`);
      }
    } else {
      log("[AUTOMOD-SENSITIVE] Actor demotion skipped: opt-in is disabled or actor safeguards did not pass.");
    }

    // No cross-thread scans; all actions remain limited to this event's group.
    return;
  }

  async function processGroupProfileEvent(api, event) {
    const eventType = String(event?.logMessageType || "");
    if (event?.type !== "event" || !["log:thread-image", "log:thread-name"].includes(eventType)) return;

    const threadID = String(event?.threadID || "").trim();
    const rawAuthor = event?.author ?? event?.authorID ?? event?.senderID;
    const userID = idOf(rawAuthor) || String(rawAuthor ?? "").trim();
    if (!threadID || !userID) {
      log("[AUTOMOD-PROFILE] Ignored profile change because the group or actor ID was missing.");
      return;
    }

    const botID = String(typeof api?.getCurrentUserID === "function" ? api.getCurrentUserID() : "").trim();
    if ((botID && userID === botID) || isAdmin(userID)) return;

    const settings = await getSettings(threadID);
    if (settings?.enabled !== true) return;
    const config = await getConfig(threadID);
    if (config.profile_abuse_enabled !== true) return;

    await ensureTables();
    const data = event?.logMessageData && typeof event.logMessageData === "object"
      ? event.logMessageData
      : {};
    const messageID = String(
      event?.messageID || event?.messageId || event?.logMessageId ||
      data?.messageID || data?.messageId || ""
    ).trim();
    const timestamp = Number(event?.timestamp || event?.time || data?.timestamp || 0);
    const now = Date.now();
    const fingerprint = messageID
      ? "message:" + messageID
      : [eventType, userID, timestamp || Math.floor(now / 3000), JSON.stringify(data)].join(":").slice(0, 900);

    const inserted = await db.query(
      `INSERT INTO automod_profile_abuse_events(thread_id, user_id, event_key, event_type, created_at)
       VALUES($1, $2, $3, $4, $5)
       ON CONFLICT(thread_id, event_key) DO NOTHING
       RETURNING id`,
      [threadID, userID, fingerprint, eventType, now],
    );
    if (!inserted.rows?.length) return;

    // Keep the table bounded while retaining enough history to diagnose recent actions.
    await db.query(
      "DELETE FROM automod_profile_abuse_events WHERE thread_id = $1 AND created_at < $2",
      [threadID, now - 24 * 60 * 60 * 1000],
    );
    const recent = await db.query(
      "SELECT COUNT(*)::int AS count FROM automod_profile_abuse_events WHERE thread_id = $1 AND user_id = $2 AND created_at >= $3",
      [threadID, userID, now - PROFILE_ABUSE_WINDOW_MS],
    );
    const count = Number(recent.rows?.[0]?.count || 0);
    // Feed confirmed profile-change events into Raid Shield for durable risk
    // history. Existing AutoMod enforcement below remains unchanged.
    try {
      await ensureRaidShieldReady();
      await raidShield.observeProfileChange(threadID, fingerprint, {
        actor_id: userID,
        sender_id: userID,
        event_type: eventType,
        observed_count: count,
        confirmedUnauthorized: false,
      });
    } catch (error) {
      log(`[AUTOMOD-RAID] profile signal failed in ${threadID}: ${String(error?.message || error).slice(0, 140)}`);
    }
    const actorName = await resolveMemberName(api, threadID, userID);
    const actorLabel = actorName ? actorName + " (" + userID + ")" : userID;
    log(`[AUTOMOD-PROFILE] ${actorLabel} made ${count}/${PROFILE_ABUSE_THRESHOLD} group photo/name changes in ${threadID} within 60 seconds.`);
    if (count < PROFILE_ABUSE_THRESHOLD) return;

    const removal = await removeFromGroup(api, threadID, userID);
    if (!removal?.ok) {
      log(`[AUTOMOD-PROFILE] kick not completed for ${actorLabel} in ${threadID}: ${String(removal?.errorMessage || removal?.errorCode || "Unknown removal failure").slice(0, 180)}`);
      return;
    }

    await db.query(
      "DELETE FROM automod_profile_abuse_events WHERE thread_id = $1 AND user_id = $2",
      [threadID, userID],
    );
    log(`[AUTOMOD-PROFILE] removed ${actorLabel} from ${threadID} after repeated group photo/name changes.`);
  }

  async function processGroupMembershipEvent(api, event) {
    if (event?.type !== "event" || String(event?.logMessageType || "") !== "log:subscribe") return;
    const threadID = String(event?.threadID || "").trim();
    if (!/^\d{6,32}$/.test(threadID)) return;
    const settings = await getSettings(threadID);
    if (settings?.enabled !== true) return;
    const data = event?.logMessageData && typeof event.logMessageData === "object" ? event.logMessageData : {};
    const rawParticipants = data.addedParticipants ?? data.added_participants ?? data.addedParticipantsList;
    const ids = [];
    if (Array.isArray(rawParticipants)) {
      for (const participant of rawParticipants) {
        const rawID = participant?.userFbId ?? participant?.userFBID ?? participant?.userID ?? participant?.userId ?? participant?.id;
        const id = String(rawID ?? "").trim();
        if (/^\d{6,32}$/.test(id)) ids.push(id);
      }
    }
    for (const field of ["addedParticipantFbId", "addedParticipantFBID", "addedParticipantID", "addedParticipantId"]) {
      const id = String(data[field] ?? "").trim();
      if (/^\d{6,32}$/.test(id)) ids.push(id);
    }
    const botID = String(typeof api?.getCurrentUserID === "function" ? api.getCurrentUserID() : "").trim();
    const participants = [...new Set(ids)].filter(id => id !== botID);
    if (!participants.length) return;
    const timestamp = Number(event?.timestamp || event?.time || data?.timestamp || 0);
    const eventID = String(event?.messageID || event?.messageId || event?.logMessageId || data?.messageID || data?.messageId || "").trim();
    const fingerprint = eventID
      ? "event:" + eventID
      : ["subscribe", threadID, timestamp || Math.floor(Date.now() / 3000), participants.slice().sort().join(",")].join(":").slice(0, 900);
    try {
      await ensureRaidShieldReady();
      for (const participantID of participants) {
        await raidShield.observeJoin(threadID, participantID, true, fingerprint);
      }
    } catch (error) {
      log("[AUTOMOD-RAID] join signal failed in " + threadID + ": " + String(error?.message || error).slice(0, 140));
    }
  }

  function onGroupEvent(apiOrEvent, maybeEvent) {
    const api = maybeEvent ? apiOrEvent : getApi();
    const event = maybeEvent || apiOrEvent;
    const threadID = String(event?.threadID || "").trim();
    const rawAuthor = event?.author ?? event?.authorID ?? event?.senderID;
    const userID = String(
      rawAuthor && typeof rawAuthor === "object"
        ? rawAuthor.id ?? rawAuthor.userID ?? rawAuthor.userId ?? ""
        : rawAuthor ?? ""
    ).trim();
    // System log events such as log:unsubscribe may not include an author ID.
    // Do not discard them before the sensitive-admin handler can inspect the
    // event payload and identify the removed participant.
    if (!threadID) return Promise.resolve();
    const eventQueueIdentity = userID || String(event?.logMessageType || event?.type || "system-event");
    const key = threadID + ":" + eventQueueIdentity;
    const previous = queues.get(key) || Promise.resolve();
    const next = previous.then(() => processSensitiveAdminEvent(api, event)).then(() => processGroupProfileEvent(api, event)).then(() => processGroupMembershipEvent(api, event)).catch(error => {
      log(`[AUTOMOD-PROFILE] event check failed: ${String(error?.message || error).slice(0, 180)}`);
    });
    queues.set(key, next);
    return next.finally(() => {
      if (queues.get(key) === next) queues.delete(key);
    });
  }

  function onMessage(apiOrEvent, maybeEvent) {
    const api = maybeEvent ? apiOrEvent : getApi();
    const event = maybeEvent || apiOrEvent;
    const threadID = String(event?.threadID || "");
    const eventType = String(event?.type || "").toLowerCase();
    const reactionEvent = ["message_reaction", "messagereactionadd", "reaction"].includes(eventType);
    const userID = String(
      (reactionEvent ? event?.userID ?? event?.senderID : event?.senderID ?? event?.userID) ??
      event?.authorID ?? ""
    );
    if (!threadID || !userID) return Promise.resolve();
    const key = threadID + ":" + userID;
    const previous = queues.get(key) || Promise.resolve();
    const next = previous.then(() => processMessage(api, event)).catch(error => {
      log(`[AUTOMOD-SPAM] message check failed: ${String(error?.message || error).slice(0, 180)}`);
    });
    queues.set(key, next);
    return next.finally(() => {
      if (queues.get(key) === next) queues.delete(key);
    });
  }

  function normalizeConfig(body = {}) {
    return {
      max_messages: clamp(body.max_messages, 3, 30, DEFAULTS.max_messages),
      window_seconds: clamp(body.window_seconds, 3, 60, DEFAULTS.window_seconds),
      repeat_max: DEFAULTS.repeat_max,
      warn_first: body.warn_first !== false,
      warn_grace_seconds: DEFAULTS.warn_grace_seconds,
      warn_text: DEFAULTS.warn_text,
      sensitive_admin_enabled: body.sensitive_admin_enabled !== false,
      profile_abuse_enabled: body.profile_abuse_enabled !== false,
    };
  }

  function registerRoutes(app, auth) {
    const route = "/api/dashboard/groups/:threadId/antispam";
    app.get(route, auth, async (req, res) => {
      try {
        const threadID = String(req.params.threadId || "").trim();
        if (!threadID || !isKnownGroup(threadID)) return res.status(404).json({ error: "Group not found in the bot's current group list." });
        const [cfg, settings] = await Promise.all([getConfig(threadID), getAutoModSettings(threadID)]);
        return res.json({ antispam: { ...cfg, enabled: settings.enabled === true } });
      } catch (error) {
        log(`[AUTOMOD-SPAM] settings load failed: ${String(error?.message || error).slice(0, 160)}`);
        return res.status(503).json({ error: "Could not load persistent automod settings." });
      }
    });

    app.put(route, auth, express.json({ limit: "10kb" }), async (req, res) => {
      try {
        const threadID = String(req.params.threadId || "").trim();
        if (!threadID || !isKnownGroup(threadID)) return res.status(404).json({ error: "Group not found in the bot's current group list." });
        const body = req.body || {};
        const cfg = normalizeConfig(body);
        await ensureTables();
        await db.query(
          `INSERT INTO automod_spam_settings(thread_id, max_messages, window_seconds, repeat_max, warn_first, warn_grace_seconds, warn_text, sensitive_admin_enabled, profile_abuse_enabled, updated_at)
           VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
           ON CONFLICT(thread_id) DO UPDATE SET max_messages = EXCLUDED.max_messages, window_seconds = EXCLUDED.window_seconds,
             repeat_max = EXCLUDED.repeat_max, warn_first = EXCLUDED.warn_first, warn_grace_seconds = EXCLUDED.warn_grace_seconds,
             warn_text = EXCLUDED.warn_text, sensitive_admin_enabled = EXCLUDED.sensitive_admin_enabled,
             profile_abuse_enabled = EXCLUDED.profile_abuse_enabled, updated_at = NOW()`,
          [threadID, cfg.max_messages, cfg.window_seconds, cfg.repeat_max, cfg.warn_first, cfg.warn_grace_seconds, cfg.warn_text, cfg.sensitive_admin_enabled, cfg.profile_abuse_enabled],
        );
        const settings = await setEnabled(threadID, body.enabled === true);
        log(`[AUTOMOD-SPAM] ${settings.enabled ? "enabled" : "disabled"} for all members in ${threadID}`);
        return res.json({ antispam: { ...cfg, enabled: settings.enabled === true } });
      } catch (error) {
        log(`[AUTOMOD-SPAM] settings save failed: ${String(error?.message || error).slice(0, 160)}`);
        return res.status(503).json({ error: "Could not save persistent automod settings." });
      }
    });


    // Authenticated Raid Shield observability and manual emergency controls.
    // These routes never kick, ban, demote, or alter Messenger group settings.
    const raidRoute = "/api/dashboard/groups/:threadId/raid-shield";
    app.get(raidRoute, auth, async (req, res) => {
      const threadID = String(req.params.threadId || "").trim();
      if (!threadID || !isKnownGroup(threadID)) return res.status(404).json({ error: "Group not found in the current group list." });
      try {
        await ensureRaidShieldReady();
        const [state, incidents] = await Promise.all([Promise.resolve(raidShield.getState(threadID)), raidShieldStore.listIncidents({ threadId: threadID, limit: 30 })]);
        return res.json({ state, incidents });
      } catch (error) {
        log("[AUTOMOD-RAID] dashboard read failed: " + String(error?.message || error).slice(0, 160));
        return res.status(503).json({ error: "Raid Shield history is temporarily unavailable." });
      }
    });
    app.post(raidRoute + "/lockdown", auth, express.json({ limit: "4kb" }), async (req, res) => {
      const threadID = String(req.params.threadId || "").trim();
      if (!threadID || !isKnownGroup(threadID)) return res.status(404).json({ error: "Group not found in the current group list." });
      try {
        await ensureRaidShieldReady();
        const durationMs = clamp(req.body?.duration_ms, 30000, 30 * 60 * 1000, 5 * 60 * 1000);
        const state = await raidShield.setLockdown(threadID, durationMs, "dashboard_manual");
        log("[AUTOMOD-RAID] dashboard enabled temporary lockdown for " + threadID + " (" + durationMs + "ms)");
        return res.json({ ok: true, state });
      } catch (error) {
        log("[AUTOMOD-RAID] dashboard lockdown failed: " + String(error?.message || error).slice(0, 160));
        return res.status(503).json({ error: "Could not enable Raid Shield lockdown." });
      }
    });
    app.post(raidRoute + "/release", auth, express.json({ limit: "4kb" }), async (req, res) => {
      const threadID = String(req.params.threadId || "").trim();
      if (!threadID || !isKnownGroup(threadID)) return res.status(404).json({ error: "Group not found in the current group list." });
      try {
        await ensureRaidShieldReady();
        const state = await raidShield.releaseLockdown(threadID, "dashboard_manual_release");
        log("[AUTOMOD-RAID] dashboard released temporary lockdown for " + threadID);
        return res.json({ ok: true, state });
      } catch (error) {
        log("[AUTOMOD-RAID] dashboard release failed: " + String(error?.message || error).slice(0, 160));
        return res.status(503).json({ error: "Could not release Raid Shield lockdown." });
      }
    });

    const actionRoute = "/api/dashboard/groups/:threadId/raid-shield/actions";
    app.get(actionRoute, auth, async (req, res) => {
      const threadID = String(req.params.threadId || "").trim();
      if (!threadID || !isKnownGroup(threadID)) return res.status(404).json({ error: "Group not found in the current group list." });
      try {
        const actions = await raidShieldStore.listApprovalActions({ threadId: threadID, status: String(req.query.status || "pending"), limit: 50 });
        return res.json({ actions });
      } catch (error) {
        log("[AUTOMOD-RAID] approval queue read failed: " + String(error?.message || error).slice(0, 160));
        return res.status(503).json({ error: "Approval queue is temporarily unavailable." });
      }
    });

    app.post(actionRoute, auth, express.json({ limit: "4kb" }), async (req, res) => {
      const threadID = String(req.params.threadId || "").trim();
      const targetID = String(req.body?.target_id || "").trim();
      if (!threadID || !isKnownGroup(threadID)) return res.status(404).json({ error: "Group not found in the current group list." });
      if (!/^\d{6,32}$/.test(threadID) || !/^\d{6,32}$/.test(targetID) || targetID === threadID) return res.status(400).json({ error: "A valid numeric group and member ID are required." });
      try {
        const action = await raidShieldStore.proposeAction({ thread_id: threadID, target_id: targetID, reason: String(req.body?.reason || "admin_review").slice(0, 120), proposed_by: "raid_shield_dashboard" });
        if (!action) return res.status(409).json({ error: "A pending action already exists for this member in this group." });
        log("[AUTOMOD-RAID] pending member-removal approval created for group " + threadID);
        return res.status(201).json({ action });
      } catch (error) {
        log("[AUTOMOD-RAID] approval proposal failed: " + String(error?.message || error).slice(0, 160));
        return res.status(503).json({ error: "Could not create approval request." });
      }
    });

    app.post(actionRoute + "/:actionId/review", auth, express.json({ limit: "4kb" }), async (req, res) => {
      const threadID = String(req.params.threadId || "").trim();
      const actionId = clamp(req.params.actionId, 1, Number.MAX_SAFE_INTEGER, 0);
      const decision = String(req.body?.decision || "").toLowerCase();
      if (!threadID || !isKnownGroup(threadID)) return res.status(404).json({ error: "Group not found in the current group list." });
      if (!actionId || !["approve", "reject"].includes(decision)) return res.status(400).json({ error: "Choose approve or reject for a valid action ID." });
      try {
        const reviewed = await raidShieldStore.reviewApprovalAction({ id: actionId, threadId: threadID, status: decision === "approve" ? "approved" : "rejected", reviewedBy: "authenticated_dashboard", note: String(req.body?.note || "").slice(0, 300) });
        if (!reviewed || reviewed.thread_id !== threadID) return res.status(409).json({ error: "Action is not pending for this group, or has already been reviewed." });
        if (decision === "reject") {
          log("[AUTOMOD-RAID] pending member-removal action rejected for group " + threadID);
          return res.json({ ok: true, action: reviewed });
        }
        const api = getApi();
        if (!api || typeof api.removeUserFromGroup !== "function") {
          await raidShieldStore.completeApprovalAction(actionId, false);
          return res.status(503).json({ error: "Messenger removal API is unavailable; action marked failed." });
        }
        const removal = await removeFromGroup(api, threadID, reviewed.target_id);
        const completed = await raidShieldStore.completeApprovalAction(actionId, removal?.ok === true);
        // A successful external operation is not enough: require the persisted
        // approved -> completed/failed transition to return its row. If the row
        // disappeared or changed unexpectedly, fall through to the uncertainty
        // handler rather than reporting success with a null action record.
        if (!completed) throw new Error("Could not persist the final approval action status");
        log("[AUTOMOD-RAID] approved member-removal action " + (removal?.ok ? "completed" : "failed") + " for group " + threadID);
        if (!removal?.ok) return res.status(502).json({ error: "Messenger did not complete the approved removal.", action: completed });
        return res.json({ ok: true, action: completed });
      } catch (error) {
        // A timeout or persistence failure can occur after the external operation
        // has succeeded. Keep the row approved and flag the outcome as uncertain;
        // do not record a definite failure that could trigger an unsafe retry.
        if (decision === "approve" && actionId) {
          try {
            await raidShieldStore.markApprovalUncertain(
              actionId,
              "Outcome uncertain; verify group membership before retrying. " + String(error?.message || error).slice(0, 150),
            );
          } catch (statusError) {
            log("[AUTOMOD-RAID] could not persist uncertainty note: " + String(statusError?.message || statusError).slice(0, 120));
          }
        }
        log("[AUTOMOD-RAID] approval outcome uncertain: " + String(error?.message || error).slice(0, 160));
        return res.status(503).json({ error: "Outcome is uncertain. Verify the group's current membership before retrying." });
      }
    });

    app.delete(route, auth, async (req, res) => {
      try {
        const threadID = String(req.params.threadId || "").trim();
        if (!threadID || !isKnownGroup(threadID)) return res.status(404).json({ error: "Group not found in the bot's current group list." });
        await setEnabled(threadID, false);
        await ensureTables();
        await db.query("DELETE FROM automod_spam_settings WHERE thread_id = $1", [threadID]);
        await db.query("DELETE FROM automod_spam_warnings WHERE thread_id = $1", [threadID]);
        for (const key of hits.keys()) if (key.startsWith(threadID + ":")) hits.delete(key);
        log(`[AUTOMOD-SPAM] cleared for ${threadID}`);
        return res.json({ ok: true });
      } catch (error) {
        log(`[AUTOMOD-SPAM] settings clear failed: ${String(error?.message || error).slice(0, 160)}`);
        return res.status(503).json({ error: "Could not clear persistent automod settings." });
      }
    });
  }

  return {
    onMessage, onGroupEvent, registerRoutes, ensureTables,
    getRaidShieldState: threadID => raidShield.getState(threadID),
    listRaidShieldIncidents: options => raidShieldStore.listIncidents(options),
    setRaidShieldLockdown: (threadID, durationMs, reason) => raidShield.setLockdown(threadID, durationMs, reason),
    releaseRaidShieldLockdown: (threadID, reason) => raidShield.releaseLockdown(threadID, reason),
  };
}

module.exports = { createAntiSpam, DEFAULTS };
