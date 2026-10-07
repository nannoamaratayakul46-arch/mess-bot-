"use strict";

const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { login } = require("ws3-fca");

const db = require("./db");

const {
  ensureNicknameGuardTable,
  setNicknameGuard,
  getNicknameGuard,
  clearNicknameGuard,
  setProtectedNicknames,
  getProtectedNicknames,
  getMassNicknameRun,
  setMassNicknameRun,
  clearMassNicknameRun,
  changeNicknameAsync,
  handleNicknameGuardEvent,
} = require("./nickname-guard");

const {
  handleVerseCommand,
  startBibleVerseScheduler,
  stopBibleVerseScheduler,
} = require("./bible-verse");

const { handleEconomyCommand } = require("./economy");

const {
  handleGamesCommand,
  handleGameResponse,
  initLastChamber,
  shutdownGames,
} = require("./games");

const gameRegistry = require("./game-registry");

// ============================================================
// ECLIPSE ACADEMY / EXAM
// ============================================================

const {
  handleExam,
  handleExamResponse,
} = require("./exam-manager");

// ============================================================
// ECLIPSE DEBATE
// ============================================================

const {
  handleDebateCommand,
  initDebate,
} = require("./debate");

// ============================================================
// ECLIPSE INVESTIGATIONS
// ============================================================

const {
  handleInvestigationCommand,
} = require("./investigations");

const { handleRpgCommand } = require("./rpg");

const {
  handleTrainingCommand,
  observeMessage,
} = require("./ai/adaptation");

const {
  handleDebugCommand,
} = require("./debug");

const {
  runCleanup,
  startCleanupScheduler,
  stopCleanupScheduler,
  getCleanupStatus,
  getDiskAudit,
  formatDiskAudit,
  registerGCActivity,
  getGCStatus,
} = require("./cleanup");

// ============================================================
// PICTURES
// ============================================================

// ============================================================
// RPG CHARACTER AI
// ============================================================

const {
  handleRpgCharacterMessage,
} = require("./rpg/character-ai");

// ============================================================
// SECRET LOVE QUEST
// ============================================================

const {
  isSpecialPlayer,
  isEclipseAdmin,
  discover: discoverLoveQuest,
  handleLoveQuestCommand,
} = require("./rpg/love-quest");

const { handleAiMessage } = require("./ai");
const { generateTriggerReply } = require("./ai/provider");
const { isPrimaryUser } = require("./ai/access");

// ============================================================
// MODERATION
// ============================================================

const {
  handleModerationMessage,
  isLocallyBanned,
} = require("./moderation");

// ============================================================
// YOUTUBE
// ============================================================

const {
  searchYouTube,
  downloadYouTubeAudio,
} = require("./youtube");

// ============================================================
// TRIGGERS
// ============================================================

const {
  getTriggerReply,
  getNextPublicReply,
  getRandomRoastReply,
  getBanatConversationReply,
} = require("./triggers");

// ============================================================
// HUMAN / BANAT MODULES
// ============================================================

const {
  sendBanatReplyWithTyping: sendBanatReplyWithTypingModule,
  BANAT_REPLY_DELAY_MS,
  prepareBanatReply,
} = require("./banat-human");

const {
  classifyBanatTarget,
  setBanatConversationMode,
  isBanatConversationModeActive,
} = require("./banat-targeting");

const {
  sendReplyWithTyping: sendReplyWithTypingModule,
} = require("./reply-with-typing");

// ============================================================
// CONFIGURATION
// ============================================================

const { ADMIN_IDS, isAdmin, isOwner } = require("./permissions");

const RANDOM_ROAST_ENABLED =
  !/^(0|false|no|off)$/i.test(
    process.env.RANDOM_ROAST || ""
  );

const parsedCooldown = Number(
  process.env.RANDOM_ROAST_COOLDOWN_MS || "30000"
);

const RANDOM_ROAST_COOLDOWN_MS =
  Number.isFinite(parsedCooldown) &&
  parsedCooldown >= 0
    ? parsedCooldown
    : 30_000;

const MAX_ACTIVE_THREADS = 1000;

const ACTIVE_THREAD_EXPIRY_MS =
  30 * 24 * 60 * 60 * 1000;

const lastRandomRoastByThread = new Map();
const activeThreads = new Map();

// ============================================================
// WATCHDOG
// ============================================================
//
// Local process watchdog.
//
// Purpose:
//   - Detect prolonged event-loop stalls.
//   - Confirm the Node process is still alive.
//   - Track Messenger connection state.
//   - Expose watchdog state through /health.
//   - Allow admin status/restart commands.
//   - Exit with code 1 when the process is genuinely unhealthy
//     so Render can restart it.
//
// IMPORTANT:
//   The watchdog does NOT spawn another copy of ECLIPSE.
//   Render is responsible for restarting the failed process.
// ============================================================

const WATCHDOG_INTERVAL_MS = 30_000;

const WATCHDOG_EVENT_LOOP_TIMEOUT_MS =
  90_000;

const WATCHDOG_FAILURE_LIMIT = 3;

const WATCHDOG_STARTUP_GRACE_MS =
  2 * 60 * 1000;

const WATCHDOG_LOG_INTERVAL_MS =
  5 * 60 * 1000;

let watchdogStarted = false;
let watchdogTimer = null;

let watchdogStartedAt = Date.now();

let watchdogLastTickAt =
  Date.now();

let watchdogLastHealthyAt =
  Date.now();

let watchdogConsecutiveFailures = 0;

let watchdogMessengerConnected =
  false;

let watchdogMessengerEverConnected =
  false;

let watchdogMessengerDisconnectedAt =
  Date.now();

const WATCHDOG_MESSENGER_TIMEOUT_MS =
  3 * 60 * 1000;

// Detect the case where Facebook still accepts the session but the MQTT
// listener silently stops delivering callbacks.
const WATCHDOG_LISTENER_STALE_MS = Math.max(
  2 * 60 * 1000,
  Number(
    process.env.ECLIPSE_WATCHDOG_LISTENER_STALE_MS ||
      5 * 60 * 1000
  )
);

const WATCHDOG_LISTENER_STALE_ENABLED =
  /^(1|true|yes|on)$/i.test(
    process.env.ECLIPSE_WATCHDOG_LISTENER_STALE_ENABLED || ""
  );

const WATCHDOG_LISTENER_STALE_FAILURE_LIMIT = 2;

let watchdogLastListenerActivityAt = Date.now();
let watchdogListenerStaleFailures = 0;
let watchdogListenerRestarting = false;

let watchdogShuttingDown = false;

let watchdogLastLogAt = 0;

function watchdogHeartbeat() {
  const now =
    Date.now();

  watchdogLastHealthyAt =
    now;

  watchdogConsecutiveFailures =
    0;

  watchdogRecomputeMode();
}

function watchdogSetMessengerConnected(
  connected
) {
  const next = Boolean(connected);
  watchdogMessengerConnected = next;

  if (next) {
    watchdogMessengerEverConnected = true;
    watchdogMessengerDisconnectedAt = 0;
    watchdogHeartbeat();
  } else if (!watchdogMessengerDisconnectedAt) {
    watchdogMessengerDisconnectedAt = Date.now();
  }
}

function watchdogRecordListenerActivity() {
  watchdogLastListenerActivityAt = Date.now();
  watchdogListenerStaleFailures = 0;
}

function watchdogCleanRestartForDeadListener(reason) {
  if (
    watchdogListenerRestarting ||
    watchdogShuttingDown
  ) {
    return;
  }

  watchdogListenerRestarting = true;
  watchdogShuttingDown = true;
  watchdogMessengerConnected = false;

  console.error(
    "[WATCHDOG] Messenger listener appears silently dead."
  );

  console.error(
    "[WATCHDOG] " + reason
  );

  console.error(
    "[WATCHDOG] Stopping the stale listener and exiting with code 1 so Render can perform a clean restart."
  );

  try {
    if (
      activeMessengerApi &&
      typeof activeMessengerApi.stopListenMqtt === "function"
    ) {
      activeMessengerApi.stopListenMqtt();
    }
  } catch (error) {
    console.error(
      "[WATCHDOG] Failed to stop stale Messenger listener cleanly:",
      error
    );
  }

  setTimeout(() => {
    process.exit(1);
  }, 1000);
}

function watchdogSetShuttingDown(
  value
) {
  watchdogShuttingDown =
    Boolean(value);
}

// ============================================================
// WATCHDOG MODE / TRAFFIC LINK
// ============================================================
//
// Bridges watchdog health into the Traffic Governor. The
// governor's trafficMode()/trafficEffectiveGapMs() functions
// look for these two globals; previously neither was ever
// declared, so the link was permanently inert. This makes it
// real: as health degrades, outgoing sends space out more.
// ============================================================

let watchdogMode = "normal"; // normal | degraded | critical

function watchdogRecomputeMode() {
  if (
    watchdogConsecutiveFailures >=
    WATCHDOG_FAILURE_LIMIT - 1
  ) {
    watchdogMode = "critical";
    return;
  }

  const now = Date.now();

  const eventLoopAgeMs =
    now - watchdogLastTickAt;

  if (
    watchdogConsecutiveFailures > 0 ||
    eventLoopAgeMs >
      WATCHDOG_EVENT_LOOP_TIMEOUT_MS / 2
  ) {
    watchdogMode = "degraded";
    return;
  }

  watchdogMode = "normal";
}

function watchdogGetTrafficMultiplier() {
  if (watchdogMode === "critical") {
    return 3;
  }

  if (watchdogMode === "degraded") {
    return 1.75;
  }

  return 1;
}

function getWatchdogStatus() {
  const now =
    Date.now();

  const uptimeMs =
    now - watchdogStartedAt;

  const eventLoopAgeMs =
    now - watchdogLastTickAt;

  const healthyAgeMs =
    now - watchdogLastHealthyAt;

  const inStartupGrace =
    uptimeMs <
    WATCHDOG_STARTUP_GRACE_MS;

  const eventLoopHealthy =
    eventLoopAgeMs <=
    WATCHDOG_EVENT_LOOP_TIMEOUT_MS;

  const messengerConnectionHealthy =
    !watchdogMessengerEverConnected ||
    watchdogMessengerConnected ||
    (
      !watchdogMessengerDisconnectedAt ||
      now - watchdogMessengerDisconnectedAt <
        WATCHDOG_MESSENGER_TIMEOUT_MS
    );

  const watchdogHealthy =
    !watchdogShuttingDown &&
    (
      inStartupGrace ||
      (
        eventLoopHealthy &&
        messengerConnectionHealthy &&
        watchdogConsecutiveFailures <
          WATCHDOG_FAILURE_LIMIT
      )
    );

  return {
    ok:
      watchdogHealthy,

    mode:
      watchdogMode,

    started:
      watchdogStarted,

    shuttingDown:
      watchdogShuttingDown,

    messengerConnected:
      watchdogMessengerConnected,

    messengerDisconnectedAt:
      watchdogMessengerDisconnectedAt || null,

    listenerStaleAfterMs:
      WATCHDOG_LISTENER_STALE_MS,

    messengerConnectionAgeMs:
      watchdogMessengerConnected || !watchdogMessengerDisconnectedAt
        ? 0
        : now - watchdogMessengerDisconnectedAt,

    listenerActivityAgeMs:
      watchdogMessengerConnected
        ? Math.max(0, now - watchdogLastListenerActivityAt)
        : 0,

    listenerStaleFailures:
      watchdogListenerStaleFailures,

    listenerRestarting:
      watchdogListenerRestarting,

    uptimeMs,

    eventLoopAgeMs,

    healthyAgeMs,

    consecutiveFailures:
      watchdogConsecutiveFailures,

    startupGrace:
      inStartupGrace,

    lastHealthyAt:
      watchdogLastHealthyAt,

    timestamp:
      new Date().toISOString(),
  };
}

function runWatchdogCheck() {
  if (
    watchdogShuttingDown
  ) {
    return;
  }

  const now =
    Date.now();

  const expectedInterval =
    WATCHDOG_INTERVAL_MS;

  const elapsedSinceTick =
    now - watchdogLastTickAt;

  const eventLoopDelay =
    elapsedSinceTick -
    expectedInterval;

  watchdogLastTickAt =
    now;

  const startupAge =
    now - watchdogStartedAt;

  if (
    startupAge <
    WATCHDOG_STARTUP_GRACE_MS
  ) {
    watchdogLastHealthyAt =
      now;

    watchdogConsecutiveFailures =
      0;

    watchdogRecomputeMode();

    return;
  }

  const eventLoopHealthy =
    elapsedSinceTick <=
    WATCHDOG_EVENT_LOOP_TIMEOUT_MS;

  const messengerConnectionHealthy =
    !watchdogMessengerEverConnected ||
    watchdogMessengerConnected ||
    (
      !watchdogMessengerDisconnectedAt ||
      now - watchdogMessengerDisconnectedAt <
        WATCHDOG_MESSENGER_TIMEOUT_MS
    );

  const listenerActivityAgeMs =
    watchdogMessengerConnected
      ? now - watchdogLastListenerActivityAt
      : 0;

  if (
    !messengerConnectionHealthy
  ) {
    watchdogConsecutiveFailures++;

    watchdogRecomputeMode();

    console.error(
      `[WATCHDOG] Messenger connection unavailable for ${now - watchdogMessengerDisconnectedAt}ms`
    );

    console.error(
      `[WATCHDOG] Failure ${watchdogConsecutiveFailures}/${WATCHDOG_FAILURE_LIMIT}`
    );
  } else if (
    !eventLoopHealthy
  ) {
    watchdogConsecutiveFailures++;

    watchdogRecomputeMode();

    console.error(
      `[WATCHDOG] Event-loop stall detected: ${eventLoopDelay}ms`
    );

    console.error(
      `[WATCHDOG] Failure ${watchdogConsecutiveFailures}/${WATCHDOG_FAILURE_LIMIT}`
    );

    if (
      watchdogConsecutiveFailures >=
      WATCHDOG_FAILURE_LIMIT
    ) {
      console.error(
        "[WATCHDOG] ECLIPSE appears unhealthy."
      );

      console.error(
        "[WATCHDOG] Exiting with code 1 so Render can restart the process."
      );

      process.exit(1);
    }

    return;
  }

  // Facebook can keep the session valid while MQTT has silently died.
  // Require two consecutive stale checks before restarting.
  if (
    WATCHDOG_LISTENER_STALE_ENABLED &&
    watchdogMessengerConnected &&
    listenerActivityAgeMs >= WATCHDOG_LISTENER_STALE_MS
  ) {
    watchdogListenerStaleFailures++;

    console.error(
      "[WATCHDOG] Messenger listener callback stale for " +
        Math.round(listenerActivityAgeMs / 1000) +
        "s (check " +
        watchdogListenerStaleFailures +
        "/" +
        WATCHDOG_LISTENER_STALE_FAILURE_LIMIT +
        ")."
    );

    if (
      watchdogListenerStaleFailures >=
      WATCHDOG_LISTENER_STALE_FAILURE_LIMIT
    ) {
      watchdogCleanRestartForDeadListener(
        "No listenMqtt callback has been observed for " +
          Math.round(listenerActivityAgeMs / 1000) +
          "s."
      );
      return;
    }

    watchdogRecomputeMode();
    return;
  }

  watchdogListenerStaleFailures = 0;

  watchdogLastHealthyAt =
    now;

  watchdogConsecutiveFailures =
    0;

  watchdogRecomputeMode();

  if (
    now - watchdogLastLogAt >=
    WATCHDOG_LOG_INTERVAL_MS
  ) {
    watchdogLastLogAt =
      now;

    const memory =
      process.memoryUsage();

    console.log(
      `[WATCHDOG] Healthy | ` +
        `Messenger: ${
          watchdogMessengerConnected
            ? "connected"
            : "not connected"
        } | ` +
        `RSS: ${Math.round(
          memory.rss /
            1024 /
            1024
        )} MB`
    );
  }
}

function startWatchdog() {
  if (
    watchdogStarted
  ) {
    return;
  }

  watchdogStarted =
    true;

  watchdogShuttingDown =
    false;

  watchdogStartedAt =
    Date.now();

  watchdogLastTickAt =
    Date.now();

  watchdogLastHealthyAt =
    Date.now();

  watchdogConsecutiveFailures =
    0;

  watchdogLastLogAt =
    Date.now();

  watchdogRecomputeMode();

  watchdogTimer =
    setInterval(
      runWatchdogCheck,
      WATCHDOG_INTERVAL_MS
    );

  if (
    watchdogTimer &&
    typeof watchdogTimer.unref ===
      "function"
  ) {
    watchdogTimer.unref();
  }

  console.log(
    "[WATCHDOG] Local watchdog started."
  );
}

function stopWatchdog() {
  watchdogShuttingDown =
    true;

  if (
    watchdogTimer
  ) {
    clearInterval(
      watchdogTimer
    );

    watchdogTimer =
      null;
  }

  watchdogStarted =
    false;

  console.log(
    "[WATCHDOG] Local watchdog stopped."
  );
}


// ============================================================
// ECLIPSE VEIL — TRAFFIC GOVERNOR
// ============================================================
//
// Legitimate reliability layer between ECLIPSE and Messenger.
// It is designed to prevent accidental bursts, duplicate command
// storms, retry amplification, and runaway outgoing traffic.
// It is NOT an anti-detection or enforcement-evasion system.
// ============================================================

const TRAFFIC_GOVERNOR = Object.freeze({
  globalPerMinute: Math.max(
    20,
    Number(process.env.ECLIPSE_GLOBAL_SENDS_PER_MINUTE || 60)
  ),

  threadPerMinute: Math.max(
    5,
    Number(process.env.ECLIPSE_THREAD_SENDS_PER_MINUTE || 20)
  ),

  userCommandsPerMinute: Math.max(
    5,
    Number(process.env.ECLIPSE_USER_COMMANDS_PER_MINUTE || 20)
  ),

  threadCommandsPerMinute: Math.max(
    10,
    Number(process.env.ECLIPSE_THREAD_COMMANDS_PER_MINUTE || 60)
  ),

  queueMax: Math.max(
    50,
    Number(process.env.ECLIPSE_TRAFFIC_QUEUE_MAX || 300)
  ),

  baseGapMs: Math.max(
    250,
    Number(process.env.ECLIPSE_TRAFFIC_GAP_MS || 750)
  ),

  duplicateWindowMs: Math.max(
    1000,
    Number(process.env.ECLIPSE_TRAFFIC_DUPLICATE_WINDOW_MS || 5000)
  ),
});

const TRAFFIC_TEXT_SEND_TIMEOUT_MS = 30_000;
const TRAFFIC_ATTACHMENT_SEND_TIMEOUT_MS = Math.max(
  90_000,
  Number(process.env.ECLIPSE_ATTACHMENT_SEND_TIMEOUT_MS || 120_000)
);

const trafficSendQueue = [];
const trafficGlobalSendTimes = [];
const trafficThreadSendTimes = new Map();
const trafficRecentMessages = new Map();
const trafficUserCommandTimes = new Map();
const trafficThreadCommandTimes = new Map();

let trafficGovernorRunning = false;
let trafficGovernorTimer = null;
let trafficGovernorInstalled = false;
let trafficShuttingDown = false;
let trafficLastSendAt = 0;
let trafficTotalSent = 0;
let trafficTotalDelayed = 0;
let trafficTotalSuppressed = 0;
let trafficTotalRejected = 0;
let trafficTotalDuplicateBlocked = 0;
let trafficTotalCommandBlocked = 0;
let trafficPeakQueue = 0;

// ============================================================
// INCOMING EVENT DEDUPLICATION
// ============================================================
// Prevents one Messenger event from executing a command twice
// during transient listener reconnects or duplicate delivery.
// ============================================================

const INCOMING_DEDUP_WINDOW_MS = Math.max(
  2_000,
  Number(process.env.ECLIPSE_INCOMING_DEDUP_WINDOW_MS || 10_000)
);

const recentIncomingEvents = new Map();

function incomingEventKeys(event) {
  if (!event || typeof event !== "object") {
    return [];
  }

  const keys = [];

  const messageID = String(
    event.messageID ||
      event.messageId ||
      event.message_id ||
      ""
  ).trim();

  if (messageID) {
    keys.push(`id:${messageID}`);
    return keys;
  }

  // Only use semantic fingerprints when Messenger did not provide a
  // message ID. This avoids suppressing legitimate identical messages
  // from the same user that happen to arrive in the same second.
  const timestamp = Number(
    event.timestamp ||
      event.timestampMS ||
      event.timestamp_ms ||
      NaN
  );

  const threadID = String(event.threadID || "").trim();
  const senderID = String(event.senderID || "").trim();
  const body = String(event.body || "").trim();

  if (
    threadID &&
    senderID &&
    Number.isFinite(timestamp) &&
    body
  ) {
    keys.push(
      `semantic:${threadID}:${senderID}:${timestamp}:${body}`
    );

    // Some reconnect paths can reproduce the same event with a tiny
    // timestamp difference. A one-second bucket catches that case
    // without using a long-lived body-only fingerprint that could
    // suppress two legitimate identical commands minutes later.
    keys.push(
      `semantic1s:${threadID}:${senderID}:${Math.floor(timestamp / 1000)}:${body}`
    );
  }

  return keys;
}

function shouldProcessIncomingEvent(event) {
  const keys = incomingEventKeys(event);

  if (!keys.length) {
    return true;
  }

  const now = Date.now();

  for (const key of keys) {
    const previous = recentIncomingEvents.get(key);

    if (
      previous &&
      now - previous < INCOMING_DEDUP_WINDOW_MS
    ) {
      console.warn(
        `[EVENT] Duplicate Messenger event suppressed: ${key}`
      );
      return false;
    }
  }

  for (const key of keys) {
    recentIncomingEvents.set(key, now);
  }

  return true;
}

function cleanupIncomingEventDedup() {
  const now = Date.now();

  for (const [key, timestamp] of recentIncomingEvents.entries()) {
    if (now - timestamp >= INCOMING_DEDUP_WINDOW_MS) {
      recentIncomingEvents.delete(key);
    }
  }
}

const incomingEventCleanupTimer = setInterval(
  cleanupIncomingEventDedup,
  Math.min(INCOMING_DEDUP_WINDOW_MS, 30_000)
);

if (
  incomingEventCleanupTimer &&
  typeof incomingEventCleanupTimer.unref === "function"
) {
  incomingEventCleanupTimer.unref();
}

function trafficNow() {
  return Date.now();
}

function trafficPruneTimes(list, now, windowMs = 60_000) {
  while (list.length && now - list[0] >= windowMs) {
    list.shift();
  }
}

function trafficPruneMap(map, now, windowMs = 60_000) {
  for (const [key, list] of map.entries()) {
    trafficPruneTimes(list, now, windowMs);
    if (!list.length) {
      map.delete(key);
    }
  }
}

function trafficFingerprint(message, threadID) {
  let body = "";
  let attachment = "";

  if (typeof message === "string") {
    body = message;
  } else if (message && typeof message === "object") {
    body = String(message.body || "");

    if (message.attachment) {
      const value = message.attachment;
      attachment =
        typeof value === "string"
          ? value
          : String(
              value?.path ||
                value?.filename ||
                value?.name ||
                value?.fd ||
                value?.constructor?.name ||
                "attachment"
            );
    }
  }

  return crypto
    .createHash("sha1")
    .update(
      String(threadID) + "\n" + body.trim() + "\n" + attachment
    )
    .digest("hex");
}

function trafficEffectiveGapMs() {
  let multiplier = 1;

  if (typeof watchdogGetTrafficMultiplier === "function") {
    multiplier = watchdogGetTrafficMultiplier();
  }

  return Math.round(
    TRAFFIC_GOVERNOR.baseGapMs * multiplier
  );
}

function trafficMode() {
  if (typeof watchdogMode !== "undefined") {
    return watchdogMode;
  }

  return "normal";
}

function trafficCanAcceptCommand(senderID, threadID) {
  const now = trafficNow();
  const sender = String(senderID || "").trim();
  const thread = String(threadID || "").trim();

  if (!sender || !thread) {
    return true;
  }

  const userTimes =
    trafficUserCommandTimes.get(sender) || [];

  const threadTimes =
    trafficThreadCommandTimes.get(thread) || [];

  trafficPruneTimes(userTimes, now);
  trafficPruneTimes(threadTimes, now);

  if (
    userTimes.length >=
    TRAFFIC_GOVERNOR.userCommandsPerMinute
  ) {
    trafficTotalCommandBlocked++;
    trafficUserCommandTimes.set(sender, userTimes);
    return false;
  }

  if (
    threadTimes.length >=
    TRAFFIC_GOVERNOR.threadCommandsPerMinute
  ) {
    trafficTotalCommandBlocked++;
    trafficThreadCommandTimes.set(thread, threadTimes);
    return false;
  }

  userTimes.push(now);
  threadTimes.push(now);

  trafficUserCommandTimes.set(sender, userTimes);
  trafficThreadCommandTimes.set(thread, threadTimes);

  return true;
}

function trafficCanSendNow(threadID, message) {
  const now = trafficNow();
  const thread = String(threadID || "");

  trafficPruneTimes(
    trafficGlobalSendTimes,
    now
  );

  const threadTimes =
    trafficThreadSendTimes.get(thread) || [];

  trafficPruneTimes(threadTimes, now);
  trafficThreadSendTimes.set(thread, threadTimes);

  const fingerprint =
    trafficFingerprint(message, thread);

  const recentAt =
    trafficRecentMessages.get(fingerprint) || 0;

  if (
    recentAt &&
    now - recentAt <
      TRAFFIC_GOVERNOR.duplicateWindowMs
  ) {
    trafficTotalDuplicateBlocked++;
    return {
      ok: false,
      reason: "duplicate",
      waitMs: 0,
    };
  }

  if (
    trafficGlobalSendTimes.length >=
    TRAFFIC_GOVERNOR.globalPerMinute
  ) {
    const waitMs =
      Math.max(
        100,
        60_000 -
          (now - trafficGlobalSendTimes[0])
      );

    return {
      ok: false,
      reason: "global_limit",
      waitMs,
    };
  }

  if (
    threadTimes.length >=
    TRAFFIC_GOVERNOR.threadPerMinute
  ) {
    const waitMs =
      Math.max(
        100,
        60_000 -
          (now - threadTimes[0])
      );

    return {
      ok: false,
      reason: "thread_limit",
      waitMs,
    };
  }

  const gapRemaining =
    Math.max(
      0,
      trafficEffectiveGapMs() -
        (now - trafficLastSendAt)
    );

  if (gapRemaining > 0) {
    return {
      ok: false,
      reason: "spacing",
      waitMs: gapRemaining,
    };
  }

  return {
    ok: true,
    reason: "ok",
    waitMs: 0,
    fingerprint,
  };
}

function trafficRecordSend(threadID, fingerprint) {
  const now = trafficNow();
  const thread = String(threadID || "");

  trafficGlobalSendTimes.push(now);

  const threadTimes =
    trafficThreadSendTimes.get(thread) || [];

  threadTimes.push(now);
  trafficThreadSendTimes.set(thread, threadTimes);

  trafficRecentMessages.set(
    fingerprint || trafficFingerprint("", thread),
    now
  );

  trafficLastSendAt = now;
  trafficTotalSent++;
}

function trafficCleanup() {
  const now = trafficNow();

  trafficPruneTimes(
    trafficGlobalSendTimes,
    now
  );

  trafficPruneMap(
    trafficThreadSendTimes,
    now
  );

  trafficPruneMap(
    trafficUserCommandTimes,
    now
  );

  trafficPruneMap(
    trafficThreadCommandTimes,
    now
  );

  for (const [key, timestamp] of trafficRecentMessages.entries()) {
    if (
      now - timestamp >=
      TRAFFIC_GOVERNOR.duplicateWindowMs
    ) {
      trafficRecentMessages.delete(key);
    }
  }
}

function trafficSafetyStatus() {
  trafficCleanup();

  const now = trafficNow();
  const watchdog =
    typeof getWatchdogStatus === "function"
      ? getWatchdogStatus()
      : null;

  return {
    mode: trafficMode(),
    queue: trafficSendQueue.length,
    queueMax: TRAFFIC_GOVERNOR.queueMax,
    queuePercent: Math.round(
      (trafficSendQueue.length /
        TRAFFIC_GOVERNOR.queueMax) *
        100
    ),
    globalSendsLastMinute:
      trafficGlobalSendTimes.length,
    globalLimit:
      TRAFFIC_GOVERNOR.globalPerMinute,
    activeThreads:
      trafficThreadSendTimes.size,
    lastSendAgoMs:
      trafficLastSendAt
        ? now - trafficLastSendAt
        : null,
    effectiveGapMs:
      trafficEffectiveGapMs(),
    totalSent:
      trafficTotalSent,
    totalDelayed:
      trafficTotalDelayed,
    totalSuppressed:
      trafficTotalSuppressed,
    totalRejected:
      trafficTotalRejected,
    duplicateBlocked:
      trafficTotalDuplicateBlocked,
    commandBlocked:
      trafficTotalCommandBlocked,
    peakQueue:
      trafficPeakQueue,
    watchdogMode:
      watchdog?.mode || trafficMode(),
    timestamp:
      new Date().toISOString(),
  };
}

function trafficQueueSend(api, message, threadID, callback, replyToMessageID = null) {
  if (trafficShuttingDown) {
    trafficTotalRejected++;

    const error = new Error("ECLIPSE is shutting down.");
    error.code = "ECLIPSE_SHUTTING_DOWN";

    if (typeof callback === "function") {
      setImmediate(() => {
        try {
          callback(error);
        } catch (callbackError) {
          console.error("[TRAFFIC] Shutdown callback failed:", callbackError);
        }
      });
    }

    return false;
  }

  if (
    trafficSendQueue.length >=
    TRAFFIC_GOVERNOR.queueMax
  ) {
    trafficTotalRejected++;

    const error =
      new Error(
        "ECLIPSE traffic queue is full."
      );

    if (typeof callback === "function") {
      setImmediate(() => callback(error));
    }

    return false;
  }

  const rawApi =
    api && api.__eclipseTrafficRawApi
      ? api.__eclipseTrafficRawApi
      : api;

  trafficSendQueue.push({
    api: rawApi,
    message,
    threadID: String(threadID),
    callback,
    replyToMessageID: replyToMessageID || null,
    enqueuedAt: trafficNow(),
  });

  trafficPeakQueue = Math.max(
    trafficPeakQueue,
    trafficSendQueue.length
  );

  if (
    trafficSendQueue.length > 1
  ) {
    trafficTotalDelayed++;
  }

  trafficStartWorker();
  return true;
}

async function trafficProcessQueue() {
  if (trafficGovernorRunning) {
    return;
  }

  trafficGovernorRunning = true;

  try {
    while (trafficSendQueue.length) {
      const job =
        trafficSendQueue[0];

      const decision =
        trafficCanSendNow(
          job.threadID,
          job.message
        );

      if (!decision.ok) {
        trafficSendQueue.shift();

        if (decision.reason === "duplicate") {
          trafficTotalSuppressed++;
          if (typeof job.callback === "function") {
            const error =
              new Error(
                "Duplicate Messenger send suppressed by ECLIPSE Traffic Governor."
              );
            error.code = "ECLIPSE_DUPLICATE_SUPPRESSED";
            job.callback(error);
          }
          continue;
        }

        trafficSendQueue.unshift(job);

        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.min(
              Math.max(100, decision.waitMs),
              60_000
            )
          )
        );

        continue;
      }

      trafficSendQueue.shift();

      try {
        await new Promise((resolve) => {
          let settled = false;

          const finish = (error, messageInfo = null) => {
            if (settled) return;
            settled = true;

            if (!error) {
              trafficRecordSend(
                job.threadID,
                decision.fingerprint
              );
            }

            if (typeof job.callback === "function") {
              try {
                job.callback(
                  error || null,
                  messageInfo || null
                );
              } catch (callbackError) {
                console.error(
                  "[TRAFFIC] Messenger callback failed:",
                  callbackError
                );
              }
            }

            resolve();
          };

          const hasAttachment =
            Boolean(
              job.message &&
                typeof job.message === "object" &&
                job.message.attachment
            );

          const sendTimeoutMs = hasAttachment
            ? TRAFFIC_ATTACHMENT_SEND_TIMEOUT_MS
            : TRAFFIC_TEXT_SEND_TIMEOUT_MS;

          const timeout = setTimeout(() => {
            const error = new Error(
              hasAttachment
                ? "Messenger attachment send timed out; Traffic Governor released the queue."
                : "Messenger send timed out; Traffic Governor released the queue."
            );
            error.code = "ECLIPSE_SEND_TIMEOUT";
            finish(error);
          }, sendTimeoutMs);

          try {
            const sendCallback = (error, messageInfo) => {
              clearTimeout(timeout);
              finish(error, messageInfo);
            };

            if (job.replyToMessageID) {
              job.api.sendMessage(
                job.message,
                job.threadID,
                sendCallback,
                job.replyToMessageID
              );
            } else {
              job.api.sendMessage(
                job.message,
                job.threadID,
                sendCallback
              );
            }
          } catch (error) {
            clearTimeout(timeout);
            finish(error);
          }
        });
      } catch (error) {
        console.error(
          "[TRAFFIC] Send worker error:",
          error
        );
      }
    }
  } finally {
    trafficGovernorRunning = false;
  }
}

function stopTrafficGovernor() {
  trafficShuttingDown = true;

  if (trafficEditTimer) {
    clearTimeout(trafficEditTimer);
    trafficEditTimer = null;
  }

  const editError = new Error("ECLIPSE is shutting down.");
  editError.code = "ECLIPSE_SHUTTING_DOWN";

  while (trafficEditQueue.length) {
    const job = trafficEditQueue.shift();

    if (typeof job?.callback === "function") {
      try {
        job.callback(editError);
      } catch {}
    }
  }

  trafficEditWorkerRunning = false;

  if (trafficGovernorTimer) {
    clearImmediate(trafficGovernorTimer);
    trafficGovernorTimer = null;
  }

  const error = new Error("ECLIPSE is shutting down.");
  error.code = "ECLIPSE_SHUTTING_DOWN";

  while (trafficSendQueue.length) {
    const job = trafficSendQueue.shift();
    if (typeof job?.callback === "function") {
      try { job.callback(error); } catch {}
    }
  }

  trafficGovernorRunning = false;
  console.log("[TRAFFIC] Traffic Governor stopped.");
}

function trafficStartWorker() {
  if (trafficShuttingDown || trafficGovernorTimer) {
    return;
  }

  trafficGovernorTimer = setImmediate(() => {
    trafficGovernorTimer = null;

    if (trafficShuttingDown) {
      return;
    }
    trafficProcessQueue().catch((error) => {
      console.error(
        "[TRAFFIC] Queue worker failed:",
        error
      );
    });
  });
}

const trafficGovernorProxies = new WeakSet();

function assertTrafficGovernorApi(api, handlerName = "unknown handler") {
  if (!api || (typeof api !== "object" && typeof api !== "function") || !trafficGovernorProxies.has(api)) {
    const error = new Error(
      '[TRAFFIC] Traffic Governor guard violation: handler "' +
      String(handlerName) +
      '" received the raw Messenger API. Pass the guarded API returned by installTrafficGovernor(api).'
    );
    error.code = "ECLIPSE_RAW_MESSENGER_API";
    throw error;
  }
  return api;
}

const TRAFFIC_EDIT_GAP_MS = Math.max(
  250,
  Number(process.env.ECLIPSE_EDIT_GAP_MS || 400)
);

const TRAFFIC_EDIT_QUEUE_MAX = Math.max(
  50,
  Number(process.env.ECLIPSE_EDIT_QUEUE_MAX || 300)
);

const trafficEditQueue = [];
let trafficEditWorkerRunning = false;
let trafficEditTimer = null;
let trafficLastEditAt = 0;

function trafficQueueEdit(api, text, messageID, callback) {
  const rawApi =
    api && api.__eclipseTrafficRawApi
      ? api.__eclipseTrafficRawApi
      : api;

  if (
    trafficShuttingDown ||
    !rawApi ||
    typeof rawApi.editMessage !== "function" ||
    !messageID
  ) {
    const error = new Error(
      trafficShuttingDown
        ? "ECLIPSE is shutting down."
        : "Messenger editMessage is unavailable."
    );

    if (typeof callback === "function") {
      setImmediate(() => callback(error));
    }

    return false;
  }

  if (trafficEditQueue.length >= TRAFFIC_EDIT_QUEUE_MAX) {
    const error = new Error(
      "ECLIPSE edit queue is full."
    );
    error.code = "ECLIPSE_EDIT_QUEUE_FULL";

    if (typeof callback === "function") {
      setImmediate(() => callback(error));
    }

    return false;
  }

  trafficEditQueue.push({
    api: rawApi,
    text,
    messageID: String(messageID),
    callback,
    enqueuedAt: Date.now(),
  });

  trafficStartEditWorker();
  return true;
}

function trafficStartEditWorker() {
  if (
    trafficShuttingDown ||
    trafficEditWorkerRunning ||
    trafficEditTimer ||
    !trafficEditQueue.length
  ) {
    return;
  }

  const waitMs = Math.max(
    0,
    TRAFFIC_EDIT_GAP_MS -
      (Date.now() - trafficLastEditAt)
  );

  trafficEditTimer = setTimeout(() => {
    trafficEditTimer = null;
    trafficProcessEditQueue().catch((error) => {
      console.error(
        "[TRAFFIC] Edit worker failed:",
        error
      );
    });
  }, waitMs);
}

async function trafficProcessEditQueue() {
  if (
    trafficEditWorkerRunning ||
    trafficShuttingDown
  ) {
    return;
  }

  trafficEditWorkerRunning = true;

  try {
    while (
      trafficEditQueue.length &&
      !trafficShuttingDown
    ) {
      const job = trafficEditQueue.shift();

      const waitMs = Math.max(
        0,
        TRAFFIC_EDIT_GAP_MS -
          (Date.now() - trafficLastEditAt)
      );

      if (waitMs > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, waitMs)
        );
      }

      await new Promise((resolve) => {
        let settled = false;

        const finish = (error, info = null) => {
          if (settled) return;
          settled = true;

          trafficLastEditAt = Date.now();

          if (typeof job.callback === "function") {
            try {
              job.callback(
                error || null,
                info || null
              );
            } catch (callbackError) {
              console.error(
                "[TRAFFIC] Edit callback failed:",
                callbackError
              );
            }
          }

          resolve();
        };

        const timeout = setTimeout(() => {
          const error = new Error(
            "Messenger edit timed out; Traffic Governor released the edit queue."
          );
          error.code = "ECLIPSE_EDIT_TIMEOUT";
          finish(error);
        }, 10_000);

        const done = (error, info) => {
          clearTimeout(timeout);
          finish(error, info);
        };

        try {
          const result =
            job.api.editMessage(
              job.text,
              job.messageID,
              done
            );

          if (
            result &&
            typeof result.then === "function"
          ) {
            result.then(
              (info) => done(null, info),
              (error) => done(error)
            );
          }
        } catch (error) {
          clearTimeout(timeout);
          finish(error);
        }
      });
    }
  } finally {
    trafficEditWorkerRunning = false;

    if (
      trafficEditQueue.length &&
      !trafficShuttingDown
    ) {
      trafficStartEditWorker();
    }
  }
}

function installTrafficGovernor(api) {
  if (!api || typeof api.sendMessage !== "function") {
    return api || null;
  }

  if (api.__eclipseTrafficProxy === true) {
    trafficGovernorInstalled = true;
    return api;
  }

  const rawApi = api;

  const guardedApi = new Proxy(rawApi, {
    get(target, property) {
      if (property === "__eclipseTrafficProxy") {
        return true;
      }

      if (property === "__eclipseTrafficRawApi") {
        return rawApi;
      }

      if (property === "sendMessage") {
        return function guardedSendMessage(
          message,
          threadID,
          callback,
          messageID
        ) {
          return trafficQueueSend(
            rawApi,
            message,
            threadID,
            callback,
            messageID
          );
        };
      }

      if (property === "editMessage") {
        return function guardedEditMessage(
          text,
          messageID,
          callback
        ) {
          return trafficQueueEdit(
            rawApi,
            text,
            messageID,
            callback
          );
        };
      }

      const value = Reflect.get(target, property, target);

      if (typeof value === "function") {
        return value.bind(target);
      }

      return value;
    },
  });

  trafficGovernorInstalled = true;
  trafficGovernorProxies.add(guardedApi);

  console.log(
    "[TRAFFIC] ECLIPSE VEIL Traffic Governor installed (proxy mode)."
  );

  return guardedApi;
}

function trafficSendMessage(
  api,
  message,
  threadID,
  callback,
  replyToMessageID = null
) {
  return trafficQueueSend(
    api,
    message,
    threadID,
    callback,
    replyToMessageID
  );
}

const trafficCleanupTimer = setInterval(() => {
  trafficCleanup();
  if (trafficSendQueue.length) {
    trafficStartWorker();
  }
}, 15_000);

if (trafficCleanupTimer && typeof trafficCleanupTimer.unref === "function") {
  trafficCleanupTimer.unref();
}

// ============================================================
// MUSIC RESOURCE PROTECTION
// ============================================================
//
// Per GC:
//   - maximum 2 music jobs total
//   - active + pending both count toward the limit
//
// Globally:
//   - maximum 2 simultaneous YouTube downloads
//
// This prevents multiple groups from spawning unlimited
// downloads and exhausting Render memory / CPU / disk.
// ============================================================

const MUSIC_MAX_PER_GC = 2;
const MUSIC_MAX_GLOBAL_DOWNLOADS = 2;
const MUSIC_MAX_GLOBAL_QUEUE = 50;

const MUSIC_SEARCH_TIMEOUT_MS = 45_000;
const MUSIC_DOWNLOAD_TIMEOUT_MS = 180_000;
const MUSIC_SEND_TIMEOUT_MS = 60_000;

const MUSIC_REQUEST_MAX_LENGTH = 300;

const parsedMusicFileLimit = Number(
  process.env.MAX_MUSIC_FILE_BYTES || String(15 * 1024 * 1024)
);

const MAX_MUSIC_FILE_BYTES =
  Number.isFinite(parsedMusicFileLimit) &&
  parsedMusicFileLimit > 0
    ? parsedMusicFileLimit
    : 25 * 1024 * 1024;

// Per-thread array of music jobs.
const musicQueues = new Map();

// Jobs waiting globally for a download slot.
const musicPendingJobs = [];

// Number of currently running download jobs.
let activeMusicDownloads = 0;

// Monotonically increasing job ID.
let musicJobCounter = 0;

// When true, no NEW music jobs will start (queueing still works,
// and any job already downloading/searching/sending finishes normally).
let musicPaused = false;

// ============================================================
// GLOBAL BOT STATE
// ============================================================
//
// botDisabled / botPaused are persisted to a small local JSON
// file so a Render restart (crash, manual `!watchdog restart`)
// doesn't silently un-pause or re-enable the bot. This does NOT
// survive a fresh deploy (new container = new disk), only
// same-container restarts.
// ============================================================

const BOT_STATE_FILE = path.join(
  __dirname,
  ".eclipse-state.json"
);

function loadPersistedBotState() {
  try {
    const raw = fs.readFileSync(
      BOT_STATE_FILE,
      "utf8"
    );

    const parsed = JSON.parse(raw);

    global.botDisabled =
      Boolean(parsed.botDisabled);

    global.botPaused =
      Boolean(parsed.botPaused);

    console.log(
      `[STATE] Restored persisted state: disabled=${global.botDisabled}, paused=${global.botPaused}`
    );
  } catch {
    if (
      typeof global.botDisabled !== "boolean"
    ) {
      global.botDisabled = false;
    }

    if (
      typeof global.botPaused !== "boolean"
    ) {
      global.botPaused = false;
    }
  }
}

function persistBotState() {
  try {
    fs.writeFileSync(
      BOT_STATE_FILE,
      JSON.stringify({
        botDisabled: global.botDisabled === true,
        botPaused: global.botPaused === true,
        savedAt: new Date().toISOString(),
      })
    );
  } catch (error) {
    console.error(
      "[STATE] Failed to persist bot state:",
      error
    );
  }
}

loadPersistedBotState();

// ============================================================
// TIMEOUT HELPER
// ============================================================

function withTimeout(
  operation,
  timeoutMs,
  timeoutMessage
) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;

        reject(
          new Error(timeoutMessage)
        );
      }
    }, timeoutMs);

    Promise.resolve()
      .then(operation)
      .then(
        (value) => {
          if (settled) return;

          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          if (settled) return;

          settled = true;
          clearTimeout(timer);
          reject(error);
        }
      );
  });
}

// ============================================================
// MESSENGER PROMISE WRAPPER
// ============================================================
//
// IMPORTANT:
// The callback's messageInfo is returned so music can capture
// the message ID and edit the original status message.
// ============================================================

function sendMessengerMessage(
  api,
  message,
  threadID
) {
  return new Promise((resolve, reject) => {
    try {
      trafficSendMessage(api, 
        message,
        threadID,
        (error, messageInfo) => {
          if (error) {
            reject(error);
          } else {
            resolve(
              messageInfo || null
            );
          }
        }
      );
    } catch (error) {
      reject(error);
    }
  });
}

// ============================================================
// COQUETTE MUSIC PANEL
// ============================================================

function buildMusicPanel({
  title,
  author,
  duration,
  state = "searching",
  position = null,
}) {
  const cleanTitle =
    String(
      title || "Unknown Title"
    ).trim();

  const cleanAuthor =
    String(
      author || ""
    ).trim();

  const cleanDuration =
    String(
      duration || "--:--"
    ).trim();

  const stateMap = {
    pending: {
      icon: "୨୧",
      label: "PENDING",
      detail:
        "waiting for an available music slot ♡",
    },

    searching: {
      icon: "୨୧",
      label: "SEARCHING YOUTUBE",
      detail:
        "finding your song ♡",
    },

    processing: {
      icon: "♡",
      label: "PREPARING AUDIO",
      detail:
        "softly processing your track ♡",
    },

    downloading: {
      icon: "୨୧",
      label: "DOWNLOADING",
      detail:
        "getting your song ready ♡",
    },

    streaming: {
      icon: "♡",
      label: "NOW PLAYING",
      detail:
        "enjoy your music ♡",
    },

    failed: {
      icon: "୨୧",
      label: "PLAYBACK FAILED",
      detail:
        "try another search ♡",
    },

    cancelled: {
      icon: "୨୧",
      label: "CANCELLED",
      detail:
        "music request was cancelled ♡",
    },
  };

  const selected =
    stateMap[state] ||
    stateMap.streaming;

  const queueLine =
    position !== null &&
    Number.isFinite(
      Number(position)
    )
      ? `│ ♡ queue   #${Number(position)}`
      : null;

  return [
    "╭─────── ୨୧ ♡ ୨୧ ───────╮",
    "        🎀 E C L I P S E",
    "          M U S I C",
    "╰─────── ୨୧ ♡ ୨୧ ───────╯",
    "",
    `        ${selected.icon} ${selected.label}`,
    "",
    `୨୧  ${cleanTitle}`,
    cleanAuthor
      ? `     ♡ ${cleanAuthor}`
      : "",
    "",
    "╭────────────────────────╮",
    `│ ♡ status  ${selected.detail}`,
    queueLine,
    `│ ♡ source  YouTube`,
    `│ ♡ time    ${cleanDuration}`,
    "╰────────────────────────╯",
    "",
    "        ♡ ୨୧ 🎀 ୨୧ ♡",
  ]
    .filter(Boolean)
    .join("\n");
}

// ============================================================
// MUSIC HELPERS
// ============================================================

function getMusicQueue(threadID) {
  const id = String(threadID);

  let queue =
    musicQueues.get(id);

  if (!queue) {
    queue = [];

    musicQueues.set(
      id,
      queue
    );
  }

  return queue;
}

function getMusicStats() {
  let totalJobs = 0;
  let pendingJobs = 0;
  let activeJobs = 0;

  for (const queue of musicQueues.values()) {
    totalJobs += queue.length;

    for (const job of queue) {
      if (
        job.status ===
        "pending"
      ) {
        pendingJobs++;
      }

      if (
        job.status ===
          "searching" ||
        job.status ===
          "processing" ||
        job.status ===
          "downloading"
      ) {
        activeJobs++;
      }
    }
  }

  return {
    totalJobs,
    pendingJobs,
    activeJobs,
    activeDownloads:
      activeMusicDownloads,
    waitingGlobal:
      musicPendingJobs.length,
    trackedGCs:
      musicQueues.size,
  };
}

function removeMusicJob(job) {
  if (!job) {
    return;
  }

  const queue =
    musicQueues.get(
      job.threadID
    );

  if (!queue) {
    return;
  }

  const index =
    queue.indexOf(job);

  if (index !== -1) {
    queue.splice(
      index,
      1
    );
  }

  if (queue.length === 0) {
    musicQueues.delete(
      job.threadID
    );
  }
}

function removePendingMusicJob(job) {
  const index =
    musicPendingJobs.indexOf(
      job
    );

  if (index !== -1) {
    musicPendingJobs.splice(
      index,
      1
    );
  }
}

function getMusicQueuePosition(job) {
  const queue =
    musicQueues.get(
      job.threadID
    );

  if (!queue) {
    return null;
  }

  const index =
    queue.indexOf(job);

  if (index === -1) {
    return null;
  }

  return index + 1;
}

function formatMusicBytes(bytes) {
  if (
    !Number.isFinite(bytes) ||
    bytes <= 0
  ) {
    return "0 B";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
  ];

  let value = bytes;
  let unitIndex = 0;

  while (
    value >= 1024 &&
    unitIndex <
      units.length - 1
  ) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(
    unitIndex === 0
      ? 0
      : 1
  )} ${units[unitIndex]}`;
}

// ============================================================
// MUSIC QUEUE PROCESSOR
// ============================================================

function processMusicQueue() {
  if (
    global.botDisabled === true ||
    global.botPaused === true ||
    musicPaused === true
  ) {
    return;
  }

  while (
    activeMusicDownloads <
      MUSIC_MAX_GLOBAL_DOWNLOADS &&
    musicPendingJobs.length > 0
  ) {
    const job =
      musicPendingJobs.shift();

    if (!job) {
      continue;
    }

    if (
      job.cancelled ||
      job.status !==
        "pending"
    ) {
      continue;
    }

    activeMusicDownloads++;

    void processMusicJob(
      job
    ).finally(() => {
      activeMusicDownloads =
        Math.max(
          0,
          activeMusicDownloads - 1
        );

      removeMusicJob(job);

      setImmediate(
        processMusicQueue
      );
    });
  }
}

// ============================================================
// MUSIC JOB
// ============================================================
//
// FLOW:
//
// 1. SEND "SEARCHING YOUTUBE" MESSAGE.
// 2. SEARCH.
// 3. SEND "PREPARING AUDIO" MESSAGE.
// 4. SEND "DOWNLOADING" MESSAGE.
// 5. DOWNLOAD.
// 6. SEND NEW MESSAGE containing the actual audio.
// 7. On failure, SEND a new failure message.
//
// Every status update is its own message (no editing), since
// editing the same Messenger message was buggy/unreliable.
// ============================================================

async function processMusicJob(job) {
  const {
    api,
    threadID,
  } = job;

  const temporaryFile =
    path.join(
      os.tmpdir(),
      `eclipse-audio-${crypto.randomUUID()}.mp3`
    );

  job.temporaryFile =
    temporaryFile;

  try {
    if (
      global.botDisabled === true ||
      job.cancelled
    ) {
      job.cancelled = true;
      return;
    }

    // ========================================================
    // STEP 1
    // SEND "SEARCHING" MESSAGE
    // ========================================================

    job.status =
      "searching";

    await sendMessengerMessage(
      api,
      buildMusicPanel({
        title:
          job.requestedSong,
        state:
          "searching",
      }),
      threadID
    ).catch((sendError) => {
      console.error(
        `[Music] Failed to send searching status for job ${job.id}:`,
        sendError
      );
    });

    // ========================================================
    // STEP 2
    // SEARCH YOUTUBE
    // ========================================================

    const video =
      await withTimeout(
        () =>
          searchYouTube(
            job.requestedSong
          ),
        MUSIC_SEARCH_TIMEOUT_MS,
        "YouTube search timed out."
      );

    if (
      !video ||
      !video.url
    ) {
      throw new Error(
        `No YouTube result found for "${job.requestedSong}".`
      );
    }

    if (
      job.cancelled
    ) {
      return;
    }

    const title =
      String(
        video.title ||
          job.requestedSong
      ).trim();

    const author =
      String(
        video.author ||
          video.channel ||
          ""
      ).trim();

    let duration =
      String(
        video.duration ||
          video.timestamp ||
          ""
      ).trim();

    if (!duration) {
      duration = "--:--";
    }

    job.title =
      title;

    job.author =
      author;

    job.duration =
      duration;

    // ========================================================
    // STEP 3
    // SEND "PREPARING AUDIO" MESSAGE
    // ========================================================

    job.status =
      "processing";

    await sendMessengerMessage(
      api,
      buildMusicPanel({
        title,
        author,
        duration,
        state:
          "processing",
      }),
      threadID
    ).catch((sendError) => {
      console.error(
        `[Music] Failed to send processing status for job ${job.id}:`,
        sendError
      );
    });

    if (
      global.botDisabled === true ||
      job.cancelled
    ) {
      job.cancelled = true;
      return;
    }

    // ========================================================
    // STEP 4
    // SEND "DOWNLOADING" MESSAGE
    // ========================================================

    job.status =
      "downloading";

    await sendMessengerMessage(
      api,
      buildMusicPanel({
        title,
        author,
        duration,
        state:
          "downloading",
      }),
      threadID
    ).catch((sendError) => {
      console.error(
        `[Music] Failed to send downloading status for job ${job.id}:`,
        sendError
      );
    });

    // ========================================================
    // STEP 5
    // DOWNLOAD AUDIO
    // ========================================================

    await withTimeout(
      () =>
        downloadYouTubeAudio(
          video.url,
          temporaryFile
        ),
      MUSIC_DOWNLOAD_TIMEOUT_MS,
      "YouTube audio download timed out."
    );

    if (
      job.cancelled
    ) {
      return;
    }

    // ========================================================
    // STEP 6
    // VERIFY AUDIO
    // ========================================================

    const fileInfo =
      await fsp.stat(
        temporaryFile
      );

    if (
      !fileInfo.isFile() ||
      fileInfo.size <= 0
    ) {
      throw new Error(
        "The downloaded audio file is empty."
      );
    }

    if (
      fileInfo.size >
      MAX_MUSIC_FILE_BYTES
    ) {
      throw new Error(
        `Audio file is too large (${formatMusicBytes(
          fileInfo.size
        )}). Maximum allowed is ${formatMusicBytes(
          MAX_MUSIC_FILE_BYTES
        )}.`
      );
    }

    if (
      global.botDisabled === true ||
      job.cancelled
    ) {
      job.cancelled = true;
      return;
    }

    // ========================================================
    // STEP 7
    // SEND NEW MESSAGE
    // THIS IS THE ACTUAL SONG
    // ========================================================

    job.status =
      "streaming";

    const playerMessage =
      buildMusicPanel({
        title,
        author,
        duration,
        state:
          "streaming",
      });

    await withTimeout(
      () =>
        sendMessengerMessage(
          api,
          {
            body:
              playerMessage,

            attachment:
              fs.createReadStream(
                temporaryFile
              ),
          },
          threadID
        ),
      MUSIC_SEND_TIMEOUT_MS,
      "Sending the audio to Messenger timed out."
    );

    console.log(
      `[Music] Sent "${title}" to ${threadID}`
    );
  } catch (error) {
    if (
      job.cancelled
    ) {
      console.log(
        `[Music] Job ${job.id} cancelled.`
      );

      return;
    }

    console.error(
      `[Music] Job ${job.id} failed:`,
      error
    );

    let errorMessage =
      error?.message ||
      String(error);

    if (
      errorMessage.length >
      500
    ) {
      errorMessage =
        errorMessage.slice(
          0,
          500
        );
    }

    // ========================================================
    // FAILURE
    // SEND A NEW FAILURE MESSAGE
    // ========================================================

    const failedPanel =
      buildMusicPanel({
        title:
          job.title ||
          job.requestedSong,

        author:
          job.author ||
          "",

        duration:
          job.duration ||
          "--:--",

        state:
          "failed",
      }) +
      `\n\n♡ ${errorMessage}`;

    try {
      await sendMessengerMessage(
        api,
        failedPanel,
        threadID
      );
    } catch (sendError) {
      console.error(
        "[Music] Failed to send error message:",
        sendError
      );
    }
  } finally {
    await fsp
      .unlink(
        temporaryFile
      )
      .catch(() => {});

    job.temporaryFile =
      null;
  }
}

// ============================================================
// ENQUEUE MUSIC
// ============================================================

function enqueueMusic(
  api,
  requestedSong,
  threadID
) {
  const queue =
    getMusicQueue(threadID);

  if (
    queue.length >=
    MUSIC_MAX_PER_GC
  ) {
    return {
      accepted: false,
      reason: "gc_limit",
    };
  }

  if (
    musicPendingJobs.length >=
    MUSIC_MAX_GLOBAL_QUEUE
  ) {
    return {
      accepted: false,
      reason: "global_limit",
    };
  }

  const job = {
    id:
      ++musicJobCounter,

    api,

    threadID:
      String(threadID),

    requestedSong:
      requestedSong.trim(),

    title:
      requestedSong.trim(),

    author: "",

    duration:
      "--:--",

    status:
      "pending",

    createdAt:
      Date.now(),

    temporaryFile:
      null,

    cancelled:
      false,
  };

  queue.push(job);
  musicPendingJobs.push(job);

  return {
    accepted:
      true,

    job,

    position:
      getMusicQueuePosition(
        job
      ),
  };
}

// ============================================================
// ADD MUSIC QUEUE AFTER PAUSE RESUMES
// ============================================================

function resumeMusicProcessing() {
  setImmediate(
    processMusicQueue
  );
}

// ============================================================
// COQUETTE MUSIC COMMAND
// ============================================================

function handleMusicCommand(
  api,
  requestedSong,
  threadID
) {
  if (
    typeof requestedSong !==
      "string" ||
    !requestedSong.trim()
  ) {
    sendReplyWithTyping(
      api,
      [
        "╭─────── ୨୧ ♡ ୨୧ ───────╮",
        "          🎀 MUSIC",
        "╰─────── ୨୧ ♡ ୨୧ ───────╯",
        "",
        "♡ usage",
        "   !play <song>",
        "",
        "୨୧ example",
        "   !play Die With A Smile",
        "",
        "୨୧ also try",
        "   !music queue",
        "   !music skip",
        "",
        "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
      ].join("\n"),
      threadID
    );

    return;
  }

  const cleanSong =
    requestedSong.trim();

  if (
    cleanSong.length >
    MUSIC_REQUEST_MAX_LENGTH
  ) {
    sendReplyWithTyping(
      api,
      [
        "╭────── 🎀  MUSIC  🎀 ──────╮",
        "",
        "🔴 REQUEST TOO LONG",
        "",
        `♡ Maximum: ${MUSIC_REQUEST_MAX_LENGTH} characters.`,
        "",
        "Please shorten your song search.",
        "",
        "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
      ].join("\n"),
      threadID
    );

    return;
  }

  if (
    global.botDisabled === true
  ) {
    return;
  }

  if (
    global.botPaused === true
  ) {
    sendReplyWithTyping(
      api,
      [
        "╭────── 🎀  MUSIC  🎀 ──────╮",
        "",
        "🟡 MUSIC IS PAUSED",
        "",
        "Your request was not queued.",
        "",
        "♡ Please wait until ECLIPSE resumes.",
        "",
        "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
      ].join("\n"),
      threadID
    );

    return;
  }

  const result =
    enqueueMusic(
      api,
      cleanSong,
      threadID
    );

  if (
    !result.accepted
  ) {
    if (
      result.reason ===
      "gc_limit"
    ) {
      sendReplyWithTyping(
        api,
        [
          "╭────── 🎀  MUSIC QUEUE  🎀 ──────╮",
          "",
          "🔴 GC MUSIC LIMIT REACHED",
          "",
          `୨୧ maximum: ${MUSIC_MAX_PER_GC} songs`,
          "୨୧ active + pending both count",
          "",
          "♡ Please wait for one song to finish.",
          "",
          "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
        ].join("\n"),
        threadID
      );

      return;
    }

    sendReplyWithTyping(
      api,
      [
        "╭────── 🎀  MUSIC QUEUE  🎀 ──────╮",
        "",
        "🔴 MUSIC SYSTEM BUSY",
        "",
        "Too many music requests are currently",
        "waiting across ECLIPSE.",
        "",
        "♡ Please try again shortly.",
        "",
        "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
      ].join("\n"),
      threadID
    );

    return;
  }

  const {
    job,
    position,
  } = result;

  if (
    position > 1
  ) {
    sendReplyWithTyping(
      api,
      buildMusicPanel({
        title:
          cleanSong,

        state:
          "pending",

        position,
      }),
      threadID
    );
  }

  console.log(
    `[Music] Queued job ${job.id} for ${threadID}: "${cleanSong}"`
  );

  processMusicQueue();
}

// ============================================================
// MUSIC STATUS
// ============================================================

function sendMusicStatus(
  api,
  threadID
) {
  const queue =
    getMusicQueue(threadID);

  const stats =
    getMusicStats();

  if (
    queue.length === 0
  ) {
    sendReplyWithTyping(
      api,
      [
        "╭────── 🎀  MUSIC STATUS  🎀 ──────╮",
        "",
        "♡ this GC has no music requests.",
        "",
        `୨୧ global downloads: ${stats.activeDownloads}/${MUSIC_MAX_GLOBAL_DOWNLOADS}`,
        `୨୧ global pending: ${stats.waitingGlobal}`,
        "",
        "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
      ].join("\n"),
      threadID
    );

    return;
  }

  const lines = [
    "╭────── 🎀  MUSIC STATUS  🎀 ──────╮",
    "",
    `୨୧ GC queue: ${queue.length}/${MUSIC_MAX_PER_GC}`,
    "",
  ];

  queue.forEach(
    (job, index) => {
      const label =
        job.title ||
        job.requestedSong;

      const state =
        String(
          job.status
        ).toUpperCase();

      lines.push(
        `${index + 1}. ${state}`,
        `   ♡ ${label.slice(0, 80)}`
      );
    }
  );

  lines.push(
    "",
    "୨୧ global protection",
    `    ♡ downloads: ${stats.activeDownloads}/${MUSIC_MAX_GLOBAL_DOWNLOADS}`,
    `    ♡ pending: ${stats.waitingGlobal}/${MUSIC_MAX_GLOBAL_QUEUE}`,
    "",
    "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯"
  );

  sendReplyWithTyping(
    api,
    lines.join("\n"),
    threadID
  );
}

// ============================================================
// MUSIC SKIP
// ============================================================
//
// Skips whatever song is currently active for this GC (searching /
// processing / downloading / streaming). If nothing is active yet,
// skips the next pending song in this GC's queue instead.
// ============================================================

function handleMusicSkip(
  api,
  threadID
) {
  const queue =
    getMusicQueue(threadID);

  const activeJob =
    queue.find(
      (job) =>
        job.status !==
          "pending" &&
        !job.cancelled
    );

  if (activeJob) {
    activeJob.cancelled =
      true;

    sendReplyWithTyping(
      api,
      buildMusicPanel({
        title:
          activeJob.title ||
          activeJob.requestedSong,

        author:
          activeJob.author ||
          "",

        duration:
          activeJob.duration ||
          "--:--",

        state:
          "cancelled",
      }),
      threadID
    );

    return;
  }

  const pendingJob =
    queue.find(
      (job) =>
        job.status ===
          "pending" &&
        !job.cancelled
    );

  if (pendingJob) {
    pendingJob.cancelled =
      true;

    removePendingMusicJob(
      pendingJob
    );

    removeMusicJob(
      pendingJob
    );

    sendReplyWithTyping(
      api,
      buildMusicPanel({
        title:
          pendingJob.title ||
          pendingJob.requestedSong,

        state:
          "cancelled",
      }),
      threadID
    );

    return;
  }

  sendReplyWithTyping(
    api,
    [
      "╭────── 🎀  MUSIC SKIP  🎀 ──────╮",
      "",
      "♡ there's nothing to skip in this GC.",
      "",
      "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
    ].join("\n"),
    threadID
  );
}

// ============================================================
// MUSIC PAUSE / RESUME
// ============================================================
//
// Pausing does NOT stop a song that's already downloading or
// being sent - it just stops the next queued song from starting.
// ============================================================

function handleMusicPauseToggle(
  api,
  threadID,
  paused
) {
  musicPaused = paused;

  if (!paused) {
    resumeMusicProcessing();
  }

  sendReplyWithTyping(
    api,
    [
      "╭────── 🎀  MUSIC  🎀 ──────╮",
      "",
      paused
        ? "🟡 MUSIC QUEUE PAUSED"
        : "🟢 MUSIC QUEUE RESUMED",
      "",
      "୨୧ effect",
      paused
        ? "    ♡ no new songs will start"
        : "    ♡ queued songs will start again",
      "    ♡ a song already downloading/",
      "      sending is not affected",
      "",
      "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
    ].join("\n"),
    threadID
  );
}

// ============================================================
// DATABASE HEALTH CHECK
// ============================================================
//
// Best-effort: db.js's exact shape isn't known here, so this
// tries the common patterns (a pg-style pool, or an explicit
// ping/healthCheck export) and falls back to "unknown" rather
// than guessing wrong. Tell me what db.js exports and I'll make
// this exact.
// ============================================================

async function checkDatabaseHealth() {
  try {
    if (
      db &&
      db.pool &&
      typeof db.pool.query === "function"
    ) {
      await db.pool.query("SELECT 1");
      return true;
    }

    if (
      db &&
      typeof db.ping === "function"
    ) {
      await db.ping();
      return true;
    }

    if (
      db &&
      typeof db.healthCheck === "function"
    ) {
      await db.healthCheck();
      return true;
    }

    return null; // unknown — db.js doesn't expose a health check
  } catch (error) {
    console.error(
      "[DB HEALTH] Check failed:",
      error
    );

    return false;
  }
}

// ============================================================
// RENDER HEALTH CHECK
// ============================================================


const app = express();

app.use(express.json({ limit: "32kb" }));

const DASHBOARD_API_KEY =
  String(process.env.ECLIPSE_DASHBOARD_API_KEY || "").trim();

function dashboardCors(req, res, next) {
  const origin = String(req.headers.origin || "");
  const allowedOrigin = String(
    process.env.ECLIPSE_DASHBOARD_ORIGIN || "*"
  ).trim();

  res.setHeader(
    "Access-Control-Allow-Origin",
    allowedOrigin === "*" ? "*" : origin === allowedOrigin ? origin : allowedOrigin
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-ECLIPSE-DASHBOARD-KEY");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
}

function requireDashboardAccess(req, res, next) {
  if (!DASHBOARD_API_KEY) {
    return res.status(503).json({
      ok: false,
      error: "Dashboard API key is not configured on Render.",
    });
  }

  const bearer = String(
    req.headers.authorization || ""
  ).replace(/^Bearer\s+/i, "").trim();

  const provided = String(
    req.headers["x-eclipse-dashboard-key"] ||
      bearer ||
      (req.path === "/api/dashboard/events/stream" ? req.query.dashboard_key : "")
  ).trim();

  if (!provided || provided !== DASHBOARD_API_KEY) {
    return res.status(401).json({
      ok: false,
      error: "Dashboard authorization required.",
    });
  }

  next();
}

app.use(dashboardCors);

// ============================================================
// ECLIPSE LAB / BANAT SIMULATOR API
// ============================================================
// Developer-only endpoint used by the local Chrome extension.
// It runs the existing Banat humanization + timing pipeline without
// sending anything to Messenger. Authentication reuses the existing
// dashboard API key; no separate secret is stored in the bot.
// ============================================================

app.post(
  "/api/dev/banat/simulate",
  requireDashboardAccess,
  async (req, res) => {
    try {
      const threadID = String(req.body?.threadID || "eclipse-lab").trim();
      const incomingText = String(req.body?.incomingText || "").slice(0, 4000);
      let candidate = String(req.body?.candidate || "").slice(0, 4000).trim();

      if (!incomingText.trim()) {
        return res.status(400).json({
          ok: false,
          error: "incomingText is required.",
        });
      }

      // If the Lab candidate box is empty, let the same Groq trigger
      // reply engine used by ECLIPSE generate the raw answer first.
      if (!candidate) {
        candidate = await generateTriggerReply({
          trigger: "eclipse-lab",
          groupName: "eclipse-lab",
          incomingText,
          fallback: "",
          conversationContext: "(ECLIPSE Lab test — generate a natural reply to the incoming message.)",
        });

        candidate = String(candidate || "").trim();

        if (!candidate) {
          return res.status(502).json({
            ok: false,
            error: "AI returned an empty reply.",
          });
        }
      }

      const prepared = prepareBanatReply(
        threadID || "eclipse-lab",
        candidate,
        incomingText
      );

      return res.json({
        ok: true,
        input: {
          incomingText,
          candidate,
          candidateGenerated: !String(req.body?.candidate || "").trim(),
        },
        output: {
          text: prepared.text,
          reactionMs: prepared.reactionMs,
          typingMs: prepared.typingMs,
          totalMs: prepared.reactionMs + prepared.typingMs,
        },
        context: prepared.context,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[ECLIPSE LAB] Banat simulation failed:", error);
      return res.status(500).json({
        ok: false,
        error: error?.message || "Banat simulation failed.",
      });
    }
  }
);

app.get(
  "/api/dashboard/status",
  requireDashboardAccess,
  async (_req, res) => {
    // Messenger session state is owned by the active API/listener generation.
    // The watchdog can briefly mark the transport unhealthy during a transient
    // listener hiccup; that must not make the dashboard treat a valid session
    // as logged out.
    const connected =
      Boolean(activeMessengerApi) &&
      activeListenerGeneration > 0;

    res.json({
      ok: true,
      facebook_connected: connected,
      login_in_progress: loginInProgress,
      login_error: dashboardLoginError,
      facebook_user_name: connected
        ? "Messenger account"
        : null,
      session_active: connected,
      bot_running:
        connected && !dashboardBotPaused,
      bot_paused: dashboardBotPaused,
      last_connected_at: dashboardLastConnectedAt,
      last_disconnected_at: dashboardLastDisconnectedAt,
      auth: await getMessengerAuthDiagnostics(),
      watchdog: getWatchdogStatus(),
      updated_at: new Date().toISOString(),
    });
  }
);


app.get(
  "/api/dashboard/snapshot",
  requireDashboardAccess,
  async (_req, res) => {
    try {
      const snapshot = await db.getDashboardSnapshot();

      res.json({
        ok: true,
        snapshot,
        runtime: {
          watchdog: getWatchdogStatus(),
          traffic: trafficSafetyStatus(),
          music: getMusicStats(),
          database: await db.healthCheck().catch(() => false),
          uptime_seconds: Math.floor(process.uptime()),
          node_version: process.version,
          memory: process.memoryUsage(),
        },
      });
    } catch (error) {
      console.error("[DASHBOARD] Snapshot query failed:", error);

      // A read-model/schema failure is not an authentication failure.
      // Keep the HTTP response authenticated so the Command Center does not
      // discard a valid Facebook session just because dashboard data failed.
      res.status(200).json({
        ok: true,
        degraded: true,
        snapshot: null,
        error: "Dashboard data is temporarily unavailable.",
        error_code: "DASHBOARD_SNAPSHOT_UNAVAILABLE",
        runtime: {
          watchdog: getWatchdogStatus(),
          traffic: trafficSafetyStatus(),
          music: getMusicStats(),
          database: await db.healthCheck().catch(() => false),
          uptime_seconds: Math.floor(process.uptime()),
          node_version: process.version,
          memory: process.memoryUsage(),
        },
      });
    }
  }
);

app.get(
  "/api/dashboard/health",
  requireDashboardAccess,
  async (_req, res) => {
    try {
      const watchdog = getWatchdogStatus();
      const traffic = trafficSafetyStatus();
      const music = getMusicStats();
      const database = await db.healthCheck().catch(() => false);

      return res.json({
        ok: watchdog.ok === true && database === true,
        runtime: {
          watchdog,
          traffic,
          music,
          database,
          uptime_seconds: Math.floor(process.uptime()),
          node_version: process.version,
          memory: process.memoryUsage(),
        },
        generated_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[DASHBOARD] Health query failed:", error);
      return res.status(503).json({
        ok: false,
        error: "Runtime health is temporarily unavailable.",
      });
    }
  }
);

app.post(
  "/api/dashboard/connect-session",
  requireDashboardAccess,
  (req, res) => {
    if (loginInProgress) {
      return res.status(409).json({
        ok: false,
        error: "A Facebook login is already in progress. Wait for it to finish, then try again.",
      });
    }

    let incoming;

    try {
      incoming = normalizeFacebookAppState(req.body?.appState, "Facebook appState");
    } catch (error) {
      return res.status(400).json({ ok: false, error: error?.message || "Invalid Facebook session export." });
    }

    // Validate the replacement session before touching the currently
    // working Messenger listener. If Facebook rejects these cookies,
    // ECLIPSE stays connected with the previous valid session.
    pendingFacebookAppState = incoming;

    dashboardBotPaused = false;
    pushDashboardEvent("messenger", "Facebook session validation requested from Command Center. The session will be checkpointed after successful login.");
    listenerGeneration++;

    if (loginRetryTimer) {
      clearTimeout(loginRetryTimer);
      loginRetryTimer = null;
    }

    loginAttempt = 0;
    listenFailureCount = 0;
    attemptLogin();

    return res.status(202).json({
      ok: true,
      action: "facebook_session_connect_requested",
    });
  }
);

app.post(
  "/api/dashboard/reconnect",
  requireDashboardAccess,
  async (_req, res) => {
    dashboardBotPaused = false;

    const diagnostics = await getMessengerAuthDiagnostics();

    if (
      !diagnostics.connected &&
      diagnostics.durable_checkpoint !== "available" &&
      !diagnostics.fb_cookies_configured
    ) {
      dashboardLoginError =
        "No durable Messenger session or FB_COOKIES is available. Upload a fresh Facebook session export or cookie header.";
      pushDashboardEvent("messenger", dashboardLoginError);

      return res.status(409).json({
        ok: false,
        action: "session_required",
        error: dashboardLoginError,
        auth: await getMessengerAuthDiagnostics(),
      });
    }

    pushDashboardEvent("messenger", "Messenger reconnect requested from Command Center.");

    if (
      !activeMessengerApi ||
      activeListenerGeneration <= 0
    ) {
      if (loginRetryTimer) {
        clearTimeout(loginRetryTimer);
        loginRetryTimer = null;
      }
      loginAttempt = 0;
      attemptLogin();
    }

    return res.json({
      ok: true,
      action: "reconnect_requested",
      auth: await getMessengerAuthDiagnostics(),
    });
  }
);

app.post(
  "/api/dashboard/disconnect",
  requireDashboardAccess,
  (_req, res) => {
    dashboardBotPaused = true;
    pushDashboardEvent("messenger", "Messenger listener disconnected from Command Center.");
    listenerGeneration++;
    activeListenerGeneration = 0;
    activeMessengerApi = null;
    watchdogSetMessengerConnected(false);
    dashboardLastDisconnectedAt = new Date().toISOString();

    if (loginRetryTimer) {
      clearTimeout(loginRetryTimer);
      loginRetryTimer = null;
    }

    res.json({
      ok: true,
      action: "listener_disconnected",
      note: "The Messenger listener was detached. The durable session checkpoint remains available for the next reconnect.",
    });
  }
);

app.post(
  "/api/dashboard/bot/start",
  requireDashboardAccess,
  (_req, res) => {
    dashboardBotPaused = false;
    pushDashboardEvent("bot", "ECLIPSE message handling enabled from Command Center.");

    if (
      !activeMessengerApi ||
      activeListenerGeneration <= 0
    ) {
      attemptLogin();
    }

    res.json({
      ok: true,
      action: "bot_start_requested",
    });
  }
);

app.post(
  "/api/dashboard/bot/stop",
  requireDashboardAccess,
  (_req, res) => {
    dashboardBotPaused = true;
    pushDashboardEvent("bot", "ECLIPSE message handling paused from Command Center.");

    res.json({
      ok: true,
      action: "bot_paused",
    });
  }
);


// ============================================================
// ECLIPSE — PRIVATE ANNIVERSARY LETTER
// ============================================================
// Served from the same Render service so Messenger can open the
// full mobile letter in a normal browser.
app.use(
  "/letter",
  express.static(
    path.join(__dirname, "public", "letter"),
    {
      extensions: ["html"],
      maxAge: 0,
      setHeaders: (res) => {
        res.setHeader(
          "Cache-Control",
          "no-store, no-cache, must-revalidate, proxy-revalidate"
        );
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      },
    }
  )
);


app.get("/", (_req, res) => {
  res.status(200).send(
    "ECLIPSE is running ♡"
  );
});

app.get("/health", async (_req, res) => {
  const music =
    getMusicStats();

  const watchdog =
    getWatchdogStatus();

  const databaseHealthy =
    await checkDatabaseHealth();

  const healthOk =
    watchdog.ok &&
    databaseHealthy !== false;

  res.status(
    healthOk
      ? 200
      : 503
  ).json({
    ok:
      healthOk,

    botDisabled:
      global.botDisabled === true,

    botPaused:
      global.botPaused === true,

    uptime:
      process.uptime(),

    watchdog,

    database:
      databaseHealthy,

    trafficGovernor: trafficSafetyStatus(),

    music: {
      activeDownloads:
        music.activeDownloads,

      globalPending:
        music.waitingGlobal,

      trackedGCs:
        music.trackedGCs,

      activeJobs:
        music.activeJobs,

      pendingJobs:
        music.pendingJobs,
    },

    timestamp:
      new Date().toISOString(),
  });
});

const port =
  Number.parseInt(
    process.env.PORT || "3000",
    10
  );

if (
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535
) {
  throw new Error(
    `Invalid PORT value: ${process.env.PORT}`
  );
}


// ============================================================
// ECLIPSE COMMAND CENTER — LIVE CONTROL PLANE
// ============================================================
// Read-only data stays in db.js. This layer adds safe operational
// events and narrowly scoped control endpoints; it never accepts
// arbitrary SQL, JavaScript, or internal function names.
// ============================================================

const dashboardEventBuffer = [];
const dashboardEventClients = new Set();
const DASHBOARD_EVENT_LIMIT = 150;

function pushDashboardEvent(type, message, meta = {}) {
  const event = {
    id: crypto.randomUUID(),
    type: String(type || "system"),
    message: String(message || ""),
    meta: meta && typeof meta === "object" ? meta : {},
    created_at: new Date().toISOString(),
  };

  dashboardEventBuffer.unshift(event);
  if (dashboardEventBuffer.length > DASHBOARD_EVENT_LIMIT) {
    dashboardEventBuffer.length = DASHBOARD_EVENT_LIMIT;
  }

  const payload = `data: ${JSON.stringify(event)}\\n\\n`;
  for (const client of dashboardEventClients) {
    try {
      client.write(payload);
    } catch {
      dashboardEventClients.delete(client);
    }
  }

  return event;
}

app.get(
  "/api/dashboard/events",
  requireDashboardAccess,
  (req, res) => {
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(String(req.query.limit || "50"), 10) || 50)
    );

    res.json({
      ok: true,
      events: dashboardEventBuffer.slice(0, limit),
      generated_at: new Date().toISOString(),
    });
  }
);

app.get(
  "/api/dashboard/events/stream",
  requireDashboardAccess,
  (req, res) => {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const heartbeat = () => {
      try { res.write(`: heartbeat ${Date.now()}\\n\\n`); } catch {}
    };

    dashboardEventClients.add(res);
    res.write(`event: ready\\ndata: ${JSON.stringify({
      ok: true,
      generated_at: new Date().toISOString(),
    })}\\n\\n`);

    const heartbeatTimer = setInterval(heartbeat, 20_000);
    heartbeatTimer.unref?.();

    req.on("close", () => {
      clearInterval(heartbeatTimer);
      dashboardEventClients.delete(res);
    });
  }
);

app.get(
  "/api/dashboard/user",
  requireDashboardAccess,
  async (req, res) => {
    try {
      const threadId = String(req.query.thread_id || "").trim();
      const userId = String(req.query.user_id || "").trim();

      if (!threadId || !userId) {
        return res.status(400).json({
          ok: false,
          error: "thread_id and user_id are required.",
        });
      }

      const inspector = await db.getDashboardUser(threadId, userId);

      return res.json({
        ok: true,
        ...inspector,
      });
    } catch (error) {
      console.error("[DASHBOARD] User inspector failed:", error);
      return res.status(503).json({
        ok: false,
        error: "Dashboard user data is temporarily unavailable.",
      });
    }
  }
);

app.get(
  "/api/dashboard/analytics",
  requireDashboardAccess,
  async (req, res) => {
    try {
      const hours = Math.min(
        168,
        Math.max(
          1,
          Number.parseInt(String(req.query.hours || "24"), 10) || 24
        )
      );

      const analytics = await db.getDashboardAnalytics(hours);

      return res.json({
        ok: true,
        analytics,
      });
    } catch (error) {
      console.error("[DASHBOARD] Analytics failed:", error);
      return res.status(503).json({
        ok: false,
        error: "Dashboard analytics are temporarily unavailable.",
      });
    }
  }
);

app.post(
  "/api/dashboard/music/pause",
  requireDashboardAccess,
  (_req, res) => {
    musicPaused = true;
    pushDashboardEvent("music", "Music queue paused from Command Center.");
    return res.json({ ok: true, paused: true });
  }
);

app.post(
  "/api/dashboard/music/resume",
  requireDashboardAccess,
  (_req, res) => {
    musicPaused = false;
    resumeMusicProcessing();
    pushDashboardEvent("music", "Music queue resumed from Command Center.");
    return res.json({ ok: true, paused: false });
  }
);


const server =
  app.listen(
    port,
    "0.0.0.0",
    () => {
      console.log(
        `Web server listening on port ${port}`
      );

      startWatchdog();
    }
  );

server.on(
  "error",
  (error) => {
    console.error(
      "Web server error:",
      error
    );

    process.exitCode = 1;
  }
);

// ============================================================
// FACEBOOK COOKIES
// ============================================================

function parseFacebookCookieHeader(header, source) {
    const cookies = header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        if (separator <= 0) return null;
        return { key: part.slice(0, separator).trim(), value: part.slice(separator + 1).trim() };
      })
      .filter(Boolean);
    if (cookies.length === 0) throw new Error(`${source} must contain Facebook cookies.`);
    return cookies;
    }

    function normalizeFacebookAppState(input, source = "Facebook appState") {
    let value = input;
    for (let depth = 0; depth < 4; depth += 1) {
      if (typeof value === "string") {
        const text = value.trim();
        if (!text) throw new Error(`${source} must not be empty.`);
        try { value = JSON.parse(text); continue; } catch { return parseFacebookCookieHeader(text, source); }
      }
      if (Array.isArray(value)) {
        if (value.length === 0) throw new Error(`${source} must be a non-empty cookie array.`);
        return value.map((cookie) => {
          if (!cookie || typeof cookie !== "object" || Array.isArray(cookie)) throw new Error(`${source} contains an invalid cookie object.`);
          const key = typeof cookie.key === "string" ? cookie.key : cookie.name;
          if (typeof key !== "string" || !key.trim() || typeof cookie.value !== "string") throw new Error(`${source} contains a cookie without a string name/key and value.`);
          return { ...cookie, key: key.trim() };
        });
      }
      if (value && typeof value === "object") {
        const nestedKey = ["appState", "cookies", "data"].find((key) => Object.prototype.hasOwnProperty.call(value, key));
        if (nestedKey) { value = value[nestedKey]; continue; }
      }
      break;
    }
    throw new Error(`${source} must be a cookie array, a wrapped cookie export, JSON text, or a cookie-header string.`);
    }

function getSessionCryptoKey() {
  const secret =
    String(
      process.env.ECLIPSE_SESSION_ENCRYPTION_KEY ||
      process.env.ECLIPSE_DASHBOARD_API_KEY ||
      process.env.DATABASE_URL ||
      ""
    ).trim();

  if (!secret) return null;

  return crypto
    .createHash("sha256")
    .update(secret)
    .digest();
}

function encryptSessionState(state) {
  const key = getSessionCryptoKey();
  if (!key) throw new Error("No session encryption key is configured.");

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = JSON.stringify(state);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

function decryptSessionState(payload) {
  const key = getSessionCryptoKey();
  if (!key) throw new Error("No session encryption key is configured.");

  const [ivText, tagText, ciphertextText] = String(payload || "").split(".");
  if (!ivText || !tagText || !ciphertextText) {
    throw new Error("Stored session state is malformed.");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivText, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final(),
  ]).toString("utf8");

  return normalizeFacebookAppState(
    JSON.parse(plaintext),
    "Stored Messenger session"
  );
}

async function persistFacebookSessionState(state) {
  try {
    if (!Array.isArray(state) || state.length === 0) return false;

    const encrypted = encryptSessionState(state);
    await db.setMessengerSessionState(encrypted);

    console.log("[AUTH] Current Messenger session checkpoint persisted.");
    return true;
  } catch (error) {
    console.error(
      "[AUTH] Could not persist Messenger session checkpoint:",
      error?.message || error
    );
    return false;
  }
}

async function loadPersistedFacebookSessionState() {
  try {
    await db.connect();

    const encrypted = await db.getMessengerSessionState();
    if (!encrypted) {
      appState = deploymentAppState;
      appStateSource = deploymentAppState ? "fb_cookies" : "none";
      return false;
    }

    const restored = decryptSessionState(encrypted);

    if (!Array.isArray(restored) || restored.length === 0) {
      throw new Error("Stored session state is empty.");
    }

    appState = restored;
    appStateSource = "durable";
    durableSessionRejected = false;

    console.log("[AUTH] Durable Messenger session checkpoint restored.");
    return true;
  } catch (error) {
    appState = deploymentAppState;
    appStateSource = deploymentAppState ? "fb_cookies" : "none";

    console.warn(
      "[AUTH] Durable session restore unavailable; using FB_COOKIES fallback:",
      error?.message || error
    );
    return false;
  }
}

async function getMessengerAuthDiagnostics() {
  let durableCheckpoint = false;
  let durableState = "unknown";
  let durableError = null;

  try {
    await db.connect();
    durableCheckpoint = Boolean(await db.getMessengerSessionState());
    durableState = durableCheckpoint ? "available" : "missing";
  } catch (error) {
    durableState = "database_unavailable";
    durableError = getFacebookLoginErrorMessage(error);
  }

  const connected =
    Boolean(activeMessengerApi) &&
    activeListenerGeneration > 0;

  let state = "needs_session";
  let recoveryAction = "Upload a valid Facebook session export or cookie header.";

  if (connected) {
    state = "connected";
    recoveryAction = "No action required.";
  } else if (loginInProgress) {
    state = "connecting";
    recoveryAction = "Wait for the current validation attempt to finish.";
  } else if (pendingFacebookAppState) {
    state = "replacement_pending";
    recoveryAction = "Wait for the uploaded Facebook session validation.";
  } else if (appStateSource === "durable" && durableSessionRejected) {
    state = "durable_rejected";
    recoveryAction = deploymentAppState
      ? "The durable session was rejected. ECLIPSE is ready to retry with FB_COOKIES."
      : "Upload a fresh Facebook session export or cookie header.";
  } else if (appStateSource === "fb_cookies" && deploymentAppState) {
    state = "session_available";
    recoveryAction = "Press Reconnect to validate the available FB_COOKIES session.";
  } else if (durableState === "database_unavailable") {
    state = "database_unavailable";
    recoveryAction = "Restore database connectivity, then press Reconnect or upload a fresh session.";
  } else if (durableState === "missing" && !deploymentAppState) {
    state = "no_session";
    recoveryAction = "Upload a valid Facebook session export or cookie header. No durable session or FB_COOKIES is available.";
  }

  return {
    state,
    source: appStateSource,
    connected,
    login_in_progress: loginInProgress,
    durable_checkpoint: durableState,
    durable_error: durableError,
    durable_session_rejected: durableSessionRejected,
    fb_cookies_configured: Boolean(deploymentAppState),
    pending_session_validation: Boolean(pendingFacebookAppState),
    login_error: dashboardLoginError,
    recovery_action: recoveryAction,
  };
}

    function readAppState() {
    const rawCookies = process.env.FB_COOKIES;
    if (typeof rawCookies !== "string" || !rawCookies.trim()) return null;
    return normalizeFacebookAppState(rawCookies, "FB_COOKIES");
    }

let appState;
let deploymentAppState = null;
let appStateSource = "none";
let durableSessionRejected = false;

try {
  appState =
    readAppState();

  deploymentAppState = appState;
  appStateSource = appState ? "fb_cookies" : "none";

  if (!appState) {
    console.warn(
      "[LOGIN] FB_COOKIES is not configured; dashboard session upload is required for authentication."
    );
  }
} catch (error) {
  console.error(
    `Configuration error: ${error.message}`
  );

  process.exit(1);
}

// ============================================================
// FACEBOOK LOGIN
// ============================================================
//
// Wrapped in a retryable function with exponential backoff.
// A raw process.exit(1) on the first failure (the old behavior)
// combined with Render's auto-restart could produce a tight
// crash-restart loop against Facebook's login endpoint, which
// is exactly the kind of pattern that gets accounts flagged.
// Backoff caps at MAX_LOGIN_BACKOFF_MS between attempts.
// ============================================================

let loginAttempt = 0;
let listenFailureCount = 0;
let loginInProgress = false;
let listenerGeneration = 0;
let activeListenerGeneration = 0;
let startupSchedulersInitialized = false;
let loginRetryTimer = null;
let activeMessengerApi = null;
let eclipseUserID = "";

let dashboardBotPaused = false;
let dashboardLastConnectedAt = null;
let dashboardLastDisconnectedAt = null;
let dashboardLoginError = null;

// A dashboard-submitted session is kept here until Facebook accepts it.
// This prevents an invalid replacement cookie set from immediately
// destroying an already-working Messenger session.
let pendingFacebookAppState = null;

// Prevent accidentally attaching two MQTT listeners to the same
// Messenger API object during reconnect races.
const listenerStartedApis = new WeakSet();

const MAX_LOGIN_BACKOFF_MS = 5 * 60_000;
const MAX_LISTEN_RETRIES = 5;

function getFacebookLoginErrorMessage(error) {
  const parts = [];
  const visited = new Set();

  function addPart(value) {
    if (
      value === null ||
      value === undefined
    ) {
      return;
    }

    const text = String(value).trim();

    if (text && !parts.includes(text)) {
      parts.push(text);
    }
  }

  function visit(value, depth = 0) {
    if (
      value === null ||
      value === undefined ||
      depth > 2
    ) {
      return;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      addPart(value);
      return;
    }

    if (
      typeof value !== "object" ||
      visited.has(value)
    ) {
      return;
    }

    visited.add(value);

    for (
      const key of [
        "name",
        "message",
        "errorDescription",
        "error_description",
        "description",
        "reason",
        "error",
        "code",
        "type",
      ]
    ) {
      if (key in value) {
        visit(value[key], depth + 1);
      }
    }
  }

  visit(error);

  const message = (
    parts.length > 0
      ? parts.join(" | ")
      : "Facebook login failed."
  )
    .replace(
      /(["']?(?:password|passwd|pass|cookie|appstate|access[_-]?token|refresh[_-]?token|session(?:[_-]?id|[_-]?token)?|authorization)["']?\s*[:=]\s*)[^,;\s}]+/gi,
      "$1[redacted]"
    )
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "[redacted email]"
    )
    .slice(0, 500);

  return message || "Facebook login failed.";
}

function fallbackFromRejectedDurableSession() {
  if (
    !deploymentAppState ||
    appStateSource !== "durable" ||
    durableSessionRejected
  ) {
    return false;
  }

  durableSessionRejected = true;
  appState = deploymentAppState;
  appStateSource = "fb_cookies";
  loginAttempt = 0;
  dashboardLoginError =
    "Durable Messenger session was rejected; retrying with FB_COOKIES.";

  console.warn(
    "[AUTH] Durable session rejected; falling back to FB_COOKIES."
  );

  return true;
}

function attemptLogin() {
  const isReplacementSession = Boolean(pendingFacebookAppState);
  const candidateAppState =
    pendingFacebookAppState || appState;

  if (
    !Array.isArray(candidateAppState) ||
    candidateAppState.length === 0
  ) {
    dashboardLoginError =
      "No usable Facebook session is available. Upload a valid session export or cookie header.";
    console.warn("[LOGIN] No usable Facebook session is available; waiting for dashboard recovery.");
    return;
  }

  if (loginInProgress) {
    console.warn("[LOGIN] Login attempt already in progress; skipping duplicate attempt.");
    return;
  }

  loginInProgress = true;
  const thisGeneration = ++listenerGeneration;

  const loginInput = candidateAppState;

  let loginSettled = false;

  const handleLoginInvocationFailure = (error) => {
    if (
      loginSettled ||
      thisGeneration !== listenerGeneration
    ) {
      return;
    }

    loginSettled = true;
    dashboardLoginError = getFacebookLoginErrorMessage(error);

    // Missing authentication input is a configuration/recovery state, not a
    // reason to hammer Facebook with exponential retries.
    if (/no cookie or credentials found/i.test(dashboardLoginError)) {
      loginInProgress = false;
      dashboardLoginError =
        "No usable Facebook session was supplied to ws3-fca. Upload a session export or cookie header.";
      return;
    }

    // A stale durable checkpoint can also fail before ws3-fca invokes the
    // normal login callback. Fall back to FB_COOKIES for that case too.
    if (!isReplacementSession) {
      const fellBackToCookies =
        fallbackFromRejectedDurableSession();

      if (fellBackToCookies) {
        loginInProgress = false;
        if (loginRetryTimer) clearTimeout(loginRetryTimer);
        loginRetryTimer = setTimeout(() => {
          loginRetryTimer = null;
          attemptLogin();
        }, 100);
        return;
      }

      if (appStateSource !== "durable") {
        loginInProgress = false;
        dashboardLoginError =
          appStateSource === "fb_cookies"
            ? "FB_COOKIES was rejected by Facebook. Upload a fresh session export or cookie header."
            : "No usable Facebook session is available. Upload a fresh session export or cookie header.";
        console.warn("[AUTH] Facebook session is unavailable; waiting for dashboard recovery.");
        return;
      }
    }

    loginInProgress = false;

    // If this was only a replacement-session test, keep the currently
    // connected Messenger account alive while the new session retries.
    if (!activeMessengerApi) {
      watchdogSetMessengerConnected(false);
    }

    loginAttempt++;

    const backoffMs = Math.min(
      2 ** loginAttempt * 1000,
      MAX_LOGIN_BACKOFF_MS
    );

    console.error(
      `[LOGIN] Login invocation failed (attempt ${loginAttempt}). Retrying in ${backoffMs}ms: ${dashboardLoginError}`
    );

    if (loginRetryTimer) {
      clearTimeout(loginRetryTimer);
    }

    loginRetryTimer = setTimeout(() => {
      loginRetryTimer = null;
      attemptLogin();
    }, backoffMs);
  };

  try {
    const loginResult = login(
      loginInput,
      {
        online: true,
        updatePresence: true,
        selfListen: true,
        randomUserAgent: false,
      },

    async (
      loginError,
      api
    ) => {
      // A previous login callback can arrive after a newer login
      // attempt has already started. Never let that stale callback
      // change login state, schedule another retry, or attach a
      // second Messenger listener.
      if (thisGeneration !== listenerGeneration) {
        console.warn(
          `[LOGIN] Discarding stale login callback (generation ${thisGeneration}, current ${listenerGeneration}).`
        );
        return;
      }

      if (loginSettled) {
        return;
      }

      loginSettled = true;

      if (loginError || !api) {
        dashboardLoginError = getFacebookLoginErrorMessage(
          loginError || "No API object returned."
        );

        // A replacement session must never take down a currently working
        // Messenger session. If Facebook rejects the replacement, discard it
        // and keep the known-good listener alive.
        if (isReplacementSession && activeMessengerApi) {
          pendingFacebookAppState = null;
          loginInProgress = false;
          dashboardLoginError =
            "Replacement session was rejected; the existing Messenger session remains active.";
          console.warn(
            "[AUTH] Replacement session rejected; keeping the existing Messenger session."
          );
          return;
        }

        if (isReplacementSession) {
          pendingFacebookAppState = null;
          loginInProgress = false;

          if (activeMessengerApi) {
            dashboardLoginError =
              "Uploaded Facebook session was rejected; the existing Messenger session remains active.";
            console.warn("[AUTH] Uploaded replacement session rejected; keeping the existing Messenger session.");
            return;
          }

          dashboardLoginError =
            "Uploaded Facebook session was rejected. Upload a fresh session export or cookie header.";
          console.warn("[AUTH] Uploaded Facebook session rejected; waiting for dashboard recovery.");
          return;
        }

        const fellBackToCookies =
          fallbackFromRejectedDurableSession();

        if (!fellBackToCookies && appStateSource !== "durable") {
          loginInProgress = false;
          dashboardLoginError =
            appStateSource === "fb_cookies"
              ? "FB_COOKIES was rejected by Facebook. Upload a fresh session export or cookie header."
              : "No usable Facebook session is available. Upload a fresh session export or cookie header.";
          console.warn("[AUTH] Facebook session is unavailable; waiting for dashboard recovery.");
          return;
        }

        if (fellBackToCookies) {
          loginInProgress = false;
          if (loginRetryTimer) clearTimeout(loginRetryTimer);
          loginRetryTimer = setTimeout(() => {
            loginRetryTimer = null;
            attemptLogin();
          }, 100);
          return;
        }

        loginAttempt++;

        const backoffMs = Math.min(
          2 ** loginAttempt * 1000,
          MAX_LOGIN_BACKOFF_MS
        );

        console.error(
          `[LOGIN] Login failed (attempt ${loginAttempt}). Retrying in ${backoffMs}ms: ${dashboardLoginError}`
        );

        if (!activeMessengerApi && appStateSource !== "durable") {
          watchdogSetMessengerConnected(false);
        }

        loginInProgress = false;

        if (loginRetryTimer) {
          clearTimeout(loginRetryTimer);
        }

        loginRetryTimer = setTimeout(() => {
          loginRetryTimer = null;
          attemptLogin();
        }, backoffMs);

        return;
      }

      loginAttempt = 0;
      listenFailureCount = 0;
      loginInProgress = false;
      dashboardLoginError = null;

      // Every successful login may return refreshed Facebook session
      // state. Keep it in memory so native ws3-fca recovery can continue
      // from the newest valid session instead of an old cookie snapshot.
      try {
        if (typeof api.getAppState === "function") {
          const refreshedAppState = api.getAppState();

          if (
            Array.isArray(refreshedAppState) &&
            refreshedAppState.length > 0
          ) {
            appState = refreshedAppState;
            pendingFacebookAppState = null;
            console.log(
              "[AUTH] Refreshed Facebook appState captured in memory."
            );
          } else if (pendingFacebookAppState) {
            appState = pendingFacebookAppState;
            pendingFacebookAppState = null;
          }
        }
      } catch (error) {
        console.warn(
          "[AUTH] Could not capture refreshed appState:",
          error?.message || error
        );
      }

      // Persist the newest session returned by ws3-fca. This is what makes
      // a refreshed cookie survive Render restarts and redeploys.
      await persistFacebookSessionState(appState);
      appStateSource = "durable";
      durableSessionRejected = false;

      pendingFacebookAppState = null;

      if (loginRetryTimer) {
        clearTimeout(loginRetryTimer);
        loginRetryTimer = null;
      }

      activeListenerGeneration = thisGeneration;

      // This generation now owns message processing. Any older
      // listener callback will fail the generation check below.
      api = installTrafficGovernor(api) || api;
      activeMessengerApi = api;

      try {
        eclipseUserID = typeof api.getCurrentUserID === "function"
          ? String(api.getCurrentUserID() || "").trim()
          : "";

        // Fallback to the c_user cookie when the adapter does not expose
        // getCurrentUserID() reliably. This is only used to identify ECLIPSE's
        // own incoming self-listen events.
        if (!eclipseUserID && Array.isArray(appState)) {
          const ownCookie = appState.find(
            (cookie) =>
              String(cookie?.key || cookie?.name || "").trim() === "c_user"
          );

          if (ownCookie?.value) {
            eclipseUserID = String(ownCookie.value).trim();
          }
        }

        console.log(
          "[AUTH] ECLIPSE user ID " +
            (eclipseUserID ? "detected." : "not available.")
        );
      } catch (error) {
        eclipseUserID = "";
        console.warn(
          "[AUTH] Could not determine ECLIPSE user ID:",
          error?.message || error
        );
      }

      watchdogSetMessengerConnected(
        true
      );

      dashboardLastConnectedAt = new Date().toISOString();

      console.log(
        "Logged in successfully."
      );

      // ========================================================
      // DATABASE
      // ========================================================

      try {
        await db.connect();

        try {
          await ensureNicknameGuardTable();
        } catch (error) {
          console.error("[NICK GUARD] Failed to initialize:", error);
        }

        console.log(
          "Neon database connected successfully."
        );
        
        try {
          startBibleVerseScheduler(
            api,
            trafficSendMessage
          );
        } catch (error) {
          console.error(
            "[BIBLE] Failed to start verse scheduler:",
            error
          );
        }
      } catch (error) {
        console.error(
          "[DB] Database initialization failed after Messenger login; " +
            "keeping the Facebook session alive:",
          error
        );

        dashboardLoginError =
          "Messenger is connected, but database initialization is temporarily unavailable.";

        pushDashboardEvent(
          "database",
          "Database initialization failed; Messenger session remains connected."
        );
      }

      // ========================================================
      // LAST CHAMBER
      // Restores any open table after a restart.
      // ========================================================

      try {
        await initLastChamber(api);
      } catch (error) {
        console.error(
          "[chamber] init failed:",
          error
        );
      }

      // ========================================================
      // DEBATE
      // Restores open debate sessions after a restart.
      // ========================================================

      try {
        await initDebate(api);
      } catch (error) {
        console.error(
          "[debate] init failed:",
          error
        );
      }

      // ========================================================
      // CLEANUP
      // ========================================================

      try {
        if (!startupSchedulersInitialized) {
          startCleanupScheduler();
          startupSchedulersInitialized = true;

          console.log(
            "[CLEANUP] Cleanup scheduler started."
          );
        } else {
          console.log(
            "[CLEANUP] Cleanup scheduler already initialized; skipping duplicate start."
          );
        }
      } catch (error) {
        console.error(
          "[CLEANUP] Failed to start cleanup scheduler:",
          error
        );
      }

      // ========================================================
      // LISTENER
      // ========================================================

      api.setOptions({
        listenEvents: true,
        selfListen: true,
      });

      const startupThreadID =
        process.env.STARTUP_THREAD_ID;

      if (startupThreadID) {
        trafficSendMessage(api, 
          [
            "╭─────── ୨୧ ♡ ୨୧ ───────╮",
            "        🎀 E C L I P S E",
            "          ONLINE ♡",
            "╰─────── ୨୧ ♡ ୨୧ ───────╯",
            "",
            "୨୧ bot is online and ready ♡",
            "",
            "♡ music protection: 2 / GC",
            "♡ global downloads: 2",
            "♡ pause system: ready",
            "♡ watchdog: active",
          ].join("\n"),
          startupThreadID,
          (sendError) => {
            if (sendError) {
              console.error(
                "Startup message failed:",
                sendError
              );
            }
          }
        );
      }

      const rawApiForListener =
        api && api.__eclipseTrafficRawApi
          ? api.__eclipseTrafficRawApi
          : api;

      if (
        rawApiForListener &&
        listenerStartedApis.has(rawApiForListener)
      ) {
        console.warn(
          "[LISTENER] Listener already attached to this Messenger API; skipping duplicate listener."
        );
        return;
      }

      if (rawApiForListener) {
        listenerStartedApis.add(rawApiForListener);
      }

      console.log(
        "Listener started."
      );

      api.listenMqtt(
        (
          listenError,
          event
        ) => {
          watchdogRecordListenerActivity();

          if (thisGeneration !== activeListenerGeneration) {
            return;
          }

          if (activeMessengerApi && activeMessengerApi !== api) {
            return;
          }

          if (listenError) {
            // A listener/MQTT hiccup is not the same thing as a Facebook
            // authentication failure. ws3-fca owns its reconnect/relogin
            // path, so keep the known-good session marked connected and do
            // not start a competing login loop.
            listenFailureCount++;

            console.error(
              "[LISTENER] ws3-fca reported a listener error " +
                "(failure " +
                listenFailureCount +
                "):",
              listenError
            );

            console.warn(
              "[AUTH] ECLIPSE will not start a second login loop; " +
                "ws3-fca owns listener/session recovery."
            );

            return;
          }

          listenFailureCount = 0;

          if (dashboardBotPaused) {
            return;
          }

          watchdogSetMessengerConnected(
            true
          );

          watchdogHeartbeat();

          if (
            !event ||
            typeof event !==
              "object"
          ) {
            return;
          }

          if (!shouldProcessIncomingEvent(event)) {
            return;
          }

          // Nickname guard listens to Messenger thread events before the
          // normal message router.
          if (event.type === "event") {
            void handleNicknameGuardEvent(api, event).catch((error) => {
              console.error("[NICK GUARD] Event handler failed:", error);
            });
            return;
          }

          if (
            (
              event.type ===
                "message" ||
              event.type ===
                "message_reply"
            ) &&
            event.threadID
          ) {
            const threadID =
              String(
                event.threadID
              );

            pushDashboardEvent("messenger", "Incoming Messenger message received.", {
              thread_id: threadID,
              event_type: event.type,
            });

            registerActiveThread(
              threadID
            );

            void registerGCActivity(
              threadID
            ).catch(
              (error) => {
                console.error(
                  "[GC ACTIVITY] Failed to register activity:",
                  error
                );
              }
            );

            void handleMessage(
              api,
              event
            );
          }
        }
      );
    }
    );

    watchdogRecordListenerActivity();

    if (
      loginResult &&
      typeof loginResult.catch === "function"
    ) {
      loginResult.catch(
        handleLoginInvocationFailure
      );
    }
  } catch (error) {
    handleLoginInvocationFailure(error);
  }
}
async function initializeMessengerSession() {
  // Prefer the newest durable checkpoint. If it is unavailable or invalid,
  // loadPersistedFacebookSessionState() leaves the deployment-provided
  // FB_COOKIES fallback in place.
  await loadPersistedFacebookSessionState();
  attemptLogin();
}

void initializeMessengerSession();

// ============================================================
// ACTIVE THREAD TRACKING
// ============================================================

function registerActiveThread(
  threadID
) {
  if (!threadID) {
    return;
  }

  const now =
    Date.now();

  activeThreads.set(
    String(threadID),
    now
  );

  void db.isBibleVerseEnabled(
    String(threadID)
  ).catch((error) => {
    console.error(
      "[BIBLE] Failed to initialize thread setting:",
      error
    );
  });

  registerActiveThreadCleanup();
}

// ============================================================
// MESSAGE HANDLING
// ============================================================

async function handleMessage(
  api,
  event
) {
  assertTrafficGovernorApi(api, "MESSAGE ROUTER");
  watchdogHeartbeat();

  const {
    threadID,
    senderID,
    body,
  } = event;

  const threadId =
    String(threadID || "");

  const hasBroadcastImage =
    Boolean(
      getBroadcastImageAttachment(event)
    );

  if (
    !threadId ||
    (
      (
        typeof body !== "string" ||
        !body.trim()
      ) &&
      !hasBroadcastImage
    )
  ) {
    return;
  }

  const originalText =
    typeof body === "string"
      ? body.trim()
      : "";

  const text =
    originalText.toLowerCase();

  const senderId =
    String(
      senderID || ""
    ).trim();

  const senderIsAdmin =
    isAdmin(senderId);

  // ==========================================================
  // MASS NICKNAME GUARD — OWNER ONLY
  // .setnn <nickname> -> set the same nickname for every member
  // .setnn off       -> remove all protected mass nicknames
  //
  // The run is checkpointed in Neon so a Facebook nickname mutation
  // block does not make the next .setnn restart from member #1.
  // ==========================================================

  const setNicknameMatch =
    originalText.match(/^\.setnn(?:\s+(.+))?$/i);

  if (setNicknameMatch) {
    if (!isOwner(senderId)) {
      sendReplyWithTyping(
        api,
        "🔒 .setnn is owner-only.",
        threadID
      );
      return;
    }

    const requestedNickname = String(
      setNicknameMatch[1] || ""
    ).trim();

    try {
      if (!requestedNickname || /^off$/i.test(requestedNickname)) {
        const removed = await clearNicknameGuard(threadID);

        sendReplyWithTyping(
          api,
          removed
            ? "🎀 mass nickname guard off."
            : "🎀 mass nickname guard is already off.",
          threadID
        );

        return;
      }

      if (typeof api.getThreadInfo !== "function") {
        throw new Error(
          "This ws3-fca build does not expose api.getThreadInfo()."
        );
      }

      const HUMAN_NICKNAME_MIN_DELAY_MS = Math.max(
        3000,
        Number(process.env.ECLIPSE_SETNN_MIN_DELAY_MS || 8000)
      );

      const HUMAN_NICKNAME_MAX_DELAY_MS = Math.max(
        HUMAN_NICKNAME_MIN_DELAY_MS,
        Number(
          process.env.ECLIPSE_SETNN_MAX_DELAY_MS || 15000
        )
      );

      const SETNN_BLOCK_COOLDOWN_MS = Math.max(
        60_000,
        Number(
          process.env.ECLIPSE_SETNN_BLOCK_COOLDOWN_MS ||
            15 * 60 * 1000
        )
      );

      const threadInfo = await new Promise((resolve, reject) => {
        let settled = false;

        const done = (error, info) => {
          if (settled) return;
          settled = true;

          if (error) reject(error);
          else resolve(info || {});
        };

        try {
          const result =
            api.getThreadInfo(
              String(threadID),
              done
            );

          if (
            result &&
            typeof result.then === "function"
          ) {
            result
              .then((info) => done(null, info))
              .catch(done);
          }
        } catch (error) {
          done(error);
        }
      });

      const botID = String(
        typeof api.getCurrentUserID === "function"
          ? api.getCurrentUserID()
          : eclipseUserID || ""
      ).trim();

      const liveParticipantIDs =
        Array.isArray(threadInfo.participantIDs)
          ? threadInfo.participantIDs
              .map((id) =>
                String(id || "").trim()
              )
              .filter(Boolean)
          : [];

      const liveTargets =
        liveParticipantIDs.filter(
          (participantID) =>
            participantID !== botID
        );

      if (!liveTargets.length) {
        sendReplyWithTyping(
          api,
          "🎀 walang target members sa GC.",
          threadID
        );
        return;
      }

      const savedRun =
        await getMassNicknameRun(threadID);

      const sameSavedRun =
        savedRun &&
        String(savedRun.nickname || "").trim() ===
          requestedNickname &&
        Array.isArray(savedRun.targets) &&
        savedRun.targets.length > 0;

      if (
        sameSavedRun &&
        Number(savedRun.blocked_until || 0) >
          Date.now()
      ) {
        const remainingMs =
          Number(savedRun.blocked_until) -
          Date.now();

        const remainingMinutes =
          Math.max(
            1,
            Math.ceil(
              remainingMs / 60_000
            )
          );

        sendReplyWithTyping(
          api,
          "🎀 setnn is cooling down after Facebook blocked nickname changes. " +
            "Try again in about " +
            remainingMinutes +
            " min.",
          threadID
        );

        return;
      }

      let targets;
      let nextIndex;
      let protectedNicknames;

      if (sameSavedRun) {
        targets = savedRun.targets
          .map((id) =>
            String(id || "").trim()
          )
          .filter(Boolean);

        nextIndex = Math.max(
          0,
          Math.min(
            Number(savedRun.next_index || 0),
            targets.length
          )
        );

        protectedNicknames =
          await getProtectedNicknames(
            threadID
          );

        console.log(
          "[NICK GUARD] Resuming .setnn in " +
            threadID +
            " at target " +
            (nextIndex + 1) +
            "/" +
            targets.length +
            "."
        );
      } else {
        targets = liveTargets;
        nextIndex = 0;
        protectedNicknames = {};

        await setMassNicknameRun(
          threadID,
          senderId,
          requestedNickname,
          targets,
          nextIndex,
          null
        );

        console.log(
          "[NICK GUARD] Starting new .setnn run in " +
            threadID +
            " for " +
            targets.length +
            " targets."
        );
      }

      let changed = 0;
      let failed = 0;
      let rateBlocked = false;

      for (
        let i = nextIndex;
        i < targets.length;
        i++
      ) {
        const participantID =
          targets[i];

        try {
          await changeNicknameAsync(
            api,
            requestedNickname,
            threadID,
            participantID
          );

          protectedNicknames[
            participantID
          ] = requestedNickname;

          changed++;

          // Checkpoint immediately after every successful mutation.
          // If Render restarts, already-completed members are not retried.
          await setProtectedNicknames(
            threadID,
            senderId,
            protectedNicknames
          );

          await setMassNicknameRun(
            threadID,
            senderId,
            requestedNickname,
            targets,
            i + 1,
            null
          );
        } catch (error) {
          failed++;

          const errorCode = Number(
            error?.error ??
              error?.code ??
              error?.errorCode ??
              error?.response?.error ??
              0
          );

          const errorText = [
            error?.errorSummary,
            error?.errorDescription?.__html,
            error?.errorDescription,
            error?.message,
          ]
            .filter(Boolean)
            .join(" ");

          const temporarilyBlocked =
            errorCode === 3252001 ||
            /temporarily blocked|going too fast|rate.?limit/i.test(
              errorText
            );

          console.error(
            "[NICK GUARD] Failed to set nickname for " +
              participantID +
              ":",
            error
          );

          if (temporarilyBlocked) {
            rateBlocked = true;

            const blockedUntil =
              Date.now() +
              SETNN_BLOCK_COOLDOWN_MS;

            await setMassNicknameRun(
              threadID,
              senderId,
              requestedNickname,
              targets,
              i,
              blockedUntil
            );

            console.error(
              "[NICK GUARD] Nickname mutation block detected. " +
                "Checkpointed at target " +
                (i + 1) +
                "/" +
                targets.length +
                " and cooling down."
            );

            break;
          }

          // A non-rate-limit failure is isolated to this member.
          // Save the failed position as skipped and continue slowly.
          await setMassNicknameRun(
            threadID,
            senderId,
            requestedNickname,
            targets,
            i + 1,
            null
          );
        }

        if (
          !rateBlocked &&
          i < targets.length - 1
        ) {
          const delayRange =
            HUMAN_NICKNAME_MAX_DELAY_MS -
            HUMAN_NICKNAME_MIN_DELAY_MS;

          const delay =
            HUMAN_NICKNAME_MIN_DELAY_MS +
            (
              delayRange > 0
                ? Math.floor(
                    Math.random() *
                      (delayRange + 1)
                  )
                : 0
            );

          console.log(
            "[NICK GUARD] Waiting " +
              delay +
              "ms before the next nickname mutation."
          );

          await new Promise((resolve) =>
            setTimeout(
              resolve,
              delay
            )
          );
        }
      }

      const finalIndex =
        await getMassNicknameRun(threadID);

      const next =
        Number(
          finalIndex?.next_index || 0
        );

      if (
        !rateBlocked &&
        next >= targets.length
      ) {
        await setMassNicknameRun(
          threadID,
          senderId,
          requestedNickname,
          targets,
          targets.length,
          null
        );

        await clearMassNicknameRun(
          threadID
        );
      }

      const skipped =
        Math.max(
          0,
          targets.length -
            (rateBlocked
              ? next
              : targets.length)
        );

      sendReplyWithTyping(
        api,
        rateBlocked
          ? "🎀 setnn paused — Facebook temporarily blocked nickname changes. " +
            changed +
            " changed · " +
            failed +
            " failed · " +
            skipped +
            " remaining. " +
            "Wait for the cooldown, then run .setnn " +
            requestedNickname +
            " again to resume."
          : "🎀 setnn done — " +
            changed +
            " changed" +
            (failed
              ? " · " +
                failed +
                " failed"
              : "") +
            ".",
        threadID
      );

      console.log(
        "[NICK GUARD] Mass nickname protection set in " +
          threadID +
          " -> " +
          JSON.stringify(
            requestedNickname
          ) +
          " | changed=" +
          changed +
          " failed=" +
          failed +
          " resumedFrom=" +
          nextIndex
      );
    } catch (error) {
      console.error(
        "[NICK GUARD] .setnn command failed:",
        error
      );

      sendReplyWithTyping(
        api,
        "🔴 .setnn could not update the GC nicknames.",
        threadID
      );
    }

    return;
  }

  // ==========================================================
  // NICKNAME GUARD — OWNER ONLY
  // .nn        -> protect this GC and your nickname
  // .nn status -> show the current guard
  // .nn off    -> disable it for this GC
  // ==========================================================

  const nicknameGuardMatch =
    originalText.match(/^\.nn(?:\s+(status|off|on))?$/i);

  if (nicknameGuardMatch) {
    if (!isOwner(senderId)) {
      sendReplyWithTyping(
        api,
        "🔒 .nn is owner-only.",
        threadID
      );
      return;
    }

    const action =
      String(nicknameGuardMatch[1] || "on").toLowerCase();

    const nickReplies = {
      on: [
        "change nn mo pre, tatadyakan ko leeg mo na parang bola",
        "dogmode isa rito oh",
        "set mo jammy on top",
      ],
      defaultOn: [
        "bawal change nn sa tropa ko, baka upakan ko mukha niyo?",
        "change nang change, bungal ka ba?",
        "change pa sa nn namin dogsko",
        "kunware affected kami sa change nn mong pang tanga",
        "change nn samin tapos kunware heard na siya",
      ],
      status: [
        "efas, walang bago, maangas pa rin",
      ],
      off: [
        "bawal change nn, kuha mo gagong mukhang aspalto?",
      ],
    };

    const pickNickReply = (pool) =>
      pool[Math.floor(Math.random() * pool.length)];

    try {
      if (action === "status") {
        const guard = await getNicknameGuard(threadID);

        sendReplyWithTyping(
          api,
          pickNickReply(nickReplies.status),
          threadID
        );

        return;
      }

      if (action === "off") {
        const removed = await clearNicknameGuard(threadID);

        sendReplyWithTyping(
          api,
          pickNickReply(nickReplies.off),
          threadID
        );

        console.log(
          "[NICK GUARD] " +
            (removed ? "Disabled" : "Already disabled") +
            " nickname guard in " +
            threadID
        );

        return;
      }

      // .nn protects the owner's CURRENT nickname. Enabling the guard
      // without snapshotting this value leaves protected_nicknames empty,
      // so log:user-nickname events have nothing to restore.
      if (typeof api.getThreadInfo !== "function") {
        throw new Error(
          "This ws3-fca build does not expose api.getThreadInfo()."
        );
      }

      const threadInfo = await new Promise((resolve, reject) => {
        let settled = false;

        const done = (error, info) => {
          if (settled) return;
          settled = true;

          if (error) reject(error);
          else resolve(info || {});
        };

        try {
          const result = api.getThreadInfo(
            String(threadID),
            done
          );

          if (result && typeof result.then === "function") {
            result
              .then((info) => done(null, info))
              .catch(done);
          }
        } catch (error) {
          done(error);
        }
      });

      const ownerID = String(senderId || "").trim();

      const currentNickname = String(
        threadInfo?.nicknames?.[ownerID] ||
        threadInfo?.nicknames?.[String(ownerID)] ||
        ""
      ).trim();

      if (!currentNickname) {
        throw new Error(
          "Messenger did not return the owner's current nickname."
        );
      }

      // Merge instead of replacing the map. This keeps .setnn / other
      // protected nicknames intact when .nn is enabled or re-enabled.
      const existingProtectedNicknames =
        await getProtectedNicknames(threadID);

      const protectedNicknames = {
        ...(existingProtectedNicknames || {}),
        [ownerID]: currentNickname,
      };

      await setNicknameGuard(
        threadID,
        senderId,
        true
      );

      await setProtectedNicknames(
        threadID,
        senderId,
        protectedNicknames
      );

      console.log(
        "[NICK GUARD] Protected owner nickname in " +
          threadID +
          " for " +
          ownerID +
          " -> " +
          JSON.stringify(currentNickname)
      );

      sendReplyWithTyping(
        api,
        action === "on"
          ? pickNickReply(nickReplies.on)
          : pickNickReply(nickReplies.defaultOn),
        threadID
      );
    } catch (error) {
      console.error("[NICK GUARD] Command failed:", error);
      sendReplyWithTyping(
        api,
        "🔴 Nickname guard could not be updated.",
        threadID
      );
    }

    return;
  }

  // ==========================================================
  // ADMIN CONTROL DENIAL
  // ==========================================================
  // Keep unauthorized admin-command attempts short and playful
  // instead of exposing the full admin-control panels/messages.
  // ==========================================================

  const adminControlAttempt =
    /^(?:!owner(?:\\s+(?:bot|automated|economy|rpg|music|moderation|system))?|!pause(?:\\s+status)?|!resume|!(?:bot(?:\\s+(?:off|on|status))?|shutdown|startup)|!watchdog(?:\\s+(?:status|restart))?|!cleanup(?:\\s+(?:status|disk|run|repair|optimize|full))?|!gcstatus|!broadcast(?:\\s|$)|!game(?:\\s+(?:on|off|status))?|!mod(?:\\s|$)|!automod(?:\\s|$)|!economy(?:\\s|$)|!debug(?:\\s|$)|!lucien(?:\\s|$)|!warn(?:\\s|$)|!ban(?:\\s|$)|!kick(?:\\s|$)|!unban(?:\\s|$)|!modlog(?:\\s|$)|!banat(?:\\s|$)|!music\\s+(?:pause|resume|play))$/i.test(originalText);  if (
    adminControlAttempt &&
    !senderIsAdmin
  ) {
    sendReplyWithTyping(
      api,
      "bawal po panget gumamit sa bot commands, baby",
      threadID
    );

    return;
  }

  // ==========================================================
  // ECLIPSE SELF-MESSAGE GUARD
  // ==========================================================
  // ECLIPSE's own outgoing messages are ignored completely.
  // Banat's laugh reaction belongs to the configured ECLIPSE
  // admin/owner sending an incoming message, not to the bot
  // reacting to its own outgoing replies.
  // ==========================================================

  if (
    eclipseUserID &&
    senderId === eclipseUserID
  ) {
    return;
  }

  // ==========================================================
  // BANAT — ECLIPSE ADMIN LAUGH REACTION
  // ==========================================================
  // When Banat is ON in this thread, react directly to the
  // configured ECLIPSE admin's own incoming message.
  //
  // This uses the actual Messenger message ID, so Facebook
  // displays 😆 on the user's message itself. No text "😆"
  // message is sent.
  // ==========================================================

  if (
    isOwner(senderId) &&
    event.messageID &&
    api &&
    (
      typeof api.setMessageReactionMqtt === "function" ||
      typeof api.setMessageReaction === "function"
    )
  ) {
    try {
      const roastEnabled = await db.isRoastEnabled(threadId);

      if (roastEnabled) {
        const messageID = String(event.messageID);

        const reactionCallback = (reactionError) => {
          if (reactionError) {
            console.error(
              "[BANAT] Admin laugh reaction failed:",
              reactionError
            );
          } else {
            console.log(
              "[BANAT] Reacted 😆 to admin message:",
              messageID
            );
          }
        };

        if (typeof api.setMessageReaction === "function") {
          // ws3-fca's compatible signature is:
          // setMessageReaction(reaction, messageID, callback, forceCustomReaction)
          api.setMessageReaction(
            "😆",
            messageID,
            reactionCallback,
            true
          );
        } else if (typeof api.setMessageReactionMqtt === "function") {
          // Legacy fallback for FCA builds that expose only the MQTT alias.
          api.setMessageReactionMqtt(
            "😆",
            messageID,
            reactionCallback
          );
        }
      }
    } catch (reactionError) {
      console.error(
        "[BANAT] Admin laugh reaction error:",
        reactionError
      );
    }
  }

  // ==========================================================
  // TRAFFIC GOVERNOR — INCOMING COMMAND GUARD
  // ==========================================================

  if (
    originalText.startsWith("!") &&
    !trafficCanAcceptCommand(senderId, threadId)
  ) {
    // Intentionally do not send a warning here. Sending a warning
    // during a command storm would itself add more Messenger traffic.
    console.warn(
      `[TRAFFIC] Command suppressed for sender=${senderId} thread=${threadId}`
    );
    return;
  }

  // ==========================================================
  // LOCAL BAN ENFORCEMENT — HARD COMMAND GATE
  // ==========================================================
  //
  // Keep this outside the moderation command router. If any
  // moderation handler ever fails, a locally banned user must
  // still be unable to reach economy, games, RPG, AI, etc.
  // ==========================================================

  if (!isAdmin(senderId)) {
    try {
      if (await isLocallyBanned(threadId, senderId)) {
        console.warn(
          "[MODERATION] Blocked locally banned user sender=" +
          senderId +
          " thread=" +
          threadId
        );
        return;
      }
    } catch (error) {
      // Fail closed for moderation enforcement: do not let a
      // database lookup failure accidentally grant a banned user
      // access to bot commands.
      console.error(
        "[MODERATION] Local-ban enforcement failed:",
        error
      );
      return;
    }
  }

  // ==========================================================
  // OWNER CONSOLE / ECLIPSE VEIL
  // ==========================================================

  const ownerMatch =
    originalText.match(
      /^!owner(?:\s+(bot|automated|economy|rpg|music|moderation|system))?$/i
    );

  if (ownerMatch) {
    if (!isAdmin(senderId)) {
      sendReplyWithTyping(
        api,
        "🔒 Owner access only.",
        threadId
      );
      return;
    }

    const section =
      (ownerMatch[1] || "home").toLowerCase();

    if (section === "automated") {
      const traffic = trafficSafetyStatus();
      const watchdog = getWatchdogStatus();

      sendReplyWithTyping(
        api,
        [
          "🪽 E C L I P S E 🪽",
          "T H E   V E I L",
          "",
          "♡ TRAFFIC PROTECTION",
          "────────────────────",
          "",
          "WATCHDOG",
          `  mode       · ${String(watchdog.mode || "normal").toUpperCase()}`,
          `  health     · ${watchdog.ok ? "🟢 HEALTHY" : "🔴 UNHEALTHY"}`,
          `  Messenger  · ${watchdog.messengerConnected ? "🟢 CONNECTED" : "🔴 DISCONNECTED"}`,
          "",
          "TRAFFIC GOVERNOR",
          "────────────────────",
          `  global     · ${traffic.globalSendsLastMinute}/${traffic.globalLimit} / min`,
          `  queue      · ${traffic.queue}/${traffic.queueMax}`,
          `  sent       · ${traffic.totalSent}`,
          `  delayed    · ${traffic.totalDelayed}`,
          `  suppressed · ${traffic.totalSuppressed}`,
          `  duplicates · ${traffic.duplicateBlocked}`,
          `  blocked    · ${traffic.commandBlocked}`,
          "",
          "ACTIVE GUARDIANS",
          "  ● global limiter",
          "  ● thread limiter",
          "  ● command limiter",
          "  ● burst guard",
          "  ● duplicate guard",
          "  ● retry spacing",
          "  ● queue governor",
          "",
          "CONTROLS",
          "  !watchdog status",
          "  !watchdog stats",
          "  !watchdog test",
          "  !watchdog pause",
          "  !watchdog resume",
          "  !watchdog reset",
          "  !watchdog restart",
          "",
          "  !owner automated",
          "",
          "♡ protection layer online ♡",
        ].join("\n"),
        threadId
      );

      return;
    }

    if (section === "bot") {
      sendReplyWithTyping(
        api,
        [
          "╭────── ୨୧ E C L I P S E ୨୧ ──────╮",
          "│            O W N E R             │",
          "│               B O T              │",
          "╰──────────────────────────────────╯",
          "",
          "♡ !debug",
          "♡ !cleanup",
          "♡ !game",
          "♡ !economy",
          "♡ !mod",
          "♡ !automod",
          "♡ !rpg",
          "",
          "♡ use !owner <section>",
        ].join("\n"),
        threadId
      );
      return;
    }

    if (section !== "home") {
      sendReplyWithTyping(
        api,
        [
          `╭────── ୨୧ ${section.toUpperCase()} ୨୧ ──────╮`,
          "",
          "This owner section is reserved for",
          "the corresponding subsystem controls.",
          "",
          `♡ !owner ${section}`,
          "",
          "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
        ].join("\n"),
        threadId
      );
      return;
    }

    sendReplyWithTyping(
      api,
      [
        "╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮",
        "┃                                    ┃",
        "┃          ୨୧ E C L I P S E ୨୧       ┃",
        "┃             O W N E R              ┃",
        "┃           C O N S O L E            ┃",
        "┃                                    ┃",
        "┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫",
        "┃  ◈ CORE                            ┃",
        "┃    !owner bot                      ┃",
        "┃                                    ┃",
        "┃  🪽 AUTOMATED BOT                  ┃",
        "┃    !owner automated                ┃",
        "┃                                    ┃",
        "┃  💗 ECONOMY                        ┃",
        "┃    !owner economy                  ┃",
        "┃                                    ┃",
        "┃  🌸 RPG                            ┃",
        "┃    !owner rpg                      ┃",
        "┃                                    ┃",
        "┃  🎀 MUSIC                          ┃",
        "┃    !owner music                    ┃",
        "┃                                    ┃",
        "┃  🛡 MODERATION                     ┃",
        "┃    !owner moderation               ┃",
        "┃                                    ┃",
        "┃  ⚙ SYSTEM                          ┃",
        "┃    !owner system                   ┃",
        "┃                                    ┃",
        "╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
        "             ୨୧ E C L I P S E ୨୧",
      ].join("\n"),
      threadId
    );

    return;
  }

  // ==========================================================
  // BANAT CONTROL
  // ==========================================================
  //
  // Handle / before pause/bot-control gates so the Banat switch and
  // unauthorized slash response remain available even when normal command
  // processing is paused/disabled.
  // The toggle controls both the persistent roast setting and the
  // in-memory conversational target mode.
  // ==========================================================

  const banatControlMatch =
    originalText.match(/^\/$/);

  if (banatControlMatch) {
    if (!isAdmin(senderId)) {
      sendBanatReplyWithTyping(
        api,
        require("./slash-banats").pickUnauthorizedSlashBanat(),
        threadID,
        event.messageID,
        false,
        null,
        0,
        originalText
      );

      return;
    }

    try {
      const currentlyEnabled = await db.isRoastEnabled(threadId);
      const enabled = !currentlyEnabled;

      await db.setRoastEnabled(threadId, enabled);
      setBanatConversationMode(threadId, enabled, senderId);

      // Turning Banat off must also kill any delayed/randomized burst that
      // was already queued before the toggle. Otherwise an old reply can
      // fire after / has disabled the mode and make the toggle look broken.
      if (!enabled && typeof clearBanatBurstState === "function") {
        clearBanatBurstState(threadId);
      }

      sendBanatReplyWithTyping(
        api,
        require("./slash-banats")(enabled ? "on" : "off"),
        threadID,
        event.messageID,
        false,
        null,
        0,
        originalText
      );

      console.log(
        "[BANAT] Conversation mode " +
          (enabled ? "ENABLED" : "DISABLED") +
          " in " +
          threadId +
          " by " +
          senderId
      );
    } catch (error) {
      console.error("[BANAT] Update failed:", error);
      sendReplyWithTyping(
        api,
        "🔴 Failed to update banat settings.",
        threadID
      );
    }

    return;
  }


  // ==========================================================
  // PAUSE / RESUME / BOT CONTROL
  // These MUST be checked before normal AI/training so that
  // pause actually pauses normal message processing.
  // ==========================================================

  const pauseMatch =
    originalText.match(
      /^!pause(?:\s+(status))?$/i
    );

  const resumeMatch =
    /^!resume$/i.test(
      originalText
    );

  if (
    pauseMatch ||
    resumeMatch
  ) {
    if (!isAdmin(senderId)) {
      sendReplyWithTyping(
        api,
        [
          "╭────── 🎀  PAUSE CONTROL  🎀 ──────╮",
          "",
          "🔒 ADMIN ONLY",
          "",
          "Only the bot admin can control",
          "the global pause state.",
          "",
          "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
        ].join("\n"),
        threadId
      );

      return;
    }

    if (resumeMatch) {
      global.botPaused =
        false;

      persistBotState();

      sendReplyWithTyping(
        api,
        [
          "╭────── 🎀  E C L I P S E  🎀 ──────╮",
          "",
          "🟢 BOT RESUMED",
          "",
          "୨୧ global pause",
          "    ♡ OFF",
          "",
          "Normal commands are active again.",
          "",
          "♡ pending music may now continue.",
          "",
          "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
        ].join("\n"),
        threadId
      );

      resumeMusicProcessing();

      return;
    }

    if (
      pauseMatch[1] ===
      "status"
    ) {
      const music =
        getMusicStats();

      const watchdog =
        getWatchdogStatus();

      sendReplyWithTyping(
        api,
        [
          "╭────── 🎀  PAUSE STATUS  🎀 ──────╮",
          "",
          "୨୧ global pause",
          `    ♡ ${
            global.botPaused
              ? "🟡 PAUSED"
              : "🟢 ACTIVE"
          }`,
          "",
          "୨୧ process",
          "    ♡ 🟢 STILL RUNNING",
          "",
          "୨୧ watchdog",
          `    ♡ ${
            watchdog.ok
              ? "🟢 HEALTHY"
              : "🔴 UNHEALTHY"
          }`,
          "",
          "୨୧ music",
          `    ♡ active downloads: ${
            music.activeDownloads
          }/${MUSIC_MAX_GLOBAL_DOWNLOADS}`,
          `    ♡ pending: ${
            music.waitingGlobal
          }`,
          "",
          "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
        ].join("\n"),
        threadId
      );

      return;
    }

    global.botPaused =
      true;

    persistBotState();

    sendReplyWithTyping(
      api,
      [
        "╭────── 🎀  E C L I P S E  🎀 ──────╮",
        "",
        "🟡 BOT IS NOW PAUSED",
        "",
        "୨୧ global pause",
        "    ♡ ON",
        "",
        "Normal commands are now ignored.",
        "",
        "♡ Render process remains alive.",
        "♡ Messenger listener remains alive.",
        "♡ !resume remains available.",
        "",
        "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
      ].join("\n"),
      threadId
    );

    return;
  }

  // ==========================================================
  // GLOBAL BOT CONTROL
  // ==========================================================

  const botControlMatch =
    originalText.match(
      /^!(bot(?:\s+(off|on|status))?|shutdown|startup)$/i
    );

  if (botControlMatch) {
    if (!isAdmin(senderId)) {
      sendReplyWithTyping(
        api,
        [
          "╭────── 🎀  BOT CONTROL  🎀 ──────╮",
          "",
          "🔒 ADMIN ONLY",
          "",
          "Only the bot admin can use",
          "global bot controls.",
          "",
          "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
        ].join("\n"),
        threadID
      );

      return;
    }

    const rawControl =
      (
        botControlMatch[1] ||
        "bot"
      ).toLowerCase();

    if (
      rawControl ===
      "bot"
    ) {
      sendReplyWithTyping(
        api,
        [
          "╭────── 🎀  BOT CONTROL  🎀 ──────╮",
          "୨୧ status",
          "    ♡ !bot status",
          "",
          "୨୧ controls",
          "    ♡ !bot on",
          "    ♡ !bot off",
          "    ♡ !shutdown",
          "    ♡ !startup",
          "",
          "୨୧ pause",
          "    ♡ !pause",
          "    ♡ !pause status",
          "    ♡ !resume",
          "",
          "୨୧ watchdog",
          "    ♡ !watchdog",
          "    ♡ !watchdog status",
          "    ♡ !watchdog restart",
          "",
          "୨୧ communication",
          "    ♡ !broadcast <message>",
          "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
        ].join("\n"),
        threadID
      );

      return;
    }

    if (
      rawControl ===
      "bot status"
    ) {
      const music =
        getMusicStats();

      const watchdog =
        getWatchdogStatus();

      sendReplyWithTyping(
        api,
        [
          "╭────── 🎀  BOT STATUS  🎀 ──────╮",
          "",
          "୨୧ global status",
          `    ♡ ${
            global.botDisabled
              ? "🔴 OFF"
              : "🟢 ON"
          }`,
          "",
          "୨୧ pause status",
          `    ♡ ${
            global.botPaused
              ? "🟡 PAUSED"
              : "🟢 ACTIVE"
          }`,
          "",
          "୨୧ watchdog",
          `    ♡ ${
            watchdog.ok
              ? "🟢 HEALTHY"
              : "🔴 UNHEALTHY"
          }`,
          `    ♡ Messenger: ${
            watchdog.messengerConnected
              ? "🟢 CONNECTED"
              : "🔴 DISCONNECTED"
          }`,
          "",
          "୨୧ music protection",
          `    ♡ global downloads: ${music.activeDownloads}/${MUSIC_MAX_GLOBAL_DOWNLOADS}`,
          `    ♡ global pending: ${music.waitingGlobal}`,
          "",
          "୨୧ controls",
          "    ♡ !bot on",
          "    ♡ !bot off",
          "    ♡ !pause",
          "    ♡ !resume",
          "    ♡ !shutdown",
          "    ♡ !startup",
          "    ♡ !watchdog status",
          "",
          "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
        ].join("\n"),
        threadID
      );

      return;
    }

    if (
      rawControl ===
        "bot off" ||
      rawControl ===
        "shutdown"
    ) {
      global.botDisabled =
        true;

      persistBotState();

      sendReplyWithTyping(
        api,
        [
          "╭────── 🎀  BOT CONTROL  🎀 ──────╮",
          "",
          "🔴 BOT IS NOW OFF",
          "",
          "୨୧ global state",
          "    ♡ OFF",
          "",
          "Normal commands are now ignored.",
          "",
          "୨୧ admin controls remain available",
          "    ♡ !bot status",
          "    ♡ !bot on",
          "    ♡ !startup",
          "",
          "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
        ].join("\n"),
        threadID
      );

      return;
    }

    if (
      rawControl ===
        "bot on" ||
      rawControl ===
        "startup"
    ) {
      global.botDisabled =
        false;

      persistBotState();

      sendReplyWithTyping(
        api,
        [
          "╭────── 🎀  BOT CONTROL  🎀 ──────╮",
          "",
          "🟢 BOT IS NOW ON",
          "",
          "୨୧ global state",
          "    ♡ ON",
          "",
          "Normal commands are active again.",
          "",
          "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
        ].join("\n"),
        threadID
      );

      resumeMusicProcessing();

      return;
    }
  }

  // ==========================================================
  // WATCHDOG CONTROL
  // ==========================================================

  const watchdogMatch =
    originalText.match(
      /^!watchdog(?:\s+(status|restart))?$/i
    );

  if (
    watchdogMatch
  ) {
    if (!isAdmin(senderId)) {
      sendReplyWithTyping(
        api,
        [
          "╭────── 🎀  WATCHDOG  🎀 ──────╮",
          "",
          "🔒 ADMIN ONLY",
          "",
          "Only the bot admin can inspect",
          "or restart the watchdog.",
          "",
          "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
        ].join("\n"),
        threadID
      );

      return;
    }

    const watchdogCommand =
      (
        watchdogMatch[1] ||
        "status"
      ).toLowerCase();

    if (
      watchdogCommand ===
      "restart"
    ) {
      sendReplyWithTyping(
        api,
        [
          "╭────── 🎀  WATCHDOG  🎀 ──────╮",
          "",
          "🔴 MANUAL RESTART REQUESTED",
          "",
          "ECLIPSE will exit now.",
          "Render should automatically restart",
          "the service.",
          "",
          "♡ This is intentional.",
          "",
          "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
        ].join("\n"),
        threadID
      );

      setTimeout(
        () => {
          watchdogSetShuttingDown(
            true
          );

          watchdogSetMessengerConnected(
            false
          );

          stopWatchdog();

          process.exit(1);
        },
        1500
      );

      return;
    }

    const watchdog =
      getWatchdogStatus();

    const uptimeSeconds =
      Math.floor(
        process.uptime()
      );

    const uptimeMinutes =
      Math.floor(
        uptimeSeconds / 60
      );

    const uptimeHours =
      Math.floor(
        uptimeMinutes / 60
      );

    const displayMinutes =
      uptimeMinutes % 60;

    const displaySeconds =
      uptimeSeconds % 60;

    sendReplyWithTyping(
      api,
      [
        "╭────── 🎀  WATCHDOG STATUS  🎀 ──────╮",
        "",
        "୨୧ watchdog",
        `    ♡ ${
          watchdog.ok
            ? "🟢 HEALTHY"
            : "🔴 UNHEALTHY"
        }`,
        `    ♡ mode: ${String(watchdog.mode || "normal").toUpperCase()}`,
        "",
        "୨୧ process",
        "    ♡ 🟢 RUNNING",
        `    ♡ uptime: ${uptimeHours}h ${displayMinutes}m ${displaySeconds}s`,
        "",
        "୨୧ Messenger",
        `    ♡ ${
          watchdog.messengerConnected
            ? "🟢 CONNECTED"
            : "🔴 DISCONNECTED"
        }`,
        "",
        "୨୧ event loop",
        `    ♡ last tick: ${watchdog.eventLoopAgeMs}ms ago`,
        `    ♡ failures: ${watchdog.consecutiveFailures}`,
        "",
        "୨୧ watchdog",
        `    ♡ started: ${
          watchdog.started
            ? "YES"
            : "NO"
        }`,
        `    ♡ shutdown: ${
          watchdog.shuttingDown
            ? "YES"
            : "NO"
        }`,
        "",
        "୨୧ commands",
        "    ♡ !watchdog",
        "    ♡ !watchdog status",
        "    ♡ !watchdog restart",
        "",
        "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
      ].join("\n"),
      threadID
    );

    return;
  }

  // ==========================================================
  // AUTOMATIC BANAT
  // ==========================================================
  //
  // Banat must run while the bot is ON as well as while normal
  // commands are paused/shut down. Never run it for commands.
  // ==========================================================

  if (
    !originalText.startsWith("!")
  ) {
    const banatHandled = await handleAutomaticBanatMessage({
      api,
      event,
      body,
      senderId,
      threadId,
    });

    if (banatHandled) {
      return;
    }
  }

  // ==========================================================
  // GLOBAL DISABLED / PAUSED STATE
  // ==========================================================
  //
  // Shutdown/pause blocks normal commands, but Banat remains active.
  // The standalone / control is also allowed through this gate.
  // ==========================================================

  const banatControlAllowedWhileDisabled =
    /^\/$/.test(originalText);

  if (
    global.botDisabled === true ||
    global.botPaused === true
  ) {
    if (!banatControlAllowedWhileDisabled) {
      return;
    }
  }

  // ==========================================================
  // AI TRAINING / ADAPTATION
  // ==========================================================

  try {
    const trainingHandled =
      await handleTrainingCommand(
        senderId,
        threadId,
        originalText
      );

    if (
      trainingHandled
    ) {
      return;
    }

    if (
      !originalText.startsWith(
        "!"
      )
    ) {
      await observeMessage({
        senderID:
          senderId,
        threadID:
          threadId,
        body:
          originalText,
      });
    }
  } catch (error) {
    console.error(
      "[AI ADAPTATION] Training/observation failed:",
      error
    );
  }

  // ==========================================================
  // DEBUG
  // ==========================================================

  assertTrafficGovernorApi(api, "DEBUG");

  try {
    if (
      await handleDebugCommand(
        api,
        event,
        text,
        originalText
      )
    ) {
      return;
    }
  } catch (error) {
    console.error(
      "[DEBUG] Handler failed:",
      error
    );
  }

  // ==========================================================
  // CLEANUP
  // ==========================================================

  const cleanupMatch =
    originalText.match(
      /^!cleanup(?:\s+(status|disk|run|repair|optimize|full))?$/i
    );

  if (cleanupMatch) {
    if (!isAdmin(senderId)) {
      return;
    }

    const cleanupCommand =
      (
        cleanupMatch[1] ||
        ""
      ).toLowerCase();

    if (!cleanupCommand) {
      sendReplyWithTyping(
        api,
        [
          "╭────── 🎀  CLEANUP  🎀 ──────╮",
          "୨୧ status",
          "    ♡ !cleanup status",
          "",
          "୨୧ disk audit",
          "    ♡ !cleanup disk",
          "",
          "୨୧ maintenance",
          "    ♡ !cleanup run",
          "    ♡ !cleanup repair",
          "    ♡ !cleanup optimize",
          "    ♡ !cleanup full",
          "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
        ].join("\n"),
        threadID
      );

      return;
    }

    if (
      cleanupCommand ===
      "disk"
    ) {
      try {
        const diskReport =
          getDiskAudit();

        sendReplyWithTyping(
          api,
          formatDiskAudit(diskReport),
          threadID
        );
      } catch (error) {
        console.error(
          "[CLEANUP] Disk audit failed:",
          error
        );

        sendReplyWithTyping(
          api,
          [
            "╭────── 🎀  DISK AUDIT  🎀 ──────╮",
            "",
            "🔴 AUDIT FAILED",
            "",
            "Check Render logs for details.",
            "",
            "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
          ].join("\n"),
          threadID
        );
      }

      return;
    }

    if (
      cleanupCommand ===
      "status"
    ) {
      const status =
        getCleanupStatus();

      sendReplyWithTyping(
        api,
        [
          "╭────── 🎀  CLEANUP  🎀 ──────╮",
          "୨୧ status",
          `    ♡ scheduler: ${
            status.schedulerActive
              ? "🟢 ACTIVE"
              : "🔴 OFF"
          }`,
          `    ♡ running: ${
            status.running
              ? "🟡 YES"
              : "🟢 NO"
          }`,
          `    ♡ last run: ${
            status.lastCleanupAt ||
            "Never"
          }`,
          "",
          "୨୧ schedule",
          "    ♡ every 24 hours",
          "    ♡ temporary files: 3 days",
          "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
        ].join("\n"),
        threadID
      );

      return;
    }

    const modeMap = {
      run: "clean",
      repair: "repair",
      optimize: "optimize",
      full: "full",
    };

    const mode =
      modeMap[
        cleanupCommand
      ];

    if (!mode) {
      return;
    }

    try {
      const result =
        await runCleanup({
          mode,
        });

      if (
        result?.skipped
      ) {
        sendReplyWithTyping(
          api,
          [
            "╭────── 🎀  CLEANUP  🎀 ──────╮",
            "",
            "🟡 CLEANUP ALREADY RUNNING",
            "",
            "Please wait for the current",
            "maintenance operation to finish.",
            "",
            "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
          ].join("\n"),
          threadID
        );

        return;
      }

      const temporaryFiles =
        Number(
          result?.cleaned
            ?.temporaryFiles ||
            0
        );

      const expiredSessions =
        Number(
          result?.cleaned
            ?.expiredSessions ||
            0
        );

      const repairs =
        Array.isArray(
          result?.repaired
            ?.stateFiles
        )
          ? result.repaired
              .stateFiles.length
          : 0;

      const optimizerFindings =
        Array.isArray(
          result?.optimizer
            ?.findings
        )
          ? result.optimizer
              .findings
          : [];

      const gc =
        result?.gc || {};

      sendReplyWithTyping(
        api,
        [
          "╭────── 🎀  CLEANUP  🎀 ──────╮",
          "          ♡ COMPLETE ♡",
          "╰─────────────────────────────╯",
          "",
          "୨୧ mode",
          `    ♡ ${mode.toUpperCase()}`,
          "",
          "୨୧ cleaned",
          `    ♡ temporary files: ${temporaryFiles}`,
          `    ♡ expired sessions: ${expiredSessions}`,
          `    ♡ repairs: ${repairs}`,
          `    ♡ optimizer findings: ${optimizerFindings.length}`,
          "",
          "୨୧ gc maintenance",
          `    ♡ inactive: ${Number(
            gc.markedInactive || 0
          )}`,
          `    ♡ features off: ${Number(
            gc.expensiveFeaturesDisabled ||
              0
          )}`,
          `    ♡ archived: ${Number(
            gc.archived || 0
          )}`,
          "",
          "୨୧ database",
          `    ♡ ${
            result?.databaseMaintenance
              ? "🟢 OK"
              : "🔴 FAILED"
          }`,
          `    ♡ duration: ${Number(
            result?.durationMs || 0
          )}ms`,
          "",
          "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
        ].join("\n"),
        threadID
      );
    } catch (error) {
      console.error(
        "[CLEANUP] Manual cleanup failed:",
        error
      );

      sendReplyWithTyping(
        api,
        [
          "╭────── 🎀  CLEANUP  🎀 ──────╮",
          "",
          "🔴 CLEANUP FAILED",
          "",
          "Check Render logs for details.",
          "",
          "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
        ].join("\n"),
        threadID
      );
    }

    return;
  }

  // ==========================================================
  // GC STATUS
  // ==========================================================

  if (
    /^!gcstatus$/i.test(
      originalText
    )
  ) {
    if (!isAdmin(senderId)) {
      sendReplyWithTyping(
        api,
        "❌ Admin only.",
        threadID
      );

      return;
    }

    try {
      const status =
        await getGCStatus();

      sendReplyWithTyping(
        api,
        [
          "╭────── 🎀  GC MONITOR  🎀 ──────╮",
          "୨୧ activity",
          `    ♡ tracked GCs: ${status.total}`,
          `    ♡ active: ${status.active}`,
          `    ♡ inactive: ${status.inactive}`,
          "",
          "୨୧ maintenance",
          `    ♡ features off: ${status.featuresDisabled}`,
          `    ♡ archived: ${status.archived}`,
          "",
          "୨୧ database",
          "    ♡ bot_gc_activity",
          "    ♡ tracker: 🟢 ONLINE",
          "",
          "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
        ].join("\n"),
        threadID
      );
    } catch (error) {
      console.error(
        "[GC STATUS] Failed:",
        error
      );

      sendReplyWithTyping(
        api,
        [
          "╭────── 🎀  GC MONITOR  🎀 ──────╮",
          "",
          "🔴 STATUS CHECK FAILED",
          "",
          "Unable to read GC activity data.",
          "",
          "Check the Render logs.",
          "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
        ].join("\n"),
        threadID
      );
    }

    return;
  }

  // ==========================================================
  // PING
  // ==========================================================

  if (
    text === "!ping"
  ) {
    sendReplyWithTyping(
      api,
      "🏓 Pong!",
      threadID
    );

    return;
  }

  // ==========================================================
  // HELP
  // ==========================================================

  if (
    text === "!help"
  ) {
    sendReplyWithTyping(
      api,
      [
        "╭─────── ୨୧ ♡ ୨୧ ───────╮",
        "        🎀 E C L I P S E",
        "         P U B L I C",
        "╰─────── ୨୧ ♡ ୨୧ ───────╯",
        "",
        "୨୧ GENERAL",
        "♡ !ping",
        "♡ !help",
        "",
        "୨୧ MUSIC",
        "♡ !play <song>",
        "  Search YouTube + send audio.",
        "♡ !music status / !music queue",
        "  Show the GC music queue.",
        "♡ !music skip",
        "  Skip the current/next song.",
        "♡ !music pause (admin)",
        "  Stop new songs from starting.",
        "♡ !music resume / !music play (admin)",
        "  Let the queue continue.",
        "♡ Maximum 2 songs per GC.",
        "",
        "୨୧ BOT CONTROL",
        "♡ !pause",
        "♡ !pause status",
        "♡ !resume",
        "",
        "୨୧ WATCHDOG",
        "♡ !watchdog",
        "♡ !watchdog status",
        "♡ !watchdog restart",
        "",
        "୨୧ PICTURES",
        "♡ !pic",
        "♡ !picture",
        "♡ !photo",
        "",
        "୨୧ ECLIPSE RPG",
        "♡ !rpg help",
        "♡ !rpg profile",
        "♡ !rpg kingdom",
        "♡ !rpg property",
        "♡ !rpg train <unit> <amount>",
        "♡ !rpg march <region>",
        "",
        "୨୧ ECONOMY",
        "♡ !balance / !bal",
        "♡ !daily",
        "♡ !work",
        "♡ !pay <amount>",
        "♡ !leaderboard / !lb",
        "♡ !shop",
        "♡ !buy <item>",
        "♡ !inventory / !inv",
        "",
        "୨୧ GAME CENTER",
        "♡ !games — open the full game panel",
        "♡ !trivia",
        "♡ !rps <choice>",
        "♡ !roll <amount>",
        "♡ !guess <number>",
        "♡ !coinflip <amount> <side>",
        "♡ !slots <amount>",
        "♡ !blackjack / !hit / !stand",
        "♡ !math / !riddle / !8ball",
        "♡ !exam — academic challenge",
        "♡ !case / !haunt / !incident",
        "♡ !heist / !trial / !lost",
        "♡ !investigator / !investigations",
        "◇ !simulation — COMING SOON",
        "♡ !debate — debate challenge + human admin judgment",
        "",
        "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
      ].join("\n"),
      threadID
    );

    return;
  }

  // ==========================================================
  // MUSIC
  // ==========================================================

  if (
    text === "!play" ||
    text.startsWith(
      "!play "
    )
  ) {
    const requestedSong =
      originalText
        .slice(
          "!play".length
        )
        .trim();

    handleMusicCommand(
      api,
      requestedSong,
      threadID
    );

    return;
  }

  // ==========================================================
  // MUSIC QUEUE / SKIP / PAUSE / RESUME
  // ==========================================================

  const musicSubMatch =
    originalText.match(
      /^!music\s+(status|queue|skip|pause|resume|play)$/i
    );

  if (musicSubMatch) {
    const musicSubcommand =
      musicSubMatch[1].toLowerCase();

    if (
      musicSubcommand ===
        "status" ||
      musicSubcommand ===
        "queue"
    ) {
      sendMusicStatus(
        api,
        threadID
      );

      return;
    }

    if (
      musicSubcommand ===
      "skip"
    ) {
      handleMusicSkip(
        api,
        threadID
      );

      return;
    }

    if (
      musicSubcommand ===
      "pause"
    ) {
      if (!isAdmin(senderId)) {
        sendReplyWithTyping(
          api,
          [
            "╭────── 🎀  MUSIC  🎀 ──────╮",
            "",
            "🔒 ADMIN ONLY",
            "",
            "Only the bot admin can pause",
            "the music queue.",
            "",
            "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
          ].join("\n"),
          threadID
        );

        return;
      }

      handleMusicPauseToggle(
        api,
        threadID,
        true
      );

      return;
    }

    if (
      musicSubcommand ===
        "resume" ||
      musicSubcommand ===
        "play"
    ) {
      if (!isAdmin(senderId)) {
        sendReplyWithTyping(
          api,
          [
            "╭────── 🎀  MUSIC  🎀 ──────╮",
            "",
            "🔒 ADMIN ONLY",
            "",
            "Only the bot admin can resume",
            "the music queue.",
            "",
            "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
          ].join("\n"),
          threadID
        );

        return;
      }

      handleMusicPauseToggle(
        api,
        threadID,
        false
      );

      return;
    }
  }

  // ==========================================================
  // PICTURES
  // ==========================================================

  if (
    text === "!pic" ||
    text === "!picture" ||
    text === "!photo"
  ) {
    try {
      sendRandomPicture(
        api,
        threadID
      );
    } catch (error) {
      console.error(
        "[PICTURES] Command failed:",
        error
      );

      sendReplyWithTyping(
        api,
        "❌ Failed to send a picture.",
        threadID
      );
    }

    return;
  }

  // ==========================================================
  // BROADCAST
  // ==========================================================

  // ----------------------------------------------------------
  // BROADCAST IMAGE FOLLOW-UP
  // Messenger cannot send the command text and a separate image
  // as one user message from the mobile composer. If an admin
  // starts !broadcast without an image, keep the message pending
  // and consume the next image they send.
  // ----------------------------------------------------------
  if (
    isAdmin &&
    !/^!broadcast(?:\s|$)/i.test(originalText)
  ) {
    const pendingBroadcast =
      pendingBroadcastComposers.get(String(senderId));

    if (pendingBroadcast) {
      if (
        Date.now() - pendingBroadcast.createdAt >
        BROADCAST_COMPOSER_TIMEOUT_MS
      ) {
        pendingBroadcastComposers.delete(
          String(senderId)
        );
      } else {
        const pendingImage =
          getBroadcastImageAttachment(event);

        if (pendingImage) {
          pendingBroadcastComposers.delete(
            String(senderId)
          );

          cleanupBroadcastFingerprintMap();

          const fingerprint =
            broadcastFingerprint(
              pendingBroadcast.message,
              pendingImage
            );

          const previousBroadcastAt =
            recentBroadcastFingerprints.get(
              fingerprint
            ) || 0;

          if (
            previousBroadcastAt &&
            Date.now() - previousBroadcastAt <
              BROADCAST_DUPLICATE_WINDOW_MS
          ) {
            sendReplyWithTyping(
              api,
              [
                "╭────── 🎀  BROADCAST  🎀 ──────╮",
                "",
                "🛑 DUPLICATE BROADCAST BLOCKED",
                "",
                "The same broadcast was already",
                "sent recently.",
                "",
                "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
              ].join("\n"),
              threadID
            );

            return;
          }

          recentBroadcastFingerprints.set(
            fingerprint,
            Date.now()
          );

          let imagePath = null;

          try {
            imagePath =
              await stageBroadcastImage(
                pendingImage
              );
          } catch (error) {
            recentBroadcastFingerprints.delete(
              fingerprint
            );

            console.error(
              "[Broadcast] Failed to stage follow-up image:",
              error
            );

            sendReplyWithTyping(
              api,
              [
                "╭────── 🎀  BROADCAST  🎀 ──────╮",
                "",
                "❌ IMAGE COULD NOT BE PREPARED",
                "",
                "The pending broadcast was not sent.",
                "Please run !broadcast again.",
                "",
                "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
              ].join("\n"),
              threadID
            );

            return;
          }

          const result =
            broadcastToAllThreads(
              api,
              pendingBroadcast.message,
              imagePath
            );

          if (!result.queued) {
            recentBroadcastFingerprints.delete(
              fingerprint
            );
          }

          sendReplyWithTyping(
            api,
            [
              "╭────── 🎀  BROADCAST  🎀 ──────╮",
              "",
              "📢 BROADCAST QUEUED",
              "",
              "୨୧ active threads",
              `    ♡ ${result.targetCount}`,
              "    ♡ image: YES 🖼️",
              "",
              "୨୧ status",
              "    ♡ 🟢 queued",
              "",
              "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
            ].join("\n"),
            threadID
          );

          return;
        }
      }
    }
  }

  if (
    /^!broadcast(?:\s|$)/i.test(originalText)
  ) {
    if (!isAdmin(senderId)) {
      sendReplyWithTyping(
        api,
        [
          "╭────── 🎀  BROADCAST  🎀 ──────╮",
          "",
          "🔒 ADMIN ONLY",
          "",
          "Only the bot admin can broadcast.",
          "",
          "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
        ].join("\n"),
        threadID
      );

      return;
    }

    const message =
      originalText
        .replace(
          /^!broadcast\s*/i,
          ""
        )
        .trim();

    if (!message) {
      sendReplyWithTyping(
        api,
        [
          "╭────── 🎀  BROADCAST  🎀 ──────╮",
          "",
          "୨୧ usage",
          "    ♡ !broadcast <message>",
          "    ♡ Or send !broadcast <message>",
          "      then attach the picture in your next message.",
          "",
          "No confirmation step.",
          "",
          "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
        ].join("\n"),
        threadID
      );

      return;
    }

    cleanupBroadcastFingerprintMap();

    const imageAttachment =
      getBroadcastImageAttachment(event);

    const fingerprint =
      broadcastFingerprint(
        message,
        imageAttachment
      );

    const previousBroadcastAt =
      recentBroadcastFingerprints.get(
        fingerprint
      ) || 0;

    if (
      previousBroadcastAt &&
      Date.now() - previousBroadcastAt <
        BROADCAST_DUPLICATE_WINDOW_MS
    ) {
      sendReplyWithTyping(
        api,
        [
          "╭────── 🎀  BROADCAST  🎀 ──────╮",
          "",
          "🛑 DUPLICATE BROADCAST BLOCKED",
          "",
          "The same broadcast was already",
          "sent recently.",
          "",
          "Please wait before sending it again.",
          "",
          "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
        ].join("\n"),
        threadID
      );

      return;
    }

    // If the image is sent in the same Messenger message,
    // broadcast immediately. Otherwise, keep the message pending
    // and consume the admin's next image message.
    if (!imageAttachment) {
      const adminKey = String(senderId);

      if (
        pendingBroadcastComposers.has(
          adminKey
        )
      ) {
        sendReplyWithTyping(
          api,
          [
            "╭────── 🎀  BROADCAST  🎀 ──────╮",
            "",
            "🛑 BROADCAST ALREADY WAITING",
            "",
            "Send the picture for the pending",
            "broadcast, or wait for it to expire.",
            "",
            "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
          ].join("\n"),
          threadID
        );

        return;
      }

      pendingBroadcastComposers.set(
        adminKey,
        {
          message,
          threadID,
          createdAt: Date.now(),
        }
      );

      sendReplyWithTyping(
        api,
        [
          "╭────── 🎀  BROADCAST  🎀 ──────╮",
          "",
          "📢 BROADCAST READY",
          "",
          "Your message is saved.",
          "🖼️ Send the picture in your next message.",
          "",
          "No confirmation needed — the image",
          "will start the broadcast automatically.",
          "",
          "⏳ Waiting for image for 2 minutes.",
          "",
          "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
        ].join("\n"),
        threadID
      );

      return;
    }

    recentBroadcastFingerprints.set(
      fingerprint,
      Date.now()
    );

    let imagePath = null;

    if (imageAttachment) {
      try {
        imagePath =
          await stageBroadcastImage(
            imageAttachment
          );
      } catch (error) {
        recentBroadcastFingerprints.delete(
          fingerprint
        );

        console.error(
          "[Broadcast] Failed to stage image:",
          error
        );

        sendReplyWithTyping(
          api,
          [
            "╭────── 🎀  BROADCAST  🎀 ──────╮",
            "",
            "❌ IMAGE COULD NOT BE PREPARED",
            "",
            "The broadcast was not sent.",
            "Please attach the picture again",
            "and retry.",
            "",
            "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
          ].join("\n"),
          threadID
        );

        return;
      }
    }

    const result =
      broadcastToAllThreads(
        api,
        message,
        imagePath
      );

    if (!result.queued) {
      recentBroadcastFingerprints.delete(
        fingerprint
      );
    }

    sendReplyWithTyping(
      api,
      [
        "╭────── 🎀  BROADCAST  🎀 ──────╮",
        "",
        "📢 BROADCAST QUEUED",
        "",
        "୨୧ active threads",
        `    ♡ ${result.targetCount}`,
        `    ♡ image: ${result.hasImage ? "YES 🖼️" : "NO"}`,
        "",
        "୨୧ status",
        "    ♡ 🟢 queued",
        "",
        "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
      ].join("\n"),
      threadID
    );

    return;
  }

  // ==========================================================
  // AUTOMATIC BIBLE VERSES
  // ==========================================================

  try {
    if (
      await handleVerseCommand(
        api,
        trafficSendMessage,
        event,
        originalText
      )
    ) {
      return;
    }
  } catch (error) {
    console.error(
      "[BIBLE] Verse command failed:",
      error
    );
  }

  // ==========================================================
  // MODERATION
  // ==========================================================

  assertTrafficGovernorApi(api, "MODERATION");

  try {
    if (
      await handleModerationMessage(
        api,
        event,
        text,
        originalText
      )
    ) {
      return;
    }
  } catch (error) {
    console.error(
      "Moderation handler failed:",
      error
    );
  }

  // ==========================================================
  // AI
  // ==========================================================

  assertTrafficGovernorApi(api, "AI");

  try {
    if (
      await handleAiMessage(
        api,
        event,
        text,
        originalText
      )
    ) {
      return;
    }
  } catch (error) {
    console.error(
      "AI message handler failed:",
      error
    );
  }

  // ==========================================================
  // RPG CHARACTER AI
  // ==========================================================

  assertTrafficGovernorApi(api, "RPG character");

  try {
    if (
      await handleRpgCharacterMessage(
        api,
        event,
        text,
        originalText
      )
    ) {
      return;
    }
  } catch (error) {
    console.error(
      "RPG character handler failed:",
      error
    );
  }

  // ==========================================================
  // EXAM RESPONSE
  // !answer A/B/C/D
  // Must run before the normal game-response router.
  // ==========================================================

  if (/^!answer(?:\s|$)/i.test(originalText)) {
    try {
      if (
        await handleExamResponse(
          api,
          event,
          text,
          originalText
        )
      ) {
        return;
      }
    } catch (error) {
      console.error(
        "[EXAM] Response handler failed:",
        error
      );

      await sendReplyWithTyping(
        api,
        "🎓 The exam system encountered an error. Please try again.",
        threadID
      );

      return;
    }
  }

  // ==========================================================
  // GAME RESPONSE
  // ==========================================================

  assertTrafficGovernorApi(api, "GAME RESPONSE");

  try {
    if (
      await handleGameResponse(
        api,
        event,
        text,
        originalText
      )
    ) {
      return;
    }
  } catch (error) {
    console.error(
      "Game response failed:",
      error
    );
  }

  // ==========================================================
  // COMMAND REGISTRY PATTERN
  // Keep game command parsing synchronized with game-registry.js.
  // ==========================================================

  const escapeRegex = (value) =>
    String(value || "").replace(/[.*+?^${}()|[\]\\]/g, (match) => "\\" + match);
  const registeredGameCommandsPattern =
    gameRegistry.COMMANDS
      .map(escapeRegex)
      .sort((a, b) => b.length - a.length)
      .join("|");

  const gameCommandPattern = new RegExp(
    "^!(" + registeredGameCommandsPattern + ")(?:\\s+(.*))?$",
    "i"
  );

  // ==========================================================
  // RPG / LOVE QUEST / GAMES / ECONOMY
  // ==========================================================

  try {
    // --------------------------------------------------------
    // RPG
    // --------------------------------------------------------

    if (
      /^!rpg(?:\s|$)/i.test(
        originalText
      )
    ) {
      const rpgParts =
        originalText
          .trim()
          .split(/\s+/);

      const rpgArgs =
        rpgParts.slice(1);

      // ------------------------------------------------------
      // LOVE QUEST
      // ------------------------------------------------------

      if (
        isSpecialPlayer(senderId) ||
        isEclipseAdmin(senderId)
      ) {
        try {
          const loveQuestHandled =
            await handleLoveQuestCommand(
              api,
              threadID,
              senderId,
              rpgArgs
            );

          if (
            loveQuestHandled
          ) {
            return;
          }
        } catch (loveQuestError) {
          console.error(
            "[LOVE QUEST] Command failed:",
            loveQuestError
          );

          sendReplyWithTyping(
            api,
            "❌ The Last Star quest encountered an error.",
            threadID
          );

          return;
        }
      }

      const isRpgExplore =
        /^!rpg\s+explore(?:\s|$)/i.test(
          originalText
        );

      const rpgHandled =
        await handleRpgCommand(
          api,
          event,
          text,
          originalText
        );

      if (
        rpgHandled
      ) {
        if (
          isRpgExplore &&
          isSpecialPlayer(
            senderId
          )
        ) {
          try {
            await discoverLoveQuest(
              api,
              threadID,
              senderId
            );
          } catch (loveQuestError) {
            console.error(
              "[LOVE QUEST] Discovery failed:",
              loveQuestError
            );
          }
        }

        return;
      }
    }

    // --------------------------------------------------------
    // GAME CONTROL
    // --------------------------------------------------------

    const gameControlMatch =
      text.match(
        /^!game(?:\s+(on|off|status))?$/i
      );

    if (
      gameControlMatch
    ) {
      if (!isAdmin(senderId)) {
        sendReplyWithTyping(
          api,
          [
            "╭────── 🎀  GAME CONTROL  🎀 ──────╮",
            "",
            "🔒 ADMIN ONLY",
            "",
            "Only the bot admin can configure",
            "games.",
            "",
            "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
          ].join("\n"),
          threadID
        );

        return;
      }

      const gameSubcommand =
        (
          gameControlMatch[1] ||
          ""
        ).toLowerCase();

      if (!gameSubcommand) {
        let currentStatus =
          false;

        try {
          currentStatus =
            await db.isGameEnabled(
              threadID
            );
        } catch (error) {
          console.error(
            "[GAME] Failed to check status:",
            error
          );
        }

        sendReplyWithTyping(
          api,
          [
            "╭────── 🎀  GAME CONTROL  🎀 ──────╮",
            "୨୧ status",
            `    ♡ ${
              currentStatus
                ? "🟢 ON"
                : "🔴 OFF"
            }`,
            "    ♡ !game status",
            "",
            "୨୧ controls",
            "    ♡ !game on",
            "    ♡ !game off",
            "",
            "୨୧ game center",
            "    ♡ !games",
            "    ♡ !games rules",
            "    ♡ !games status",
            "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
          ].join("\n"),
          threadID
        );

        return;
      }

      if (
        gameSubcommand ===
        "status"
      ) {
        try {
          const enabled =
            await db.isGameEnabled(
              threadID
            );

          sendReplyWithTyping(
            api,
            [
              "╭────── 🎀  GAME STATUS  🎀 ──────╮",
              "",
              "୨୧ current group status",
              `    ♡ ${
                enabled
                  ? "🟢 ON"
                  : "🔴 OFF"
              }`,
              "",
              "୨୧ controls",
              "    ♡ !game on",
              "    ♡ !game off",
              "",
              "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
            ].join("\n"),
            threadID
          );
        } catch (error) {
          console.error(
            "[GAME STATUS] Error:",
            error
          );

          sendReplyWithTyping(
            api,
            "🔴 Unable to read the game setting.",
            threadID
          );
        }

        return;
      }

      const enabled =
        gameSubcommand ===
        "on";

      try {
        await db.setGameEnabled(
          threadID,
          enabled
        );

        sendReplyWithTyping(
          api,
          [
            "╭────── 🎀  GAME CONTROL  🎀 ──────╮",
            "",
            enabled
              ? "🟢 GAMES ARE NOW ON"
              : "🔴 GAMES ARE NOW OFF",
            "",
            "୨୧ group status",
            `    ♡ ${
              enabled
                ? "ON"
                : "OFF"
            }`,
            "",
            "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
          ].join("\n"),
          threadID
        );
      } catch (error) {
        console.error(
          "[GAME TOGGLE] Error:",
          error
        );

        sendReplyWithTyping(
          api,
          "🔴 Failed to change the game setting.",
          threadID
        );
      }

      return;
    }

    // --------------------------------------------------------
    // DEBATE COMMANDS
    // --------------------------------------------------------

    const debateMatch =
      text.match(
        /^!debate(?:\s+(.*))?$/i
      );

    if (debateMatch) {
      const debateArgs = debateMatch[1]
        ? debateMatch[1].trim().split(/\s+/)
        : [];

      assertTrafficGovernorApi(api, "DEBATE");

      try {
        if (
          await handleDebateCommand(
            api,
            event,
            "debate",
            debateArgs
          )
        ) {
          return;
        }
      } catch (error) {
        console.error(
          "[DEBATE] Command failed:",
          error
        );

        await sendReplyWithTyping(
          api,
          "🎀 The debate system encountered an error. Please try again.",
          threadID
        );

        return;
      }
    }

    // --------------------------------------------------------
    // EXAM COMMANDS
    // --------------------------------------------------------

    const examMatch =
      text.match(
        /^!exam(?:\s+(.*))?$/i
      );

    if (examMatch) {
      const examArgs = examMatch[1]
        ? examMatch[1].trim().split(/\s+/)
        : [];

      assertTrafficGovernorApi(api, "EXAM");

      try {
        if (await handleExam(api, event, examArgs)) {
          return;
        }
      } catch (error) {
        console.error(
          "[EXAM] Command failed:",
          error
        );

        await sendReplyWithTyping(
          api,
          "🎓 The exam system encountered an error. Please try again.",
          threadID
        );

        return;
      }
    }

    // --------------------------------------------------------
    // INVESTIGATION COMMANDS
    // !case / !haunt / !incident / !heist / !trial / !lost
    // !investigator / !investigations
    // --------------------------------------------------------

    const investigationMatch =
      text.match(
        /^!(case|haunt|incident|heist|trial|lost|investigator|investigations)(?:\s+(.*))?$/i
      );

    if (investigationMatch) {
      const investigationCommand =
        investigationMatch[1].toLowerCase();

      const investigationArgs = investigationMatch[2]
        ? investigationMatch[2].trim().split(/\s+/)
        : [];

      assertTrafficGovernorApi(api, "INVESTIGATIONS");

      try {
        if (
          await handleInvestigationCommand(
            api,
            event,
            investigationCommand,
            investigationArgs
          )
        ) {
          return;
        }
      } catch (error) {
        console.error(
          "[INVESTIGATIONS] Command failed:",
          error
        );

        await sendReplyWithTyping(
          api,
          "🕵️ The investigation system encountered an error. Please try again.",
          threadID
        );

        return;
      }
    }

    // --------------------------------------------------------
    // GAME COMMANDS
    // --------------------------------------------------------

    const gameMatch =
      text.match(gameCommandPattern);

    if (
      gameMatch
    ) {
      const gameCommand =
        gameMatch[1].toLowerCase();

      const gameArgs =
        gameMatch[2]
          ? gameMatch[2]
              .trim()
              .split(/\s+/)
          : [];

      if (
        gameCommand ===
        "games"
      ) {
        const handled =
          await handleGamesCommand(
            api,
            event,
            gameCommand,
            gameArgs
          );

        if (
          handled
        ) {
          return;
        }

        sendGameCenter(
          api,
          threadID
        );

        return;
      }

      const gamesEnabled =
        await db.isGameEnabled(
          threadID
        );

      if (
        !gamesEnabled
      ) {
        sendReplyWithTyping(
          api,
          [
            "╭────── 🎀  GAME CENTER  🎀 ──────╮",
            "",
            "🔴 GAMES ARE OFF",
            "",
            "An admin can enable them with:",
            "    ♡ !game on",
            "",
            "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
          ].join("\n"),
          threadID
        );

        return;
      }

      if (
        await handleGamesCommand(
          api,
          event,
          gameCommand,
          gameArgs
        )
      ) {
        return;
      }
    }

    // --------------------------------------------------------
    // ECONOMY
    // --------------------------------------------------------

    if (
      await handleEconomyCommand(
        api,
        event,
        text,
        originalText
      )
    ) {
      return;
    }
  } catch (error) {
    console.error(
      "RPG/economy/games command failed:",
      error
    );
  }

}

// ============================================================
// GAME CENTER
// ============================================================

function sendGameCenter(
  api,
  threadID
) {
  sendReplyWithTyping(
    api,
    [
      "🎀 E C L I P S E",
      "G A M E S",
      "",
      "♡ GAME CENTER",
      "────────────────────",
      "",
      "🎯 TRIVIA",
      "  !trivia",
      "",
      "✊ ROCK · PAPER · SCISSORS",
      "  !rps rock",
      "  !rps paper",
      "  !rps scissors",
      "",
      "🎲 ROLL",
      "  !roll 100",
      "",
      "🎯 GUESS",
      "  !guess 7",
      "",
      "🪙 COINFLIP",
      "  !coinflip 100 heads",
      "",
      "🎰 SLOTS",
      "  !slots 100",
      "",
      "🃏 BLACKJACK",
      "  !blackjack",
      "  !hit · !stand · !double · !split",
      "",
      "🧮 MATH",
      "  !math",
      "",
      "🧩 RIDDLE",
      "  !riddle",
      "",
      "🔮 8-BALL",
      "  !8ball <question>",
      "",
      "🎓 EXAM",
      "  !exam",
      "  !exam math · !exam science",
      "",
      "🕵️ INVESTIGATION",
      "  !case · !haunt · !incident",
      "  !heist · !trial · !lost",
      "  !investigator · !investigations",
      "",
      "🌌 COMING SOON",
      "  ◇ SIMULATION",
      "  ◇ DEBATE",
      "",
      "♡ !games rules",
      "♡ !games status",
      "",
      "୨୧ play · compete · explore ୨୧",
    ].join("\n"),
    threadID
  );
}

// ============================================================
// RANDOM ROAST COOLDOWN
// ============================================================

function canRandomRoastThread(
  threadID
) {
  const now =
    Date.now();

  const lastRoastAt =
    lastRandomRoastByThread.get(
      threadID
    ) || 0;

  if (
    now - lastRoastAt <
    RANDOM_ROAST_COOLDOWN_MS
  ) {
    return false;
  }

  if (
    lastRandomRoastByThread.size >
    1000
  ) {
    const expiry =
      Math.max(
        RANDOM_ROAST_COOLDOWN_MS * 2,
        60_000
      );

    for (
      const [
        knownThreadID,
        roastAt,
      ] of lastRandomRoastByThread.entries()
    ) {
      if (
        now - roastAt >
        expiry
      ) {
        lastRandomRoastByThread.delete(
          knownThreadID
        );
      }
    }
  }

  return true;
}

// ============================================================
// BROADCAST
// ============================================================
//
// pendingBroadcastTimers tracks each staggered setTimeout so
// gracefulShutdown can cancel outstanding ones. Without this, a
// large broadcast (many active threads) could still be firing
// send calls seconds after the process began tearing down.
// ============================================================

const pendingBroadcastTimers = new Set();

const BROADCAST_DUPLICATE_WINDOW_MS = 60_000;
const recentBroadcastFingerprints = new Map();
const pendingBroadcastComposers = new Map();
const BROADCAST_COMPOSER_TIMEOUT_MS = 2 * 60_000;

function getBroadcastImageAttachment(event) {
  const candidates = [];

  const pushCandidate = (value) => {
    if (value && typeof value === "object") {
      candidates.push(value);
    }
  };

  const attachments = Array.isArray(event?.attachments)
    ? event.attachments
    : [];

  for (const attachment of attachments) {
    pushCandidate(attachment);

    if (Array.isArray(attachment?.attachments)) {
      for (const nested of attachment.attachments) {
        pushCandidate(nested);
      }
    }
  }

  pushCandidate(event?.attachment);
  pushCandidate(event?.message?.attachment);
  pushCandidate(event?.messageReply?.attachment);

  const hasUsableUrl = (attachment) =>
    [
      attachment?.url,
      attachment?.payload?.url,
      attachment?.payload?.source,
      attachment?.source,
      attachment?.href,
      attachment?.downloadUrl,
      attachment?.download_url,
      attachment?.imageUrl,
      attachment?.image_url,
      attachment?.metadata?.url,
      attachment?.metadata?.source,
    ].some(
      (value) =>
        typeof value === "string" &&
        /^https?:\/\//i.test(value.trim())
    );

  const isImage = (attachment) => {
    if (!hasUsableUrl(attachment)) {
      return false;
    }

    const type = String(
      attachment?.type ||
        attachment?.mimeType ||
        attachment?.mime_type ||
        attachment?.payload?.type ||
        ""
    ).toLowerCase();

    return (
      !type ||
      type === "photo" ||
      type === "image" ||
      type === "picture" ||
      type === "animated_image"
    );
  };

  return candidates.find(isImage) || null;
}

async function stageBroadcastImage(attachment) {
  const candidates = [
    attachment?.url,
    attachment?.payload?.url,
    attachment?.payload?.source,
    attachment?.source,
    attachment?.href,
    attachment?.downloadUrl,
    attachment?.download_url,
    attachment?.imageUrl,
    attachment?.image_url,
    attachment?.metadata?.url,
    attachment?.metadata?.source,
  ];

  const imageUrl = candidates
    .map((value) =>
      typeof value === "string"
        ? value.trim()
        : ""
    )
    .find((value) =>
      /^https?:\/\//i.test(value)
    );

  if (!imageUrl) {
    throw new Error("broadcast image has no usable URL");
  }

  const temporaryBase = path.join(
    os.tmpdir(),
    `eclipse-broadcast-${crypto.randomUUID()}`
  );

  let finalPath = temporaryBase;

  try {
    if (typeof fetch !== "function") {
      throw new Error(
        "Global fetch is unavailable on this Node runtime."
      );
    }

    const response = await fetch(
      imageUrl,
      {
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
        headers: {
          "User-Agent": "ECLIPSE Messenger Bot",
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} while downloading broadcast image.`
      );
    }

    const contentLength = Number(response.headers.get("content-length") || "0");
    const MAX_BROADCAST_IMAGE_BYTES = Math.max(
      1,
      Number(process.env.MAX_BROADCAST_IMAGE_BYTES || String(2 * 1024 * 1024))
    );

    if (contentLength > MAX_BROADCAST_IMAGE_BYTES) {
      throw new Error(
        `Broadcast image is too large (${Math.round(contentLength / 1024 / 1024)} MB). Maximum allowed is ${Math.round(MAX_BROADCAST_IMAGE_BYTES / 1024 / 1024)} MB.`
      );
    }

    const contentType = String(
      response.headers.get("content-type") || ""
    ).toLowerCase();

    if (!contentType.startsWith("image/")) {
      throw new Error(
        `attachment is not an image (${contentType || "unknown content type"})`
      );
    }

    const buffer = Buffer.from(
      await response.arrayBuffer()
    );

    if (buffer.length > MAX_BROADCAST_IMAGE_BYTES) {
      throw new Error(
        `Broadcast image exceeded the ${Math.round(MAX_BROADCAST_IMAGE_BYTES / 1024 / 1024)} MB bandwidth safety limit.`
      );
    }

    if (!buffer.length) {
      throw new Error(
        "Downloaded broadcast image is empty."
      );
    }

    const extensionMap = {
      "image/jpeg": ".jpg",
      "image/jpg": ".jpg",
      "image/png": ".png",
      "image/gif": ".gif",
      "image/webp": ".webp",
    };

    const extension =
      extensionMap[contentType] || ".img";

    finalPath =
      temporaryBase + extension;

    await fsp.writeFile(
      finalPath,
      buffer
    );

    const stat = await fsp.stat(
      finalPath
    );

    if (
      !stat.isFile() ||
      stat.size <= 0
    ) {
      throw new Error(
        "Broadcast image file was not written correctly."
      );
    }

    return finalPath;
  } catch (error) {
    try {
      await fsp.rm(
        finalPath,
        { force: true }
      );
    } catch {}

    throw error;
  }
}

function broadcastFingerprint(message, attachment) {
  const attachmentUrl = String(
    attachment?.url ||
      attachment?.payload?.url ||
      ""
  ).trim();

  return crypto
    .createHash("sha1")
    .update(
      `${String(message || "").trim()}\n${attachmentUrl}`
    )
    .digest("hex");
}

function cleanupBroadcastFingerprintMap() {
  const now = Date.now();

  for (
    const [fingerprint, timestamp] of recentBroadcastFingerprints.entries()
  ) {
    if (
      now - timestamp >=
      BROADCAST_DUPLICATE_WINDOW_MS
    ) {
      recentBroadcastFingerprints.delete(
        fingerprint
      );
    }
  }
}

function broadcastToAllThreads(
  api,
  message,
  imagePath = null
) {
  if (
    !message ||
    !message.trim()
  ) {
    console.log(
      "[Broadcast] No message."
    );

    return {
      queued: false,
      targetCount: 0,
    };
  }

  registerActiveThreadCleanup();

  const threads =
    Array.from(
      activeThreads.keys()
    );

  if (
    threads.length === 0
  ) {
    console.log(
      "[Broadcast] No active threads."
    );

    if (imagePath) {
      void fsp.unlink(imagePath).catch(() => {});
    }

    return {
      queued: false,
      targetCount: 0,
    };
  }

  console.log(
    `[Broadcast] Broadcasting to ${threads.length} threads` +
      (imagePath ? " with image." : ".")
  );

  const broadcastMessage =
    "makinig kayong mga gago kayo sa talata ko: " +
    message.trim();

  let remainingSends = threads.length;

  const cleanupImageWhenDone = () => {
    remainingSends--;

    if (
      remainingSends <= 0 &&
      imagePath
    ) {
      void fsp.unlink(imagePath).catch(() => {});
    }
  };

  threads.forEach(
    (
      threadID,
      index
    ) => {
      const timer = setTimeout(
        () => {
          pendingBroadcastTimers.delete(timer);

          const outgoingMessage = imagePath
            ? {
                body: broadcastMessage,
                attachment:
                  fs.createReadStream(imagePath),
              }
            : broadcastMessage;

          trafficSendMessage(
            api,
            outgoingMessage,
            threadID,
            (sendError) => {
              if (
                sendError
              ) {
                console.error(
                  `[Broadcast] Failed for ${threadID}:`,
                  sendError
                );
              } else {
                console.log(
                  `[Broadcast] Sent to ${threadID}` +
                    (imagePath ? " with image" : "")
                );
              }

              cleanupImageWhenDone();
            }
          );
        },
        index * 500
      );

      pendingBroadcastTimers.add(timer);
    }
  );

  return {
    queued: true,
    targetCount: threads.length,
    hasImage: Boolean(imagePath),
  };
}

// ============================================================
// ACTIVE THREAD CLEANUP
// ============================================================

function registerActiveThreadCleanup() {
  const now =
    Date.now();

  for (
    const [
      threadID,
      lastSeenAt,
    ] of activeThreads.entries()
  ) {
    if (
      now - lastSeenAt >
      ACTIVE_THREAD_EXPIRY_MS
    ) {
      activeThreads.delete(
        threadID
      );
    }
  }

  if (
    activeThreads.size >
    MAX_ACTIVE_THREADS
  ) {
    const entries =
      Array.from(
        activeThreads.entries()
      )
        .sort(
          (a, b) =>
            a[1] - b[1]
        );

    const excess =
      activeThreads.size -
      MAX_ACTIVE_THREADS;

    for (
      let i = 0;
      i < excess;
      i++
    ) {
      activeThreads.delete(
        entries[i][0]
      );
    }
  }
}

// ============================================================
// SAFE REPLY
// ============================================================


const BANAT_MIN_INTER_REPLY_GAP_MS = Math.max(
  5_000,
  Number(process.env.ECLIPSE_BANAT_MIN_INTER_REPLY_GAP_MS || 5_000)
);
const BANAT_STALE_JOB_MS = Math.max(
  15_000,
  Number(process.env.ECLIPSE_BANAT_STALE_JOB_MS || 30_000)
);

// Hard ceiling for one Banat turn. If the Messenger send/typing layer
// ever fails to settle, the GC must not remain permanently locked in
// state.running and stop accepting future messages.
const BANAT_TURN_TIMEOUT_MS = Math.max(
  15_000,
  Number(process.env.ECLIPSE_BANAT_TURN_TIMEOUT_MS || 45_000)
);


const BANAT_DECISION_MIN_MS = Math.max(
  500,
  Number(process.env.ECLIPSE_BANAT_DECISION_MIN_MS || 700)
);

// One Banat queue per conversation.
// Messages are coalesced per sender, then one sender is selected at random
// for each turn. The queue survives the 5s inter-reply gap, so Banat does
// not reset into an immediate reply every time someone talks.
const banatBurstState = new Map();

function acceptBanatBurstMessage(threadID, job) {
  const key = String(threadID || "");
  if (!key || !job || !job.api || !job.message) {
    return false;
  }

  let state = banatBurstState.get(key);

  if (!state) {
    state = {
      queue: [],
      running: false,
      lastSentAt: 0,
      decisionTimer: null,
      cleanupTimer: null,
    };

    banatBurstState.set(key, state);
  }

  if (state.cleanupTimer) {
    clearTimeout(state.cleanupTimer);
    state.cleanupTimer = null;
  }

  /*
   * Banat uses a strict one-message-per-turn window.
   *
   * The first incoming message owns the current turn.
   * Every other message received while that turn is waiting, being
   * answered, or inside the 5s reply gap is intentionally discarded.
   *
   * Example:
   *   A1 -> accepted
   *   A2 -> discarded
   *   A3 -> discarded
   *   B1 -> discarded
   *
   * After the 5s gap expires, the next NEW message starts the next turn.
   * This prevents old messages from piling up and being answered later.
   */
  const now = Date.now();

  if (state.running || state.decisionTimer) {
    return true;
  }

  if (
    state.lastSentAt &&
    now - state.lastSentAt < BANAT_MIN_INTER_REPLY_GAP_MS
  ) {
    return true;
  }

  // The current turn must contain exactly one job.
  state.queue.length = 0;
  state.queue.push({
    ...job,
    senderId: String(job.senderId || "").trim(),
    queuedAt: now,
  });

  const decisionMs = Math.max(
    BANAT_DECISION_MIN_MS,
    typeof calculateBanatDecisionDelay === "function"
      ? calculateBanatDecisionDelay(
          job.incomingText || job.message || "",
          1
        )
      : 1000
  );

  state.decisionTimer = setTimeout(() => {
    state.decisionTimer = null;

    runBanatBurstQueue(key).catch((error) => {
      console.error("[BANAT] Burst queue failed:", error);
    });
  }, decisionMs);

  return true;
}

function clearBanatBurstState(threadID) {
  const key = String(threadID || "").trim();
  const state = banatBurstState.get(key);

  if (!state) {
    return false;
  }

  if (state.decisionTimer) {
    clearTimeout(state.decisionTimer);
  }

  if (state.cleanupTimer) {
    clearTimeout(state.cleanupTimer);
  }

  state.decisionTimer = null;
  state.cleanupTimer = null;
  state.queue.length = 0;

  // If a reply is already in flight, leave its API call alone but prevent
  // any queued continuation from surviving the / toggle.
  if (!state.running) {
    banatBurstState.delete(key);
  }

  return true;
}

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

async function runBanatBurstQueue(threadID) {
  const key = String(threadID || "").trim();
  const state = banatBurstState.get(key);

  if (!state || state.running || !state.queue.length) {
    return;
  }

  state.running = true;

  try {
    const sinceLast = Date.now() - state.lastSentAt;

    if (
      state.lastSentAt &&
      sinceLast < BANAT_MIN_INTER_REPLY_GAP_MS
    ) {
      await sleep(
        BANAT_MIN_INTER_REPLY_GAP_MS - sinceLast
      );
    }

    if (!state.queue.length) {
      return;
    }

    const now = Date.now();

    // Drop stale jobs before selecting a target.
    state.queue = state.queue.filter((candidate) => {
      const age = now - Number(candidate.queuedAt || now);

      if (age > BANAT_STALE_JOB_MS) {
        console.log(
          "[BANAT] Dropping stale queued reply in " + key
        );
        return false;
      }

      return true;
    });

    if (!state.queue.length) {
      return;
    }

    // Prefer jobs with a sender ID. The fallback keeps malformed legacy
    // events from blocking the queue forever.
    const eligible = state.queue.filter(
      (candidate) =>
        String(candidate.senderId || "").trim()
    );

    const pool = eligible.length
      ? eligible
      : state.queue;

    // FIFO: if A, B, C speak during the same burst, answer A -> B -> C.
    // Do not randomly jump between senders; that makes Banat feel unnatural
    // and can make a later message get answered before an earlier one.
    const selected = pool[0];

    const selectedIndex =
      state.queue.indexOf(selected);

    const job =
      selectedIndex >= 0
        ? state.queue.splice(selectedIndex, 1)[0]
        : null;

    if (!job) {
      return;
    }

    console.log(
      "[BANAT] Turn started in " +
        key +
        " sender=" +
        String(job.senderId || "unknown")
    );

    let sent = false;

    try {
      sent = await Promise.race([
        sendBanatReplyWithTyping(
          job.api,
          job.message,
          key,
          job.replyToMessageID,
          job.attachMeme,
          job.linkUrl,
          0,
          job.incomingText || ""
        ),
        new Promise((resolve) => {
          setTimeout(() => {
            console.error(
              "[BANAT] Turn timed out after " +
                BANAT_TURN_TIMEOUT_MS +
                "ms in " +
                key +
                ". Releasing Banat state."
            );
            resolve(false);
          }, BANAT_TURN_TIMEOUT_MS);
        }),
      ]);
    } catch (error) {
      console.error(
        "[BANAT] Turn send failed in " + key + ":",
        error
      );
      sent = false;
    }

    if (sent) {
      state.lastSentAt = Date.now();
    }

    console.log(
      "[BANAT] Turn released in " +
        key +
        " sent=" +
        Boolean(sent)
    );
  } finally {
    const current = banatBurstState.get(key);

    if (current !== state) {
      return;
    }

    state.running = false;

    if (state.queue.length) {
      const sinceLast = Date.now() - state.lastSentAt;
      const cooldownMs = state.lastSentAt
        ? Math.max(0, BANAT_MIN_INTER_REPLY_GAP_MS - sinceLast)
        : 0;

      if (!state.decisionTimer) {
        const latest = state.queue[state.queue.length - 1];

        const decisionMs = Math.max(
          BANAT_DECISION_MIN_MS,
          typeof calculateBanatDecisionDelay === "function"
            ? calculateBanatDecisionDelay(
                latest?.incomingText || latest?.message || "",
                state.queue.length
              )
            : 1000
        );

        state.decisionTimer = setTimeout(() => {
          state.decisionTimer = null;

          runBanatBurstQueue(key).catch((error) => {
            console.error(
              "[BANAT] Burst queue continuation failed:",
              error
            );
          });
        }, cooldownMs + decisionMs);
      }

      return;
    }

    if (!state.cleanupTimer) {
      state.cleanupTimer = setTimeout(() => {
        const currentState = banatBurstState.get(key);

        if (
          currentState === state &&
          !state.running &&
          !state.queue.length
        ) {
          banatBurstState.delete(key);
        }
      }, BANAT_MIN_INTER_REPLY_GAP_MS);
    }
  }
}

async function handleAutomaticBanatMessage({
  api,
  event,
  body,
  senderId,
  threadId,
}) {
  const threadID = threadId;

  let roastEnabled = false;

  try {
    roastEnabled = await db.isRoastEnabled(threadId);
  } catch (error) {
    console.error(
      "[BANAT] Failed to check roast status:",
      error
    );

    return false;
  }

  if (!roastEnabled) {
    setBanatConversationMode(threadId, false);
    return false;
  }

  // Keep the in-memory conversation mode synchronized with the persistent
  // per-thread Banat setting. This also restores active mode after restart.
  if (!isBanatConversationModeActive(threadId)) {
    setBanatConversationMode(threadId, true);
  }

  // ECLIPSE's own self-listen events are never eligible.
  //
  // The primary owner/admin is intentionally NOT blocked here. Their
  // messages still trigger Banat so ECLIPSE can react to both sides of
  // the conversation, but getRandomRoastReply() routes protected users
  // through the admin-safe reaction pool instead of roast content.
  if (
    eclipseUserID &&
    String(senderId || "") === String(eclipseUserID)
  ) {
    return false;
  }

  // Persistent Banat ON means this thread is in automatic-reply mode.
  // Do not make the actual reply depend on a second in-memory gate: that
  // caused Banat to be ON in Neon while messages were still treated as
  // "undirected" after restarts or state desyncs.
  // ECLIPSE's own self-listen messages are already blocked above.
  const target = {
    shouldRespond: true,
    reason: "banat-enabled",
    directed: true,
    via: "enabled",
    conversationActive: true,
  };

  try {
    // The owner is protected from roast/trigger generation. The existing
    // admin-safe Banat pool below provides the reaction instead.
    const triggerReply = null;

    // Explicit triggers remain opt-in for non-admin senders.
    if (triggerReply) {
      let banatLinkEnabled = false;
      let banatMemeEnabled = false;

      try {
        const settings = await db.getThreadSettings(threadId);
        banatLinkEnabled = settings.banat_link_enabled === true;
        banatMemeEnabled = settings.banat_meme_enabled === true;
      } catch (settingsError) {
        console.error(
          "[BANAT] Failed to load link/meme settings:",
          settingsError
        );
      }

      const banatLinkPool = [
        "https://www.facebook.com/profile.php?id=61590719390401",
        "https://www.facebook.com/profile.php?id=61588685169649",
      ];

      const banatProfileUrl =
        banatLinkPool[
          Math.floor(Math.random() * banatLinkPool.length)
        ];

      const accepted = acceptBanatBurstMessage(
        threadID,
        {
          api,
          message: triggerReply,
          replyToMessageID: event.messageID,
          attachMeme: banatMemeEnabled,
          linkUrl: banatLinkEnabled
            ? banatProfileUrl
            : null,
          incomingText: body,
          senderId,
        }
      );

      if (!accepted) {
        console.log(
          "[BANAT] Ignored burst message from " +
            senderId +
            " in " +
            threadID
        );
      }

      return true;
    }
  } catch (error) {
    console.error(
      "Trigger system failed:",
      error
    );
  }

  // Ordinary Banat replies require a clear conversational reason to address
  // ECLIPSE. This stops it from jumping into two other people talking.
  if (!target.shouldRespond) {
    console.log(
      "[BANAT] Ignoring undirected message in " +
        threadID +
        " (" +
        target.reason +
        ")"
    );
    return false;
  }

  const randomRoastReply = getRandomRoastReply(threadID, body, senderId);

  if (randomRoastReply) {
    const accepted = acceptBanatBurstMessage(
      threadID,
      {
        api,
        message: randomRoastReply,
        replyToMessageID: event.messageID,
        attachMeme: false,
        linkUrl: null,
        incomingText: body,
        senderId,
      }
    );

    if (!accepted) {
      console.log(
        "[BANAT] Ignored burst message from " +
          senderId +
          " in " +
          threadID
      );
    }

    return true;
  }

  return false;
}

// ============================================================
// HUMAN / BANAT WIRING
// ============================================================
//
// The human system lives in dedicated modules.
// index.js only preserves the legacy call signatures and injects
// the existing Traffic Governor + meme helper dependencies.

function sendBanatReplyWithTyping(
  api,
  message,
  threadID,
  replyToMessageID = null,
  attachMeme = false,
  linkUrl = null,
  replyDelayMs = BANAT_REPLY_DELAY_MS,
  incomingText = ""
) {
  return sendBanatReplyWithTypingModule(
    api,
    message,
    threadID,
    replyToMessageID,
    attachMeme,
    linkUrl,
    replyDelayMs,
    incomingText,
    {
      trafficSendMessage,
      getRandomMemePath,
    }
  );
}

function sendReplyWithTyping(
  api,
  message,
  threadID,
  attachMeme = false,
  linkUrl = null
) {
  return sendReplyWithTypingModule(
    api,
    message,
    threadID,
    attachMeme,
    linkUrl,
    {
      trafficSendMessage,
      getRandomMemePath,
    }
  );
}

// ============================================================
// MEME HELPER
// ============================================================

function getRandomMemePath() {
  const memeDirectory =
    path.join(
      __dirname,
      "memes"
    );

  const supportedExtensions =
    new Set([
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
    ]);

  try {
    if (
      !fs.existsSync(
        memeDirectory
      )
    ) {
      return null;
    }

    const files =
      fs
        .readdirSync(
          memeDirectory
        )
        .filter((fileName) => {
          if (!supportedExtensions.has(path.extname(fileName).toLowerCase())) return false;
          try {
            const stat = fs.statSync(path.join(memeDirectory, fileName));
            const maxMemeBytes = Math.max(
              1,
              Number(process.env.MAX_BANAT_MEME_BYTES || String(2 * 1024 * 1024))
            );
            return stat.isFile() && stat.size > 0 && stat.size <= maxMemeBytes;
          } catch {
            return false;
          }
        });

    if (
      files.length === 0
    ) {
      return null;
    }

    const randomFile =
      files[
        Math.floor(
          Math.random() *
            files.length
        )
      ];

    return path.join(
      memeDirectory,
      randomFile
    );
  } catch (error) {
    console.error(
      "Could not load memes:",
      error
    );

    return null;
  }
}

// ============================================================
// PROCESS / SHUTDOWN PROTECTION
// ============================================================

async function cleanupMusicFiles() {
  const files = new Set();

  for (const queue of musicQueues.values()) {
    for (const job of queue) {
      if (job.temporaryFile) {
        files.add(
          job.temporaryFile
        );
      }
    }
  }

  for (const file of files) {
    await fsp
      .unlink(file)
      .catch(() => {});
  }
}

let shuttingDown =
  false;

async function gracefulShutdown(
  signal,
  exitCode = 0
) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  watchdogSetShuttingDown(
    true
  );

  watchdogSetMessengerConnected(
    false
  );

  stopWatchdog();
  stopTrafficGovernor();

  try {
    shutdownGames();
  } catch (error) {
    console.error("[SYSTEM] Game shutdown failed:", error);
  }

  try {
    stopCleanupScheduler();
  } catch (error) {
    console.error("[SYSTEM] Cleanup scheduler shutdown failed:", error);
  }

  if (loginRetryTimer) {
    clearTimeout(loginRetryTimer);
    loginRetryTimer = null;
  }

  console.log(
    `[SYSTEM] Received ${signal}. Cleaning up ECLIPSE...`
  );

  for (const timer of pendingBroadcastTimers) {
    clearTimeout(timer);
  }

  pendingBroadcastTimers.clear();

  for (
    const job of musicPendingJobs
  ) {
    job.cancelled =
      true;
  }

  musicPendingJobs.length = 0;

  try {
    await cleanupMusicFiles();
  } catch (error) {
    console.error(
      "[SYSTEM] Music cleanup failed:",
      error
    );
  }

  // Do NOT call Messenger logout during process shutdown.
  // Render sends SIGTERM for normal deploys/restarts. Explicitly logging
  // out here invalidates the Facebook session every time the process is
  // replaced. Stopping the Node process is enough; ws3-fca/Facebook can
  // keep the session valid for the next startup.
  try {
    if (server) {
      await new Promise(
        (resolve) => {
          server.close(
            () => resolve()
          );
        }
      );
    }
  } catch (error) {
    console.error(
      "[SYSTEM] Server shutdown failed:",
      error
    );
  }

  try {
    await db.close();
  } catch (error) {
    console.error("[SYSTEM] Database shutdown failed:", error);
  }

  process.exit(
    Number.isInteger(exitCode) ? exitCode : 0
  );
}

process.once("uncaughtException", (error) => {
  console.error("[SYSTEM] Uncaught exception:", error);
  void gracefulShutdown("uncaughtException", 1);
});

process.once("unhandledRejection", (reason) => {
  console.error("[SYSTEM] Unhandled rejection:", reason);
  void gracefulShutdown("unhandledRejection", 1);
});

process.once(
  "SIGTERM",
  () => {
    void gracefulShutdown(
      "SIGTERM"
    );
  }
);

process.once(
  "SIGINT",
  () => {
    void gracefulShutdown(
      "SIGINT"
    );
  }
);

// ============================================================
// MEMORY MONITOR
// ============================================================

setInterval(() => {
  const m =
    process.memoryUsage();

  const music =
    getMusicStats();

  console.log(
    `[MEMORY] RSS: ${Math.round(
      m.rss / 1024 / 1024
    )} MB | ` +
      `Heap: ${Math.round(
        m.heapUsed / 1024 / 1024
      )} / ` +
      `${Math.round(
        m.heapTotal / 1024 / 1024
      )} MB | ` +
      `External: ${Math.round(
        m.external / 1024 / 1024
      )} MB | ` +
      `Music: ${music.activeDownloads}/${MUSIC_MAX_GLOBAL_DOWNLOADS} downloads`
  );
}, 60_000);


