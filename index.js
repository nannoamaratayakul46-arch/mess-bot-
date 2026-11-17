"use strict";

const { invokeMessengerSend, resolveMessengerIsGroup } = require("./messengerSendRouting");
const { loadDashboardGroupSettings } = require("./dashboardGroupSettings");
const { setMessageReactionMqtt, changeGroupMember } = require("./messengerApiCompat");
const { classifyListenerError, getListenerRecoveryDelayMs, getLoginRetryDelayMs } = require("./messengerRecoveryPolicy");
const { verifyMessengerProxy, getMessengerProxyUrl } = require("./messengerProxy");

// "/" is an admin-only Banat toggle. Keep unauthorized-attempt state at
// module scope so it survives individual message-handler invocations.
const unauthorizedSlashAttempts = new Map();
const UNAUTHORIZED_SLASH_WINDOW_MS = Math.max(
  60_000,
  Number(process.env.ECLIPSE_BANAT_SLASH_WINDOW_MS || 60_000)
);
const UNAUTHORIZED_SLASH_MAX_REPLIES = Math.max(
  1,
  Number(process.env.ECLIPSE_BANAT_UNAUTHORIZED_MAX_REPLIES || 1)
);

// Dashboard-controlled reaction engine. Kept in memory for fast message-path
// checks, with the canonical value persisted in PostgreSQL.
const DEFAULT_REACTION_CONFIG = Object.freeze({
  owner_messages: true,
  eclipse_messages: true,
  reaction: "😆",
});
let dashboardReactionConfig = { ...DEFAULT_REACTION_CONFIG };

function normalizeReactionConfig(value = {}) {
  const reaction = String(value.reaction || DEFAULT_REACTION_CONFIG.reaction).trim();
  const allowedReactions = new Set(["😆", "😂", "🤣", "😭", "💀", "❤️", "🔥", "👍", "😮", "😢", "😡"]);
  return {
    owner_messages: value.owner_messages !== false,
    eclipse_messages: value.eclipse_messages !== false,
    reaction: allowedReactions.has(reaction) ? reaction : DEFAULT_REACTION_CONFIG.reaction,
  };
}

async function loadDashboardReactionConfig() {
  try {
    await db.connect();
    await db.query(
      `CREATE TABLE IF NOT EXISTS eclipse_dashboard_preferences (
        preference_key TEXT PRIMARY KEY,
        preference_value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    );
    const { rows } = await db.query(
      "SELECT preference_value FROM eclipse_dashboard_preferences WHERE preference_key = $1 LIMIT 1",
      ["reaction_engine"]
    );
    dashboardReactionConfig = normalizeReactionConfig(rows[0]?.preference_value || DEFAULT_REACTION_CONFIG);
  } catch (error) {
    console.warn("[BANAT] Could not load dashboard reaction settings; using defaults:", error?.message || error);
  }
  return dashboardReactionConfig;
}



const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { createDashboardSecurity } = require("./dashboardSecurity");
const { createDashboardAccessRoutes } = require("./dashboardAccessRoutes");
const { createSpotifyListeningRooms } = require("./spotifyListeningRooms");
const { login } = require("ws3-fca");

const db = require("./db");
const trafficDeliveryStore = require("./trafficDeliveryHistory");
const { resolveTargetName, clearTargetNameCache } = require("./targetName");
const { createJaidenMessageQueue } = require("./jaiden-message-queue");
const { createJaidenTargetCountdown } = require("./jaiden-target-countdown");
const jaidenAutoTargetPersonality = require("./jaiden-auto-target-personality");
const { pickJaidenAutoTargetLine } = jaidenAutoTargetPersonality;
const { createJaidenTargetPersonalitySettings } = require("./jaidenTargetPersonalitySettings");
const jaidenTargetRecords = require("./jaidenTargetRecords");
const { registerGroupProfileRoutes, handleGroupProfileEvent, handleTargetedLaughReaction } = require("./groupProfileRoutes");
const { resolveGroupMembers, noteEvent: noteMemberNameEvent } = require("./memberNameResolver");
const { getThreadList: getSharedThreadList, clearThreadListCache: clearSharedThreadListCache } = require("./messengerThreadList");
const { createLiveChat } = require("./liveChat");
const { registerModerationRoutes } = require("./dashboardModeration");
const { registerTemporaryAdminRoutes } = require("./temporaryGroupAdmins");
const { registerDatabaseAiCenterRoutes } = require("./dashboardDatabaseAiCenter");
const { createBurstRoastSettings } = require("./burstRoastSettings");
const { createPmCenter } = require("./pmCenter");
const { createPmBattles } = require("./pmBattles");

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
  removeFromGroup,
  createBan,
  logModeration,
} = require("./moderation");

const { createAntiSpam } = require("./antiSpam");
const { createAutoWelcome } = require("./autoWelcome");
const { createSharedGcRegistry } = require("./sharedGcRegistry");

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
  scoreBanatAddressContext,
  setBanatDirectedTarget,
  clearBanatDirectedTarget,
  getBanatConversationTarget,
  setBanatConversationTarget,
  clearBanatConversationTarget,
} = require("./triggers");

const { trackBanatRotation, markBanatRotationReply, clearBanatRotation } = require("./banat-rotation");

// ============================================================
// HUMAN / BANAT MODULES
// ============================================================

const {
  sendBanatReplyWithTyping: sendBanatReplyWithTypingModule,
  BANAT_REPLY_DELAY_MS,
  prepareBanatReply,
} = require("./banat-human");

const { startTyping, stopTyping } = require("./typingIndicator");

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
const dashboardKnownGroups = new Map();
// Avoid repeating the same automatic Jaiden Target nickname write for every message.
const jaidenTargetNicknameApplied = new Map();
const dashboardSetNNJobs = new Map();
const dashboardRemoveNNJobs = new Map();
let dashboardSharedLocation = null;
const dashboardSetNNStopRequests = new Set();
const archivedDashboardGroups = new Set();
let archivedDashboardGroupsLoadedAt = 0;
let archivedDashboardGroupsLoadPromise = null;

async function isDashboardGroupArchived(threadID) {
  const now = Date.now();
  if (now - archivedDashboardGroupsLoadedAt > 30_000 && !archivedDashboardGroupsLoadPromise) {
    const archiveOwnerID = String(eclipseUserID || "").trim();
    archivedDashboardGroupsLoadPromise = db.query(
      "SELECT thread_id FROM eclipse_dashboard_archived_groups WHERE messenger_user_id = $1",
      [archiveOwnerID]
    ).then(result => {
      if (archiveOwnerID !== String(eclipseUserID || "").trim()) return;
      archivedDashboardGroups.clear();
      for (const row of result.rows || []) {
        const id = String(row.thread_id || "").trim();
        if (id) archivedDashboardGroups.add(id);
      }
      archivedDashboardGroupsLoadedAt = Date.now();
    }).catch(() => {
      // The archive table is created lazily by the dashboard endpoint. If it
      // is not present yet, leave normal message routing unchanged.
      archivedDashboardGroupsLoadedAt = Date.now();
    }).finally(() => {
      archivedDashboardGroupsLoadPromise = null;
    });
  }
  if (archivedDashboardGroupsLoadPromise) await archivedDashboardGroupsLoadPromise;
  return archivedDashboardGroups.has(String(threadID || "").trim());
}


function getRenderRuntimeSeconds() {
  // Prefer PID 1's age: on Render this is the closest available local signal
  // for how long the service container has been running.
  const readProcAgeSeconds = (pid) => {
    const uptimeText = fs.readFileSync("/proc/uptime", "utf8").trim().split(/\s+/)[0];
    const uptimeSeconds = Number(uptimeText);
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    // The comm field can contain spaces and parentheses; parse after its last ')'.
    const closingParen = stat.lastIndexOf(")");
    if (closingParen < 0) throw new Error("Invalid proc stat");
    const fieldsAfterComm = stat.slice(closingParen + 1).trim().split(/\s+/);
    const startTicks = Number(fieldsAfterComm[19]); // Linux stat field 22: starttime
    if (!Number.isFinite(uptimeSeconds) || !Number.isFinite(startTicks) || startTicks < 0) {
      throw new Error("Invalid proc uptime data");
    }

    // CLK_TCK is system-specific; ask the runtime rather than assuming 100.
    let ticksPerSecond = 100;
    try {
      const { execFileSync } = require("child_process");
      const detected = Number(execFileSync("getconf", ["CLK_TCK"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 1000,
      }).trim());
      if (Number.isFinite(detected) && detected > 0) ticksPerSecond = detected;
    } catch {
      // 100 is a compatibility fallback for common Linux container images.
    }

    return Math.max(0, Math.floor(uptimeSeconds - startTicks / ticksPerSecond));
  };

  try {
    const containerAge = readProcAgeSeconds(1);
    if (containerAge > 0) return containerAge;
  } catch {
    // PID 1/procfs may not be readable in local or restricted environments.
  }

  // Secondary fallback: use this Node process's kernel start time if possible.
  try {
    const processAge = readProcAgeSeconds("self");
    if (processAge > 0) return processAge;
  } catch {
    // Fall through to Node's monotonic process clock.
  }

  // Automatic fallback: capture this Node process's start timestamp at
  // startup, derived from its monotonic uptime clock. This needs no Render env
  // var and naturally resets when Node starts again. It represents process
  // uptime, not container uptime, so procfs remains preferred above.
  const processStartedAtMs = Date.now() - process.uptime() * 1000;
  return Math.max(0, Math.floor((Date.now() - processStartedAtMs) / 1000));
}

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

  minGapMs: 1200,
  maxGapMs: 2400,

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
let trafficNextGapMs =
  TRAFFIC_GOVERNOR.minGapMs +
  Math.floor(Math.random() * (TRAFFIC_GOVERNOR.maxGapMs - TRAFFIC_GOVERNOR.minGapMs + 1));
let trafficTotalSent = 0;
let trafficTotalFailed = 0;
let trafficLastFailure = null;
const trafficDeliveryHistory = [];
const TRAFFIC_DELIVERY_HISTORY_LIMIT = 5000;
const TRAFFIC_DELIVERY_RETENTION_MS = 24 * 60 * 60 * 1000;

function trafficRecordDeliveryOutcome(outcome, job, code = null) {
  const now = Date.now();
  const entry = {
    at: new Date(now).toISOString(),
    outcome,
    code: code ? String(code).slice(0, 80) : null,
    elapsed_ms: Math.max(0, now - Number(job?.enqueuedAt || now)),
    attachment: Boolean(job?.message && typeof job.message === "object" && job.message.attachment),
  };
  trafficDeliveryHistory.push(entry);

  const cutoff = now - TRAFFIC_DELIVERY_RETENTION_MS;
  while (trafficDeliveryHistory.length && Date.parse(trafficDeliveryHistory[0].at) < cutoff) {
    trafficDeliveryHistory.shift();
  }
  while (trafficDeliveryHistory.length > TRAFFIC_DELIVERY_HISTORY_LIMIT) {
    trafficDeliveryHistory.shift();
  }

  // Persist sanitized outcomes asynchronously so send callbacks never wait on PostgreSQL.
  trafficDeliveryStore.record(outcome, job, code);
}
function trafficDeliverySummary() {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  const currentHour = Math.floor(now / hourMs) * hourMs;
  const history = Array.from({ length: 24 }, (_, index) => {
    const start = currentHour - (23 - index) * hourMs;
    return {
      bucket: new Date(start).toISOString(),
      sent: 0,
      failed: 0,
    };
  });
  const byHour = new Map(history.map((item) => [item.bucket, item]));
  let totalSent24h = 0;
  let totalFailed24h = 0;
  const cutoff = now - TRAFFIC_DELIVERY_RETENTION_MS;

  for (const entry of trafficDeliveryHistory) {
    const timestamp = Date.parse(entry?.at || "");
    if (!Number.isFinite(timestamp) || timestamp < cutoff || timestamp > now) continue;
    const bucket = new Date(Math.floor(timestamp / hourMs) * hourMs).toISOString();
    const target = byHour.get(bucket);
    if (!target) continue;
    if (entry.outcome === "sent") {
      target.sent++;
      totalSent24h++;
    } else if (entry.outcome === "failed") {
      target.failed++;
      totalFailed24h++;
    }
  }

  return { totalSent24h, totalFailed24h, history };
}

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

  // For reactions, messageID usually identifies the message being reacted
  // to, not a unique reaction event. Deduplicate by actor + target + timestamp
  // instead so multiple members reacting to one message are all counted.
  const eventType = String(event.type || "").toLowerCase();
  if (["message_reaction", "messagereactionadd", "reaction"].includes(eventType)) {
    const threadID = String(event.threadID || "").trim();
    const actorID = String(event.userID ?? event.senderID ?? event.authorID ?? "").trim();
    const targetMessageID = String(event.messageID || event.messageId || "").trim();
    const timestamp = Number(event.timestamp || event.timestampMS || event.timestamp_ms || NaN);
    const reaction = String(event.reaction ?? event.reactionEmoji ?? event.emoji ?? event.reactionType ?? "");
    if (threadID && actorID && Number.isFinite(timestamp)) {
      return [`reaction:${threadID}:${actorID}:${targetMessageID}:${timestamp}:${reaction}`];
    }
    // Without an event timestamp, don't use the target message ID as a
    // dedup key; doing so would suppress every later reaction to that message.
    return [];
  }

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

  return Math.round(trafficNextGapMs * multiplier);
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
  trafficNextGapMs =
    TRAFFIC_GOVERNOR.minGapMs +
    Math.floor(Math.random() * (TRAFFIC_GOVERNOR.maxGapMs - TRAFFIC_GOVERNOR.minGapMs + 1));
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
    totalFailed:
      trafficTotalFailed,
    delivery24h: (() => {
      const persisted = trafficDeliveryStore.getCachedSummary();
      if (persisted && persisted.available) {
        return {
          available: true,
          source: persisted.source,
          totalSent24h: persisted.sent,
          totalFailed24h: persisted.failed,
          history: (persisted.hourly || []).map((bucket) => ({
            bucket: bucket.hour,
            sent: bucket.sent,
            failed: bucket.failed,
          })),
          failure_codes: persisted.failure_codes || {},
          recent_failures: persisted.recent_failures || [],
          last_failure: persisted.last_failure || null,
        };
      }
      return {
        ...trafficDeliverySummary(),
        available: false,
        source: "process-memory",
      };
    })(),
    lastFailure:
      trafficLastFailure,
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

function trafficQueueSend(api, message, threadID, callback, replyToMessageID = null, options = {}) {
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
    shouldSend: typeof options.shouldSend === "function" ? options.shouldSend : null,
    // ws3-fca's sendMessage defaults to inferring single-user vs group from
    // threadID length. PM recipient IDs can exceed that heuristic's limit.
    // Callers may explicitly identify a private recipient with isGroup=false.
    isGroup: resolveMessengerIsGroup(threadID, options.isGroup, dashboardKnownGroups),
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

      if (job.shouldSend && !job.shouldSend()) {
        trafficSendQueue.shift();
        const cancelledError = new Error("Queued Messenger send was cancelled before delivery.");
        cancelledError.code = "ECLIPSE_SEND_CANCELLED";
        if (typeof job.callback === "function") {
          try { job.callback(cancelledError); } catch (error) {
            console.error("[TRAFFIC] Cancelled-send callback failed:", error?.message || error);
          }
        }
        continue;
      }

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
              trafficRecordDeliveryOutcome("sent", job);
            } else {
              trafficTotalFailed++;
              const rawCode = String(
                error?.errorCode ||
                error?.code ||
                error?.error?.errorCode ||
                error?.error?.code ||
                error?.error ||
                error?.errorDescription?.errorCode ||
                error?.errorDescription?.code ||
                error?.cause?.errorCode ||
                error?.cause?.code ||
                error?.name ||
                "SEND_FAILED"
              ).slice(0, 80);
              trafficRecordDeliveryOutcome("failed", job, rawCode);

              // ws3-fca can wrap Messenger errors in generic Error objects.
              // Preserve a small allowlist of diagnostic fields so the actual
              // rejection can be distinguished from a session/HTTP failure.
              // Never serialize the full error/response: it may contain cookies
              // or request/session data.
              // Inspect a bounded set of data descriptors across the prototype chain.
              // Do not invoke getters or serialize arbitrary ws3-fca request/response objects.
              const readSafeErrorField = (target, key) => {
                let current = target;
                for (let depth = 0; current && depth < 4; depth++) {
                  let descriptor;
                  try { descriptor = Object.getOwnPropertyDescriptor(current, key); } catch { return undefined; }
                  if (descriptor) return Object.prototype.hasOwnProperty.call(descriptor, "value")
                    ? descriptor.value : undefined;
                  try { current = Object.getPrototypeOf(current); } catch { return undefined; }
                }
                return undefined;
              };
              const safeErrorObject = (value) => {
                if (!value || typeof value !== "object" || Array.isArray(value)) return value;
                const allowedKeys = [
                  "code", "errorCode", "type", "name", "message", "error_description",
                  "errorDescription", "errorSummary", "error_user_title", "error_user_msg",
                  "error_subcode", "errorSubcode", "status", "statusCode", "responseSummary",
                ];
                const safe = {};
                for (const key of allowedKeys) {
                  const item = readSafeErrorField(value, key);
                  if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
                    safe[key] = String(item).slice(0, 180);
                  }
                }
                const shape = [];
                try { shape.push(...Object.getOwnPropertyNames(value).slice(0, 20)); } catch {}
                let proto = null;
                try { proto = Object.getPrototypeOf(value); } catch {}
                if (proto && proto !== Object.prototype) {
                  try { shape.push(...Object.getOwnPropertyNames(proto).slice(0, 10).map(key => "prototype:" + key)); } catch {}
                }
                if (shape.length) safe.available_properties = [...new Set(shape)].slice(0, 24);
                return Object.keys(safe).length ? JSON.stringify(safe).slice(0, 360) : "[structured object; no safe data fields]";
              };
              const diagnosticFields = [
                ["message", readSafeErrorField(error, "message")],
                ["errorDescription", safeErrorObject(readSafeErrorField(error, "errorDescription"))],
                ["errorSummary", readSafeErrorField(error, "errorSummary")],
                ["error", safeErrorObject(readSafeErrorField(error, "error"))],
                ["responseSummary", readSafeErrorField(error, "responseSummary")],
                ["nestedError", readSafeErrorField(error, "error")],
                ["errorValue", typeof error === "string" || typeof error === "number" ? error : null],
                ["statusCode", readSafeErrorField(error, "statusCode") ?? readSafeErrorField(error, "status")],
                ["causeCode", readSafeErrorField(readSafeErrorField(error, "cause"), "code")],
                ["causeMessage", readSafeErrorField(readSafeErrorField(error, "cause"), "message")],
                ["responseStatus", readSafeErrorField(readSafeErrorField(error, "response"), "status") ?? readSafeErrorField(readSafeErrorField(error, "response"), "statusCode")],
                ["errorShape", safeErrorObject(error)],
              ].filter(([, value]) => value !== undefined && value !== null && String(value).trim());
              // Log only payload metadata, never message text, IDs, attachments, or raw request data.
              // This distinguishes reply-reference failures from plain text/attachment failures.
              const payloadBody = typeof job.message === "string" ? job.message : job.message?.body;
              const payloadKind = job.message && typeof job.message === "object"
                ? (job.message.attachment ? "attachment" : "object")
                : typeof job.message;
              const sendContext = [
                "payloadKind=" + payloadKind,
                "bodyLength=" + (typeof payloadBody === "string" ? payloadBody.length : 0),
                "hasReplyTo=" + Boolean(job.replyToMessageID),
                "hasAttachment=" + Boolean(job.message && typeof job.message === "object" && job.message.attachment),
                "hasUrl=" + Boolean(job.message && typeof job.message === "object" && job.message.url),
              ].join(" | ");
              const rawDetail = ((diagnosticFields.length
                ? diagnosticFields.map(([key, value]) => key + "=" + String(value)).join(" | ")
                : "Messenger send failed.") + " | " + sendContext)
                .replace(/(["']?(?:password|passwd|cookie|appstate|access[_-]?token|refresh[_-]?token|authorization)["']?\s*[:=]\s*)[^,;\s}]+/gi, "$1[redacted]")
                .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted email]")
                .replace(/https?:\/\/[^\s"\x27<>]+/gi, "[redacted URL]")
                .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted token]")
                .slice(0, 500);
              trafficLastFailure = {
                code: rawCode,
                detail: rawDetail,
                thread_id: String(job.threadID),
                at: new Date().toISOString(),
              };
              console.error(`[TRAFFIC] Messenger send failed (${rawCode}) in thread ${String(job.threadID)}: ${rawDetail}`);
              pushDashboardEvent("send-failed", "Messenger send failed: " + rawCode + " — " + rawDetail, {
                code: rawCode,
                detail: rawDetail,
                thread_id: String(job.threadID),
                attachment: Boolean(job.message && typeof job.message === "object" && job.message.attachment),
                elapsed_ms: Math.max(0, Date.now() - Number(job.enqueuedAt || Date.now())),
              });
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

            invokeMessengerSend(job.api, job, sendCallback);
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
    const error = new Error(      trafficShuttingDown
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
          messageID,
          isGroup
        ) {
          return trafficQueueSend(
            rawApi,
            message,
            threadID,
            callback,
            messageID,
            typeof isGroup === "boolean" ? { isGroup } : {}
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

      // ws3-fca 3.5.2 reactions return Promises instead of using the legacy
      // callback parameters. Preserve the callback contract used by bot modules.
      if (property === "setMessageReaction") {
        return function guardedSetMessageReaction(reaction, messageID, callback) {
          try {
            const result = rawApi.setMessageReaction(reaction, messageID);
            if (typeof callback !== "function") return result;
            return Promise.resolve(result).then(
              info => { callback(null, info); return info; },
              error => { callback(error); return undefined; }
            );
          } catch (error) {
            if (typeof callback === "function") { callback(error); return undefined; }
            throw error;
          }
        };
      }

      if (property === "setMessageReactionMqtt") {
        return function guardedSetMessageReactionMqtt(reaction, messageID, threadID, callback) {
          try {
            const result = rawApi.setMessageReactionMqtt(reaction, messageID, threadID);
            if (typeof callback !== "function") return result;
            if (result && typeof result.then === "function") {
              return result.then(
                info => { callback(null, info); return info; },
                error => { callback(error); return undefined; }
              );
            }
            // 3.5.2 publishes synchronously and returns undefined. Report only
            // local publish acceptance, never a server-side acknowledgement.
            const published = { published: true, acknowledged: false, transport: "mqtt" };
            callback(null, published);
            return published;
          } catch (error) {
            if (typeof callback === "function") { callback(error); return undefined; }
            throw error;
          }
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
  replyToMessageID = null,
  options = {}
) {
  return trafficQueueSend(
    api,
    message,
    threadID,
    callback,
    replyToMessageID,
    options
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
  threadID,
  options = {}
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
        },
        null,
        options
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
app.set("trust proxy", 1);

app.use(express.json({
  limit: "32kb",
  // Let the profile endpoint use its own bounded parser for image data URLs.
  type: req =>
    !/^\/api\/dashboard\/groups\/[^/]+\/profile$/.test(req.path) &&
    !/^\/api\/dashboard\/auto-welcome(?:\/|$)/.test(req.path) &&
    !/^\/api\/dashboard\/jaiden-auto-target\/personality$/.test(req.path) &&
    Boolean(req.is("application/json")),
}));

const dashboardSecurity = createDashboardSecurity({
  apiKey: process.env.ECLIPSE_DASHBOARD_API_KEY,
  allowedOrigins: [
    process.env.ECLIPSE_DASHBOARD_ORIGIN,
    "https://messenger-bot-admin-1.onrender.com",
    "https://messenger-bot-admin-6wlf.onrender.com",
  ].filter(Boolean).join(","),
});

function dashboardCors(req, res, next) {
  return dashboardSecurity.cors(req, res, next);
}

let dashboardSessionAuthorizer = null;

function requireDashboardAccess(req, res, next) {
  if (dashboardSessionAuthorizer) return dashboardSessionAuthorizer(req, res, next);
  return dashboardSecurity.requireAccess(req, res, next);
}

app.use(dashboardCors);

// Individual account sessions are the only authentication method for normal
// dashboard routes. The shared Dashboard API Key is reserved for owner setup
// and Passkey reset through /api/access/bootstrap.
if (/^(1|true|yes|on)$/i.test(process.env.ECLIPSE_DASHBOARD_ACCESS_ENABLED || "")) {
  const dashboardAccessRoutes = createDashboardAccessRoutes({
    app,
    db,
    legacyAuth: dashboardSecurity.requireAccess,
  });
  // All existing dashboard routes now use the centralized account/role policy.
  dashboardSessionAuthorizer = dashboardAccessRoutes.authorizeExistingRoute;
  dashboardAccessRoutes.schemaReady.then(() => {
    console.log("[DASHBOARD ACCESS] Account/session schema is ready.");
  }).catch(error => {
    console.error("[DASHBOARD ACCESS] Schema initialization failed:", String(error?.code || error?.name || "ACCESS_SCHEMA_FAILED"));
  });
}

// Persistent Spotify rooms use the same individual dashboard-session auth as the rest of the API.
createSpotifyListeningRooms({ app, db, auth: requireDashboardAccess });

// Authenticated, read-only Neon inspection and encrypted dashboard AI settings.
registerDatabaseAiCenterRoutes(app, requireDashboardAccess);
const burstRoastSettings = createBurstRoastSettings({
  db,
  getApi: () => activeMessengerApi && activeListenerGeneration > 0 ? activeMessengerApi : null,
  isKnownGroup: threadId => dashboardKnownGroups.has(String(threadId)),
  send: (api, message, threadID) => sendMessengerMessage(api, message, threadID),
});

burstRoastSettings.registerRoutes(app, requireDashboardAccess);




const liveChat = createLiveChat({
  getApi: () => activeMessengerApi && activeListenerGeneration > 0 ? activeMessengerApi : null,
  log: console.log,
});
liveChat.registerRoutes(app, requireDashboardAccess);

// Manual, single-recipient private messaging from the owner dashboard.
const pmCenter = createPmCenter({
  getApi: () => activeMessengerApi && activeListenerGeneration > 0 ? activeMessengerApi : null,
  isKnownGroup: threadId => dashboardKnownGroups.has(String(threadId)),
  // PM Center shares the same metadata-aware member resolution used by the
  // dashboard Groups picker. Keep unresolved IDs selectable instead of hiding
  // the entire list when profile-name lookups fail.
  resolveMembers: async (api, threadId) => {
    const [threadInfo, threadList] = await Promise.all([
      dashboardGetThreadInfo(api, threadId).catch(() => ({})),
      dashboardGetThreadList(api).catch(() => []),
    ]);
    const resolved = await resolveGroupMembers(api, threadId, { threadInfo, threadList });
    let members = Array.isArray(resolved?.members) ? resolved.members : [];
    if (!members.length) {
      const participantIds = await dashboardGetParticipantIds(api, threadId);
      const nicknames = threadInfo?.nicknames && typeof threadInfo.nicknames === "object"
        ? threadInfo.nicknames : {};
      members = [...participantIds].map(user_id => ({
        user_id,
        name: String(nicknames[user_id] || "").trim() || ("Unnamed ····" + user_id.slice(-4)),
        resolved: Boolean(String(nicknames[user_id] || "").trim()),
        source: String(nicknames[user_id] || "").trim() ? "nickname" : "unresolved",
      }));
    }
    const listedThread = Array.isArray(threadList) ? threadList.find(item =>
      String(item?.threadID || item?.threadId || item?.thread_id || "") === String(threadId)
    ) : null;
    const profileRows = [
      threadInfo?.userInfo, threadInfo?.participants, threadInfo?.participantList,
      threadInfo?.participant_list, listedThread?.userInfo, listedThread?.participants,
      listedThread?.participantList, listedThread?.participant_list,
    ];
    const profileNames = new Map();
    for (const source of profileRows) {
      const rows = Array.isArray(source) ? source : source && typeof source === "object"
        ? Object.entries(source).map(([key, value]) =>
            value && typeof value === "object" && !dashboardNormalizeMemberId(value)
              ? { id: key, ...value } : value)
        : [];
      for (const row of rows) {
        const id = dashboardNormalizeMemberId(row);
        const name = dashboardMemberDisplayName(row);
        if (id && name && !profileNames.has(id)) profileNames.set(id, name);
      }
    }
    for (const member of members) {
      const id = String(member?.user_id || "");
      if (!/^\d{6,32}$/.test(id)) continue;
      const profileName = profileNames.get(id);
      if (profileName && (!member.resolved || member.source === "nickname")) {
        member.name = profileName;
        member.resolved = true;
        member.source = "thread-list-userInfo";
      }
    }
    return { ...resolved, members };
  },
  // This is a user ID selected from a GC member list, never a group thread ID.
  // Override ws3-fca's length-based routing heuristic for PM delivery.
  send: (api, message, recipientId) => sendMessengerMessage(api, message, recipientId, { isGroup: false }),
});
pmCenter.registerRoutes(app, requireDashboardAccess);

const pmBattles = createPmBattles({
  db,
  getApi: () => activeMessengerApi && activeListenerGeneration > 0 ? activeMessengerApi : null,
  isKnownGroup: threadId => dashboardKnownGroups.has(String(threadId)),
  resolveMembers: (api, threadId) => resolveGroupMembers(api, threadId),
  // PM Battles targets a selected GC member, so force ws3-fca's single-user route.
  send: (api, message, recipientId) => sendMessengerMessage(api, message, recipientId, { isGroup: false }),
  getHybridReply: async ({ api, event, text, senderId, threadId }) => {
    const triggerReply = await getTriggerReply(text, senderId, threadId, api, event);
    if (triggerReply) return triggerReply;
    return getBanatConversationReply(text, senderId, threadId, api, event);
  },
  startTyping,
  stopTyping,
});
pmBattles.registerRoutes(app, requireDashboardAccess);

// Group profile uploads use a route-scoped JSON parser with a larger bounded limit.
registerGroupProfileRoutes(app, {
  auth: requireDashboardAccess,
  getApi: () =>
    activeMessengerApi && activeListenerGeneration > 0
      ? activeMessengerApi
      : null,
  isKnownGroup: threadId => dashboardKnownGroups.has(String(threadId)),
  db,
  audit: message => console.log(message),
});

// Spam protection shares the existing persistent !automod on/off setting.// It monitors all members independently of owner presence.
const autoWelcome = createAutoWelcome({
  db,
  getApi: () => activeMessengerApi && activeListenerGeneration > 0 ? activeMessengerApi : null,
  isKnownGroup: threadId => dashboardKnownGroups.has(String(threadId)),
  log: message => console.log(message),
});
autoWelcome.registerRoutes(app, requireDashboardAccess);

const sharedGcRegistry = createSharedGcRegistry();

const antiSpam = createAntiSpam({
  db,
  getApi: () =>
    activeMessengerApi && activeListenerGeneration > 0
      ? activeMessengerApi
      : null,
  isKnownGroup: threadId => dashboardKnownGroups.has(String(threadId)),
  log: message => console.log(message),
  onGroupJoin: (api, event) => autoWelcome.onGroupEvent(api, event),
});
antiSpam.registerRoutes(app, requireDashboardAccess);

// Dashboard Kick / Ban uses the same fail-closed Messenger role verification
// as command moderation. It shares the existing API key and local ban store.
registerModerationRoutes(app, {
  auth: requireDashboardAccess,
  getApi: () =>
    activeMessengerApi && activeListenerGeneration > 0
      ? activeMessengerApi
      : null,
  isKnownGroup: threadId => dashboardKnownGroups.has(String(threadId)),
  removeFromGroup,
  createBan,
  logModeration,
  db,
  audit: message => console.log(message),
});

registerTemporaryAdminRoutes(app, {
  auth: requireDashboardAccess,
  db,
  getApi: () =>
    activeMessengerApi && activeListenerGeneration > 0
      ? activeMessengerApi
      : null,
  isKnownGroup: threadId => dashboardKnownGroups.has(String(threadId)),
  // Grant/review endpoints require an authenticated principal attached by
  // trusted middleware plus membership in the bot's configured admin registry.
  isAuthorizedOperator: userId => isAdmin(userId),
  audit: message => console.log(message),
});

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


jaidenTargetRecords.registerRoutes(app, requireDashboardAccess);

const jaidenTargetPersonalitySettings = createJaidenTargetPersonalitySettings({
  db,
  personality: jaidenAutoTargetPersonality,
});
jaidenTargetPersonalitySettings.registerRoutes(app, requireDashboardAccess);

app.get(
  "/api/dashboard/jaiden-target-countdown/settings",
  requireDashboardAccess,
  async (_req, res) => {
    try {
      const settings = await db.getJaidenTargetCountdownSettings();
      return res.json({ ok: true, settings });
    } catch (error) {
      console.error("[JAIDEN COUNTDOWN] Could not load dashboard settings:", error?.message || error);
      return res.status(500).json({ ok: false, error: "Could not load countdown settings." });
    }
  }
);

app.put(
  "/api/dashboard/jaiden-target-countdown/settings",
  requireDashboardAccess,
  async (req, res) => {
    const template = typeof req.body?.template === "string" ? req.body.template : "";
    const reason = typeof req.body?.reason === "string" ? req.body.reason : "";
    const customNickname = typeof req.body?.customNickname === "string" ? req.body.customNickname.trim() : undefined;
    const targetName = typeof req.body?.targetName === "string" ? req.body.targetName.trim() : undefined;
    const personalityEnabled = typeof req.body?.personalityEnabled === "boolean" ? req.body.personalityEnabled : undefined;
    const newBanatEnabled = typeof req.body?.newBanatEnabled === "boolean" ? req.body.newBanatEnabled : undefined;
    const openingTauntEnabled = typeof req.body?.openingTauntEnabled === "boolean" ? req.body.openingTauntEnabled : undefined;
    const interleavedTauntsEnabled = typeof req.body?.interleavedTauntsEnabled === "boolean" ? req.body.interleavedTauntsEnabled : undefined;
    if (!template.trim() || template.length > 4000) {
      return res.status(400).json({ ok: false, error: "Message template must be between 1 and 4000 characters." });
    }
    if (reason.length > 2000) {
      return res.status(400).json({ ok: false, error: "Reason must be 2000 characters or fewer." });
    }
    if (customNickname !== undefined && customNickname.length > 80) {
      return res.status(400).json({ ok: false, error: "Custom nickname must be 80 characters or fewer." });
    }
    if (targetName !== undefined && targetName.length > 80) {
      return res.status(400).json({ ok: false, error: "Auto Target name must be 80 characters or fewer." });
    }
    try {
      const settings = await db.setJaidenTargetCountdownSettings({ template, reason, ...(customNickname === undefined ? {} : { customNickname }), ...(targetName === undefined ? {} : { targetName }), ...(personalityEnabled === undefined ? {} : { personalityEnabled }), ...(newBanatEnabled === undefined ? {} : { newBanatEnabled }), ...(openingTauntEnabled === undefined ? {} : { openingTauntEnabled }), ...(interleavedTauntsEnabled === undefined ? {} : { interleavedTauntsEnabled }) });
      return res.json({ ok: true, settings });
    } catch (error) {
      console.error("[JAIDEN COUNTDOWN] Could not save dashboard settings:", error?.message || error);
      return res.status(500).json({ ok: false, error: error?.message || "Could not save countdown settings." });
    }
  }
);

app.get(
  "/api/dashboard/jaiden-target-countdown/live",
  requireDashboardAccess,
  (req, res) => {
    const threadId = String(req.query?.thread_id || "").trim();
    if (!threadId) return res.status(400).json({ ok: false, error: "Choose a group first." });
    return res.json({ ok: true, status: jaidenTargetCountdown.getStatus(threadId) });
  }
);

app.post(
  "/api/dashboard/jaiden-target-countdown/force-start",
  requireDashboardAccess,
  async (req, res) => {
    const threadId = String(req.body?.thread_id || "").trim();
    if (!threadId) return res.status(400).json({ ok: false, error: "Choose a group first." });
    if (!activeMessengerApi) return res.status(503).json({ ok: false, error: "The Messenger bot is not connected." });
    const result = await jaidenTargetCountdown.forceStart(threadId, activeMessengerApi);
    if (!result.started) {
      const messages = {
        NO_TARGET: "Set a Jaiden target for this group before starting the countdown.",
        BOT_OFFLINE: "The Messenger bot is not connected.",
        ALREADY_RUNNING: "A countdown is already running in this group.",
        TARGET_LOOKUP_FAILED: "Could not verify the selected target. Try again.",
      };
      return res.status(result.reason === "ALREADY_RUNNING" ? 409 : 400).json({
        ok: false, error: messages[result.reason] || "Could not start the forced countdown.", status: result.status || null,
      });
    }
    pushDashboardEvent("jaiden-countdown", "Admin started a forced Jaiden countdown in group " + threadId + ".");
    return res.json({ ok: true, status: result.status });
  }
);

app.post(
  "/api/dashboard/jaiden-target-countdown/force-stop",
  requireDashboardAccess,
  async (req, res) => {
    const threadId = String(req.body?.thread_id || "").trim();
    if (!threadId) return res.status(400).json({ ok: false, error: "Choose a group first." });
    const result = await jaidenTargetCountdown.forceReceipt(threadId);
    if (!result.sent) return res.status(409).json({ ok: false, error: "No active countdown is available to stop and report." });
    pushDashboardEvent("jaiden-countdown", "Admin stopped a Jaiden countdown and posted its partial receipt in group " + threadId + ".");
    return res.json({ ok: true, receipt: result.receipt, message: "Countdown stopped and partial resibo posted." });
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
          uptime_seconds: getRenderRuntimeSeconds(),
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
          uptime_seconds: getRenderRuntimeSeconds(),
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
          uptime_seconds: getRenderRuntimeSeconds(),
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
    activeThreads.clear();
    dashboardKnownGroups.clear();
    archivedDashboardGroups.clear();
    archivedDashboardGroupsLoadedAt = 0;
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

// ZENITH — private-by-unlisted anniversary experience for Baby.
app.use(
  "/zenith",
  express.static(
    path.join(__dirname, "public", "zenith"),
    {
      extensions: ["html"],
      index: "index.html",
      maxAge: 0,
      setHeaders: (res) => {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
        res.setHeader("Referrer-Policy", "no-referrer");
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
  const watchdog = getWatchdogStatus();
  const databaseHealthy = await checkDatabaseHealth();
  const healthOk = watchdog.ok && databaseHealthy !== false;
  // Keep public readiness information minimal; detailed diagnostics require dashboard authentication.
  res.status(healthOk ? 200 : 503).json({
    ok: healthOk,
    uptime: Math.floor(process.uptime()),
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

  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of dashboardEventClients) {
    try {
      client.write(payload);
    } catch {
      dashboardEventClients.delete(client);
    }
  }

  return event;
}


function buildTrafficDeliveryAnalytics(hours = 24) {
  const now = Date.now();
  const retentionCutoff = now - TRAFFIC_DELIVERY_RETENTION_MS;
  while (trafficDeliveryHistory.length && Date.parse(trafficDeliveryHistory[0].at) < retentionCutoff) {
    trafficDeliveryHistory.shift();
  }
  const cutoff = now - hours * 60 * 60 * 1000;
  const recent = trafficDeliveryHistory.filter((event) => Date.parse(event.at) >= cutoff);
  const sent = recent.filter((event) => event.outcome === "sent");
  const failed = recent.filter((event) => event.outcome === "failed");
  const total = sent.length + failed.length;
  const avgLatencyMs = total
    ? Math.round(recent.reduce((sum, event) => sum + event.elapsed_ms, 0) / total)
    : 0;
  const failureCodes = {};
  for (const event of failed) {
    const code = event.code || "SEND_FAILED";
    failureCodes[code] = (failureCodes[code] || 0) + 1;
  }

  const currentHour = Math.floor(now / 3_600_000) * 3_600_000;
  const hourly = Array.from({ length: hours }, (_, index) => {
    const start = currentHour - (hours - index - 1) * 3_600_000;
    return {
      hour: new Date(start).toISOString(),
      sent: 0,
      failed: 0,
      avgLatencyMs: 0,
      _latencyTotal: 0,
      _latencyCount: 0,
    };
  });
  const bucketByHour = new Map(hourly.map((bucket) => [Date.parse(bucket.hour), bucket]));
  for (const event of recent) {
    const bucket = bucketByHour.get(Math.floor(Date.parse(event.at) / 3_600_000) * 3_600_000);
    if (!bucket) continue;
    if (event.outcome === "sent") bucket.sent++;
    else if (event.outcome === "failed") bucket.failed++;
    bucket._latencyTotal += event.elapsed_ms;
    bucket._latencyCount++;
  }
  for (const bucket of hourly) {
    bucket.avgLatencyMs = bucket._latencyCount
      ? Math.round(bucket._latencyTotal / bucket._latencyCount)
      : 0;
    delete bucket._latencyTotal;
    delete bucket._latencyCount;
  }

  const lastFailure = failed.length
    ? failed.reduce((latest, event) => Date.parse(event.at) > Date.parse(latest.at) ? event : latest)
    : null;
  return {
    generated_at: new Date(now).toISOString(),
    hours,
    retention_hours: 24,
    retention_limit: TRAFFIC_DELIVERY_HISTORY_LIMIT,
    sample_count: recent.length,
    sent: sent.length,
    failed: failed.length,
    success_rate: total ? Math.round((sent.length / total) * 1000) / 10 : null,
    avg_latency_ms: avgLatencyMs,
    lifetime: { sent: trafficTotalSent, failed: trafficTotalFailed },
    failure_codes: failureCodes,
    last_failure: lastFailure ? {
      at: lastFailure.at,
      code: lastFailure.code || "SEND_FAILED",
      elapsed_ms: lastFailure.elapsed_ms,
      attachment: lastFailure.attachment,
    } : null,
    hourly,
    note: "Delivery history is in process memory, limited to 24 hours and 5,000 outcomes; it resets when the process restarts.",
  };
}

app.get(
  "/api/dashboard/delivery-analytics",
  requireDashboardAccess,
  async (req, res) => {
    const hours = Math.min(
      24,
      Math.max(1, Number.parseInt(String(req.query.hours || "24"), 10) || 24)
    );
    try {
      const analytics = await trafficDeliveryStore.getAnalytics(hours, {
        sent: trafficTotalSent,
        failed: trafficTotalFailed,
      });
      return res.json({ ok: true, analytics });
    } catch (error) {
      console.warn("[DASHBOARD] Persistent delivery analytics unavailable:", error?.message || error);
      const analytics = buildTrafficDeliveryAnalytics(hours);
      analytics.available = false;
      analytics.source = "process-memory-fallback";
      analytics.note = "Persistent delivery history is unavailable right now. This fallback covers only the current process and may reset on restart.";
      return res.json({ ok: true, analytics, warning: "Persistent delivery history is temporarily unavailable." });
    }
  }
);

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
      try { res.write(`: heartbeat ${Date.now()}\n\n`); } catch {}
    };

    dashboardEventClients.add(res);
    res.write(`event: ready\ndata: ${JSON.stringify({
      ok: true,
      generated_at: new Date().toISOString(),
    })}\n\n`);

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


// ============================================================
// DASHBOARD OPERATIONS API
// ============================================================
// These endpoints reuse the existing dashboard-key middleware. They do not
// read, rewrite, replace, or clear FB_COOKIES or the durable Messenger session.
// ============================================================

function dashboardGetThreadInfo(api, threadID, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      callback(value);
    };
    const done = (...args) => {
      if (settled) return;
      // ws3-fca is normally error-first, but compatible wrappers sometimes
      // invoke callbacks with just the payload. Accept both forms.
      if (args.length > 1) {
        const [error, info] = args;
        if (error) finish(reject, error);
        else finish(resolve, info || {});
        return;
      }
      const [value] = args;
      if (value instanceof Error) finish(reject, value);
      else if (value != null) finish(resolve, value);
    };

    // Some ws3-fca versions can throw internally or never call back when the
    // thread-info response is missing. Do not let commands such as .removenn
    // hang forever; an empty result lets callers try getThreadList fallback.
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.warn("[THREAD-INFO] Lookup timed out for " + String(threadID) + "; trying available fallbacks.");
      resolve({});
    }, Math.max(1000, Number(timeoutMs) || 8000));
    timer.unref?.();

    try {
      const result = api.getThreadInfo(String(threadID), done);
      if (result && typeof result.then === "function") {
        result.then((info) => {
          if (info != null) done(null, info);
        }).catch(done);
      } else if (result && typeof result === "object" && !Array.isArray(result)) {
        // Only accept an immediate object when it looks like thread data;
        // request handles must not win the race against the real callback.
        if (result.participantIDs || result.userInfo || result.threadName || result.threadID) {
          done(null, result);
        }
      }
    } catch (error) {
      done(error);
    }
  });
}


function dashboardGetUserInfo(api, userIDs, timeoutMs = 4000, scalarLookup = false, usePayload = true) {
  return new Promise((resolve, reject) => {
    if (!api || typeof api.getUserInfo !== "function") return resolve({});
    let settled = false;
    let timeout = null;
    const expectedIDs = new Set((Array.isArray(userIDs) ? userIDs : [userIDs]).map(String));
    const looksLikeUserPayload = (users) => {
      if (!users || typeof users !== "object") return false;
      if (Array.isArray(users)) return users.some(row =>
        dashboardNormalizeMemberId(row) || dashboardMemberDisplayName(row)
      );
      const directName = dashboardMemberDisplayName(users);
      const directId = dashboardNormalizeMemberId(users);
      if (directName && (directId && expectedIDs.has(directId) || expectedIDs.size === 1)) return true;
      return Object.keys(users).some(key => expectedIDs.has(key)) ||
        Object.values(users).some(value => value && typeof value === "object" &&
          (value.name || value.firstName || value.first_name || value.fullName || value.full_name ||
           value.displayName || value.display_name || value.userID || value.userId || value.uid || value.id));
    };
    const done = (...args) => {
      if (settled) return;
      // Error-first callback is the ws3-fca contract; also tolerate
      // single-argument data callbacks used by API-compatible wrappers.
      let error = null;
      let users;
      if (args.length > 1) {
        [error, users] = args;
      } else {
        [users] = args;
        if (users instanceof Error) {
          error = users;
          users = null;
        }
      }
      if (error) {
        settled = true;
        if (timeout) clearTimeout(timeout);
        reject(error);
        return;
      }
      if (users !== undefined && users !== null && looksLikeUserPayload(users)) {
        settled = true;
        if (timeout) clearTimeout(timeout);
        resolve(users);
      }
    };
    // A callback-style request may return a request handle immediately.
    // Ignore that handle and wait for actual user records.
    timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({});
    }, timeoutMs);
    try {
      // ws3-fca's user-info lookup is most reliable when IDs are an array,
      // including the single-member retry path.
      const lookupIDs = scalarLookup
        ? String(Array.isArray(userIDs) ? userIDs[0] || "" : userIDs || "")
        : (Array.isArray(userIDs) ? userIDs : [userIDs]);
      const result = usePayload
        ? api.getUserInfo(lookupIDs, done)
        : api.getUserInfo(lookupIDs, false, done);
      if (result && typeof result.then === "function") {
        result.then(users => done(null, users)).catch(done);
      } else if (looksLikeUserPayload(result)) {
        done(null, result);
      }
    } catch (error) {
      done(error);
    }
  });
}

function dashboardGetUserInfoRow(userRows, userID) {
  if (!userRows || typeof userRows !== "object") return null;
  if (Array.isArray(userRows)) {
    return userRows.find(value => dashboardNormalizeMemberId(value) === userID) || null;
  }
  const direct = userRows[userID];
  if (direct && typeof direct === "object") return direct;
  // Some wrappers return a list-like object rather than an ID-keyed map.
  for (const [key, value] of Object.entries(userRows)) {
    if (key === userID && value && typeof value === "object") return value;
    if (dashboardNormalizeMemberId(value) === userID) return value;
    if (value && typeof value === "object" && dashboardNormalizeMemberId({ id: key, ...value }) === userID) return value;
  }
  return null;
}

function dashboardMemberDisplayName(row) {
  if (!row || typeof row !== "object") return "";
  const first = String(row.firstName || row.first_name || "").trim();
  const last = String(row.lastName || row.last_name || "").trim();
  const candidates = [
    row.name, row.displayName, row.display_name, row.fullName, row.full_name,
    row.profileName, row.profile_name, [first, last].filter(Boolean).join(" "),
  ];
  for (const candidate of candidates) {
    const name = String(candidate || "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (
      !name ||
      /^\d{6,32}$/.test(name) ||
      /^(facebook(?:\s+user)?|messenger(?:\s+user)?|unknown|unnamed|user)(?:\s+\d+)?$/i.test(name)
    ) continue;
    return name;
  }
  return "";
}

function dashboardNormalizeMemberId(value) {
  const candidate = value && typeof value === "object"
    ? (value.userID ?? value.userId ?? value.id ?? value.uid ?? value.participantID ?? value.participantId)
    : value;
  const id = String(candidate ?? "").trim();
  return /^\d{6,32}$/.test(id) ? id : "";
}

// Use the same tolerant participant-ID resolution for every dashboard action.
// ws3-fca variants do not always populate participantIDs, even when member
// records are available under userInfo/participants or the thread list.
function dashboardParticipantIdsFrom(source) {
  const ids = new Set();
  const values = Array.isArray(source)
    ? source
    : source && typeof source === "object"
      ? Object.entries(source).map(([id, row]) =>
          row && typeof row === "object" ? { id, ...row } : id
        )
      : [];
  for (const value of values) {
    const id = dashboardNormalizeMemberId(value);
    if (id) ids.add(id);
  }
  return ids;
}

async function dashboardGetParticipantIds(api, threadID, knownInfo = null) {
  const info = knownInfo || await dashboardGetThreadInfo(api, threadID);
  const ids = new Set();
  for (const source of [
    info?.participantIDs,
    info?.userInfo,
    info?.participants,
    info?.participantList,
    info?.participant_list,
  ]) {
    for (const id of dashboardParticipantIdsFrom(source)) ids.add(id);
  }

  if (!ids.size) {
    const threads = await dashboardGetThreadList(api);
    const thread = threads.find(item =>
      String(item.threadID || item.threadId || item.thread_id || "") === String(threadID)
    );
    if (thread) {
      for (const source of [
        thread.participantIDs,
        thread.userInfo,
        thread.participants,
        thread.participantList,
        thread.participant_list,
      ]) {
        for (const id of dashboardParticipantIdsFrom(source)) ids.add(id);
      }
    }
  }
  return ids;
}


app.get(
  "/api/dashboard/groups/:thread_id/members",
  requireDashboardAccess,
  async (req, res) => {
    const threadID = String(req.params.thread_id || "").trim();
    if (!threadID || !dashboardKnownGroups.has(threadID)) return res.status(400).json({ ok: false, error: "Choose a group in the refreshed group list." });
    if (!activeMessengerApi || activeListenerGeneration <= 0) return res.status(409).json({ ok: false, error: "Messenger is not connected." });
    try {
      // Fetch thread metadata once and share the same payload with the resolver
      // and the compatibility name-merging pass. The previous order called
      // getThreadInfo/getThreadList in both places, multiplying API traffic.
      const [profileThreadInfo, profileThreadList] = await Promise.all([
        dashboardGetThreadInfo(activeMessengerApi, threadID).catch(() => ({})),
        dashboardGetThreadList(activeMessengerApi).catch(() => []),
      ]);
      let { members, diagnostics } = await resolveGroupMembers(activeMessengerApi, threadID, {
        threadInfo: profileThreadInfo,
        threadList: profileThreadList,
        // This route already performs its own batched profile-page fallback below.
        profilePageFallback: false,
      });

      // Some FCA builds expose real member names in getThreadList().userInfo
      // even when getThreadInfo() and getUserInfo() return generic placeholders.
      // Merge those already-fetched official profile records before further lookups.
      const profileListedThread = profileThreadList.find(item =>
        String(item?.threadID || item?.threadId || item?.thread_id || "") === threadID
      );
      const profileRows = [
        profileThreadInfo?.userInfo,
        profileThreadInfo?.participants,
        profileThreadInfo?.participantList,
        profileThreadInfo?.participant_list,
        profileListedThread?.userInfo,
        profileListedThread?.participants,
        profileListedThread?.participantList,
        profileListedThread?.participant_list,
      ];
      const profileNames = new Map();
      for (const source of profileRows) {
        const rows = Array.isArray(source)
          ? source
          : source && typeof source === "object"
            ? Object.entries(source).map(([key, value]) =>
                value && typeof value === "object" && !dashboardNormalizeMemberId(value)
                  ? { id: key, ...value }
                  : value
              )
            : [];
        for (const row of rows) {
          const id = dashboardNormalizeMemberId(row);
          const name = dashboardMemberDisplayName(row);
          if (id && name && !profileNames.has(id)) profileNames.set(id, name);
        }
      }
      const isPlaceholderName = value =>
        /^(?:facebook(?:\s+user)?|messenger(?:\s+user)?|unknown|unnamed|user)(?:\s+\d+)?$/i
          .test(String(value || "").trim());
      for (const member of members) {
        if (!member || !/^\d{6,32}$/.test(String(member.user_id || ""))) continue;
        if (!member.resolved || member.source === "nickname" || isPlaceholderName(member.name)) {
          const profileName = profileNames.get(String(member.user_id));
          if (profileName) {
            member.name = profileName;
            member.resolved = true;
            member.source = "thread-list-userInfo";
          }
        }
      }

      // Fallback to the bot's established participant parser when this FCA
      // variant exposes participants through the thread-list response shape.
      if (!members.length) {
        const fallbackIDs = await dashboardGetParticipantIds(activeMessengerApi, threadID);
        const fallbackInfo = await dashboardGetThreadInfo(activeMessengerApi, threadID).catch(() => ({}));
        const fallbackNicknames = fallbackInfo?.nicknames && typeof fallbackInfo.nicknames === "object" ? fallbackInfo.nicknames : {};
        const fallbackMembers = [...fallbackIDs].map(user_id => ({
          user_id,
          name: String(fallbackNicknames[user_id] || "").trim() || ("Unnamed ····" + user_id.slice(-4)),
          resolved: Boolean(String(fallbackNicknames[user_id] || "").trim()),
          source: String(fallbackNicknames[user_id] || "").trim() ? "nickname" : "unresolved",
        }));
        // Failed profile lookups must not make the whole picker disappear.
        for (let offset = 0; offset < fallbackMembers.length; offset += 25) {
          const batch = fallbackMembers.slice(offset, offset + 25);
          try {
            const rows = await dashboardGetUserInfo(activeMessengerApi, batch.map(member => member.user_id), 3500);
            for (const member of batch) {
              const row = dashboardGetUserInfoRow(rows, member.user_id);
              const name = dashboardMemberDisplayName(row);
              if (name) {
                member.name = name;
                member.resolved = true;
                member.source = "userInfo";
              }
            }
          } catch (lookupError) {
            console.warn("[MEMBERS] Fallback name lookup failed:", String(lookupError?.message || lookupError).slice(0, 120));
          }
        }
        members = fallbackMembers;
        diagnostics = {
          ...diagnostics,
          threadInfo: true,
          participantIds: fallbackIDs.size,
          named: members.filter(member => member.resolved).length,
          unresolved: members.filter(member => !member.resolved).length,
          fallback: "dashboardGetParticipantIds",
        };
      }
      // Keep the pre-shared-resolver Single SetNN name lookup as a compatibility
      // pass. The shared resolver can identify participants correctly while a
      // particular ws3-fca response shape still leaves their display names blank.
      // Use the established dashboard helper and ARRAY form for one-ID retries.
      const retryMembers = members.filter(member =>
        /^\d{6,32}$/.test(String(member.user_id || "")) &&
        (!member.resolved || member.source === "nickname")
      );
      for (let offset = 0; offset < retryMembers.length; offset += 8) {
        const batch = retryMembers.slice(offset, offset + 8);
        const resolvedRows = await Promise.all(batch.map(async member => {
          const userID = String(member.user_id);
          try {
            // resolveGroupMembers already tried the normal /chat/user_info
            // path. Avoid repeating that request for every unresolved member;
            // use only the distinct profile-page fallback here.
            const profileRows = await dashboardGetUserInfo(
              activeMessengerApi,
              [userID],
              4500,
              false,
              false
            );
            const row = dashboardGetUserInfoRow(profileRows, userID) ||
              (Array.isArray(profileRows) ? profileRows[0] : null);
            const name = dashboardMemberDisplayName(row);
            return { member, name };
          } catch (lookupError) {
            console.warn("[MEMBERS] Profile-page name retry failed:", String(lookupError?.message || lookupError).slice(0, 120));
            return { member, name: "" };
          }
        }));
        for (const result of resolvedRows) {
          if (!result.name) continue;
          result.member.name = result.name;
          result.member.resolved = true;
          result.member.source = "userInfo-single";
        }
      }
      members.sort((a, b) => Number(Boolean(b.resolved)) - Number(Boolean(a.resolved)) || String(a.name || "").localeCompare(String(b.name || "")));
      diagnostics.named = members.filter(member => member.resolved).length;
      diagnostics.unresolved = members.filter(member => !member.resolved).length;

      // A usable getThreadList fallback is sufficient even when getThreadInfo
      // itself returns no data. Only fail when neither source yields members.
      if (!members.length) {
        console.warn("[MEMBERS] No usable members from thread info/list:", JSON.stringify({ threadID, diagnostics }));
        return res.status(503).json({ ok: false, error: "Messenger returned no participant IDs for this group. Check bot service logs.", members: [] });
      }
      if (diagnostics.unresolved) console.warn("[MEMBERS] Some names remain unresolved:", JSON.stringify({ threadID, participantIds: diagnostics.participantIds, named: diagnostics.named, unresolved: diagnostics.unresolved, sources: diagnostics.sources, batchCalls: diagnostics.batchCalls, singleCalls: diagnostics.singleCalls }));
      return res.json({ ok: true, thread_id: threadID, members, count: members.length });
    } catch (error) {
      console.error("[MEMBERS] Failed to resolve group members:", String(error?.message || error).slice(0, 200));
      return res.status(503).json({ ok: false, error: "Could not load group members from Messenger." });
    }
  }
);

app.get(
  "/api/dashboard/groups/:thread_id/members/debug",
  requireDashboardAccess,
  async (req, res) => {
    const threadID = String(req.params.thread_id || "").trim();
    if (!threadID || !dashboardKnownGroups.has(threadID)) return res.status(400).json({ ok: false, error: "Choose a group in the refreshed group list." });
    if (!activeMessengerApi || activeListenerGeneration <= 0) return res.status(409).json({ ok: false, error: "Messenger is not connected." });
    try {
      const { members = [], diagnostics = {} } = await resolveGroupMembers(activeMessengerApi, threadID);
      const isRealName = value => {
        const name = String(value || "").trim();
        return Boolean(name) &&
          !/^\d{6,32}$/.test(name) &&
          !/^(?:facebook(?:\s+user)?|messenger(?:\s+user)?|unknown|unnamed|user)(?:\s+\d+)?$/i.test(name);
      };
      const [threadInfoResult, threadListResult] = await Promise.all([
        dashboardGetThreadInfo(activeMessengerApi, threadID).then(value => ({ ok: true, value })).catch(() => ({ ok: false, value: {} })),
        dashboardGetThreadList(activeMessengerApi).then(value => ({ ok: true, value })).catch(() => ({ ok: false, value: [] })),
      ]);
      const threadInfo = threadInfoResult.value || {};
      const threadList = Array.isArray(threadListResult.value) ? threadListResult.value : [];
      const listedThread = threadList.find(item =>
        String(item?.threadID || item?.threadId || item?.thread_id || "") === threadID
      ) || {};
      const countProfileRows = source => {
        const rows = Array.isArray(source)
          ? source
          : source && typeof source === "object"
            ? Object.entries(source).map(([key, value]) =>
                value && typeof value === "object" && !dashboardNormalizeMemberId(value)
                  ? { id: key, ...value }
                  : value
              )
            : [];
        return {
          rows: rows.length,
          ids: rows.filter(row => Boolean(dashboardNormalizeMemberId(row))).length,
          named: rows.filter(row => isRealName(dashboardMemberDisplayName(row))).length,
        };
      };
      const profileSources = {
        threadInfoUserInfo: countProfileRows(threadInfo?.userInfo),
        threadInfoParticipants: countProfileRows(threadInfo?.participants || threadInfo?.participantList || threadInfo?.participant_list),
        threadListUserInfo: countProfileRows(listedThread?.userInfo),
        threadListParticipants: countProfileRows(listedThread?.participants || listedThread?.participantList || listedThread?.participant_list),
      };
      const unresolved = members.filter(member =>
        /^\d{6,32}$/.test(String(member?.user_id || "")) &&
        (!member.resolved || !isRealName(member.name))
      );
      const probeMembers = unresolved.slice(0, 3);
      const probeIDs = probeMembers.map(member => String(member.user_id));
      const probeLookup = async usePayload => {
        if (!probeIDs.length) return { attempted: 0, returnedRecords: 0, realNames: 0, errors: 0 };
        let rows = {};
        let errors = 0;
        try {
          rows = await dashboardGetUserInfo(activeMessengerApi, probeIDs, usePayload ? 3500 : 4500, false, usePayload);
        } catch (_) {
          errors += 1;
        }
        const records = probeIDs.map(userID => dashboardGetUserInfoRow(rows, userID)).filter(Boolean);
        return {
          attempted: probeIDs.length,
          returnedRecords: records.length,
          realNames: records.filter(row => isRealName(dashboardMemberDisplayName(row))).length,
          errors,
        };
      };
      const [normalLookup, profilePageLookup] = await Promise.all([
        probeLookup(true),
        probeLookup(false),
      ]);
      let packageVersion = null;
      try { packageVersion = require("ws3-fca/package.json").version || null; } catch (_) {}
      res.set("Cache-Control", "no-store");
      return res.json({
        ok: true,
        diagnostics: {
          ...diagnostics,
          pipeline: {
            returnedMembers: members.length,
            resolvedMembers: members.filter(member => member.resolved && isRealName(member.name)).length,
            unresolvedMembers: unresolved.length,
            threadInfoCallSucceeded: threadInfoResult.ok,
            threadListCallSucceeded: threadListResult.ok,
            profileSources,
            lookupProbe: { sampleSize: probeIDs.length, normalLookup, profilePageLookup },
            runtime: {
              node: process.version,
              ws3FcaVersion: packageVersion,
              getUserInfoFunctionArity: typeof activeMessengerApi.getUserInfo === "function" ? activeMessengerApi.getUserInfo.length : null,
            },
          },
        },
      });
    } catch (error) {
      console.warn("[MEMBERS] Diagnostic probe failed:", String(error?.message || error).slice(0, 160));
      return res.status(503).json({ ok: false, error: "Member diagnostics failed." });
    }
  }
);
app.put(
  "/api/dashboard/groups/:thread_id/target",
  requireDashboardAccess,
  async (req, res) => {
    const threadID = String(req.params.thread_id || "").trim();
    const targetID = String(req.body?.target_user_id || "").trim();
    if (!threadID || !dashboardKnownGroups.has(threadID)) {
      return res.status(400).json({ ok: false, error: "Choose a group in the refreshed group list." });
    }
    if (!targetID) {
      return res.status(400).json({ ok: false, error: "Choose a member to target." });
    }
    if (!activeMessengerApi || activeListenerGeneration <= 0) {
      return res.status(409).json({ ok: false, error: "Messenger is not connected." });
    }
    try {
      const info = await dashboardGetThreadInfo(activeMessengerApi, threadID);
      const ids = await dashboardGetParticipantIds(activeMessengerApi, threadID, info);
      const botID = String(activeMessengerApi.getCurrentUserID?.() || "");
      if (!ids.has(targetID) || targetID === botID) {
        return res.status(400).json({ ok: false, error: "Target must be a member of this group, not the bot." });
      }
      const requestedBangEnabled = typeof req.body?.bang_enabled === "boolean" ? req.body.bang_enabled : null;
      const jaidenSettings = {};
      if (req.body?.jaiden_interval_seconds !== undefined) {
        const interval = Number(req.body.jaiden_interval_seconds);
        if (!Number.isInteger(interval) || interval < 3 || interval > 120) {
          return res.status(400).json({ ok: false, error: "Jaiden interval must be a whole number from 3 to 120 seconds." });
        }
        jaidenSettings.interval_seconds = interval;
      }
      if (req.body?.jaiden_cooldown_mode !== undefined) {
        if (!["extend", "queue", "ignore"].includes(req.body.jaiden_cooldown_mode)) {
          return res.status(400).json({ ok: false, error: "Choose a valid Jaiden cooldown behavior." });
        }
        jaidenSettings.cooldown_mode = req.body.jaiden_cooldown_mode;
      }
      if (req.body?.jaiden_reply_mode !== undefined) {
        if (!["always", "random"].includes(req.body.jaiden_reply_mode)) {
          return res.status(400).json({ ok: false, error: "Choose a valid Jaiden reply mode." });
        }
        jaidenSettings.reply_mode = req.body.jaiden_reply_mode;
      }
      if (req.body?.jaiden_typing_enabled !== undefined) {
        if (typeof req.body.jaiden_typing_enabled !== "boolean") {
          return res.status(400).json({ ok: false, error: "Jaiden typing indicator setting must be true or false." });
        }
        jaidenSettings.typing_enabled = req.body.jaiden_typing_enabled;
      }
      const infoRows = Array.isArray(info?.userInfo)
        ? info.userInfo
        : Object.entries(info?.userInfo || info?.participants || {}).map(([id, value]) => ({
            id,
            ...(value && typeof value === "object" ? value : {}),
          }));
      const targetMember = infoRows.find(member =>
        String(member?.id || member?.userID || member?.userId || member?.uid || "") === targetID
      );
      let targetName = String(
        req.body?.target_name ||
        info?.nicknames?.[targetID] ||
        dashboardMemberDisplayName(targetMember) ||
        ""
      ).replace(/\s+/g, " ").trim().slice(0, 120);
      if (!targetName) {
        try {
          const userRows = await dashboardGetUserInfo(activeMessengerApi, targetID, 3500);
          const userRow = dashboardGetUserInfoRow(userRows, targetID) ||
            (userRows && typeof userRows === "object" && !Array.isArray(userRows) &&
              dashboardMemberDisplayName(userRows) ? userRows : null);
          targetName = dashboardMemberDisplayName(userRow);
        } catch (error) {
          console.warn("[DASHBOARD] Target display-name lookup failed:", error?.message || error);
        }
      }
      const saved = await db.setBanatThreadTarget(
        threadID, targetID, "dashboard-admin", requestedBangEnabled, targetName, jaidenSettings
      );
      clearJaidenCooldownState(threadID);
      setBanatDirectedTarget(threadID, targetID, "dashboard-admin", { persistent: true });
      clearBanatConversationTarget(threadID);
      clearBanatBurstState(threadID);
      pushDashboardEvent("banat-target", "Dashboard target updated for group " + threadID + ".");
      return res.json({
        ok: true, thread_id: threadID, target_user_id: saved.target_user_id,
        target_name: saved.target_name || null, bang_enabled: saved.bang_enabled === true,
        jaiden_interval_seconds: Number(saved.jaiden_interval_seconds) || 3,
        jaiden_cooldown_mode: saved.jaiden_cooldown_mode || "extend",
        jaiden_reply_mode: saved.jaiden_reply_mode || "always",
        jaiden_typing_enabled: saved.jaiden_typing_enabled !== false,
        target_set_at: new Date(Number(saved.updated_at)).toISOString()
      });
    } catch (error) {
      console.error("[DASHBOARD] Could not save Banat target:", error);
      return res.status(503).json({ ok: false, error: "Could not save this group's Banat target." });
    }
  }
);

app.delete(
  "/api/dashboard/groups/:thread_id/target",
  requireDashboardAccess,
  async (req, res) => {
    const threadID = String(req.params.thread_id || "").trim();
    if (!threadID || !dashboardKnownGroups.has(threadID)) {
      return res.status(400).json({ ok: false, error: "Choose a group in the refreshed group list." });
    }
    try {
      await db.clearBanatThreadTarget(threadID);
      clearJaidenCooldownState(threadID);
      clearBanatDirectedTarget(threadID);
      clearBanatConversationTarget(threadID);
      clearBanatBurstState(threadID);
      pushDashboardEvent("banat-target", "Dashboard target cleared for group " + threadID + ".");
      return res.json({ ok: true, thread_id: threadID, target_user_id: null });
    } catch (error) {
      console.error("[DASHBOARD] Could not clear Banat target:", error);
      return res.status(503).json({ ok: false, error: "Could not clear this group's Banat target." });
    }
  }
);

let dashboardArchivedGroupsSchemaPromise = null;

async function ensureDashboardArchivedGroupsTable() {
  if (!dashboardArchivedGroupsSchemaPromise) {
    dashboardArchivedGroupsSchemaPromise = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS eclipse_dashboard_archived_groups (
          thread_id TEXT PRIMARY KEY,
          group_name TEXT NOT NULL DEFAULT 'Archived group',
          participant_count INTEGER NOT NULL DEFAULT 0,
          archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          left_at TIMESTAMPTZ
        )
      `);
      await db.query("ALTER TABLE eclipse_dashboard_archived_groups ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ");
      await db.query("ALTER TABLE eclipse_dashboard_archived_groups ADD COLUMN IF NOT EXISTS messenger_user_id TEXT NOT NULL DEFAULT ''");
    })().catch(error => {
      dashboardArchivedGroupsSchemaPromise = null;
      throw error;
    });
  }
  return dashboardArchivedGroupsSchemaPromise;
}

function dashboardFetchThreadList(api, timeoutMs = 8000) {
  return getSharedThreadList(api, { timeoutMs });
}

let dashboardThreadLists = new WeakMap();
let dashboardSavedGroupDirectoryCleared = false;

function dashboardGetThreadList(api, timeoutMs = 8000) {
  if (!api || (typeof api !== "object" && typeof api !== "function")) {
    return Promise.reject(new Error("Messenger API is unavailable."));
  }
  let state = dashboardThreadLists.get(api);
  if (!state) {
    state = { value: null, expiresAt: 0, failedUntil: 0, promise: null };
    dashboardThreadLists.set(api, state);
  }
  const now = Date.now();
  if (Array.isArray(state.value) && now < state.expiresAt) return Promise.resolve(state.value);
  if (state.promise) return state.promise;
  if (now < state.failedUntil) return Promise.resolve(state.value || []);

  state.promise = dashboardFetchThreadList(api, timeoutMs)
    .then(threads => {
      if (Array.isArray(threads) && threads.length) {
        state.value = threads;
        state.expiresAt = Date.now() + 60_000;
        state.failedUntil = 0;
        return threads;
      }
      state.failedUntil = Date.now() + 15_000;
      // Preserve the last good inbox list instead of replacing it with an
      // empty response during a temporary Messenger outage or rate limit.
      return state.value || [];
    })
    .catch(error => {
      state.failedUntil = Date.now() + 30_000;
      if (Array.isArray(state.value)) {
        console.warn("[THREAD-LIST] Messenger lookup failed; serving cached thread list during cooldown.");
        return state.value;
      }
      throw error;
    })
    .finally(() => { state.promise = null; });
  return state.promise;
}

app.post(
  "/api/dashboard/groups/cache/clear",
  requireDashboardAccess,
  async (req, res) => {
    // Clearing the live group directory can disrupt other dashboard users, so
    // reserve it for the owner. Legacy shared-key sessions are owner-only.
    if (req.dashboardAccount && req.dashboardAccount.role !== "owner") {
      return res.status(403).json({ ok: false, error: "Owner access is required to clear the group cache." });
    }
    const api = activeMessengerApi;
    try {
      if (api) clearSharedThreadListCache(api);
      dashboardThreadLists = new WeakMap();
      // Suppress only the synthetic offline "Saved group" placeholders. These
      // rows are derived from persistent settings; never delete those settings.
      dashboardSavedGroupDirectoryCleared = true;
      // activeThreads is also used by runtime broadcast and activity tracking;
      // do not clear it as part of the dashboard's display-cache reset.
      dashboardKnownGroups.clear();
      console.info("[DASHBOARD] Owner cleared the live Messenger group cache; the next group refresh will fetch fresh data.");
      return res.json({
        ok: true,
        cleared: true,
        messenger_connected: Boolean(api && activeListenerGeneration > 0),
        message: api && activeListenerGeneration > 0
          ? "Temporary group cache cleared. Refresh to load fresh Messenger groups."
          : "Saved offline group placeholders cleared. Connect Messenger to load current group chats.",
      });
    } catch (error) {
      console.error("[DASHBOARD] Could not clear live group cache:", error?.message || error);
      return res.status(503).json({ ok: false, error: "Could not clear the temporary group cache." });
    }
  }
);


app.post(
  "/api/groups/clean-cache",
  requireDashboardAccess,
  async (req, res) => {
    if (req.dashboardAccount && req.dashboardAccount.role !== "owner") {
      return res.status(403).json({ ok: false, error: "Owner access is required to force-clean group settings." });
    }

    const api = activeMessengerApi && activeListenerGeneration > 0 ? activeMessengerApi : null;
    if (!api) {
      return res.status(409).json({
        ok: false,
        error: "Messenger must be connected before Force clean can safely compare saved groups with the live inbox. No persistent settings were changed.",
      });
    }

    try {
      // Invalidate both layers before reading so Force clean compares against a
      // fresh Messenger inbox snapshot, not an old cached list.
      clearSharedThreadListCache(api);
      dashboardThreadLists = new WeakMap();
      const currentThreads = await dashboardGetThreadList(api);
      if (!Array.isArray(currentThreads) || currentThreads.length === 0) {
        return res.status(503).json({
          ok: false,
          error: "Messenger did not return a usable thread list. Persistent settings were left unchanged.",
        });
      }

      const activeIds = new Set();
      for (const thread of currentThreads) {
        const id = String(thread?.threadID || thread?.threadId || thread?.thread_id || "").trim();
        if (id.length < 6 || id.length > 32 || ![...id].every(char => char >= "0" && char <= "9")) continue;
        const participants = Array.isArray(thread?.participantIDs)
          ? thread.participantIDs
          : Array.isArray(thread?.participants)
            ? thread.participants
            : [];
        const isGroup = Number(thread?.threadType) === 2 ||
          String(thread?.threadType || "").toUpperCase() === "GROUP" ||
          thread?.isGroup === true ||
          participants.length >= 3;
        if (isGroup) activeIds.add(id);
      }
      if (activeIds.size === 0) {
        return res.status(503).json({
          ok: false,
          error: "Messenger returned threads but no groups could be verified. Persistent settings were left unchanged.",
        });
      }

      await ensureDashboardArchivedGroupsTable();
      const archivedResult = await db.query(
        "SELECT thread_id FROM eclipse_dashboard_archived_groups WHERE messenger_user_id = $1",
        [String(eclipseUserID || "").trim()]
      );
      const archivedIds = (archivedResult.rows || [])
        .map(row => String(row.thread_id || "").trim())
        .filter(Boolean);

      // The DB helper independently protects every customized setting, target,
      // Automod rule, moderation ban, and saved group override. Only stale,
      // untouched default thread-settings rows can be removed.
      const cleanup = await db.pruneStaleDashboardGroupSettings(
        [...activeIds],
        archivedIds
      );

      dashboardKnownGroups.clear();
      dashboardSavedGroupDirectoryCleared = false;
      dashboardThreadLists.set(api, {
        value: currentThreads,
        expiresAt: Date.now() + 60_000,
        failedUntil: 0,
        promise: null,
      });

      const loadedCount = currentThreads.filter(thread => {
        const participants = Array.isArray(thread?.participantIDs)
          ? thread.participantIDs
          : Array.isArray(thread?.participants)
            ? thread.participants
            : [];
        return Number(thread?.threadType) === 2 ||
          String(thread?.threadType || "").toUpperCase() === "GROUP" ||
          thread?.isGroup === true ||
          participants.length >= 3;
      }).length;

      console.info(
        "[DASHBOARD] Force-cleaned stale default group settings; removed=" +
        cleanup.removedCount + ", preserved_configured=" +
        cleanup.preservedConfiguredCount + ", live_groups=" + activeIds.size
      );
      return res.json({
        ok: true,
        removedCount: cleanup.removedCount,
        preservedCount: cleanup.preservedConfiguredCount,
        activeCount: activeIds.size,
        loadedCount,
        messenger_connected: true,
      });
    } catch (error) {
      console.error("[DASHBOARD] Force clean group settings failed:", error?.message || error);
      return res.status(503).json({
        ok: false,
        error: "Could not safely force-clean group settings. Existing customized data was left intact.",
      });
    }
  }
);


function dashboardOwnerId() {
  const { ADMIN_IDS, isOwner } = require("./permissions");
  for (const candidate of ADMIN_IDS) {
    if (isOwner(candidate)) return String(candidate);
  }
  return "";
}

app.get(
  "/api/dashboard/groups",
  requireDashboardAccess,
  async (_req, res) => {
    const messengerConnected = Boolean(activeMessengerApi && activeListenerGeneration > 0);
    const known = new Map();
    if (!messengerConnected) {
      // Keep previously discovered group metadata usable while Facebook is offline.
      for (const [threadID, group] of dashboardKnownGroups.entries()) {
        known.set(String(threadID), { ...group, last_seen_at: null, metadata_unavailable: true });
      }
    } else {
      try {
      const inboxThreads = await dashboardGetThreadList(activeMessengerApi);
      if (Array.isArray(inboxThreads) && inboxThreads.length) dashboardSavedGroupDirectoryCleared = false;
      for (const thread of inboxThreads) {
        const threadID = String(thread.threadID || thread.threadId || thread.thread_id || "").trim();
        if (!threadID) continue;
        const participants = Array.isArray(thread.participantIDs)
          ? thread.participantIDs
          : Array.isArray(thread.participants)
            ? thread.participants
            : [];
        const isGroup = Number(thread.threadType) === 2 ||
          String(thread.threadType || "").toUpperCase() === "GROUP" ||
          participants.length >= 3;
        if (!isGroup) continue;
        const seenAt = activeThreads.get(threadID);
        const messageTime = Number(thread.lastMessageTimestamp || thread.last_message_timestamp || 0);
        const fallbackTime = messageTime > 0
          ? (messageTime < 1e12 ? messageTime * 1000 : messageTime)
          : null;
        known.set(threadID, {
          thread_id: threadID,
          name: String(thread.name || thread.threadName || "Unnamed group").slice(0, 160),
          participant_count: participants.length,
          last_seen_at: seenAt ? new Date(Number(seenAt)).toISOString()
            : fallbackTime ? new Date(fallbackTime).toISOString() : null,
          is_group: true,
        });
      }
    } catch (error) {
      console.warn("[DASHBOARD] Could not fetch Messenger thread list:", error?.message || error);
    }

    }

    // Archived groups stay available in the dashboard's Archived view even
    // after they disappear from the Messenger inbox. Archiving never removes
    // the bot from a conversation; leaving is a separate explicit action.
    const archivedGroups = new Map();
    try {
      await ensureDashboardArchivedGroupsTable();

      const archivedResult = await db.query(
        "SELECT thread_id, group_name, participant_count, archived_at, left_at FROM eclipse_dashboard_archived_groups WHERE messenger_user_id = $1 ORDER BY archived_at DESC",
        [String(eclipseUserID || "").trim()]
      );
      for (const row of archivedResult.rows || []) {
        const threadID = String(row.thread_id || "").trim();
        if (!threadID) continue;
        archivedGroups.set(threadID, row);
        const current = known.get(threadID);
        if (current) {
          current.archived = true;
          current.left = Boolean(row.left_at);
        } else {
          known.set(threadID, {
            thread_id: threadID,
            name: String(row.group_name || "Archived group").slice(0, 160),
            participant_count: Number(row.participant_count) || 0,
            last_seen_at: null,
            is_group: true,
            archived: true,
            left: Boolean(row.left_at),
          });
        }
      }
      archivedDashboardGroups.clear();
      for (const archivedID of archivedGroups.keys()) archivedDashboardGroups.add(archivedID);
      archivedDashboardGroupsLoadedAt = Date.now();
    } catch (error) {
      console.warn("[DASHBOARD] Could not load archived groups:", error?.message || error);
    }

    const configuredSavedGroupIds = new Set();
    if (!dashboardSavedGroupDirectoryCleared) {
      // Only groups with explicit overrides belong in the saved directory.
      // Default settings are now read without creating persistent rows.
      try {
        const savedGroupIds = await db.getConfiguredDashboardGroupIds();
        for (const rawThreadID of savedGroupIds) {
          const threadID = String(rawThreadID || "").trim();
          if (!threadID) continue;
          configuredSavedGroupIds.add(threadID);
          const existing = known.get(threadID);
          if (existing) {
            existing.has_custom_settings = true;
            continue;
          }
          known.set(threadID, {
            thread_id: threadID,
            name: "Saved group · " + threadID.slice(-6),
            participant_count: 0,
            last_seen_at: null,
            is_group: true,
            metadata_unavailable: true,
            has_custom_settings: true,
          });
        }
      } catch (error) {
        console.warn("[DASHBOARD] Could not load configured group directory:", error?.message || error);
      }
    }
    for (const group of known.values()) {
      group.has_custom_settings = group.has_custom_settings === true ||
        configuredSavedGroupIds.has(String(group.thread_id || ""));
    }

    dashboardKnownGroups.clear();
    const groups = [];
    const orderedGroups = Array.from(known.values()).slice(0, 200);
    let groupSettingsById = new Map();
    if (orderedGroups.length) {
      try {
        groupSettingsById = await loadDashboardGroupSettings(
          db,
          orderedGroups.map(group => group.thread_id)
        );
      } catch (error) {
        console.warn("[DASHBOARD] Could not load group settings in one batch:", error?.message || error);
      }
    }

    for (const group of orderedGroups) {
      dashboardKnownGroups.set(group.thread_id, group);
      const saved = groupSettingsById.get(group.thread_id);
      const settings = saved?.settings || {
        bot_enabled: true,
        roast_enabled: true,
        slash_pool_enabled: false,
        fun_enabled: true,
      };
      const target = saved?.target || null;
      groups.push({
        ...group,
        archived: Boolean(group.archived || archivedGroups.has(group.thread_id)),
        left: Boolean(group.left || archivedGroups.get(group.thread_id)?.left_at),
        bot_enabled: settings.bot_enabled !== false,
        roast_enabled: settings.roast_enabled === true,
        slash_pool_enabled: settings.slash_pool_enabled === true,
        fun_enabled: settings.fun_enabled === true,
        target_user_id: target?.target_user_id || null,
        target_name: target?.target_name || null,
        bang_enabled: target?.bang_enabled === true,
        jaiden_interval_seconds: Number(target?.jaiden_interval_seconds) || 3,
        jaiden_cooldown_mode: target?.jaiden_cooldown_mode || "extend",
        jaiden_reply_mode: target?.jaiden_reply_mode || "always",
        jaiden_typing_enabled: target?.jaiden_typing_enabled !== false,
        target_set_at: target?.updated_at ? new Date(Number(target.updated_at)).toISOString() : null,
      });
    }

    return res.json({
      ok: true,
      groups,
      messenger_connected: messengerConnected,
      generated_at: new Date().toISOString(),
    });
  }
);

app.post(
  "/api/dashboard/groups/:thread_id/archive",
  requireDashboardAccess,
  async (req, res) => {
    const threadID = String(req.params.thread_id || "").trim();
    const group = dashboardKnownGroups.get(threadID);
    if (!threadID || !group) {
      return res.status(400).json({ ok: false, error: "Choose a group from the refreshed dashboard list." });
    }
    const archived = req.body?.archived !== false;
    try {
      await ensureDashboardArchivedGroupsTable();
      if (archived) {
        await db.query(
          `INSERT INTO eclipse_dashboard_archived_groups (thread_id, messenger_user_id, group_name, participant_count, archived_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (thread_id) DO UPDATE SET
             messenger_user_id = EXCLUDED.messenger_user_id,
             group_name = EXCLUDED.group_name,
             participant_count = EXCLUDED.participant_count,
             archived_at = NOW()`,
          [threadID, String(eclipseUserID || "").trim(), String(group.name || "Archived group").slice(0, 160), Number(group.participant_count) || 0]
        );
      } else {
        await db.query(
          "DELETE FROM eclipse_dashboard_archived_groups WHERE thread_id = $1 AND messenger_user_id = $2",
          [threadID, String(eclipseUserID || "").trim()]
        );
      }
      group.archived = archived;
      if (archived) archivedDashboardGroups.add(threadID);
      else archivedDashboardGroups.delete(threadID);
      archivedDashboardGroupsLoadedAt = Date.now();
      dashboardKnownGroups.set(threadID, group);
      pushDashboardEvent("group", (archived ? "Archived " : "Restored ") + String(group.name || threadID) + ".");
      return res.json({ ok: true, thread_id: threadID, archived });
    } catch (error) {
      console.error("[DASHBOARD] Could not update archived group:", error);
      return res.status(503).json({ ok: false, error: "Could not update this group's archive state." });
    }
  }
);

app.post(
  "/api/dashboard/groups/:thread_id/leave",
  requireDashboardAccess,
  async (req, res) => {
    const threadID = String(req.params.thread_id || "").trim();
    const group = dashboardKnownGroups.get(threadID);
    if (!threadID || !group) {
      return res.status(400).json({ ok: false, error: "Choose a group from the refreshed dashboard list." });
    }
    if (!activeMessengerApi || activeListenerGeneration <= 0) {
      return res.status(409).json({ ok: false, error: "Messenger is not connected." });
    }
    if (typeof activeMessengerApi.gcmember !== "function") {
      return res.status(501).json({ ok: false, error: "This ws3-fca client does not expose gcmember, so leaving this group is unavailable." });
    }
    const currentUserID = String(activeMessengerApi.getCurrentUserID?.() || "").trim();
    if (!/^\d{6,20}$/.test(currentUserID)) {
      return res.status(409).json({ ok: false, error: "Could not verify the bot's Messenger user ID; no leave action was sent." });
    }
    try {
      await changeGroupMember(activeMessengerApi, "remove", currentUserID, threadID);
      await ensureDashboardArchivedGroupsTable();
      await db.query(
        `INSERT INTO eclipse_dashboard_archived_groups (thread_id, messenger_user_id, group_name, participant_count, archived_at, left_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (thread_id) DO UPDATE SET
           messenger_user_id = EXCLUDED.messenger_user_id,
           group_name = EXCLUDED.group_name,
           participant_count = EXCLUDED.participant_count,
           archived_at = NOW(),
           left_at = NOW()`,
        [threadID, String(eclipseUserID || "").trim(), String(group.name || "Archived group").slice(0, 160), Number(group.participant_count) || 0]
      );
      group.archived = true;
      group.left = true;
      archivedDashboardGroups.add(threadID);
      archivedDashboardGroupsLoadedAt = Date.now();
      dashboardKnownGroups.set(threadID, group);
      pushDashboardEvent("group", "Bot left and archived " + String(group.name || threadID) + ".");
      return res.json({ ok: true, thread_id: threadID, archived: true, left: true });
    } catch (error) {
      console.error("[DASHBOARD] Could not leave Messenger group " + threadID + ":", error?.message || error);
      return res.status(502).json({ ok: false, error: "Messenger could not remove the bot from this group. The group was not marked as left." });
    }
  }
);

app.put(
  "/api/dashboard/groups/:thread_id/settings",
  requireDashboardAccess,
  async (req, res) => {
    const threadID = String(req.params.thread_id || "").trim();
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const allowedSettings = ["bot_enabled", "roast_enabled", "slash_pool_enabled", "fun_enabled"];
    const updates = {};
    for (const key of allowedSettings) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        if (typeof body[key] !== "boolean") {
          return res.status(400).json({ ok: false, error: key + " must be true or false." });
        }
        updates[key] = body[key];
      }
    }
    if (!threadID || (!activeThreads.has(threadID) && !dashboardKnownGroups.has(threadID))) {
      return res.status(400).json({ ok: false, error: "Choose a group in the bot group list." });
    }
    if (!Object.keys(updates).length) {
      return res.status(400).json({ ok: false, error: "Provide at least one group setting to update." });
    }
    try {
      const settings = await db.setThreadSettings(threadID, updates);

      // Keep the in-memory Banat runtime aligned with dashboard changes.
      // Clearing pending bursts prevents an old reply from appearing after
      // an admin turns Banat or the whole bot off from the dashboard.
      const banatEnabled =
        settings.roast_enabled === true ||
        settings.slash_pool_enabled === true;
      const banatModeWasDisabled =
        updates.roast_enabled === false ||
        updates.slash_pool_enabled === false;
      if (settings.bot_enabled === false || !banatEnabled) {
        setBanatConversationMode(threadID, false);
        if (typeof clearBanatBurstState === "function") {
          clearBanatBurstState(threadID);
        }
      } else {
        if (banatModeWasDisabled && typeof clearBanatBurstState === "function") {
          clearBanatBurstState(threadID);
        }
        setBanatConversationMode(threadID, true);
      }

      const settingLabels = {
        bot_enabled: "bot",
        roast_enabled: "/ Banat",
        slash_pool_enabled: "\\ Banat",
        fun_enabled: "games",
      };
      for (const [key, value] of Object.entries(updates)) {
        pushDashboardEvent("group", settingLabels[key] + " " + (value ? "enabled" : "disabled") + " in group " + threadID + ".");
      }
      return res.json({
        ok: true,
        thread_id: threadID,
        bot_enabled: settings.bot_enabled !== false,
        roast_enabled: settings.roast_enabled === true,
        slash_pool_enabled: settings.slash_pool_enabled === true,
        fun_enabled: settings.fun_enabled === true,
      });
    } catch (error) {
      console.error("[DASHBOARD] Group setting update failed:", error);
      return res.status(503).json({ ok: false, error: "Could not save this group's settings." });
    }
  }
);

app.post(
  "/api/dashboard/setnn/single",
  requireDashboardAccess,
  async (req, res) => {
    const threadID = String(req.body?.thread_id || "").trim();
    const participantID = String(req.body?.participant_id || "").trim();
    const nickname = String(req.body?.nickname || "").trim();    const ownerId = dashboardOwnerId();

    if (!ownerId) {
      return res.status(503).json({
        ok: false,
        error: "Set ADMIN_IDS to the bot owner's Messenger ID before enabling dashboard SetNN.",
      });
    }
    if (!activeMessengerApi || activeListenerGeneration <= 0) {
      return res.status(409).json({ ok: false, error: "Messenger is not connected." });
    }
    if (!threadID || (!activeThreads.has(threadID) && !dashboardKnownGroups.has(threadID))) {
      return res.status(400).json({ ok: false, error: "Choose a group in the bot group list." });
    }
    if (!participantID) {
      return res.status(400).json({ ok: false, error: "Choose one group member." });
    }
    if (!nickname || nickname.length > 80 || /[\u0000-\u001f\u007f]/.test(nickname) || /^off$/i.test(nickname)) {
      return res.status(400).json({ ok: false, error: "Enter a nickname of 1–80 characters; use Clear only if you want a separate reset flow." });
    }

    try {
      const info = await dashboardGetThreadInfo(activeMessengerApi, threadID);
      const ids = await dashboardGetParticipantIds(activeMessengerApi, threadID, info);
      const botID = String(activeMessengerApi.getCurrentUserID?.() || "");
      if (!ids.has(participantID) || participantID === botID) {
        return res.status(400).json({ ok: false, error: "The selected target must be a member of this group, not the bot." });
      }

      await changeNicknameAsync(activeMessengerApi, nickname, threadID, participantID);
      const protectedNicknames = await getProtectedNicknames(threadID);
      protectedNicknames[participantID] = nickname;
      await setProtectedNicknames(threadID, ownerId, protectedNicknames);

      pushDashboardEvent("setnn", "Single-member SetNN completed for group " + threadID + ".");
      return res.json({
        ok: true,
        thread_id: threadID,
        participant_id: participantID,
        nickname,
        status: "completed",
        message: "Nickname updated for the selected member only.",
      });
    } catch (error) {
      console.error("[DASHBOARD] Single-member SetNN failed:", error);
      pushDashboardEvent("error", "Single-member SetNN failed for group " + threadID + ".");
      return res.status(503).json({
        ok: false,
        error: String(error?.message || "Could not update this member's nickname.").slice(0, 300),
      });
    }
  }
);

const DEFAULT_MASS_SETNN_COMPLETION_MESSAGE = "wagpaletnnmgataba";

async function getMassSetNNCompletionMessage() {
  await db.query(`CREATE TABLE IF NOT EXISTS eclipse_dashboard_preferences (
    preference_key TEXT PRIMARY KEY,
    preference_value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const { rows } = await db.query(
    "SELECT preference_value FROM eclipse_dashboard_preferences WHERE preference_key = $1 LIMIT 1",
    ["mass_setnn_completion_message"]
  );
  const value = rows[0]?.preference_value;
  return typeof value === "string" ? value : DEFAULT_MASS_SETNN_COMPLETION_MESSAGE;
}

app.get(
  "/api/dashboard/setnn/completion-message",
  requireDashboardAccess,
  async (_req, res) => {
    try {
      const message = await getMassSetNNCompletionMessage();
      return res.json({ ok: true, settings: { message } });
    } catch (error) {
      console.error("[DASHBOARD SETNN] Could not load completion message:", error?.message || error);
      return res.status(500).json({ ok: false, error: "Could not load Mass SetNN completion message." });
    }
  }
);

app.put(
  "/api/dashboard/setnn/completion-message",
  requireDashboardAccess,
  async (req, res) => {
    const message = typeof req.body?.message === "string" ? req.body.message : "";
    if (!message.trim() || message.length > 500 || /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(message)) {
      return res.status(400).json({ ok: false, error: "Completion message must be 1–500 printable characters." });
    }
    try {
      await db.query(`CREATE TABLE IF NOT EXISTS eclipse_dashboard_preferences (
        preference_key TEXT PRIMARY KEY,
        preference_value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await db.query(
        `INSERT INTO eclipse_dashboard_preferences(preference_key, preference_value, updated_at)
         VALUES($1, $2::jsonb, NOW())
         ON CONFLICT(preference_key) DO UPDATE SET
           preference_value = EXCLUDED.preference_value,
           updated_at = NOW()`,
        ["mass_setnn_completion_message", JSON.stringify(message.trim())]
      );
      return res.json({ ok: true, settings: { message: message.trim() } });
    } catch (error) {
      console.error("[DASHBOARD SETNN] Could not save completion message:", error?.message || error);
      return res.status(500).json({ ok: false, error: "Could not save Mass SetNN completion message." });
    }
  }
);

app.post(
  "/api/dashboard/setnn/start",
  requireDashboardAccess,
  async (req, res) => {
    const threadID = String(req.body?.thread_id || "").trim();
    const nickname = String(req.body?.nickname || "").trim();
    const interval = Number(req.body?.interval_seconds ?? 10);
    const ownerId = dashboardOwnerId();

    if (!ownerId) {
      return res.status(503).json({
        ok: false,
        error: "Set ADMIN_IDS to the bot owner's Messenger ID before enabling dashboard SetNN.",
      });
    }
    if (!activeMessengerApi || activeListenerGeneration <= 0) {
      return res.status(409).json({ ok: false, error: "Messenger is not connected." });
    }
    if (!threadID || (!activeThreads.has(threadID) && !dashboardKnownGroups.has(threadID))) {
      return res.status(400).json({ ok: false, error: "Choose a group in the bot group list." });
    }
    if (!nickname || nickname.length > 80 || /[\u0000-\u001f\u007f]/.test(nickname) || /^off$/i.test(nickname)) {
      return res.status(400).json({ ok: false, error: "Enter a nickname of 1–80 characters; use Stop to cancel a job." });
    }
    if (!Number.isInteger(interval) || interval < 2 || interval > 60) {
      return res.status(400).json({ ok: false, error: "Interval must be between 2 and 60 seconds." });
    }
    if (dashboardSetNNJobs.get(threadID)?.status === "running") {
      return res.status(409).json({ ok: false, error: "A SetNN job is already running for this group." });
    }

    const job = {
      thread_id: threadID,
      nickname,
      interval_seconds: interval,
      status: "running",
      started_at: new Date().toISOString(),
      finished_at: null,
      error: null,
    };
    dashboardSetNNJobs.set(threadID, job);
    dashboardSetNNStopRequests.delete(threadID);
    pushDashboardEvent("setnn", "SetNN job started for group " + threadID + ".");

    void handleMessage(activeMessengerApi, {
      threadID,
      senderID: ownerId,
      body: ".setnn " + interval + " " + nickname,
      isGroup: true,
    }).then(async (result) => {
      const outcome = result?.setnn;
      if (!outcome || !["completed", "stopped", "paused", "deferred", "partial", "failed"].includes(outcome.status)) {
        throw new Error("SetNN command returned no verifiable operation result; refusing to mark the job completed.");
      }
      job.result = outcome;
      job.status = dashboardSetNNStopRequests.has(threadID) && outcome.status === "completed"
        ? "stopped"
        : outcome.status;
      if (outcome.error) job.error = outcome.error;
      job.finished_at = new Date().toISOString();
      if (job.status === "completed") {
        try {
          const completionMessage = await getMassSetNNCompletionMessage();
          if (completionMessage.trim()) {
            await sendMessengerMessage(activeMessengerApi, completionMessage, threadID);
            pushDashboardEvent("setnn", "Mass SetNN completion message sent for group " + threadID + ".");
          }
        } catch (completionError) {
          // The nickname job succeeded even if its optional final message fails.
          console.error("[DASHBOARD SETNN] Completion message send failed:", completionError?.message || completionError);
          pushDashboardEvent("error", "Mass SetNN completed, but its completion message could not be sent.");
        }
      }
      pushDashboardEvent("setnn", "SetNN job " + job.status + " for group " + threadID + ".");
    }).catch((error) => {
      job.status = "failed";
      job.error = String(error?.message || error).slice(0, 500);
      job.finished_at = new Date().toISOString();
      pushDashboardEvent("error", "SetNN job failed for group " + threadID + ".");
      console.error("[DASHBOARD] SetNN job failed:", error);
    }).finally(() => {
      dashboardSetNNStopRequests.delete(threadID);
    });

    return res.status(202).json({ ok: true, job });
  }
);

app.get(
  "/api/dashboard/setnn/status",
  requireDashboardAccess,
  async (req, res) => {
    const threadID = String(req.query.thread_id || "").trim();
    if (!threadID) return res.status(400).json({ ok: false, error: "thread_id is required." });
    const job = dashboardSetNNJobs.get(threadID) || null;
    let checkpoint = null;
    try {
      checkpoint = await getMassNicknameRun(threadID);
    } catch (error) {
      console.error("[DASHBOARD] SetNN checkpoint read failed:", error);
    }
    return res.json({
      ok: true,
      job,
      checkpoint: checkpoint ? {
        nickname: checkpoint.nickname || null,
        total: Array.isArray(checkpoint.targets) ? checkpoint.targets.length : 0,
        next_index: Number(checkpoint.next_index || 0),
        blocked_until: Number(checkpoint.blocked_until || 0) || null,
      } : null,
    });
  }
);

app.post(
  "/api/dashboard/setnn/stop",
  requireDashboardAccess,
  (req, res) => {
    const threadID = String(req.body?.thread_id || "").trim();
    if (!threadID) return res.status(400).json({ ok: false, error: "thread_id is required." });
    const job = dashboardSetNNJobs.get(threadID);
    if (!job || job.status !== "running") {
      return res.status(409).json({ ok: false, error: "No active SetNN job exists for this group." });
    }
    dashboardSetNNStopRequests.add(threadID);
    pushDashboardEvent("setnn", "SetNN stop requested for group " + threadID + ".");
    return res.json({ ok: true, stopping: true, message: "The job will stop after its current nickname operation and preserve its checkpoint." });
  }
);

app.post(
  "/api/dashboard/removenn/start",
  requireDashboardAccess,
  async (req, res) => {
    const threadID = String(req.body?.thread_id || "").trim();
    const interval = Number(req.body?.interval_seconds ?? 10);
    const ownerId = dashboardOwnerId();

    if (!ownerId) {
      return res.status(503).json({ ok: false, error: "Set ADMIN_IDS to the bot owner's Messenger ID before enabling dashboard nickname removal." });
    }
    if (!activeMessengerApi || activeListenerGeneration <= 0) {
      return res.status(409).json({ ok: false, error: "Messenger is not connected." });
    }
    if (!threadID || (!activeThreads.has(threadID) && !dashboardKnownGroups.has(threadID))) {
      return res.status(400).json({ ok: false, error: "Choose a group in the bot group list." });
    }
    if (!Number.isInteger(interval) || interval < 2 || interval > 60) {
      return res.status(400).json({ ok: false, error: "Interval must be between 2 and 60 seconds." });
    }
    if (dashboardRemoveNNJobs.get(threadID)?.status === "running") {
      return res.status(409).json({ ok: false, error: "A nickname-removal job is already running for this group." });
    }

    const job = {
      thread_id: threadID,
      interval_seconds: interval,
      status: "running",
      started_at: new Date().toISOString(),
      finished_at: null,
      error: null,
    };
    dashboardRemoveNNJobs.set(threadID, job);
    pushDashboardEvent("setnn", "Mass nickname removal started for group " + threadID + ".");

    void handleMessage(activeMessengerApi, {
      threadID,
      senderID: ownerId,
      body: ".removenn " + interval,
      isGroup: true,
    }).then(() => {
      job.status = "completed";
      job.finished_at = new Date().toISOString();
      pushDashboardEvent("setnn", "Mass nickname removal completed for group " + threadID + ".");
    }).catch((error) => {
      job.status = "failed";
      job.error = String(error?.message || error).slice(0, 500);
      job.finished_at = new Date().toISOString();
      pushDashboardEvent("error", "Mass nickname removal failed for group " + threadID + ".");
      console.error("[DASHBOARD] Mass nickname removal failed:", error);
    });

    return res.status(202).json({ ok: true, job });
  }
);

app.get(
  "/api/dashboard/removenn/status",
  requireDashboardAccess,
  (req, res) => {
    const threadID = String(req.query.thread_id || "").trim();
    if (!threadID) return res.status(400).json({ ok: false, error: "thread_id is required." });
    return res.json({ ok: true, job: dashboardRemoveNNJobs.get(threadID) || null });
  }
);

app.post(
  "/api/dashboard/commands/execute",
  requireDashboardAccess,
  (req, res) => {
    const threadID = String(req.body?.thread_id || "").trim();
    const command = String(req.body?.command || "").trim();
    const ownerId = dashboardOwnerId();
    const allowed = new Set(["!help", "!ping", "!rpg help"]);

    if (!ownerId) {
      return res.status(503).json({ ok: false, error: "Set ADMIN_IDS to the bot owner's Messenger ID before enabling command execution." });
    }
    if (!activeMessengerApi || activeListenerGeneration <= 0) {
      return res.status(409).json({ ok: false, error: "Messenger is not connected." });
    }
    if (!threadID || (!activeThreads.has(threadID) && !dashboardKnownGroups.has(threadID))) {
      return res.status(400).json({ ok: false, error: "Choose a group in the bot group list." });
    }
    if (!allowed.has(command.toLowerCase())) {
      return res.status(400).json({ ok: false, allowed_commands: Array.from(allowed), error: "This playground only executes allowlisted, low-risk commands." });
    }

    pushDashboardEvent("command", "Dashboard command " + command + " sent to thread " + threadID + ".");
    void handleMessage(activeMessengerApi, {
      threadID,
      senderID: ownerId,
      body: command,
      isGroup: true,
    }).catch((error) => {
      console.error("[DASHBOARD] Command playground execution failed:", error);
      pushDashboardEvent("error", "Command playground execution failed.");
    });

    return res.status(202).json({ ok: true, accepted: true, command, thread_id: threadID, message: "Command dispatched to Messenger; its reply appears in the selected conversation." });
  }
);

app.get(
  "/api/dashboard/preferences/reaction",
  requireDashboardAccess,
  async (_req, res) => {
    try {
      const { rows } = await db.query(
        "SELECT preference_value, updated_at FROM eclipse_dashboard_preferences WHERE preference_key = $1 LIMIT 1",
        ["reaction_engine"]
      );
      const reaction = normalizeReactionConfig(rows[0]?.preference_value || DEFAULT_REACTION_CONFIG);
      dashboardReactionConfig = reaction;
      return res.json({ ok: true, reaction, updated_at: rows[0]?.updated_at || null });
    } catch (error) {
      console.error("[DASHBOARD] Reaction preference read failed:", error);
      return res.status(503).json({ ok: false, error: "Reaction settings are temporarily unavailable." });
    }
  }
);

app.put(
  "/api/dashboard/preferences/reaction",
  requireDashboardAccess,
  async (req, res) => {
    const value = req.body?.reaction || {};
    const reaction = normalizeReactionConfig(value);
    try {
      await db.query(
        `CREATE TABLE IF NOT EXISTS eclipse_dashboard_preferences (
          preference_key TEXT PRIMARY KEY,
          preference_value JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      );
      const { rows } = await db.query(
        `INSERT INTO eclipse_dashboard_preferences (preference_key, preference_value, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (preference_key)
         DO UPDATE SET preference_value = EXCLUDED.preference_value, updated_at = NOW()
         RETURNING updated_at`,
        ["reaction_engine", JSON.stringify(reaction)]
      );
      dashboardReactionConfig = reaction;
      pushDashboardEvent("preferences", "Reaction engine preferences updated.");
      return res.json({ ok: true, reaction, updated_at: rows[0]?.updated_at || new Date().toISOString() });
    } catch (error) {
      console.error("[DASHBOARD] Reaction preference save failed:", error);
      return res.status(503).json({ ok: false, error: "Could not save reaction settings." });
    }
  }
);

app.get(
  "/api/dashboard/preferences/appearance",
  requireDashboardAccess,
  async (_req, res) => {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS eclipse_dashboard_preferences (
          preference_key TEXT PRIMARY KEY,
          preference_value JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      const { rows } = await db.query(
        "SELECT preference_value, updated_at FROM eclipse_dashboard_preferences WHERE preference_key = $1 LIMIT 1",
        ["appearance"]
      );
      return res.json({
        ok: true,
        appearance: rows[0]?.preference_value || null,
        updated_at: rows[0]?.updated_at || null,
      });
    } catch (error) {
      console.error("[DASHBOARD] Appearance preference read failed:", error);
      return res.status(503).json({ ok: false, error: "Server appearance preferences are temporarily unavailable." });
    }
  }
);

app.put(
  "/api/dashboard/preferences/appearance",
  requireDashboardAccess,
  async (req, res) => {
    const value = req.body?.appearance;
    const overlay = Number(value?.overlay);
    const glass = Number(value?.glass);
    const accent = String(value?.accent || "");
    const compact = value?.compact;
    if (!Number.isInteger(overlay) || overlay < 35 || overlay > 95 ||
        !Number.isInteger(glass) || glass < 45 || glass > 95 ||
        !/^#[0-9a-f]{6}$/i.test(accent) || typeof compact !== "boolean") {
      return res.status(400).json({ ok: false, error: "Appearance settings are invalid." });
    }
    const appearance = { overlay, glass, accent, compact };
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS eclipse_dashboard_preferences (
          preference_key TEXT PRIMARY KEY,
          preference_value JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      const { rows } = await db.query(
        `INSERT INTO eclipse_dashboard_preferences (preference_key, preference_value, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (preference_key)
         DO UPDATE SET preference_value = EXCLUDED.preference_value, updated_at = NOW()
         RETURNING updated_at`,
        ["appearance", JSON.stringify(appearance)]
      );
      pushDashboardEvent("preferences", "Dashboard appearance preferences saved to the server.");
      return res.json({ ok: true, appearance, updated_at: rows[0]?.updated_at || new Date().toISOString() });
    } catch (error) {
      console.error("[DASHBOARD] Appearance preference save failed:", error);
      return res.status(503).json({ ok: false, error: "Could not save server appearance preferences." });
    }
  }
);

app.get(
  "/api/dashboard/deployment",
  requireDashboardAccess,
  (_req, res) => {
    const configured = Boolean(
      String(process.env.RENDER_API_KEY || process.env.RENDER_API_TOKEN || "").trim() &&
      String(process.env.RENDER_SERVICE_ID || "").trim()
    );
    return res.json({
      ok: true,
      provider: "render",
      configured,
      restart_enabled: configured,
      service_id_configured: Boolean(String(process.env.RENDER_SERVICE_ID || "").trim()),
      message: configured
        ? "Render deployment controls are configured."
        : "Set RENDER_API_KEY and RENDER_SERVICE_ID in the bot deployment environment to enable authenticated restart controls.",
      version: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || null,
      node_version: process.version,
      uptime_seconds: getRenderRuntimeSeconds(),
    });
  }
);

app.post(
  "/api/dashboard/deployment/restart",
  requireDashboardAccess,
  async (_req, res) => {
    const token = String(process.env.RENDER_API_KEY || process.env.RENDER_API_TOKEN || "").trim();
    const serviceId = String(process.env.RENDER_SERVICE_ID || "").trim();
    if (!token || !serviceId) {
      return res.status(503).json({ ok: false, error: "Configure RENDER_API_KEY and RENDER_SERVICE_ID on the server first." });
    }

    try {
      const response = await fetch("https://api.render.com/v1/services/" + encodeURIComponent(serviceId) + "/restart", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        console.warn("[DASHBOARD] Render restart request failed with HTTP status", response.status);
        return res.status(502).json({ ok: false, error: "Render rejected the restart request (" + response.status + ")." });
      }
      pushDashboardEvent("deployment", "Render restart requested from the dashboard.");
      return res.json({ ok: true, requested: true, message: "Render accepted the restart request." });
    } catch (error) {
      console.error("[DASHBOARD] Render restart request failed:", String(error?.code || error?.name || "RENDER_REQUEST_FAILED"));
      return res.status(502).json({ ok: false, error: "Could not reach Render's API." });
    }
  }
);

app.post(
  "/api/dashboard/location",
  requireDashboardAccess,
  (req, res) => {
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    const accuracy = Number(req.body?.accuracy);
    const consent = req.body?.consent === true;
    if (!consent) return res.status(400).json({ ok: false, error: "Explicit location-sharing consent is required." });
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
        !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 1_000_000) {
      return res.status(400).json({ ok: false, error: "Valid coordinates and accuracy are required." });
    }
    const location = {
      latitude: Number(latitude.toFixed(5)),
      longitude: Number(longitude.toFixed(5)),
      accuracy: Math.round(accuracy),
      captured_at: new Date().toISOString(),
      expires_at: Date.now() + 60 * 60 * 1000,
    };
    dashboardSharedLocation = location;
    pushDashboardEvent("location", "Location was shared explicitly with the dashboard; coordinates are not included in event logs.");
    return res.json({ ok: true, location: { ...location, expires_at: new Date(location.expires_at).toISOString() }, expires_in_seconds: 3600 });
  }
);

app.get(
  "/api/dashboard/location",
  requireDashboardAccess,
  (_req, res) => {
    if (dashboardSharedLocation && dashboardSharedLocation.expires_at <= Date.now()) {
      dashboardSharedLocation = null;
    }
    const location = dashboardSharedLocation;
    return res.json({
      ok: true,
      location: location ? { ...location, expires_at: new Date(location.expires_at).toISOString() } : null,
    });
  }
);

app.delete(
  "/api/dashboard/location",
  requireDashboardAccess,
  (_req, res) => {
    dashboardSharedLocation = null;
    pushDashboardEvent("location", "Shared location was cleared from server memory.");
    return res.json({ ok: true, cleared: true });
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
    console.error("Web server error:", String(error?.code || error?.name || "SERVER_ERROR"));

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

function getLegacySessionCryptoSecret() {
  return String(process.env.ECLIPSE_DASHBOARD_API_KEY || process.env.DATABASE_URL || "").trim();
}

function getSessionCryptoSecretsForDecryption() {
  return [...new Set([
    process.env.ECLIPSE_SESSION_ENCRYPTION_KEY,
    process.env.ECLIPSE_SESSION_ENCRYPTION_KEY_PREVIOUS,
    getLegacySessionCryptoSecret(),
  ].map(value => String(value || "").trim()).filter(Boolean))];
}

let sessionCryptoFallbackWarningLogged = false;

function getSessionCryptoKey(secretOverride) {
  const secret = secretOverride === undefined
    ? String(process.env.ECLIPSE_SESSION_ENCRYPTION_KEY || getLegacySessionCryptoSecret()).trim()
    : String(secretOverride || "").trim();
  if (!secret) return null;
  if (secretOverride === undefined && !String(process.env.ECLIPSE_SESSION_ENCRYPTION_KEY || "").trim() && !sessionCryptoFallbackWarningLogged) {
    sessionCryptoFallbackWarningLogged = true;
    console.warn("[SECURITY] ECLIPSE_SESSION_ENCRYPTION_KEY is unset; session encryption is using a legacy fallback. Configure a dedicated key and set ECLIPSE_SESSION_ENCRYPTION_KEY_PREVIOUS to the prior key during migration.");
  }
  return crypto.createHash("sha256").update(secret).digest();
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
  const [ivText, tagText, ciphertextText] = String(payload || "").split(".");
  if (!ivText || !tagText || !ciphertextText) throw new Error("Stored session state is malformed.");
  const secrets = getSessionCryptoSecretsForDecryption();
  if (!secrets.length) throw new Error("No session encryption key is configured.");
  for (const secret of secrets) {
    try {
      const key = getSessionCryptoKey(secret);
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
      decipher.setAuthTag(Buffer.from(tagText, "base64url"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertextText, "base64url")),
        decipher.final(),
      ]).toString("utf8");
      return normalizeFacebookAppState(JSON.parse(plaintext), "Stored Messenger session");
    } catch (_) {
      // Try the previous configured key to support safe key rotation.
    }
  }
  throw new Error("Stored session state could not be decrypted. Check the current and previous session encryption keys.");
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

let appStateFileWritePromise = null;

async function persistAppStateFile() {
  if (appStateFileWritePromise) return appStateFileWritePromise;

  appStateFileWritePromise = (async () => {
    const api = activeMessengerApi;
    const rawApi = api?.__eclipseTrafficRawApi || api;
    let currentState = null;

    try {
      if (rawApi && typeof rawApi.getAppState === "function") {
        currentState = rawApi.getAppState();
      }
    } catch (error) {
      console.warn("[AUTH] getAppState() failed during appstate.json persistence:", error?.message || error);
    }

    if (!Array.isArray(currentState) || currentState.length === 0) {
      currentState = appState;
    }
    if (!Array.isArray(currentState) || currentState.length === 0) {
      console.warn("[AUTH] No valid appState is available to write to appstate.json.");
      return false;
    }

    const targetPath = path.join(__dirname, "appstate.json");
    const temporaryPath = path.join(__dirname, "appstate.tmp.json");
    try {
      await fsp.writeFile(
        temporaryPath,
        JSON.stringify(currentState),
        { encoding: "utf8", mode: 0o600 }
      );
      await fsp.rename(temporaryPath, targetPath);
      try { await fsp.chmod(targetPath, 0o600); } catch {}
      appState = currentState;
      await persistFacebookSessionState(currentState);
      console.log("[AUTH] Refreshed appState atomically saved to appstate.json.");
      return true;
    } catch (error) {
      await fsp.unlink(temporaryPath).catch(() => {});
      console.error("[AUTH] Atomic appstate.json persistence failed:", error?.message || error);
      return false;
    }
  })();

  try {
    return await appStateFileWritePromise;
  } finally {
    appStateFileWritePromise = null;
  }
}

async function loadPersistedFacebookSessionState() {
  try {
    await db.connect();
    await loadDashboardReactionConfig();
    try {
      await jaidenTargetPersonalitySettings.load();
    } catch (error) {
      console.warn("[JAIDEN BANAT] Could not initialize saved personality settings:", error?.message || error);
    }

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
let rateLimitFailureCount = 0;
let loginInProgress = false;
let proxyGateVerified = false;
let proxyGatePending = false;
let proxyGateRetryAttempt = 0;
let proxyGateRetryTimer = null;
let listenerGeneration = 0;
let activeListenerGeneration = 0;
let startupSchedulersInitialized = false;
let loginRetryTimer = null;
// Permit one delayed revalidation after Facebook drops an authenticated listener.
// A second explicit login-required response still waits for a fresh session.
let authRejectionRetryUsed = false;
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
let activeMqttListenerCallback = null;
let activeMqttStopHandle = null;
let lastMqttActivity = Date.now();
let lastMqttListenerAttachAt = 0;
let mqttActivityWatchdogTimer = null;
let mqttReconnectTimer = null;
let mqttReconnectAttempt = 0;
let mqttReconnectInProgress = false;
let mqttReconnectFatal = false;

const MQTT_ACTIVITY_CHECK_INTERVAL_MS = 5 * 60_000;
const MQTT_ACTIVITY_STALE_AFTER_MS = 15 * 60_000;
const MQTT_RECONNECT_BASE_DELAY_MS = 10_000;
const MQTT_RECONNECT_MAX_DELAY_MS = 60_000;

function attachMqttListener(api, callback) {
  return api.listenMqtt(callback);
}

function scheduleMqttListenerReattach(reason) {
  if (
    mqttReconnectFatal ||
    mqttReconnectTimer ||
    mqttReconnectInProgress ||
    watchdogShuttingDown ||
    !activeMessengerApi ||
    activeListenerGeneration <= 0 ||
    typeof activeMqttListenerCallback !== "function"
  ) return;

  const delayMs = Math.min(
    MQTT_RECONNECT_MAX_DELAY_MS,
    MQTT_RECONNECT_BASE_DELAY_MS * (2 ** Math.min(mqttReconnectAttempt, 3))
  );
  mqttReconnectAttempt += 1;

  console.warn(
    "[MQTT WATCHDOG] No MQTT activity detected; clean listener reattach scheduled in " +
    delayMs + "ms. Reason: " + String(reason || "stale listener")
  );

  mqttReconnectTimer = setTimeout(() => {
    mqttReconnectTimer = null;
    const api = activeMessengerApi;
    const callback = activeMqttListenerCallback;
    if (
      watchdogShuttingDown ||
      !api ||
      activeListenerGeneration <= 0 ||
      typeof callback !== "function"
    ) return;

    mqttReconnectInProgress = true;
    const rawApi = api.__eclipseTrafficRawApi || api;
    try {
      const stopHandle = activeMqttStopHandle;
      activeMqttStopHandle = null;
      if (typeof stopHandle === "function") {
        stopHandle();
      } else if (typeof api.stopListenMqtt === "function") {
        api.stopListenMqtt();
      }

      if (rawApi && listenerStartedApis.has(rawApi)) {
        listenerStartedApis.delete(rawApi);
      }

      const nextStopHandle = attachMqttListener(api, callback);
      activeMqttStopHandle = typeof nextStopHandle === "function" ? nextStopHandle : null;
      if (rawApi) listenerStartedApis.add(rawApi);
      lastMqttListenerAttachAt = Date.now();
      mqttReconnectInProgress = false;
      console.warn("[MQTT WATCHDOG] Existing Messenger session retained; MQTT listener reattached without logout.");
    } catch (error) {
      mqttReconnectInProgress = false;
      const errorText = getFacebookLoginErrorMessage(error);
      const { authRejected } = classifyListenerError(errorText);
      if (authRejected) {
        mqttReconnectFatal = true;
        console.error(
          "[MQTT WATCHDOG] Fatal authentication rejection while reattaching (" +
          errorText + "). Automatic MQTT reattach is paused; upload or validate a fresh session."
        );
        return;
      }
      console.warn("[MQTT WATCHDOG] Temporary listener reattach failure: " + errorText);
      scheduleMqttListenerReattach("temporary reattach failure");
    }
  }, delayMs);
  mqttReconnectTimer.unref?.();
}

function startMqttActivityWatchdog() {
  if (mqttActivityWatchdogTimer) return;
  mqttActivityWatchdogTimer = setInterval(() => {
    if (
      watchdogShuttingDown ||
      mqttReconnectFatal ||
      !activeMessengerApi ||
      activeListenerGeneration <= 0 ||
      typeof activeMqttListenerCallback !== "function"
    ) return;

    const activityReference = Math.max(lastMqttActivity, lastMqttListenerAttachAt);
    const inactiveForMs = Date.now() - activityReference;
    if (inactiveForMs >= MQTT_ACTIVITY_STALE_AFTER_MS) {
      scheduleMqttListenerReattach(
        "no incoming MQTT callback event for " + Math.round(inactiveForMs / 60_000) + " minute(s)"
      );
    }
  }, MQTT_ACTIVITY_CHECK_INTERVAL_MS);
  mqttActivityWatchdogTimer.unref?.();
}

function stopMqttActivityWatchdog() {
  if (mqttActivityWatchdogTimer) {
    clearInterval(mqttActivityWatchdogTimer);
    mqttActivityWatchdogTimer = null;
  }
  if (mqttReconnectTimer) {
    clearTimeout(mqttReconnectTimer);
    mqttReconnectTimer = null;
  }
  mqttReconnectInProgress = false;
}

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
      depth > 5
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

    // ws3-fca may wrap one or more MQTT errors in arrays. Traverse the
    // entries before inspecting named Error properties so nested codes and
    // messages are not silently lost.
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, depth + 1);
      }
      return;
    }

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

function isWs3FcaBuildApiParserFailure(error) {
  if (String(error?.code || "") === "ECLIPSE_WS3_FCA_MISSING_DTSG") return true;
  const message = String(error?.message || error || "");
  const stack = String(error?.stack || "");
  return (
    /undefined is not iterable|not iterable/i.test(message) &&
    /ws3-fca[\\/].*buildAPI\.js|buildAPI\.js/i.test(stack)
  );
}

function isWs3FcaLoginRequired(error) {
  const code = String(error?.code || "");
  const responseKind = String(error?.eclipseDiagnostics?.responseKind || "");
  const message = String(error?.message || error || "");

  return (
    code === "ECLIPSE_WS3_FCA_LOGIN_REQUIRED" ||
    responseKind === "login" ||
    // ws3-fca@3.5.2 reports rejected sessions through loginHelper as
    // "Error retrieving userID" instead of the custom buildAPI error.
    // Treat these login-callback failures as authentication rejection so
    // the existing one-time durable-session -> FB_COOKIES fallback runs.
    /error retrieving user\s*id|facebook blocked the login|not logged in\.?/i.test(message)
  );
}

function getSafeLoginParserDiagnostics(error) {
  const source = error?.eclipseDiagnostics;
  if (!source || source.kind !== "missing_fb_dtsg") return null;
  const safeKeys = value => Array.isArray(value)
    ? value
        .filter(key => typeof key === "string" && /^[A-Za-z0-9_$.-]{1,60}$/.test(key))
        .slice(0, 20)
    : [];
  const responseKinds = new Set(["two_factor", "checkpoint", "login", "authenticated_home", "unclassified"]);
  return {
    kind: "missing_fb_dtsg",
    htmlLength: Number.isFinite(source.htmlLength) ? source.htmlLength : null,
    netDataCount: Number.isFinite(source.netDataCount) ? source.netDataCount : null,
    dtsgConfigFound: source.dtsgConfigFound === true,
    checkpointMarker: source.checkpointMarker === true,
    twoFactorMarker: source.twoFactorMarker === true,
    loginMarker: source.loginMarker === true,
    accountDisabledMarker: source.accountDisabledMarker === true,
    responseKind: responseKinds.has(source.responseKind) ? source.responseKind : "unclassified",
    twoFactorFormMarker: source.twoFactorFormMarker === true,
    checkpointPathMarker: source.checkpointPathMarker === true,
    checkpointHeadingMarker: source.checkpointHeadingMarker === true,
    passwordFieldMarker: source.passwordFieldMarker === true,
    loginIdentifierFieldMarker: source.loginIdentifierFieldMarker === true,
    authenticatedHomeMarker: source.authenticatedHomeMarker === true,
    fbDtsgLiteralPresent: source.fbDtsgLiteralPresent === true,
    dtsgValueType: ["undefined", "string", "object", "number", "boolean"].includes(source.dtsgValueType)
      ? source.dtsgValueType
      : "unknown",
    dtsgDataKeys: safeKeys(source.dtsgDataKeys),
    netDataKeys: safeKeys(source.netDataKeys),
    // Forward only scalar metadata and safe key names; never log token values.
    dtsgDataType: ["undefined", "object", "string", "number", "boolean"].includes(source.dtsgDataType)
      ? source.dtsgDataType
      : "unknown",
    dtsgDataKeyCount: Number.isFinite(source.dtsgDataKeyCount) ? source.dtsgDataKeyCount : null,
    dtsgDataHasToken: source.dtsgDataHasToken === true,
    dtsgDataTokenType: ["missing", "undefined", "object", "string", "number", "boolean"].includes(source.dtsgDataTokenType)
      ? source.dtsgDataTokenType
      : "unknown",
    dtsgDataTokenLength: Number.isFinite(source.dtsgDataTokenLength) ? source.dtsgDataTokenLength : null,
    htmlDtsgInitialDataMarker: source.htmlDtsgInitialDataMarker === true,
    htmlGenericTokenMarker: source.htmlGenericTokenMarker === true,
    netDataRequireEntryCount: Number.isFinite(source.netDataRequireEntryCount) ? source.netDataRequireEntryCount : null,
    dtsgRequireEntryCount: Number.isFinite(source.dtsgRequireEntryCount) ? source.dtsgRequireEntryCount : null,
  };
}
function getSafeLoginFailureTrace(error) {
  const stack = String(error?.stack || error?.message || "Unknown login failure");
  return stack
    .split("\n")
    .slice(0, 8)
    .map(line => line
      .replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/gi, "https://[redacted]@")
      .replace(/([?&](?:access_token|token|session|cookie|password)=)[^&\s]+/gi, "$1[redacted]")
    )
    .join("\n")
    .slice(0, 1800);
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
  // Verify the configured proxy before Messenger login. Temporary probe
  // failures retry automatically with bounded backoff and preserve the session.
  if (!proxyGateVerified) {
    if (proxyGatePending || proxyGateRetryTimer) return;
    proxyGatePending = true;
    void verifyMessengerProxy().then(() => {
      proxyGateVerified = true;
      proxyGatePending = false;
      proxyGateRetryAttempt = 0;
      console.log("[PROXY] Egress verification passed; Messenger login may proceed.");
      attemptLogin();
    }).catch((error) => {
      proxyGatePending = false;
      proxyGateRetryAttempt += 1;
      const backoffMs = Math.min(
        MAX_LOGIN_BACKOFF_MS,
        5_000 * (2 ** Math.min(proxyGateRetryAttempt - 1, 6))
      );
      dashboardLoginError = "Messenger login is waiting for the configured proxy to become reachable. The session is preserved; proxy verification will retry automatically.";
      const safeMessage = String(error?.message || "verification failed")
        .replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/gi, "http://[redacted]@")
        .replace(/([?&](?:access_token|token|session|cookie|password)=)[^&\s]+/gi, "$1[redacted]")
        .slice(0, 200);
      console.error("[PROXY] Egress verification failed: " + safeMessage);
      pushDashboardEvent("proxy", dashboardLoginError, {
        failure_kind: "proxy_verification_failed",
        retry_in_ms: backoffMs,
        attempt: proxyGateRetryAttempt,
      });
      proxyGateRetryTimer = setTimeout(() => {
        proxyGateRetryTimer = null;
        attemptLogin();
      }, backoffMs);
    });
    return;
  }

  const isReplacementSession = Boolean(pendingFacebookAppState);

  // A healthy active listener owns the connection. Do not create a second
  // login/listener unless the dashboard explicitly supplied a replacement
  // session to validate.
  if (
    activeMessengerApi &&
    activeListenerGeneration > 0 &&
    !isReplacementSession
  ) {
    console.warn(
      "[LOGIN] Skipping login attempt: an active Messenger listener already owns the connection."
    );
    return;
  }

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
  let loginRequiredHandled = false;

  const handleLoginRequiredResponse = (error) => {
    if (thisGeneration !== listenerGeneration || loginRequiredHandled) return true;
    loginRequiredHandled = true;
    loginSettled = true;
    const safeTrace = getSafeLoginFailureTrace(error);
    const parserDiagnostics = getSafeLoginParserDiagnostics(error);

    if (!isReplacementSession && fallbackFromRejectedDurableSession()) {
      dashboardLoginError = "Facebook returned its login page for the durable session; trying the separately configured FB_COOKIES session once.";
      console.warn("[AUTH] Durable session was not accepted; trying FB_COOKIES once.");
      pushDashboardEvent("login-failed", dashboardLoginError, { detail: safeTrace, parser_diagnostics: parserDiagnostics, attempt: loginAttempt + 1, session_source: "durable", failure_kind: "facebook_login_required" });
      loginInProgress = false;
      if (loginRetryTimer) clearTimeout(loginRetryTimer);
      loginRetryTimer = setTimeout(() => { loginRetryTimer = null; attemptLogin(); }, 100);
      return true;
    }

    if (isReplacementSession) {
      pendingFacebookAppState = null;
      dashboardLoginError = activeMessengerApi
        ? "Facebook returned its login page for the uploaded replacement session; the existing Messenger connection was kept."
        : "Facebook returned its login page for the uploaded session. Upload a fresh Facebook session export or cookie header.";
    } else if (appStateSource === "fb_cookies") {
      dashboardLoginError = "Facebook returned its login page for FB_COOKIES. Those cookies were not accepted; upload a fresh Facebook session export or cookie header.";
    } else {
      dashboardLoginError = "Facebook returned its login page instead of an authenticated Messenger session. The stored session was not accepted; upload a fresh Facebook session export or cookie header.";
    }
    console.error("[AUTH] Saved-session revalidation was rejected. Automatic retries are paused; upload a fresh session from the dashboard.");
    console.error("[LOGIN][SESSION] " + dashboardLoginError);
    console.error("[LOGIN][SESSION] Safe failure trace:\\n" + safeTrace);
    if (parserDiagnostics) console.error("[LOGIN][SESSION] Safe parser diagnostics: " + JSON.stringify(parserDiagnostics));
    pushDashboardEvent("login-failed", dashboardLoginError, { detail: safeTrace, parser_diagnostics: parserDiagnostics, attempt: loginAttempt + 1, session_source: isReplacementSession ? "replacement" : appStateSource, failure_kind: "facebook_login_required" });
    loginInProgress = false;
    if (!activeMessengerApi) watchdogSetMessengerConnected(false);
    if (loginRetryTimer) { clearTimeout(loginRetryTimer); loginRetryTimer = null; }
    return true;
  };
  const handleLoginInvocationFailure = (error) => {
    if (
      loginSettled ||
      thisGeneration !== listenerGeneration
    ) {
      return;
    }

    if (isWs3FcaLoginRequired(error)) {
      handleLoginRequiredResponse(error);
      return;
    }

    loginSettled = true;
    dashboardLoginError = getFacebookLoginErrorMessage(error);

    // ws3-fca 3.5.2 can throw inside buildAPI before it reaches the normal
    // authentication callback. This is a response-parser failure, not proof
    // that the supplied cookies are invalid. Preserve the session and pause
    // automatic retries so we do not repeatedly hit Facebook or discard a
    // potentially valid durable checkpoint.
    if (isWs3FcaBuildApiParserFailure(error)) {
      dashboardLoginError =
        "ws3-fca could not parse the Facebook login response (buildAPI parser failure). Session was preserved; automatic login retries are paused pending diagnostics.";
      console.error("[LOGIN][PARSER] " + dashboardLoginError);
      console.error("[LOGIN][PARSER] Safe failure trace:\\n" + getSafeLoginFailureTrace(error));
      const parserDiagnostics = getSafeLoginParserDiagnostics(error);
      if (parserDiagnostics) console.error("[LOGIN][PARSER] Safe parser diagnostics: " + JSON.stringify(parserDiagnostics));
      pushDashboardEvent("login-failed", dashboardLoginError, {
        detail: getSafeLoginFailureTrace(error),
        parser_diagnostics: getSafeLoginParserDiagnostics(error),
        attempt: loginAttempt + 1,
        session_source: isReplacementSession ? "replacement" : appStateSource,
        failure_kind: "ws3_fca_buildapi_parser",
      });
      loginInProgress = false;
      if (loginRetryTimer) {
        clearTimeout(loginRetryTimer);
        loginRetryTimer = null;
      }
      return;
    }

    console.error(`[LOGIN] Login invocation failed: ${dashboardLoginError}`);
    pushDashboardEvent("login-failed", "Messenger login invocation failed: " + dashboardLoginError.slice(0, 240), {
      detail: dashboardLoginError.slice(0, 240),
      attempt: loginAttempt + 1,
      session_source: isReplacementSession ? "replacement" : appStateSource,
    });

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
    const { rateLimited: loginRateLimited } = classifyListenerError(dashboardLoginError);
    if (loginRateLimited) rateLimitFailureCount++;
    const backoffMs = loginRateLimited
      ? getListenerRecoveryDelayMs({ rateLimited: true, failureCount: rateLimitFailureCount })
      : getLoginRetryDelayMs(loginAttempt, MAX_LOGIN_BACKOFF_MS);

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
      { appState: loginInput },
      {
        online: true,
        updatePresence: true,
        selfListen: false,
        randomUserAgent: false,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        autoMarkDelivery: true,
        autoReconnect: true,
        forceLogin: false,
        proxy: getMessengerProxyUrl(),
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
        if (isWs3FcaLoginRequired(loginError)) {
          handleLoginRequiredResponse(loginError);
          return;
        }

        dashboardLoginError = getFacebookLoginErrorMessage(
          loginError || "No API object returned."
        );

        // ws3-fca can report its buildAPI parser exception through the
        // callback rather than rejecting the login invocation Promise.
        // This is not evidence that the Facebook session is invalid.
        if (isWs3FcaBuildApiParserFailure(loginError)) {
          dashboardLoginError =
            "ws3-fca could not parse the Facebook login response (buildAPI parser failure). Session was preserved; automatic login retries are paused pending diagnostics.";
          const safeTrace = getSafeLoginFailureTrace(loginError);
          console.error("[LOGIN][PARSER] " + dashboardLoginError);
          console.error("[LOGIN][PARSER] Safe failure trace:\\n" + safeTrace);
          const parserDiagnostics = getSafeLoginParserDiagnostics(loginError);
          if (parserDiagnostics) console.error("[LOGIN][PARSER] Safe parser diagnostics: " + JSON.stringify(parserDiagnostics));
          pushDashboardEvent("login-failed", dashboardLoginError, {
            detail: safeTrace,
            parser_diagnostics: getSafeLoginParserDiagnostics(loginError),
            attempt: loginAttempt + 1,
            session_source: isReplacementSession ? "replacement" : appStateSource,
            failure_kind: "ws3_fca_buildapi_parser",
          });
          loginInProgress = false;
          if (loginRetryTimer) {
            clearTimeout(loginRetryTimer);
            loginRetryTimer = null;
          }
          return;
        }

        pushDashboardEvent("login-failed", "Messenger login was rejected: " + dashboardLoginError.slice(0, 240), {
          detail: dashboardLoginError.slice(0, 240),
          attempt: loginAttempt + 1,
          session_source: isReplacementSession ? "replacement" : appStateSource,
        });

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
        const { rateLimited: loginRateLimited } = classifyListenerError(dashboardLoginError);
        if (loginRateLimited) rateLimitFailureCount++;
        const backoffMs = loginRateLimited
          ? getListenerRecoveryDelayMs({ rateLimited: true, failureCount: rateLimitFailureCount })
          : getLoginRetryDelayMs(loginAttempt, MAX_LOGIN_BACKOFF_MS);

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
      rateLimitFailureCount = 0;
      authRejectionRetryUsed = false;
      loginInProgress = false;
      dashboardLoginError = null;

      mqttReconnectFatal = false;
      mqttReconnectAttempt = 0;
      if (mqttReconnectTimer) {
        clearTimeout(mqttReconnectTimer);
        mqttReconnectTimer = null;
      }

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

      // If the adapter did not return a refreshed state, persist the exact
      // replacement cookie set that just authenticated instead of retaining
      // the previous account's durable checkpoint.
      if (pendingFacebookAppState) {
        appState = pendingFacebookAppState;
        pendingFacebookAppState = null;
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

      // Promote this API to connection owner only after the login succeeded.
      // A replacement-session login is allowed while the old session remains
      // healthy; stop that old listener before attaching the replacement so
      // only one MQTT consumer can process messages.
      const previousApi = activeMessengerApi;
      const previousRawApi =
        previousApi && previousApi.__eclipseTrafficRawApi
          ? previousApi.__eclipseTrafficRawApi
          : previousApi;

      if (previousApi && previousApi !== api) {
        activeListenerGeneration = 0;
        try {
          if (typeof activeMqttStopHandle === "function") {
            activeMqttStopHandle();
          } else if (typeof previousApi.stopListenMqtt === "function") {
            previousApi.stopListenMqtt();
          } else if (
            previousRawApi &&
            typeof previousRawApi.stopListenMqtt === "function"
          ) {
            previousRawApi.stopListenMqtt();
          }
          activeMqttStopHandle = null;
          activeMqttListenerCallback = null;
        } catch (stopError) {
          console.warn(
            "[LISTENER] Could not stop previous listener before replacement:",
            stopError?.message || stopError
          );
        }
        console.log("[LISTENER] Previous Messenger listener stopped before replacement.");
      }

      activeListenerGeneration = thisGeneration;

      // This generation now owns message processing. Any older
      // listener callback will fail the generation check below.
      api = installTrafficGovernor(api) || api;
      activeMessengerApi = api;
      const previousMessengerUserID = String(eclipseUserID || "").trim();

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

      if (
        previousMessengerUserID &&
        eclipseUserID &&
        previousMessengerUserID !== eclipseUserID
      ) {
        activeThreads.clear();
        dashboardKnownGroups.clear();
        dashboardSavedGroupDirectoryCleared = false;
        archivedDashboardGroups.clear();
        archivedDashboardGroupsLoadedAt = 0;
        console.log("[DASHBOARD] Messenger identity changed; cleared previous account's cached group discovery state.");
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

      // Restore unfinished Jaiden Target countdowns from PostgreSQL.
      try {
        await jaidenTargetCountdown.restore(api);
      } catch (error) {
        console.error("[JAIDEN COUNTDOWN] Startup restore failed:", error?.message || error);
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
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        autoMarkDelivery: true,
        autoReconnect: true,
        selfListen: false,
        forceLogin: false,
        pageID: null,
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

      activeMqttListenerCallback = (
          listenError,
          event
        ) => {
          if (event && typeof event === "object") {
            lastMqttActivity = Date.now();
            mqttReconnectAttempt = 0;
            mqttReconnectFatal = false;
          }
          watchdogRecordListenerActivity();

          if (thisGeneration !== activeListenerGeneration) {
            return;
          }

          if (activeMessengerApi && activeMessengerApi !== api) {
            return;
          }

          if (listenError) {
            // ws3-fca's MQTT error path may call mqttClient.end() before
            // invoking this callback. In that state, leaving activeMessengerApi
            // marked connected prevents our own login recovery from running.
            listenFailureCount++;

            const normalizedListenerError = getFacebookLoginErrorMessage(listenError);
            const nestedRateLimitCode = normalizedListenerError.includes("1675004") ? "1675004" : null;
            const listenErrorSummary = {
              type: Array.isArray(listenError) ? "array" : typeof listenError,
              name: typeof listenError?.name === "string" ? listenError.name : null,
              message: normalizedListenerError.slice(0, 300),
              code: nestedRateLimitCode || listenError?.code || listenError?.errorCode || null,
              keys: listenError && typeof listenError === "object" ? Object.keys(listenError).slice(0, 12) : [],
              arrayLength: Array.isArray(listenError) ? listenError.length : undefined,
            };
            console.error("[LISTENER] Structured error summary:", JSON.stringify(listenErrorSummary));
            console.error("[LISTENER] ws3-fca reported a listener error:", listenError);

            const listenerErrorText = normalizedListenerError + " " + String(listenErrorSummary.code || "");
            const { authRejected, rateLimited } = classifyListenerError(listenerErrorText);

            // Invalidate this listener generation before detaching the API so
            // late callbacks from the dead MQTT client cannot process messages.
            if (thisGeneration === activeListenerGeneration) {
              activeListenerGeneration = 0;
              listenerGeneration++;
              watchdogSetMessengerConnected(false);
              dashboardLastDisconnectedAt = new Date().toISOString();

              try {
                if (typeof activeMqttStopHandle === "function") {
                  activeMqttStopHandle();
                } else if (typeof api.stopListenMqtt === "function") {
                  api.stopListenMqtt();
                }
                activeMqttStopHandle = null;
                activeMqttListenerCallback = null;
                if (rawApiForListener) listenerStartedApis.delete(rawApiForListener);
              } catch (stopError) {
                console.warn("[LISTENER] Could not stop failed MQTT listener cleanly:", stopError?.message || stopError);
              }

              if (activeMessengerApi === api || activeMessengerApi === rawApiForListener) {
                activeMessengerApi = null;
              }
            }

            if (authRejected) {
              mqttReconnectFatal = true;
              if (mqttReconnectTimer) {
                clearTimeout(mqttReconnectTimer);
                mqttReconnectTimer = null;
              }
              dashboardLoginError = getFacebookLoginErrorMessage(listenError);
              pushDashboardEvent("login-failed", "Messenger listener stopped because Facebook rejected the session. Reconnect the account from the dashboard.", {
                detail: String(dashboardLoginError || "Facebook session rejected").slice(0, 240),
              });
              if (!authRejectionRetryUsed && !loginRetryTimer && !watchdogShuttingDown) {
                authRejectionRetryUsed = true;
                const retryDelayMs = 30_000;
                dashboardLoginError = "Facebook rejected the active listener. ECLIPSE will revalidate the saved session once in 30 seconds; if Facebook rejects that login too, a fresh session will be required.";
                pushDashboardEvent("messenger", "A one-time saved-session revalidation was scheduled after the listener logout.", {
                  retry_after_ms: retryDelayMs,
                  failure_kind: "listener_auth_rejected",
                });
                console.warn("[AUTH] Scheduling one controlled saved-session revalidation in 30000ms.");
                loginRetryTimer = setTimeout(() => {
                  loginRetryTimer = null;
                  if (!watchdogShuttingDown && !activeMessengerApi && activeListenerGeneration <= 0) {
                    attemptLogin();
                  }
                }, retryDelayMs);
              } else {
                console.error("[AUTH] Saved-session revalidation already used or unavailable; a fresh session may be required.");
              }
              return;
            }

            // Recover a dead listener through one controlled fresh login.
            // Rate-limit failures use an escalating cooldown (2, 4, 8, then
            // 15 minutes) so repeated rejections do not create a login loop.
            if (!loginRetryTimer) {
              if (rateLimited) rateLimitFailureCount++;
              const recoveryDelayMs = getListenerRecoveryDelayMs({
                rateLimited,
                failureCount: rateLimitFailureCount,
              });
              const waitMinutes = Math.ceil(recoveryDelayMs / 60_000);
              dashboardLoginError = rateLimited
                ? "Messenger was rate-limited; waiting " + waitMinutes + " minute(s) before reconnecting."
                : "Messenger listener dropped; retrying the saved session in 30 seconds.";
              pushDashboardEvent("messenger", "Messenger listener failed; a controlled reconnect has been scheduled.", {
                detail: String(dashboardLoginError).slice(0, 240),
                retry_after_ms: recoveryDelayMs,
              });
              console.warn("[LISTENER] Scheduling fresh Messenger login in " + recoveryDelayMs + "ms (rateLimited=" + rateLimited + ").");

              loginRetryTimer = setTimeout(() => {
                loginRetryTimer = null;
                if (!watchdogShuttingDown && !activeMessengerApi && activeListenerGeneration <= 0) {
                  attemptLogin();
                }
              }, recoveryDelayMs);
            }

            return;
          }

          listenFailureCount = 0;
          // Any subsequent healthy listener callback proves the cooldown
          // recovered; start future rate-limit backoff from its first step.
          rateLimitFailureCount = 0;

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

          // Learn sender, mention, join, and nickname names without blocking message handling.
          noteMemberNameEvent(event);

          // Record chat only for groups currently open in the dashboard; closed chats are not buffered.
          liveChat.record(event);

          // Evaluate the incoming-event deduplicator exactly once per event.
          // Calling it once for diagnostics and again for the real filter would
          // mark the event as seen on the first call, then suppress it on the second.
          const passesIncomingFilter = shouldProcessIncomingEvent(event);
          if (["message", "message_reply"].includes(event?.type) && typeof event?.body === "string") {
            const trimmedBody = event.body.trim();
            const commandPrefix = trimmedBody[0];
            if (["!", "/", ".", "\\"].includes(commandPrefix)) {
              console.info("[MESSAGE ROUTER] Command-like Messenger event received:", JSON.stringify({
                eventType: event.type,
                threadPresent: Boolean(event?.threadID),
                senderPresent: Boolean(event?.senderID),
                prefix: commandPrefix,
                bodyLength: trimmedBody.length,
                passesIncomingFilter,
              }));
            }
          }
          if (event?.type === "event" && String(event?.logMessageType || "").startsWith("log:")) {
            const diagnosticData = event?.logMessageData && typeof event.logMessageData === "object"
              ? event.logMessageData
              : {};
            console.log("[AUTOMOD-DIAG] Incoming Messenger system event:", JSON.stringify({
              threadPresent: Boolean(event?.threadID),
              eventType: String(event?.logMessageType || ""),
              adminEvent: diagnosticData.ADMIN_EVENT ?? diagnosticData.admin_event ?? null,
              targetPresent: Boolean(diagnosticData.TARGET_ID ?? diagnosticData.target_id),
              authorPresent: Boolean(event?.author ?? event?.authorID ?? event?.senderID),
              passesIncomingFilter
            }));
            if (!listenError && event) {
            void sharedGcRegistry.syncExisting(api);
            void sharedGcRegistry.onEvent(api, event).catch((error) => {
              console.error("[SHARED-GC-REGISTRY] Event registration failed:", String(error?.message || error).slice(0, 160));
            });
          }

          if (!passesIncomingFilter) {
              console.log("[AUTOMOD-DIAG] System event was rejected by shouldProcessIncomingEvent.");
            }
          }

          if (!passesIncomingFilter) {
            return;
          }
          // AutoMod also watches group photo/name changes. It only acts when
          // the existing per-group !automod setting is enabled.
          // The handler fails closed if the event does not identify its actor.
          if (event.type === "event") {
            void antiSpam.onGroupEvent(api, event).catch((error) => {
              console.error("[AUTOMOD-PROFILE] Unhandled profile-event check:", error);
            });
            void handleNicknameGuardEvent(api, event).catch((error) => {
              console.error("[NICK GUARD] Event handler failed:", error);
            });
            void handleGroupProfileEvent(api, event).catch((error) => {
              console.error("[PROFILE-GUARD] Event-triggered verification failed:", error);
            });
            return;
          }

          // Reaction updates are distinct MQTT event types, not ordinary messages.
          // Route only to AutoMod; never send reaction payloads through commands/AI.
          if (
            (["message_reaction", "messageReactionAdd", "reaction"].includes(event.type)) &&
            event.threadID
          ) {
            void antiSpam.onMessage(api, event).catch(error => {
              console.error("[AUTOMOD-SPAM] Unhandled reaction-check error:", error);
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

            void pmBattles.handleIncoming(api, event).then((handled) => {
              if (handled) return;
              return handleMessage(api, event);
            }).catch((error) => {
              console.error(
                "[MESSAGE ROUTER] Unhandled PM Battle/message handler failure:",
                error?.stack || error?.message || error
              );
            });
          }
        };
      activeMqttStopHandle = attachMqttListener(api, activeMqttListenerCallback);
      lastMqttListenerAttachAt = Date.now();
    }
    );

    startMqttActivityWatchdog();
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
  // FB_COOKIES fallback in place. attemptLogin() owns the single shared
  // login path so startup and every dashboard login route behave identically.
  await loadPersistedFacebookSessionState();
  attemptLogin();
}

void initializeMessengerSession();

const appStatePersistenceTimer = setInterval(() => {
  void persistAppStateFile();
}, 20 * 60_000);
appStatePersistenceTimer.unref?.();

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

  const incomingBody = typeof body === "string" ? body.trim() : "";
  const isIncomingCommand =
    ["message", "message_reply"].includes(event?.type) &&
    /^[!/.\\]/.test(incomingBody);
  if (isIncomingCommand && typeof api.markAsRead === "function") {
    const markReadDelayMs = 500 + Math.floor(Math.random() * 601);
    await new Promise(resolve => setTimeout(resolve, markReadDelayMs));
    try {
      const markReadResult = api.markAsRead(threadID, error => {
        if (error) console.warn("[MESSAGE ROUTER] markAsRead failed:", error?.message || error);
      });
      if (markReadResult && typeof markReadResult.then === "function") {
        markReadResult.catch(error => console.warn("[MESSAGE ROUTER] markAsRead failed:", error?.message || error));
      }
    } catch (error) {
      console.warn("[MESSAGE ROUTER] markAsRead failed:", error?.message || error);
    }
  }

  void handleTargetedLaughReaction(api, event, db).catch(error => {
    console.error("[TARGETED-LAUGH] Message reaction handler failed:", error?.message || error);
  });

  // Check archive state once for this event, and track target activity even
  // when the incoming message has no text body (for example, a sticker/photo).
  const countdownArchiveCheck = threadId
    ? isDashboardGroupArchived(threadId)
    : Promise.resolve(false);
  if (threadId) {
    void countdownArchiveCheck.then((archived) => {
      if (archived) return;
      return jaidenTargetCountdown.onMessage({
        api,
        threadId,
        senderId: String(senderID || "").trim(),
        messageBody: String(event?.body || ""),
      });
    }).catch((error) => {
      console.error("[JAIDEN COUNTDOWN] Activity tracker failed:", error?.message || error);
    });
  }

  const hasBroadcastImage =
    Boolean(
      getBroadcastImageAttachment(event)
    );

  const stickerOnlyEvent =
    event?.type === "message" ||
    event?.type === "message_reply"
      ? (Array.isArray(event?.attachments) &&
          event.attachments.some(item =>
            String(item?.type || item?.attachmentType || "").toLowerCase() === "sticker" ||
            Boolean(item?.stickerID || item?.stickerId || item?.packID && item?.spriteUrl)
          ) &&
          !(typeof body === "string" && body.trim()))
      : false;

  // Sticker-only messages have no body, so the normal command router must
  // not discard them before AutoMod sees them.
  if (stickerOnlyEvent && threadId) {
    void antiSpam.onMessage(api, event).catch(error => {
      console.error("[AUTOMOD-SPAM] Unhandled sticker-check error:", error);
    });
    return;
  }

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

  // ==========================================================
  // BANAT — BOT / ECLIPSE ADMIN REACTION
  // ==========================================================
  // Reaction eligibility is intentionally restricted to:
  //   1) ECLIPSE itself, or
  //   2) the configured ECLIPSE admin/owner.
  //
  // Everyone else is ignored. The bot's own outgoing events are still
  // stopped from entering the normal Banat response pipeline below.
  // ==========================================================

  // Reactions are part of Banat, not a standalone always-on feature.
  // Enable them only while this group has one of its Banat modes active:
  // / pool (roast_enabled), \\ pool (slash_pool_enabled), or Jaiden
  // Target Banat (a saved target, including the explicit ! mode).
  let banatReactionModeEnabled = false;
  try {
    const [threadSettings, savedBanatTarget] = await Promise.all([
      db.getThreadSettings(threadId),
      db.getBanatThreadTarget(threadId),
    ]);
    banatReactionModeEnabled =
      threadSettings?.roast_enabled === true ||
      threadSettings?.slash_pool_enabled === true ||
      Boolean(String(savedBanatTarget?.target_user_id || "").trim());
  } catch (reactionSettingsError) {
    // Fail closed: if Banat state cannot be confirmed, do not react.
    console.warn(
      "[BANAT] Skipping laugh reaction because Banat mode could not be verified:",
      reactionSettingsError?.message || reactionSettingsError
    );
  }

  const reactionSenderAllowed =
    banatReactionModeEnabled &&
    (
      (dashboardReactionConfig.eclipse_messages && senderId === eclipseUserID) ||
      (dashboardReactionConfig.owner_messages && isOwner(senderId))
    );

  if (
    reactionSenderAllowed &&
    event.messageID &&
    api &&
    (
      typeof api.setMessageReactionMqtt === "function" ||
      typeof api.setMessageReaction === "function"
    )
  ) {
    const messageID = String(event.messageID);
    const reactionLabel =
      senderId === eclipseUserID ? "bot message" : "admin message";
    const reactionDelayMs = 3000 + Math.floor(Math.random() * 3001);

    // Delay the self/owner laugh reaction so it feels less instantaneous.
    // The inclusive range is 3,000–6,000 ms and does not block message handling.
    setTimeout(() => {
      try {
        const reactionCallback = (reactionError) => {
          if (reactionError) {
            console.error(
              "[BANAT] Allowed-sender laugh reaction failed:",
              reactionError
            );
          } else {
            console.log(
              "[BANAT] Reaction API callback completed without error for " +
                reactionLabel +
                " after " + reactionDelayMs + "ms:",
              messageID
            );
          }
        };

        if (typeof api.setMessageReactionMqtt === "function") {
          setMessageReactionMqtt(api, dashboardReactionConfig.reaction, messageID, threadId)
            .then(result => {
              console.log("[BANAT] Allowed-sender reaction published:", {
                reaction: reactionLabel, messageID, acknowledged: result?.acknowledged === true
              });
            })
            .catch(reactionError => console.error("[BANAT] Allowed-sender laugh reaction failed:", reactionError));
        } else if (typeof api.setMessageReaction === "function") {
          Promise.resolve(api.setMessageReaction(dashboardReactionConfig.reaction, messageID))
            .then(() => console.log("[BANAT] Allowed-sender reaction completed:", reactionLabel, messageID))
            .catch(reactionError => console.error("[BANAT] Allowed-sender laugh reaction failed:", reactionError));
        } else {
          console.warn("[BANAT] Reaction API is unavailable.");
        }
      } catch (reactionError) {
        console.error(
          "[BANAT] Allowed-sender laugh reaction error:",
          reactionError
        );
      }
    }, reactionDelayMs);
  }

  // ECLIPSE's own outgoing messages must never enter the normal Banat
  // response pipeline. Its message may be reacted to above, but it must
  // not cause another Banat reply.
  if (
    eclipseUserID &&
    senderId === eclipseUserID
  ) {
    return;
  }


  // Archived GCs are intentionally ignored by all bot features until restored
  // from the dashboard, including commands, Banat, games, and automod.
  if (await countdownArchiveCheck) return;

  // Keep spam monitoring independent of owner presence and the normal bot toggle.
  // The detector serializes events per member and uses persistent group settings.
  void antiSpam.onMessage(api, event).catch(error => {
    console.error("[AUTOMOD-SPAM] Unhandled message-check error:", error);
  });

  const senderIsAdmin =
    isAdmin(senderId);

  // Force-post the current or most recently interrupted Jaiden countdown receipt.
  // This is handled before group-off and Banat routing so admins can use it
  // even when ordinary group automation is disabled.
  if (/^!lapagresibo$/i.test(originalText)) {
    if (!senderIsAdmin) {
      sendReplyWithTyping(api, "🔒 ADMIN ONLY. Only configured bot admins can force a countdown resibo.", threadID);
      return;
    }
    const receiptResult = await jaidenTargetCountdown.forceReceipt(threadId);
    if (!receiptResult.sent) {
      const message = receiptResult.reason === "NO_ACTIVE_COUNTDOWN"
        ? "Walang active Jaiden countdown or interrupted run to report in this GC."
        : receiptResult.reason === "NO_COUNTDOWN_TO_REPORT"
          ? "Wala pang countdown na nagsimula para may resibo."
          : "Hindi naipadala ang resibo. Try !lapagresibo again.";
      sendReplyWithTyping(api, message, threadID);
    }
    return;
  }

  // A disabled group ignores normal commands and automatic replies.
  // Keep owner SetNN and explicit bot/pause controls available.
  try {
    const threadSettings = await db.getThreadSettings(threadId);
    const allowedWhileGroupOff =
      /^\.setnn(?:\s|$)/i.test(originalText) ||
      /^\.removenn(?:\s|$)/i.test(originalText) ||
      /^\/$/.test(originalText) ||
      /^\\$/.test(originalText) ||
      /^!(?:pause(?:\s+status)?|resume|bot(?:\s+(?:on|off|status))?|shutdown|startup|game(?:\s+(?:on|off|status))?|automod(?:\s+(?:on|off|status))?|lapagresibo)$/i.test(originalText);
    if (threadSettings.bot_enabled === false && !allowedWhileGroupOff) {
      return;
    }
  } catch (error) {
    console.error("[DASHBOARD] Could not read group bot setting:", error);
  }

  // ==========================================================
  // MASS NICKNAME GUARD — OWNER ONLY
  // .setnn <nickname> -> set the same nickname for every member
  // .setnn off       -> remove all protected mass nicknames
  //
  // The run is checkpointed in Neon so a Facebook nickname mutation
  // block does not make the next .setnn restart from member #1.
  // ==========================================================

  // SINGLE-MEMBER SETNN — does not create or alter the mass SetNN job.
  // Usage: reply to a member's message with ".setnn one nickname".
  // Or mention them: ".setnn one @member -- nickname".
  const setSingleNicknameMatch =
    originalText.match(/^\.setnn\s+one(?:\s+([\s\S]+))?$/i);

  if (setSingleNicknameMatch) {
    if (!isOwner(senderId)) {
      sendReplyWithTyping(api, "🔒 .setnn is owner-only.", threadID);
      return;
    }

    const rawSingleNickname = String(setSingleNicknameMatch[1] || "").trim();
    const repliedMemberID = String(
      event?.messageReply?.senderID ||
      event?.messageReply?.senderId ||
      event?.messageReply?.sender_id ||
      ""
    ).trim();
    const mentionedIDs = event?.mentions && typeof event.mentions === "object"
      ? Object.keys(event.mentions).map((id) => String(id).trim()).filter(Boolean)
      : [];
    const participantID = repliedMemberID || mentionedIDs[0] || "";

    let requestedSingleNickname = rawSingleNickname;
    if (!repliedMemberID && mentionedIDs.length) {
      const delimiterMatch = rawSingleNickname.match(/--\s*([\s\S]+)$/);
      requestedSingleNickname = delimiterMatch ? delimiterMatch[1].trim() : "";
    }

    if (!participantID) {
      sendReplyWithTyping(
        api,
        "🎀 Reply to the member's message with .setnn one nickname, or use .setnn one @member -- nickname.",
        threadID
      );
      return;
    }

    if (
      !requestedSingleNickname ||
      requestedSingleNickname.length > 80 ||
      /[\u0000-\u001f\u007f]/.test(requestedSingleNickname) ||
      /^off$/i.test(requestedSingleNickname)
    ) {
      sendReplyWithTyping(
        api,
        "⏱️ Nickname must be 1–80 characters. Reply to a member with .setnn one nickname.",
        threadID
      );
      return;
    }

    try {
      if (typeof api?.getThreadInfo !== "function") {
        throw new Error("This ws3-fca build does not expose api.getThreadInfo().");
      }

      const threadInfo = await new Promise((resolve, reject) => {
        let settled = false;
        const timeout = setTimeout(() => done(new Error("getThreadInfo timed out after 5000ms")), 5000);
        const done = (error, info) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (error) reject(error);
          else resolve(info || {});
        };

        try {
          const result = api.getThreadInfo(String(threadID), done);
          if (result && typeof result.then === "function") {
            result.then((info) => done(null, info)).catch(done);
          }
        } catch (error) {
          done(error);
        }
      });

      const participantIDs = Array.isArray(threadInfo?.participantIDs)
        ? threadInfo.participantIDs.map((id) => String(id || "").trim())
        : [];

      if (!participantIDs.includes(participantID)) {
        sendReplyWithTyping(api, "🔎 That account is not listed as a member of this group.", threadID);
        return;
      }

      const botID = String(
        typeof api.getCurrentUserID === "function" ? api.getCurrentUserID() : eclipseUserID || ""
      ).trim();
      if (botID && participantID === botID) {
        sendReplyWithTyping(api, "⛔ I can't set a nickname for the bot account.", threadID);
        return;
      }

      await changeNicknameAsync(api, requestedSingleNickname, threadID, participantID);

      const protectedNicknames = await getProtectedNicknames(threadID);
      protectedNicknames[participantID] = requestedSingleNickname;
      await setProtectedNicknames(threadID, senderId, protectedNicknames);

      console.log(
        "[NICK GUARD] Single-member SetNN in " + threadID +
        " for " + participantID + " -> " + JSON.stringify(requestedSingleNickname)
      );
      sendReplyWithTyping(
        api,
        "🎀 Nickname updated for that member only: " + requestedSingleNickname,
        threadID
      );
    } catch (error) {
      const errorText = [
        error?.error,
        error?.errorSummary,
        error?.errorDescription?.__html,
        error?.errorDescription,
        error?.message
      ].filter(Boolean).join(" ");
      const priorMessageRequired =
        /thread that doesn't exist[\s\S]*at least one message in the thread/i.test(errorText);
      console.error("[NICK GUARD] Single-member .setnn failed:", error);
      sendReplyWithTyping(
        api,
        priorMessageRequired
          ? "⚠️ Messenger won't allow that nickname yet. That member may need to send at least one message in this group first."
          : "🔴 Could not update that member's nickname: " + errorText.slice(0, 180),
        threadID
      );
    }

    return;
  }

  // MASS REMOVE NICKNAMES — OWNER ONLY
  // .removenn [seconds] clears custom nicknames for all other GC members.
  const removeNicknameMatch =
    originalText.match(/^\.removenn(?:\s+(\d+))?$/i);

  if (removeNicknameMatch) {
    if (!isOwner(senderId)) {
      sendReplyWithTyping(api, "🔒 .removenn is owner-only.", threadID);
      return;
    }

    const requestedIntervalSeconds = removeNicknameMatch[1]
      ? Number(removeNicknameMatch[1])
      : null;

    if (
      requestedIntervalSeconds !== null &&
      (!Number.isInteger(requestedIntervalSeconds) ||
        requestedIntervalSeconds < 2 ||
        requestedIntervalSeconds > 60)
    ) {
      sendReplyWithTyping(
        api,
        "⏱️ .removenn interval must be between 2 and 60 seconds. Example: .removenn 10",
        threadID
      );
      return;
    }

    try {
      const threadInfo = await dashboardGetThreadInfo(api, threadID);
      const botID = String(
        typeof api.getCurrentUserID === "function"
          ? api.getCurrentUserID()
          : eclipseUserID || ""
      ).trim();

      const participantIDs = new Set(
        await dashboardGetParticipantIds(api, threadID, threadInfo)
      );

      if ([...participantIDs].filter(id => id !== botID).length === 0) {
        try {
          const listedThreads = await dashboardGetThreadList(api);
          const listedGroup = listedThreads.find(item =>
            String(item?.threadID || item?.threadId || item?.thread_id || "") === String(threadID)
          );
          if (listedGroup) {
            for (const source of [
              listedGroup.participantIDs,
              listedGroup.userInfo,
              listedGroup.participants,
              listedGroup.participantList,
              listedGroup.participant_list,
            ]) {
              for (const id of dashboardParticipantIdsFrom(source)) {
                participantIDs.add(id);
              }
            }
          }
        } catch (fallbackError) {
          console.warn(
            "[NICK GUARD] .removenn participant fallback failed: " +
              String(fallbackError?.message || fallbackError).slice(0, 160)
          );
        }
      }

      const targets = [...participantIDs].filter(id => id && id !== botID);
      if (!targets.length) {
        sendReplyWithTyping(api, "🎀 walang target members sa GC.", threadID);
        return;
      }

      // Remove stale protected nicknames first, so .nn does not restore a
      // raider's nickname after it is cleared. Preserve the owner's own guard.
      const protectedNicknames = await getProtectedNicknames(threadID);
      const ownerProtectedNickname = protectedNicknames[String(senderId)];
      await setProtectedNicknames(
        threadID,
        senderId,
        ownerProtectedNickname
          ? { [String(senderId)]: ownerProtectedNickname }
          : {}
      );

      // Stop any saved .setnn run so it cannot re-apply the unwanted nickname.
      await clearMassNicknameRun(threadID);

      const minDelay = requestedIntervalSeconds !== null
        ? requestedIntervalSeconds * 1000
        : Math.max(4000, Number(process.env.ECLIPSE_SETNN_MIN_DELAY_MS || 4000));
      let cleared = 0;
      let alreadyBlank = 0;
      let failed = 0;
      let rateBlocked = false;

      for (let i = 0; i < targets.length; i++) {
        const participantID = targets[i];
        const hasNicknameSnapshot =
          Boolean(
            threadInfo?.nicknames &&
            typeof threadInfo.nicknames === "object" &&
            !Array.isArray(threadInfo.nicknames)
          );
        const currentNickname = String(
          threadInfo?.nicknames?.[participantID] ||
          threadInfo?.nicknames?.[String(participantID)] ||
          ""
        ).trim();

        // Unlike .setnn, removenn must not interpret a failed/incomplete
        // getThreadInfo response as proof that every nickname is already blank.
        // If Messenger supplied a real nicknames map, an absent entry means
        // there is nothing to clear; without that map, attempt the same
        // per-member mutation used by .setnn instead of silently skipping.
        if (hasNicknameSnapshot && !currentNickname) {
          alreadyBlank++;
          continue;
        }

        try {
          // An empty nickname asks Messenger to remove the custom nickname.
          await changeNicknameAsync(api, "", threadID, participantID);
          cleared++;
        } catch (error) {
          const errorCode = Number(
            error?.error ?? error?.code ?? error?.errorCode ??
            error?.response?.error ?? 0
          );
          const errorText = [
            error?.errorSummary,
            error?.errorDescription?.__html,
            error?.errorDescription,
            error?.message,
          ].filter(Boolean).join(" ");

          if (
            errorCode === 3252001 ||
            /temporarily blocked|going too fast|rate.?limit/i.test(errorText)
          ) {
            rateBlocked = true;
            console.warn("[NICK GUARD] .removenn stopped by Messenger rate limit.");
            break;
          }

          failed++;
          console.error(
            "[NICK GUARD] .removenn failed for " + participantID + ":",
            error
          );
        }

        if (i < targets.length - 1) {
          await new Promise(resolve => setTimeout(resolve, minDelay));
        }
      }

      sendReplyWithTyping(
        api,
        rateBlocked
          ? "🎀 removenn paused because Facebook rate-limited nickname changes. " +
            cleared + " cleared · " + alreadyBlank + " already blank · " +
            failed + " failed. Wait for the cooldown before running .removenn again."
          : "🎀 removenn done — " + cleared + " cleared · " +
            alreadyBlank + " already blank · " + failed + " failed.",
        threadID
      );
    } catch (error) {
      console.error("[NICK GUARD] .removenn command failed:", error);
      sendReplyWithTyping(
        api,
        "🔴 .removenn could not clear the GC nicknames.",
        threadID
      );
    }

    return;
  }

  const setNicknameMatch =
    originalText.match(/^\.setnn(?:\s+(?:(\d+)\s+)?(.+))?$/i);

  if (setNicknameMatch) {
    if (!isOwner(senderId)) {
      sendReplyWithTyping(
        api,
        "🔒 .setnn is owner-only.",
        threadID
      );
      return;
    }

    const requestedIntervalSeconds =
      setNicknameMatch[1]
        ? Number(setNicknameMatch[1])
        : null;

    const requestedNickname = String(
      setNicknameMatch[2] || ""
    ).trim();

    if (
      requestedIntervalSeconds !== null &&
      (
        !Number.isInteger(requestedIntervalSeconds) ||
        requestedIntervalSeconds < 2 ||
        requestedIntervalSeconds > 60
      )
    ) {
      sendReplyWithTyping(
        api,
        "⏱️ .setnn interval must be between 2 and 60 seconds. Example: .setnn 10 akobudoy",
        threadID
      );
      return;
    }

    try {
      if (!requestedNickname || /^off$/i.test(requestedNickname)) {
        // .setnn off only stops the mass-nickname job. It must NOT delete
        // the independent .nn owner protection or its protected nickname map.
        const removed = await clearMassNicknameRun(threadID);

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

      const configuredMinDelayMs = Math.max(
        2000,
        Number(process.env.ECLIPSE_SETNN_MIN_DELAY_MS || 4000)
      );

      const configuredMaxDelayMs = Math.max(
        configuredMinDelayMs,
        Number(process.env.ECLIPSE_SETNN_MAX_DELAY_MS || 4000)
      );

      // Optional command syntax: .setnn <seconds> <nickname>
      // When supplied, use that exact interval between member changes.
      const HUMAN_NICKNAME_MIN_DELAY_MS =
        requestedIntervalSeconds !== null
          ? requestedIntervalSeconds * 1000
          : configuredMinDelayMs;

      const HUMAN_NICKNAME_MAX_DELAY_MS =
        requestedIntervalSeconds !== null
          ? requestedIntervalSeconds * 1000
          : configuredMaxDelayMs;

      const SETNN_BLOCK_COOLDOWN_MS = Math.max(
        60_000,
        Number(
          process.env.ECLIPSE_SETNN_BLOCK_COOLDOWN_MS ||
            15 * 60 * 1000
        )
      );

      // Use the shared callback-safe lookup. Some ws3-fca builds resolve
      // the returned promise with null before the callback provides thread data.
      const threadInfo = await dashboardGetThreadInfo(api, threadID);

      const botID = String(
        typeof api.getCurrentUserID === "function"
          ? api.getCurrentUserID()
          : eclipseUserID || ""
      ).trim();

      // Member lists differ across ws3-fca versions: participantIDs may be
      // absent while userInfo/participants contain the actual GC roster.
      const resolvedParticipantIDs = await dashboardGetParticipantIds(
        api,
        threadID,
        threadInfo
      );
      let liveParticipantIDs = new Set(resolvedParticipantIDs);

      // If the info endpoint only returned the bot (or an empty list), retry
      // against the matching group entry in the inbox thread list.
      if ([...liveParticipantIDs].filter(id => id !== botID).length === 0) {
        try {
          const listedThreads = await dashboardGetThreadList(api);
          const listedGroup = listedThreads.find(item =>
            String(item?.threadID || item?.threadId || item?.thread_id || "") === String(threadID)
          );
          if (listedGroup) {
            for (const source of [
              listedGroup.participantIDs,
              listedGroup.userInfo,
              listedGroup.participants,
              listedGroup.participantList,
              listedGroup.participant_list,
            ]) {
              for (const id of dashboardParticipantIdsFrom(source)) {
                liveParticipantIDs.add(id);
              }
            }
          }
        } catch (error) {
          console.warn(
            "[NICK GUARD] Could not load fallback member list for " +
              threadID + ": " + String(error?.message || error).slice(0, 160)
          );
        }
      }

      const liveTargets = [...liveParticipantIDs].filter(
        participantID => participantID !== botID
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

        // Never wipe an existing .nn/.setnn protected map when starting
        // another mass run. The owner nickname and any already-protected
        // members must survive a new .setnn command.
        protectedNicknames =
          await getProtectedNicknames(threadID);

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
      let alreadyCorrect = 0;
      let failed = 0;
      // Messenger cannot assign a nickname until the member has sent at
      // least one message in this thread. Keep those IDs for a later retry.
      let deferredTargets = [];
      let rateBlocked = false;
      let transportPaused = false;

      let cancelled = false;

      for (
        let i = nextIndex;
        i < targets.length;
        i++
      ) {
        if (dashboardSetNNStopRequests.has(String(threadID))) {
          cancelled = true;
          await setMassNicknameRun(
            threadID,
            senderId,
            requestedNickname,
            targets,
            i,
            null
          );
          break;
        }

        const participantID =
          targets[i];

        try {
          // Idempotency: do not spend a Messenger nickname write when the
          // member already has the requested nickname.
          const currentNickname = String(
            threadInfo?.nicknames?.[participantID] || ""
          ).trim();

          if (
            currentNickname &&
            currentNickname === requestedNickname
          ) {
            protectedNicknames[
              participantID
            ] = requestedNickname;

            alreadyCorrect++;

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

            console.log(
              "[NICK GUARD] Skipping nickname write for " +
                participantID +
                " because it is already " +
                JSON.stringify(requestedNickname) +
                "."
            );

            continue;
          }

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
          const errorCode = Number(
            error?.error ??
              error?.code ??
              error?.errorCode ??
              error?.response?.error ??
              0
          );

          const errorText = [
            error?.error,
            error?.errorSummary,
            error?.errorDescription?.__html,
            error?.errorDescription,
            error?.message,
          ]
            .filter(Boolean)
            .join(" ");

          const transportUnavailable =
            /Messenger MQTT listener is not active|Messenger MQTT connection is not ready|Timed out waiting for Messenger MQTT|Messenger MQTT connection closed/i.test(errorText);
          if (transportUnavailable) {
            transportPaused = true;
            await setMassNicknameRun(
              threadID,
              senderId,
              requestedNickname,
              targets,
              i,
              null
            );
            console.warn(
              "[NICK GUARD] Paused .setnn at target " + (i + 1) +
              "/" + targets.length + " because Messenger MQTT is reconnecting."
            );
            break;
          }

          const temporarilyBlocked =
            errorCode === 3252001 ||
            /temporarily blocked|going too fast|rate.?limit/i.test(
              errorText
            );
          const requiresPriorThreadMessage =
            /thread that doesn't exist[\s\\S]*at least one message in the thread/i.test(
              errorText
            );

          if (requiresPriorThreadMessage) {
            deferredTargets.push(participantID);
            console.warn(
              "[NICK GUARD] Deferring " + participantID +
                " until they send a message in this GC; Messenger requires prior thread activity for nickname changes."
            );
          } else {
            failed++;
          }

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
          !transportPaused &&
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
        !transportPaused &&
        next >= targets.length &&
        !deferredTargets.length
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
      } else if (!rateBlocked && !transportPaused && deferredTargets.length) {
        // Keep only members who need to speak in the GC before Messenger
        // will accept their nickname mutation. A repeated .setnn resumes
        // this short pending list instead of silently losing these members.
        await setMassNicknameRun(
          threadID,
          senderId,
          requestedNickname,
          deferredTargets,
          0,
          null
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
            alreadyCorrect +
            " already correct · " +
            failed +
            " failed · " +
            skipped +
            " remaining. " +
            "Wait for the cooldown, then run .setnn " +
            requestedNickname +
            " again to resume."
          : transportPaused
          ? "🎀 setnn paused — Messenger is reconnecting. Your progress is saved. Run .setnn " +
            requestedNickname +
            " again after the bot reconnects."
          : cancelled
          ? "🎀 setnn stopped — checkpoint saved at the next member. Run .setnn " +
            requestedNickname +
            " to resume."
          : "🎀 setnn done — " +
            changed +
            " changed" +
            (alreadyCorrect
              ? " · " +
                alreadyCorrect +
                " already correct"
              : "") +
            (failed
              ? " · " +
                failed +
                " failed"
              : "") +
            (deferredTargets.length
              ? " · " + deferredTargets.length +
                " deferred: they must send a message in this GC first. Run .setnn " +
                requestedNickname + " again after they speak"
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
          " alreadyCorrect=" +
          alreadyCorrect +
          " failed=" +
          failed +
          " resumedFrom=" +
          nextIndex
      );

      const outcomeStatus = rateBlocked
        ? "paused"
        : transportPaused
          ? "paused"
          : cancelled
            ? "stopped"
            : deferredTargets.length
              ? "deferred"
              : failed > 0
                ? (changed + alreadyCorrect > 0 ? "partial" : "failed")
                : "completed";
      return {
        setnn: {
          status: outcomeStatus,
          changed,
          already_correct: alreadyCorrect,
          failed,
          deferred: deferredTargets.length,
          remaining: Math.max(0, targets.length - next),
          nickname: requestedNickname,
        },
      };
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
      return { setnn: { status: "failed", error: String(error?.message || error).slice(0, 500) } };
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
    /^(?:!owner(?:\s+(?:bot|automated|economy|rpg|music|moderation|system))?|!pause(?:\s+status)?|!resume|!(?:bot(?:\s+(?:off|on|status))?|shutdown|startup)|!watchdog(?:\s+(?:status|restart))?|!cleanup(?:\s+(?:status|disk|run|repair|optimize|full))?|!gcstatus|!broadcast(?:\s|$)|!game(?:\s+(?:on|off|status))?|!mod(?:\s|$)|!automod(?:\s|$)|!economy(?:\s|$)|!debug(?:\s|$)|!lucien(?:\s|$)|!warn(?:\s|$)|!ban(?:\s|$)|!kick(?:\s|$)|!unban(?:\s|$)|!modlog(?:\s|$)|!banat(?:\s|$)|!music\s+(?:pause|resume|play))$/i.test(originalText);  if (
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
      const now = Date.now();
      const key = String(threadID) + ":" + String(senderId);
      const previous = unauthorizedSlashAttempts.get(key);

      const windowExpired =
        !previous ||
        now - previous.windowStartedAt >=
          UNAUTHORIZED_SLASH_WINDOW_MS;

      if (windowExpired) {
        unauthorizedSlashAttempts.set(key, {
          windowStartedAt: now,
          replies: 0,
        });
      }

      const state = unauthorizedSlashAttempts.get(key);

      if (state.replies < UNAUTHORIZED_SLASH_MAX_REPLIES) {
        state.replies++;

        sendBanatReplyWithTyping(
          api,
          require("./slash-banats").pickUnauthorizedSlashBanat(threadID, senderId),
          threadID,
          event.messageID,
          false,
          null,
          0,
          originalText
        );
      } else {
        // Silent after the configured number of unauthorized attempts.
        // Never feed spam attempts into Banat or the message queue.
        console.log(
          "[BANAT] Suppressed unauthorized / from " +
            senderId +
            " in " +
            threadID +
            " (" +
            state.replies +
            "/" +
            UNAUTHORIZED_SLASH_MAX_REPLIES +
            " replies)"
        );
      }

      return;
    }

    try {
      const currentlyEnabled = await db.isRoastEnabled(threadId);
      const enabled = !currentlyEnabled;

      await db.setRoastEnabled(threadId, enabled);
      const settings = await db.getThreadSettings(threadId);
      const anyBanatEnabled =
        settings.bot_enabled !== false &&
        (settings.roast_enabled === true || settings.slash_pool_enabled === true);
      setBanatConversationMode(threadId, anyBanatEnabled, senderId);
      if (!anyBanatEnabled) clearBanatRotation(threadID);

      // A queued reply from the mode being switched off must not leak into
      // the other mode. The next incoming message will use whichever mode
      // remains enabled.
      if ((!enabled || settings.bot_enabled === false) && typeof clearBanatBurstState === "function") {
        clearBanatBurstState(threadId);
      }

      sendBanatReplyWithTyping(
        api,
        require("./slash-banats")(enabled ? "on" : "off", threadID, senderId),
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
  // BACKSLASH BANAT POOL CONTROL
  // Independent from the existing / toggle and admin-only.
  // ==========================================================

  const backslashBanatMatch = originalText.match(/^\\$/);

  if (backslashBanatMatch) {
    if (!isAdmin(senderId)) {
      const now = Date.now();
      const key = "backslash:" + String(threadID) + ":" + String(senderId);
      const previous = unauthorizedSlashAttempts.get(key);
      const windowExpired =
        !previous ||
        now - previous.windowStartedAt >= UNAUTHORIZED_SLASH_WINDOW_MS;

      if (windowExpired) {
        unauthorizedSlashAttempts.set(key, {
          windowStartedAt: now,
          replies: 0,
        });
      }

      const state = unauthorizedSlashAttempts.get(key);
      if (state.replies < 1) { // hard cap: one reply per thread/user per 60s window
        state.replies++;
        sendBanatReplyWithTyping(
          api,
          require("./slash-banats").pickUnauthorizedSlashBanat(threadID, senderId),
          threadID,
          event.messageID,
          false,
          null,
          0,
          originalText
        );
      }
      return;
    }

    try {
      const settings = await db.getThreadSettings(threadId);
      const enabled = settings.slash_pool_enabled !== true;
      await db.setThreadSettings(threadId, {
        slash_pool_enabled: enabled,
      });

      const anyBanatEnabled =
        settings.bot_enabled !== false &&
        (enabled || settings.roast_enabled === true);

      // Cancel pending replies from the backslash pool as soon as it is      // disabled, even if normal / Banat remains enabled.
      if ((!enabled || settings.bot_enabled === false) && typeof clearBanatBurstState === "function") {
        clearBanatBurstState(threadId);
      }

      setBanatConversationMode(threadId, anyBanatEnabled, senderId);

      sendBanatReplyWithTyping(
        api,
        require("./banat-slash-pool").getSlashPoolToggleReply(enabled),
        threadID,
        event.messageID,
        false,
        null,
        0,
        originalText
      );

      console.log(
        "[BANAT] Backslash pool " +
          (enabled ? "ENABLED" : "DISABLED") +
          " in " + threadId + " by " + senderId
      );
    } catch (error) {
      console.error("[BANAT] Backslash pool toggle failed:", error);
      sendReplyWithTyping(
        api,
        "🔴 Failed to update backslash Banat settings.",
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

    const uptimeSeconds = getRenderRuntimeSeconds();

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

  let dashboardBangJaidenEnabled = false;
  if (originalText.startsWith("!")) {
    try {
      const target = await db.getBanatThreadTarget(threadId);
      dashboardBangJaidenEnabled = target?.bang_enabled === true;
    } catch (error) {
      console.warn("[BANAT] Could not check dashboard ! mode:", error?.message || error);
    }
  }

  // Exact Banat control messages must reach their dedicated command
  // handlers before automatic Banat can consume them as ordinary chat.
  // Otherwise an active/saved Jaiden target can return handled=true and
  // silently swallow "/" or "\\" before the toggle code runs.
  const isBanatToggleCommand =
    /^\/$/.test(originalText) || /^\\$/.test(originalText);

  if (!isBanatToggleCommand &&
      (!originalText.startsWith("!") || dashboardBangJaidenEnabled)) {
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
  // ZENITH — SHARE BABY'S PRIVATE ANNIVERSARY EXPERIENCE
  // ==========================================================
  if (text === "!zenith") {
    if (!isOwner(senderId)) {
      sendReplyWithTyping(api, "♡ This little universe can only be shared by my owner.", threadID);
      return;
    }

    const baseUrl = String(
      process.env.ECLIPSE_ZENITH_URL || process.env.RENDER_EXTERNAL_URL || ""
    ).trim().replace(/\/$/, "");
    if (!baseUrl) {
      sendReplyWithTyping(
        api,
        "♡ ZENITH isn't configured yet. Set ECLIPSE_ZENITH_URL to this bot service's public URL.",
        threadID
      );
      return;
    }

    sendReplyWithTyping(
      api,
      "╭────── ♡ Z E N I T H ♡ ──────╮\nA little universe, made for baby.\nTen months of us, memories, letters, and all the moments still waiting.\n\n♡ Step inside: " + baseUrl + "/zenith/\n╰────── made with love ♡ ──────╯",
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
    [...new Set(["games", ...gameRegistry.COMMANDS])]
      .map(escapeRegex)
      .sort((a, b) => b.length - a.length)
      .join("|");

  const gameCommandPattern = new RegExp(
    "^!(" + registeredGameCommandsPattern + ")(?:\s+(.*))?$",
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
                ? "🟢 ON"                : "🔴 OFF"
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

const BROADCAST_IMAGE_HOST_SUFFIXES = [".facebook.com", ".fbcdn.net", ".fbsbx.com"];

function assertSafeBroadcastImageUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch (_) { throw new Error("Broadcast image URL is invalid."); }
  const hostname = parsed.hostname.toLowerCase();
  const allowedHost = ["facebook.com", "fbcdn.net", "fbsbx.com"].includes(hostname) || BROADCAST_IMAGE_HOST_SUFFIXES.some(suffix => hostname.endsWith(suffix));
  if (parsed.protocol !== "https:" || !allowedHost || parsed.username || parsed.password || (parsed.port && parsed.port !== "443")) {
    throw new Error("Broadcast images must come from an approved HTTPS Facebook media host.");
  }
  return parsed;
}

async function fetchSafeBroadcastImage(value) {
  let url = assertSafeBroadcastImageUrl(value);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
      headers: { "User-Agent": "ECLIPSE Messenger Bot" },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) throw new Error("Broadcast image redirect omitted its destination.");
    if (redirects === 3) throw new Error("Broadcast image exceeded the redirect limit.");
    url = assertSafeBroadcastImageUrl(new URL(location, url).toString());
  }
  throw new Error("Broadcast image could not be downloaded.");
}

function hasAllowedImageSignature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isGif = buffer.subarray(0, 3).toString("ascii") === "GIF";
  const isWebp = buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return isPng || isJpeg || isGif || isWebp;
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

    const response = await fetchSafeBroadcastImage(imageUrl);

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} while downloading broadcast image.`
      );
    }

    const contentLength = Number(response.headers.get("content-length") || "0");
    const configuredMaxBytes = Number(process.env.MAX_BROADCAST_IMAGE_BYTES || String(2 * 1024 * 1024));
    const MAX_BROADCAST_IMAGE_BYTES = Number.isFinite(configuredMaxBytes)
      ? Math.max(1024, Math.min(configuredMaxBytes, 10 * 1024 * 1024))
      : 2 * 1024 * 1024;

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

    const chunks = [];
    let totalBytes = 0;
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Broadcast image response has no readable body.");
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        totalBytes += part.value.byteLength;
        if (totalBytes > MAX_BROADCAST_IMAGE_BYTES) {
          await reader.cancel().catch(() => {});
          throw new Error("Broadcast image exceeded the configured bandwidth safety limit.");
        }
        chunks.push(Buffer.from(part.value));
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    }
    const buffer = Buffer.concat(chunks, totalBytes);
    if (buffer.length > MAX_BROADCAST_IMAGE_BYTES) throw new Error("Broadcast image exceeded the configured bandwidth safety limit.");
    if (!hasAllowedImageSignature(buffer)) throw new Error("Downloaded file does not contain a supported image signature.");

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
const jaidenCooldownState = new Map();

function scheduleJaidenReply(threadID, targetID, job, settings = {}) {
  const threadKey = String(threadID || "").trim();
  const targetKey = String(targetID || "").trim();
  if (!threadKey || !targetKey || !job) return false;
  const key = threadKey + ":" + targetKey;
  const interval = Math.max(3, Math.min(120, Number(settings.interval_seconds) || 3)) * 1000;
  const mode = ["extend", "queue", "ignore"].includes(settings.cooldown_mode) ? settings.cooldown_mode : "extend";

  if (mode === "queue") {
    // Keep Jaiden messages in a dedicated FIFO scoped to this thread + target.
    // Unlike the general burst queue, this never merges or replaces messages.
    jaidenMessageQueue.enqueue(key, { ...job, threadID: threadKey }, interval)
      .then((result) => {
        if (result && result.sent === false) {
          console.error(
            "[JAIDEN QUEUE] Reply failed for thread " + threadKey +
            " target " + targetKey + " (" + (result.outcome || "send-failed") + ")" +
            (result.errorCode ? " code=" + result.errorCode : "") +
            (result.errorMessage ? ": " + result.errorMessage : "")
          );
        }
      })
      .catch((error) => {
        console.error("[JAIDEN QUEUE] Reply processor failed:", error?.message || error);
      });
    return true;
  }

  let state = jaidenCooldownState.get(key);
  if (!state) {
    state = { timer: null, latest: null, queue: [] };
    jaidenCooldownState.set(key, state);
  }
  if (mode === "ignore" && state.timer) return true;
  state.latest = job;
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    state.timer = null;
    const latest = state.latest;
    state.latest = null;
    if (latest) acceptBanatBurstMessage(threadKey, latest);
    if (!state.queue.length) jaidenCooldownState.delete(key);
  }, interval);
  return true;
}

function clearJaidenCooldownState(threadID) {
  // Target changes/removal must also discard pending dedicated Jaiden jobs.
  jaidenMessageQueue.clear(threadID);
  const prefix = String(threadID || "").trim() + ":";
  let cleared = false;
  for (const [key, state] of jaidenCooldownState) {
    if (!key.startsWith(prefix)) continue;
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    state.latest = null;
    state.queue.length = 0;
    jaidenCooldownState.delete(key);
    cleared = true;
  }
  return cleared;
}

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
      activeSenderId: null,
      activeTargetId: null,
    };

    banatBurstState.set(key, state);
  }

  if (state.cleanupTimer) {
    clearTimeout(state.cleanupTimer);
    state.cleanupTimer = null;
  }

  /*
   * Banat has one active conversational person per turn.
   *
   * The first eligible sender claims the turn. Follow-up messages from
   * that same sender may join the short decision window; messages from
   * other people do not. This keeps Banat proactive without making one
   * reply address a whole GC at once.
   *
   * Once the turn is running, everyone waits for the next turn.
   */
  const now = Date.now();
  const incomingSenderId = String(job.senderId || "").trim();

  if (state.decisionTimer && !state.running) {
    if (
      incomingSenderId &&
      state.activeSenderId &&
      incomingSenderId === state.activeSenderId &&
      state.queue.length < 6
    ) {
      state.queue.push({
        ...job,
        senderId: incomingSenderId,
        queuedAt: now,
      });
      if (job.typingEnabled !== false) startTyping(job.api, key);
      return true;
    }

    // A different person may replace the current target only when the
    // context scorer explicitly says the conversation has moved to them.
    if (
      incomingSenderId &&
      incomingSenderId !== state.activeSenderId &&
      job.canSwitchTarget
    ) {
      state.queue.length = 0;
      state.activeSenderId = incomingSenderId;
      state.activeTargetId = incomingSenderId;
      state.queue.push({
        ...job,
        senderId: incomingSenderId,
        queuedAt: now,
      });
      if (job.typingEnabled !== false) startTyping(job.api, key);
    }

    return false;
  }

  // A running turn is already owned by the current sender. Do not let a
  // later message from another person silently steal the persistent target.
  // The active sender's additional messages will be picked up on the next
  // decision window.
  if (state.running) {
    // A dashboard-selected target is an explicit override, not an ordinary
    // conversational switch. Queue it behind an in-flight send instead of
    // dropping it; runBanatBurstQueue will honor the normal cooldown.
    if (job.canSwitchTarget && incomingSenderId) {
      state.queue.length = 0;
      state.activeSenderId = incomingSenderId;
      state.activeTargetId = incomingSenderId;
      state.queue.push({
        ...job,
        senderId: incomingSenderId,
        queuedAt: now,
      });
      if (job.typingEnabled !== false) startTyping(job.api, key);
      return true;
    }

    return false;
  }

  if (
    state.lastSentAt &&
    now - state.lastSentAt < BANAT_MIN_INTER_REPLY_GAP_MS
  ) {
    // The inter-reply gap is a send limiter, not a target switch.
    // Keep the persistent conversation owner eligible during the gap,
    // but never let an unrelated speaker steal ownership merely because
    // the queue is cooling down.
    const activeTarget = getBanatConversationTarget(key);
    const sameTarget =
      activeTarget &&
      incomingSenderId &&
      String(activeTarget.senderId || "").trim() === incomingSenderId;

    if (!sameTarget) {
      return false;
    }

    state.activeSenderId = incomingSenderId;
    state.activeTargetId = incomingSenderId;
    return true;
  }

  state.queue.length = 0;
  state.activeSenderId = incomingSenderId || null;
  state.activeTargetId = incomingSenderId || null;
  state.queue.push({
    ...job,
    senderId: incomingSenderId,
    queuedAt: now,
  });
  if (job.typingEnabled !== false) startTyping(job.api, key);

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

  // If no send is in flight, close any indicator held for queued Banat work.
  if (!state.running) {
    for (const queuedJob of state.queue) {
      stopTyping(queuedJob.api, key);
    }
    state.queue.length = 0;
    banatBurstState.delete(key);
  } else {
    // The active send owns the indicator and will close it in its finally path.
    state.queue.length = 0;
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
    const queuedTypingApi = state.queue[0]?.api || null;
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
      if (queuedTypingApi) stopTyping(queuedTypingApi, key);
      return;
    }

    // The queue is already locked to one sender. Keep the turn FIFO
    // and preserve that person's short burst as the conversational context.
    const selected = state.queue[0];

    const job = selected
      ? {
          ...selected,
          incomingText: state.queue
            .map((item) => String(item.incomingText || "").trim())
            .filter(Boolean)
            .join("\n")
            .slice(0, 2200),
        }
      : null;

    state.queue.length = 0;

    if (!job) {
      state.activeSenderId = null;
      return;
    }

    console.log(
      "[BANAT] Turn started in " +
        key +
        " sender=" +
        String(job.senderId || "unknown")
    );

    let sent = false;
    let turnTimeout = null;

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
          job.incomingText || "",
          { skipTyping: job.typingEnabled === false }
        ),
        new Promise((resolve) => {
          turnTimeout = setTimeout(() => {
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
    } finally {
      if (turnTimeout) clearTimeout(turnTimeout);
    }

    if (sent) {
      state.lastSentAt = Date.now();
      if (job.rotationTarget === true) {
        markBanatRotationReply(key, job.senderId, state.lastSentAt);
      }
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
    state.activeSenderId = null;

    if (state.queue.length) {
      // Normally empty after burst coalescing. Keep this fallback for any
      // message that arrives after the decision window closes.
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

// A dashboard Jaiden trigger must not swallow commands that already belong
// to ECLIPSE. Ordinary messages such as "!hello" still trigger Jaiden mode;
// recognized command names continue into the normal command router.
function isRecognizedBangCommand(body) {
  const match = String(body || "").trim().match(/^!([a-z0-9_-]+)(?:\s|$)/i);
  if (!match) return false;

  const command = match[1].toLowerCase();
  if (gameRegistry && typeof gameRegistry.getGame === "function" && gameRegistry.getGame(command)) {
    return true;
  }

  return new Set([
    "help", "ping", "zenith", "rpg", "games", "game", "debate", "exam",
    "cleanup", "owner", "pause", "resume", "watchdog", "gcstatus",
    "music", "broadcast", "answer", "play", "haunt", "heist",
    "incident", "investigations", "investigator", "lost", "trial",
    "hit", "stand", "double",
    "trivia", "riddle", "math", "roll", "coinflip", "flip", "slots",
    "guess", "rps", "blackjack", "bj", "8ball", "8-ball", "chamber",
    "roulette", "lastchamber", "daily", "work", "rizz", "simp", "clown",
    "aura", "npc", "delulu", "menace", "grass", "bro", "roast",
    "compat", "compatibility", "ship", "battle", "vibes", "social",
    "socialgames", "ban", "kick", "unban", "warn", "mute", "unmute",
    "automod", "moderation", "profile", "stats", "inventory", "shop",
    "buy", "sell", "balance", "bal", "leaderboard", "level", "rank",
    "verse", "training", "debug", "simulation", "yt", "youtube", "queue",
    "skip", "stop", "volume", "setnn"
  ]).has(command);
}

async function handleAutomaticBanatMessage({
  api,
  event,
  body,
  senderId,
  threadId,
}) {
  const threadID = threadId;

  // ! commands are routed here only when the dashboard explicitly enables
  // the Jaiden trigger for this group's saved target.
  if (/^!/.test(String(body || ""))) {
    // Existing commands (for example !help, !trivia, and !rpg) always retain
    // their normal behavior even when Jaiden mode is enabled for this GC.
    if (isRecognizedBangCommand(body)) return false;
    try {
      const target = await db.getBanatThreadTarget(threadId);
      if (target?.bang_enabled !== true || !target?.target_user_id) return false;
    } catch (error) {
      console.warn("[BANAT] Could not load dashboard ! mode:", error?.message || error);
      return false;
    }
  }

  let roastEnabled = false;
  let slashPoolEnabled = false;

  try {
    const settings = await db.getThreadSettings(threadId);
    roastEnabled = settings.roast_enabled === true;
    slashPoolEnabled = settings.slash_pool_enabled === true;
  } catch (error) {
    console.error(
      "[BANAT] Failed to check Banat pool settings:",
      error
    );

    return false;
  }

  // A saved dashboard target activates the Jaiden pool on its own.
  // Ordinary / and \ pool toggles are not prerequisites for targeted mode.
  let savedBanatTarget = null;
  let targetLookupSucceeded = false;
  try {
    savedBanatTarget = await db.getBanatThreadTarget(threadId);
    targetLookupSucceeded = true;
  } catch (error) {
    console.warn("[BANAT] Could not load saved dashboard target:", error?.message || error);
  }

  if (!roastEnabled && !slashPoolEnabled && !savedBanatTarget?.target_user_id) {
    setBanatConversationMode(threadId, false);
    return false;
  }

  // Either independent pool can activate the existing Banat runtime.
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
  // "/" enables Banat for the thread, but activation does not mean
  // "reply to every message". The existing context state decides whether
  // this turn is actually worth entering. A direct reply/mention is never
  // required for ordinary Banat.
  // Dashboard-selected targets are persisted per GC and rehydrated into
  // the scorer on incoming messages. Only dashboard admins can change them.
  // Read from the database so the target survives process restarts and does
  // not depend on someone opening the dashboard after a restart.
  if (savedBanatTarget?.target_user_id) {
    setBanatDirectedTarget(
      threadId,
      savedBanatTarget.target_user_id,
      savedBanatTarget.set_by || "dashboard",
      { persistent: true }
    );
  } else if (targetLookupSucceeded) {
    clearBanatDirectedTarget(threadId);
  }

  // Public / and \\ pools share a single rotating speaker per group.
  // A saved dashboard-selected target remains fixed and bypasses this rotation.
  const publicRotationMode =
    (roastEnabled || slashPoolEnabled) &&
    !String(savedBanatTarget?.target_user_id || "").trim();

  if (publicRotationMode) {
    const rotation = trackBanatRotation(threadId, senderId);
    if (!rotation.isTarget) {
      console.log(
        "[BANAT] Ignoring non-target speaker thread=" + threadID +
        " sender=" + String(senderId || "unknown") +
        " target=" + String(rotation.targetId || "unknown") +
        " rotated=" + Boolean(rotation.rotated)
      );
      // Mark the event handled so normal message/AI handlers cannot reply
      // to a speaker that this Banat rotation intentionally ignored.
      return true;
    }
    if (rotation.rotated) {
      console.log(
        "[BANAT] Rotated speaker target thread=" + threadID +
        " target=" + String(rotation.targetId || "unknown")
      );
    }
  } else {
    clearBanatRotation(threadId);
  }

  const target = scoreBanatAddressContext({
    rawText: body,
    senderId,
    threadId,
    event,
    botId: eclipseUserID,
    // The explicit rotation gate above limits public pools to one speaker.
    // The scorer remains open for that selected speaker's ordinary messages.
    allowAnySpeaker: publicRotationMode,
  });

  if (publicRotationMode) {
    target.shouldRespond = true;
    target.score = Math.max(Number(target.score || 0), 0.9);
    target.reason = "rotation-target";
    target.canSwitchTarget = false;
  }

  // A saved dashboard target remains exclusive and fixed when configured.
  if (savedBanatTarget?.target_user_id && !roastEnabled && !slashPoolEnabled) {
    if (String(senderId || "").trim() === String(savedBanatTarget.target_user_id).trim()) {
      target.shouldRespond = true;
      target.score = Math.max(Number(target.score || 0), 0.9);
      target.reason = "dashboard-target";
      target.canSwitchTarget = true;
    } else {
      target.shouldRespond = false;
      target.reason = "dashboard-target-wait";
      target.canSwitchTarget = false;
    }
  } else if (!targetLookupSucceeded) {
    // If the database is temporarily unavailable, don't erase an in-memory
    // target. Normal scoring remains in place until the saved target can load.
  }

  console.log(
    "[BANAT] Response decision " +
      "thread=" + threadID +
      " score=" + Number(target.score || 0).toFixed(3) +
      " reason=" + String(target.reason || "unknown") +
      " direct=" + Boolean(target.direct)
  );

  try {
    // The owner is protected from roast/trigger generation. The existing
    // admin-safe Banat pool below provides the reaction instead.
    let triggerReply = null;
    const dashboardTargetId = String(savedBanatTarget?.target_user_id || "").trim();
    const senderIsDashboardTarget =
      Boolean(dashboardTargetId) &&
      String(senderId || "").trim() === dashboardTargetId;

    // A manually selected dashboard target always uses the Jaiden pool,
    // regardless of whether / or \ is the active ordinary Banat pool.
    // This check intentionally runs before ordinary pool selection.
    // When ! mode is enabled, any ! message invokes the Jaiden pool for the
    // saved target. Otherwise preserve the legacy selected-target behavior.
    const bangJaidenCommand =
      savedBanatTarget?.bang_enabled === true &&
      /^!/.test(String(body || "")) &&
      !isRecognizedBangCommand(body);
    if (bangJaidenCommand || senderIsDashboardTarget) {
      if (savedBanatTarget?.bang_enabled === true && savedBanatTarget?.jaiden_reply_mode === "random" && Math.random() >= 0.5) {
        console.log("[BANAT] Jaiden random reply mode skipped this turn in " + threadID);
        return true;
      }
      const resolvedTarget = await resolveTargetName(api, threadID, dashboardTargetId, {
        savedName: savedBanatTarget?.target_name,
        // Only trust a name observed on a message from the selected target;
        // in ! mode, the command may have been sent by somebody else.
        seenName: senderIsDashboardTarget
          ? String(event?.senderName || event?.authorName || event?.userName || "")
          : "",
      });
      let configuredTargetName = "";
      try {
        configuredTargetName = String((await db.getJaidenTargetCountdownSettings()).targetName || "").trim();
      } catch (settingsError) {
        console.warn("[BANAT] Could not load configured Auto Target name:", settingsError?.message || settingsError);
      }
      const dashboardTargetName = resolvedTarget.name || "";
      const banatTargetName = configuredTargetName || dashboardTargetName;

      // Keep the selected Jaiden Target's group nickname synced with the resolved
      // Messenger name only. The dashboard's Banat alias must never rename the member.
      if (dashboardTargetName && (typeof api?.nickname === "function" || typeof api?.changeNickname === "function")) {
        const nicknameKey = String(threadID) + ":" + String(dashboardTargetId);
        const nicknameValue = dashboardTargetName.trim();
        if (nicknameValue && jaidenTargetNicknameApplied.get(nicknameKey) !== nicknameValue) {
          try {
            await changeNicknameAsync(api, nicknameValue, threadID, dashboardTargetId);
            jaidenTargetNicknameApplied.set(nicknameKey, nicknameValue);
            console.log("[JAIDEN TARGET] Synced target nickname in " + threadID +
              " for " + dashboardTargetId + " -> " + JSON.stringify(nicknameValue));
          } catch (nicknameError) {
            console.warn("[JAIDEN TARGET] Could not sync target nickname in " + threadID +
              " for " + dashboardTargetId + ":", nicknameError?.message || nicknameError);
          }
        }
      }

      console.log(
        "[BANAT] Jaiden target resolved: target=" + dashboardTargetId +
        " name=" + (banatTargetName || "<unresolved>") +
        " source=" + (configuredTargetName ? "dashboard-alias" : resolvedTarget.source)
      );
      if (!dashboardTargetName) {
        console.warn("[BANAT] Name lookup failed for target " + dashboardTargetId + "; Jaiden replies will use the safe fallback.");
      }

      triggerReply = await getTriggerReply(
        body,
        senderId,
        threadID,
        api,
        event,
        {
          targetName: banatTargetName,
          forceJaidenTarget: true,
        }
      );
    }

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

      const jaidenModeActive = savedBanatTarget?.bang_enabled === true &&
        (bangJaidenCommand || senderIsDashboardTarget);
      const queueJob = {
        api, message: triggerReply, replyToMessageID: event.messageID,
        attachMeme: banatMemeEnabled,
        // Jaiden replies are text-only by default. Historical thread_settings rows
        // may have banat_link_enabled=true solely because the old DB default was on.
        // Opt in explicitly with ECLIPSE_JAIDEN_INCLUDE_LINKS=true.
        linkUrl: jaidenModeActive && process.env.ECLIPSE_JAIDEN_INCLUDE_LINKS !== "true"
          ? null
          : (banatLinkEnabled ? banatProfileUrl : null),
        incomingText: body, senderId, canSwitchTarget: true,
        rotationTarget: publicRotationMode,
        typingEnabled: jaidenModeActive ? savedBanatTarget?.jaiden_typing_enabled !== false : true,
      };
      const accepted = jaidenModeActive
        ? scheduleJaidenReply(threadID, dashboardTargetId, queueJob, {
            interval_seconds: savedBanatTarget?.jaiden_interval_seconds,
            // Jaiden mode is message-by-message targeting: preserve every
            // eligible target message instead of replacing it with the latest
            // message during the quiet period.
            cooldown_mode: "queue",
          })
        : acceptBanatBurstMessage(threadID, queueJob);

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

  let banatReply = null;

  // The context-aware conversation generator is now actually wired into
  // the automatic pipeline for established Jammy defense exchanges.
  // Ordinary Banat keeps using the existing natural reply pool so the
  // AI path does not become a mandatory dependency for every message.
  const useConversationReply =
    target.reason === "jammy-defense" ||
    target.reason === "jammy-interaction-history" ||
    target.reason === "active-jammy-defense" ||
    target.reason === "defense-momentum";

  // The harsher backslash pool takes priority over context-generated replies.
  // Target scoring still decides whether to respond; this only selects the reply source.
  if (useConversationReply && !slashPoolEnabled) {
    try {
      banatReply = await getBanatConversationReply(
        body,
        senderId,
        threadID,
        api,
        event
      );
    } catch (error) {
      console.warn(
        "[BANAT] Context reply generator failed; using natural pool:",
        error?.status || error?.message || error
      );
    }
  }

  if (!banatReply) {
    if (
      slashPoolEnabled &&
      !isAdmin(senderId) &&
      !isPrimaryUser(senderId)
    ) {
      banatReply = require("./banat-slash-pool").pickSlashPoolInsult(
        threadID,
        senderId
      );
    } else {
      // Protected users still receive safe reactions, never insults.
      banatReply = getRandomRoastReply(
        threadID,
        body,
        senderId
      );
    }
  }

  if (banatReply) {
    const accepted = acceptBanatBurstMessage(
      threadID,
      {
        api,
        message: banatReply,
        replyToMessageID: event.messageID,
        attachMeme: false,
        linkUrl: null,
        incomingText: body,
        senderId,
        rotationTarget: publicRotationMode,
        canSwitchTarget: Boolean(target.canSwitchTarget),
        targetReason: target.reason,
        topicOverlap: Number(target.topicOverlap || 0),
      }
    );

    if (!accepted) {
      console.log(
        "[BANAT] Ignored burst message from " +
          senderId +
          " in " +
          threadID
      );
    } else {
      // The scorer has decided this person owns the current conversation.
      // Persist that ownership in the existing Banat context so unrelated
      // speakers are ignored until the topic legitimately transfers.
      setBanatConversationTarget(threadID, senderId, {
        reason: target.reason,
        confidence: Number(target.score || 0),
        text: body,
      });
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

const jaidenMilestoneReactionMessageIds = new Set();
const jaidenTargetCountdown = createJaidenTargetCountdown({
  onPersonalityLine: async ({ threadId, targetName, api, context, shouldSend }) => {
    if (typeof shouldSend === "function" && !shouldSend()) return false;
    const settings = await db.getJaidenTargetCountdownSettings();
    if (!settings.personalityEnabled && !settings.newBanatEnabled) return false;
    if (context === "general" && !settings.openingTauntEnabled) return false;
    if (context !== "general" && !settings.interleavedTauntsEnabled) return false;
    if (typeof shouldSend === "function" && !shouldSend()) return false;
    const line = pickJaidenAutoTargetLine({
      threadId, targetName, context, fallbackName: "target",
      useCustomPools: settings.newBanatEnabled === true,
    });
    return new Promise((resolve) => {
      trafficSendMessage(api, line, threadId, (error) => {
        if (error) console.warn("[JAIDEN COUNTDOWN] Personality send failed in " + threadId + ":", error?.message || error);
        resolve(!error);
      }, null, { shouldSend });
    });
  },
  onMilestone: ({ number, threadId, api, messageInfo, shouldReact }) => {
    const messageID = String(messageInfo?.messageID || messageInfo?.messageId || messageInfo?.message_id || "").trim();
    if (!messageID || !api || jaidenMilestoneReactionMessageIds.has(messageID)) return;
    jaidenMilestoneReactionMessageIds.add(messageID);
    if (jaidenMilestoneReactionMessageIds.size > 500) {
      const oldest = jaidenMilestoneReactionMessageIds.values().next().value;
      jaidenMilestoneReactionMessageIds.delete(oldest);
    }
    const delayMs = 3000 + Math.floor(Math.random() * 3001);
    setTimeout(() => {
      if (typeof shouldReact === "function" && !shouldReact()) return;
      try {
        const callback = (error) => {
          if (error) console.warn("[JAIDEN COUNTDOWN] Milestone reaction failed for " + number + " in " + threadId + ":", error?.message || error);
        };
        if (typeof api.setMessageReactionMqtt === "function") {
          setMessageReactionMqtt(api, dashboardReactionConfig.reaction, messageID, threadId)
            .then(result => {
              if (result?.acknowledged === false) {
                console.info("[JAIDEN COUNTDOWN] Milestone reaction published to MQTT for " + number + " in " + threadId + ".");
              }
            })
            .catch(error => console.warn("[JAIDEN COUNTDOWN] Milestone reaction failed for " + number + " in " + threadId + ":", error?.message || error));
        } else if (typeof api.setMessageReaction === "function") {
          Promise.resolve(api.setMessageReaction(dashboardReactionConfig.reaction, messageID))
            .catch(error => console.warn("[JAIDEN COUNTDOWN] Milestone reaction failed for " + number + " in " + threadId + ":", error?.message || error));
        } else {
          console.warn("[JAIDEN COUNTDOWN] Reaction API unavailable for " + number + " in " + threadId + ".");
        }
      } catch (error) {
        console.warn("[JAIDEN COUNTDOWN] Milestone reaction error:", error?.message || error);
      }
    }, delayMs);
  },
  onCancel: (record) => jaidenTargetRecords.recordEncounter(db, { ...record, threadName: record.threadId }),
  persistState: (state) => db.saveJaidenTargetCountdownState(state),
  loadState: (threadId) => db.getJaidenTargetCountdownState(threadId),
  loadAllStates: () => db.listJaidenTargetCountdownStates(),
  deleteState: (threadId, targetId) => db.deleteJaidenTargetCountdownState(threadId, targetId),
  getTarget: (threadId) => db.getBanatThreadTarget(threadId),
  getResultsSettings: () => db.getJaidenTargetCountdownSettings(),
  getTargetName: async ({ threadId, targetId, savedName, api }) => {
    const isDefaultPlaceholder = (value) => /^(?:kei|facebook|facebook user|unknown(?: target)?|unnamed|messenger(?: user)?|user)(?:\\s+\\d+)?$/i.test(String(value || "").trim());
    let resolved = await resolveTargetName(api, threadId, targetId, {
      savedName: isDefaultPlaceholder(savedName) ? "" : savedName,
    });
    // The result formatter must use the same real-target-name rules as nickname sync.
    // A legacy value such as "FACEBOOK" is not the selected target's display name.
    if (isDefaultPlaceholder(resolved?.name)) {
      clearTargetNameCache(threadId, targetId);
      resolved = await resolveTargetName(api, threadId, targetId, {});
    }
    return isDefaultPlaceholder(resolved?.name) ? "" : (resolved?.name || "");
  },
  syncTargetNickname: async ({ threadId, targetId, savedName, api }) => {
    const isDefaultPlaceholder = (value) => /^(?:kei|facebook|unknown(?: target)?|unnamed|facebook user|messenger user)(?:\s+\d+)?$/i.test(String(value || "").trim());
    let resolved = await resolveTargetName(api, threadId, targetId, { savedName: isDefaultPlaceholder(savedName) ? "" : savedName });
    // "Kei" is the legacy default placeholder, not a verified target display name.
    // Clear a cached placeholder and retry the real Messenger profile before using
    // the operator's configured fallback nickname.
    if (isDefaultPlaceholder(resolved?.name)) {
      clearTargetNameCache(threadId, targetId);
      resolved = await resolveTargetName(api, threadId, targetId, {});
    }
    let nickname = String(resolved?.name || "").trim();
    let nicknameSource = "target";
    if (!nickname || isDefaultPlaceholder(nickname)) {
      const settings = await db.getJaidenTargetCountdownSettings();
      nickname = String(settings?.customNickname || "").trim();
      nicknameSource = "custom fallback";
    }
    const botId = String(typeof api?.getCurrentUserID === "function" ? api.getCurrentUserID() : "").trim();
    if (!nickname || !botId) throw new Error("Target display name and custom nickname are unavailable, or bot user ID is missing.");
    await changeNicknameAsync(api, nickname, threadId, botId);
    console.log("[JAIDEN COUNTDOWN] Synced bot nickname in " + threadId + " using " + nicknameSource + " for target " + targetId + " (" + nickname + ")");
    return nickname;
  },
  onComplete: async ({ threadId, targetId, targetName, startedAt, endedAt, reason }) => {
    await jaidenTargetRecords.recordEncounter(db, { threadId, targetId, targetName, startedAt, endedAt, result: "WIN", reason });
    // Only clear the target that actually completed. If an admin selected a
    // different target while the results message was in flight, preserve it.
    const targetKey = String(targetId || "").trim();
    if (!targetKey) return;
    // Use one conditional DELETE so a target change in the dashboard cannot
    // race between a separate read and delete.
    const cleared = await db.query(
      "DELETE FROM banat_thread_targets WHERE thread_id = $1 AND target_user_id = $2",      [String(threadId || "").trim(), targetKey]
    );
    if (!cleared?.rowCount) return;
    clearJaidenCooldownState(threadId);
    clearBanatDirectedTarget(threadId);
    clearBanatConversationTarget(threadId);
    clearBanatBurstState(threadId);
    pushDashboardEvent("banat-target", "Jaiden Target automatically cleared after countdown results for group " + threadId + ".");
    console.log("[JAIDEN COUNTDOWN] Completed target cleared for thread " + threadId + ".");
  },
  send: (api, message, threadID, shouldSend) => new Promise((resolve) => {
    trafficSendMessage(api, message, threadID, (error, messageInfo) => {
      resolve(error ? { sent: false, code: error.code || null } : { sent: true, messageInfo });
    }, null, { shouldSend });
  }),
});

const jaidenMessageQueue = createJaidenMessageQueue({
  maxQueuePerThread: Number(process.env.ECLIPSE_JAIDEN_QUEUE_MAX || 1000),
  // Messenger can briefly reject sends during transient session/API failures.
  // Use bounded exponential backoff; ambiguous timeouts remain non-retryable.
  retryDelays: [1500, 4000, 8000],
  send: async (job) => {
    return sendBanatReplyWithTyping(
      job.api,
      job.message,
      job.threadID,
      job.replyToMessageID || null,
      job.attachMeme === true,
      job.linkUrl || null,
      undefined,
      job.incomingText || "",
      { skipTyping: job.typingEnabled === false, returnSendOutcome: true }
    );
  },
});

function sendBanatReplyWithTyping(
  api,
  message,
  threadID,
  replyToMessageID = null,
  attachMeme = false,
  linkUrl = null,
  replyDelayMs = BANAT_REPLY_DELAY_MS,
  incomingText = "",
  options = {}
) {
  if (options.skipTyping !== true) startTyping(api, threadID);
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
      skipTyping: options.skipTyping === true,
      returnSendOutcome: options.returnSendOutcome === true,
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

  await persistAppStateFile();
  stopMqttActivityWatchdog();
  if (appStatePersistenceTimer) clearInterval(appStatePersistenceTimer);
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
  if (proxyGateRetryTimer) {
    clearTimeout(proxyGateRetryTimer);
    proxyGateRetryTimer = null;
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

