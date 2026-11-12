"use strict";

const INACTIVITY_MS = 5 * 60 * 1000;
const COUNT_DELAY_MS = 2 * 1000;
const DEFAULT_RESULT_TEMPLATE = "WIN: {{WIN}}\nLOSE: {{LOSE}}\nREASON: {{REASON}}\nSTART: {{START}}\nEND: {{END}}";
const DEFAULT_RESULT_REASON = "DI TUMAGOS SA HEV CHALLENGE, NA-OUTPLAY SA COUNTDOWN 😭";
const { detectJaidenAutoTargetContext } = require("./jaiden-auto-target-personality");

function createJaidenTargetCountdown(options = {}) {
  const getTarget = options.getTarget;
  const send = options.send;
  const getTargetName = options.getTargetName;
  const syncTargetNickname = options.syncTargetNickname;
  const getResultsSettings = options.getResultsSettings;
  const onComplete = options.onComplete;
  const persistState = options.persistState;
  const loadState = options.loadState;
  const loadAllStates = options.loadAllStates;
  const deleteState = options.deleteState;
  const timeZone = options.timeZone || "Asia/Manila";
  const inactivityMs = Number.isFinite(options.inactivityMs) ? Math.max(1, options.inactivityMs) : INACTIVITY_MS;
  const countDelayMs = Number.isFinite(options.countDelayMs) ? Math.max(0, options.countDelayMs) : COUNT_DELAY_MS;
  const retryCooldownMs = Number.isFinite(options.retryCooldownMs) ? Math.max(1, options.retryCooldownMs) : 5 * 60 * 1000;
  const states = new Map();
  let stopped = false;

  async function persist(threadId, state) {
    if (typeof persistState !== "function" || !state) return;
    try {
      await persistState({
        threadId, targetId: state.targetId, targetName: state.targetName || "",
        lockedAt: state.lockedAt, lastActivityAt: state.lastActivityAt,
        countdownStartedAt: state.countdownStartedAt || null, nextNumber: state.nextNumber || 1, status: state.forceMode ? (state.retryBlocked ? "force_send_failed" : "force_counting") : state.retryBlocked ? "send_failed" : state.counting ? "counting" : "waiting",
      });
    } catch (error) {
      console.error("[JAIDEN COUNTDOWN] Could not persist state for thread " + threadId + ":", error?.message || error);
    }
  }

  async function removePersisted(threadId, targetId) {
    if (typeof deleteState !== "function") return;
    try { await deleteState(threadId, targetId); }
    catch (error) { console.error("[JAIDEN COUNTDOWN] Could not delete persisted state:", error?.message || error); }
  }

  const clearTimer = (state) => {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
  };

  const cancel = (threadId, targetId = null) => {
    const state = states.get(String(threadId || "").trim());
    if (!state) return false;
    if (targetId && state.targetId !== String(targetId).trim()) return false;
    state.generation += 1;
    clearTimer(state);
    state.counting = false;
    void persist(String(threadId || '').trim(), state);
    return true;
  };

  const formatTime = (timestamp) => new Intl.DateTimeFormat("en-PH", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date(timestamp));

  const formatDateTime = (timestamp) => new Intl.DateTimeFormat("en-PH", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date(timestamp));

  const formatDuration = (startedAt, endedAt) => {
    const totalSeconds = Math.max(0, Math.floor((Number(endedAt) - Number(startedAt)) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours + "h " + String(minutes).padStart(2, "0") + "m " + String(seconds).padStart(2, "0") + "s";
  };

  const buildReceiptMessage = ({ threadId, targetName, startedAt, endedAt, completedCount, status, reason }) => {
    const safeCount = Math.max(0, Math.min(100, Number(completedCount) || 0));
    return [
      "🧾 JAIDEN COUNTDOWN RESIBO",
      "GROUP: " + String(threadId || "UNKNOWN GROUP"),
      "TARGET: " + (String(targetName || "").trim() || "UNKNOWN TARGET"),
      "START: " + formatDateTime(startedAt),
      "END: " + formatDateTime(endedAt),
      "COUNT: " + safeCount + "/100",
      "DURATION: " + formatDuration(startedAt, endedAt),
      "STATUS: " + String(status || "INTERRUPTED").toUpperCase(),
      "DETAILS: " + String(reason || (status === "COMPLETED" ? "Countdown reached 100." : "Countdown was stopped before completion.")),
    ].join("\n");
  };

  const buildResultsMessage = (targetName, startedAt, endedAt, settings = {}) => {
    const values = {
      WIN: "HEV",
      LOSE: String(targetName || "").trim().toLocaleUpperCase("en-US") || "UNKNOWN TARGET",
      REASON: typeof settings.reason === "string" ? settings.reason : DEFAULT_RESULT_REASON,
      START: formatTime(startedAt),
      END: formatTime(endedAt),
    };
    const template = typeof settings.template === "string" && settings.template.trim()
      ? settings.template
      : DEFAULT_RESULT_TEMPLATE;
    return template.replace(/\{\{\s*(WIN|LOSE|REASON|START|END)\s*\}\}/gi, (_match, key) => values[String(key).toUpperCase()]);
  };

  const wait = (ms) => new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === "function") timer.unref();
  });

  function scheduleInactivity(threadId, state, generation) {
    clearTimer(state);
    const elapsed = Math.max(0, Date.now() - Number(state.lastActivityAt || Date.now()));
    const remaining = Math.max(0, inactivityMs - elapsed, Number(state.retryNotBeforeAt || 0) - Date.now());
    state.timer = setTimeout(() => {
      state.timer = null;
      void runCountdown(threadId, state, generation);
    }, remaining);
    if (typeof state.timer.unref === "function") state.timer.unref();
  }

  async function verifySelectedTarget(threadId, state, generation) {
    try {
      const target = typeof getTarget === "function" ? await getTarget(threadId) : null;
      const currentTargetId = String(target?.target_user_id || "").trim();
      if (currentTargetId === state.targetId) return true;
      if (state.generation === generation && states.get(threadId) === state) {
        state.generation += 1;
        clearTimer(state);
        state.counting = false;
        states.delete(threadId);
      }
      return false;
    } catch (error) {
      console.warn("[JAIDEN COUNTDOWN] Could not verify selected target for thread " + threadId + ":", error?.message || error);
      if (!stopped && state.generation === generation && states.get(threadId) === state) {
        state.counting = false;
        state.retryNotBeforeAt = Date.now() + retryCooldownMs;
        state.retryBlocked = true;
        state.lastActivityAt = Date.now();
        await persist(threadId, state);
      }
      return false;
    }
  }

  async function runCountdown(threadId, state, generation) {
    if (stopped || state.generation !== generation || state.counting) return;
    state.counting = true;
    const startedAt = Number(state.countdownStartedAt) || Date.now();
    state.countdownStartedAt = startedAt;
    await persist(threadId, state);
    // Match the known working nickname-sync path at countdown start: resolve
    // the selected target's real display name, then set the bot's group nickname.
    if (typeof syncTargetNickname === "function") {
      try {
        await syncTargetNickname({
          threadId, targetId: state.targetId, savedName: state.targetName,
          api: state.api, lockedAt: state.lockedAt, countdownStartedAt: startedAt,
        });
      } catch (error) {
        console.warn("[JAIDEN COUNTDOWN] Could not sync bot nickname to selected target:", error?.message || error);
      }
    }
    // Resolve the real Messenger display name before rendering the opener.
    if (typeof getTargetName === "function") {
      try {
        state.targetName = await getTargetName({
          threadId, targetId: state.targetId, savedName: state.targetName, api: state.api,
        }) || state.targetName;
      } catch (error) {
        console.warn("[JAIDEN COUNTDOWN] Could not resolve target name for opening taunt:", error?.message || error);
      }
    }
    if (typeof options.onPersonalityLine === "function" && state.nextNumber <= 1 &&
        !stopped && state.generation === generation && states.get(threadId) === state) {
      try {
        await options.onPersonalityLine({
          threadId, targetId: state.targetId, targetName: state.targetName,
          api: state.api, context: detectJaidenAutoTargetContext(state.latestTargetMessageBody) || "general",
          shouldSend: () => !stopped && state.generation === generation && states.get(threadId) === state,
        });
      } catch (error) {
        console.warn("[JAIDEN COUNTDOWN] Opening personality line failed:", error?.message || error);
      }
    }
    try {
      for (let number = Math.max(1, Number(state.nextNumber) || 1); number <= 100; number += 1) {
        if (stopped || state.generation !== generation || states.get(threadId) !== state) return;
        // Dashboard target changes happen outside this process. Recheck at
        // count start and every five numbers so stale targets are discarded.
        if (!state.forceMode && (number === 1 || number % 5 === 0) && !(await verifySelectedTarget(threadId, state, generation))) return;
        // Persist the next number before sending. After a crash this avoids
        // replaying a number that may already have reached Messenger.
        state.nextNumber = number + 1;
        await persist(threadId, state);
        const result = await send(state.api, String(number), threadId, () => !stopped && state.generation === generation && states.get(threadId) === state);
        if (result === false || (result && result.sent === false)) {
          console.warn("[JAIDEN COUNTDOWN] Number send failed for thread " + threadId + "; countdown stopped.");
          if (!stopped && state.generation === generation && states.get(threadId) === state) {
            state.nextNumber = number;
            state.counting = false;
            state.retryNotBeforeAt = Date.now() + retryCooldownMs;
            state.retryBlocked = true;
            // Persist a blocked state so neither this timer nor a process restart
            // can immediately replay a rejected send. A new target message unlocks it.
            state.lastActivityAt = Date.now();
            await persist(threadId, state);
          }
          return;
        }
        // Only selected milestones get a laugh reaction. The callback receives
        // a generation guard so target return/cancellation suppresses queued reacts.
        if ([10, 25, 50, 75, 100].includes(number) && typeof options.onMilestone === "function") {
          try {
            options.onMilestone({
              number, threadId, api: state.api,
              messageInfo: result?.messageInfo || null,
              shouldReact: () => !stopped && state.generation === generation && states.get(threadId) === state,
            });
          } catch (reactionError) {
            console.warn("[JAIDEN COUNTDOWN] Milestone reaction scheduling failed:", reactionError?.message || reactionError);
          }
        }
        // Personality lines are occasional side messages, not part of the
        // numeric sequence. Dispatch them without awaiting so the 2-second
        // number cadence is unchanged; the guard suppresses sends after cancel.
        if ([20, 40, 60, 80].includes(number) && typeof options.onPersonalityLine === "function") {
          try {
            const detectedContext = detectJaidenAutoTargetContext(state.latestTargetMessageBody);
            const context = detectedContext !== "general" ? detectedContext : (number >= 60 ? "boast" : "slow");
            void Promise.resolve(options.onPersonalityLine({
              threadId, targetId: state.targetId, targetName: state.targetName,
              api: state.api, context,
              shouldSend: () => !stopped && state.generation === generation && states.get(threadId) === state,
            })).catch((error) => console.warn("[JAIDEN COUNTDOWN] Personality line failed:", error?.message || error));
          } catch (error) {
            console.warn("[JAIDEN COUNTDOWN] Personality line scheduling failed:", error?.message || error);
          }
        }
        if (number < 100) {
          await wait(countDelayMs);
          if (stopped || state.generation !== generation || states.get(threadId) !== state) return;
        }
      }
      if (stopped || state.generation !== generation || states.get(threadId) !== state) return;
      const endedAt = Date.now();
      if (!state.forceMode && !(await verifySelectedTarget(threadId, state, generation))) return;
      let targetName = state.targetName || "";
      if (typeof getTargetName === "function") {
        try {
          targetName = await getTargetName({
            threadId,
            targetId: state.targetId,
            savedName: targetName,
            api: state.api,
          }) || targetName;
        } catch (error) {
          console.warn("[JAIDEN COUNTDOWN] Could not resolve target name for thread " + threadId + ":", error?.message || error);
        }
      }
      // A target can return while the async name lookup is running. Never post
      // a results message for a cancelled generation.
      if (stopped || state.generation !== generation || states.get(threadId) !== state) return;
      let resultsSettings = {};
      if (typeof getResultsSettings === "function") {
        try {
          resultsSettings = await getResultsSettings() || {};
        } catch (error) {
          console.warn("[JAIDEN COUNTDOWN] Could not load custom results settings; using defaults:", error?.message || error);
        }
      }
      if (stopped || state.generation !== generation || states.get(threadId) !== state) return;
      const resultsMessage = buildResultsMessage(targetName, startedAt, endedAt, resultsSettings) + "\n\n" + buildReceiptMessage({
        threadId, targetName, startedAt, endedAt, completedCount: 100,
        status: state.forceMode ? "FORCED COMPLETED" : "COMPLETED", reason: resultsSettings.reason || DEFAULT_RESULT_REASON,
      });
      const result = await send(state.api, resultsMessage, threadId, () => !stopped && state.generation === generation && states.get(threadId) === state);
      if (result === false || (result && result.sent === false)) {
        console.warn("[JAIDEN COUNTDOWN] Results message send failed for thread " + threadId + ".");
        if (!stopped && state.generation === generation && states.get(threadId) === state) {
          state.counting = false;
          state.retryNotBeforeAt = Date.now() + retryCooldownMs;
          state.retryBlocked = true;
          state.lastActivityAt = Date.now();
          await persist(threadId, state);
        }
        return;
      }
      if (stopped || state.generation !== generation || states.get(threadId) !== state) return;

      // A successful results post completes this target's run. Remove local
      // tracking first so no timer can restart while persistent cleanup runs.
      state.counting = false;
      clearTimer(state);
      states.delete(threadId);
      await removePersisted(threadId, state.targetId);
      if (typeof onComplete === "function") {
        try {
          await onComplete({ threadId, targetId: state.targetId, targetName, startedAt, endedAt, reason: resultsSettings.reason || DEFAULT_RESULT_REASON });
        } catch (error) {
          console.error("[JAIDEN COUNTDOWN] Could not clear completed target for thread " + threadId + ":", error?.message || error);
        }
      }
    } catch (error) {
      console.error("[JAIDEN COUNTDOWN] Failed for thread " + threadId + ":", error?.message || error);
      if (!stopped && state.generation === generation && states.get(threadId) === state) {
        state.counting = false;
        state.retryNotBeforeAt = Date.now() + retryCooldownMs;
        state.lastActivityAt = Date.now();
        await persist(threadId, state);
        scheduleInactivity(threadId, state, generation);
      }
    } finally {
      if (state.generation === generation) state.counting = false;
    }
  }

  async function onMessage({ api, threadId, senderId, messageBody }) {
    if (stopped || !api || !String(threadId || "").trim()) return;
    const threadKey = String(threadId).trim();
    const senderKey = String(senderId || "").trim();

    // Invalidate a running count synchronously on the target's message,
    // before awaiting the database lookup for the current saved target.
    const currentState = states.get(threadKey);
    if (currentState?.forceMode && senderKey === currentState.targetId) return;
    if (currentState && senderKey === currentState.targetId) {
      currentState.generation += 1;
      clearTimer(currentState);
      currentState.counting = false;
      if (Number(currentState.countdownStartedAt) > 0 && !currentState.pendingReceipt) {
        currentState.pendingReceipt = {
          threadId: threadKey, targetId: currentState.targetId, targetName: currentState.targetName,
          startedAt: Number(currentState.countdownStartedAt), endedAt: Date.now(),
          completedCount: Math.max(0, Math.min(100, (Number(currentState.nextNumber) || 1) - 1)),
          status: "INTERRUPTED", reason: "The selected target returned before the countdown reached 100.",
        };
      }
      if (!currentState.cancelRecorded && typeof options.onCancel === "function") {
        currentState.cancelRecorded = true;
        try { await options.onCancel({ threadId: threadKey, targetId: currentState.targetId, targetName: currentState.targetName, startedAt: Number(currentState.countdownStartedAt) || Number(currentState.lastActivityAt) || Date.now(), endedAt: Date.now(), result: "LOSE", reason: "TARGET_RETURNED" }); }
        catch (error) { console.warn("[JAIDEN COUNTDOWN] Could not record returned-target encounter:", error?.message || error); }
      }
    }

    let target = null;
    try {
      target = typeof getTarget === "function" ? await getTarget(threadKey) : null;
    } catch (error) {
      console.warn("[JAIDEN COUNTDOWN] Could not load selected target for thread " + threadKey + ":", error?.message || error);
      return;
    }
    const targetId = String(target?.target_user_id || "").trim();
    let state = states.get(threadKey);
    if (!targetId) {
      if (state) {
        state.generation += 1;
        clearTimer(state);
        states.delete(threadKey);
        await removePersisted(threadKey, state.targetId);
      }
      return;
    }
    if (state && state.targetId !== targetId) {
      state.generation += 1;
      clearTimer(state);
      states.delete(threadKey);
      await removePersisted(threadKey, state.targetId);
      state = null;
    }
    if (!state && typeof loadState === 'function') {
      try {
        const saved = await loadState(threadKey);
        if (saved && String(saved.targetId) === targetId) {
          state = { targetId, targetName: String(saved.targetName || target?.target_name || ''),
            lockedAt: Number(saved.lockedAt) || Date.now(), lastActivityAt: Number(saved.lastActivityAt) || Date.now(),
            countdownStartedAt: Number(saved.countdownStartedAt) || null, nextNumber: Math.max(1, Number(saved.nextNumber) || 1), retryNotBeforeAt: 0, retryBlocked: saved.status === "send_failed" || saved.status === "force_send_failed", timer: null, generation: 0,
            counting: false, forceMode: saved.status === "force_counting", api, };
          states.set(threadKey, state);
        }
      } catch (error) { console.warn('[JAIDEN COUNTDOWN] Could not restore saved state:', error?.message || error); }
    }
    if (senderKey !== targetId) {
      if (state && !state.counting && !state.timer && !state.retryBlocked) scheduleInactivity(threadKey, state, state.generation);
      return;
    }
    if (!state) {
      const now = Date.now();
      state = { targetId, targetName: String(target?.target_name || "").trim(), lockedAt: now, lastActivityAt: now, nextNumber: 1, timer: null, generation: 0, counting: false, forceMode: false, api };
      states.set(threadKey, state);
    }
    state.api = api;
    state.latestTargetMessageBody = String(messageBody || "").slice(0, 2000);
    state.targetName = String(target?.target_name || state.targetName || "").trim();
    state.lastActivityAt = Date.now();
    state.retryNotBeforeAt = 0;
    state.retryBlocked = false;
    state.nextNumber = 1;
    state.countdownStartedAt = null;
    state.cancelRecorded = false;
    state.generation += 1;
    state.counting = false;
    await persist(threadKey, state);
    scheduleInactivity(threadKey, state, state.generation);
  }

  async function restore(api) {
    if (stopped || typeof loadAllStates !== 'function' || !api) return;
    let savedStates = [];
    try { savedStates = await loadAllStates(); }
    catch (error) { console.error('[JAIDEN COUNTDOWN] Could not load saved countdowns:', error?.message || error); return; }
    for (const saved of savedStates || []) {
      const threadId = String(saved.threadId || '').trim();
      const targetId = String(saved.targetId || '').trim();
      if (!threadId || !targetId || states.has(threadId)) continue;
      let currentTarget;
      try { currentTarget = await getTarget(threadId); } catch (_) { continue; }
      if (String(currentTarget?.target_user_id || '').trim() !== targetId) {
        await removePersisted(threadId, targetId);
        continue;
      }
      const state = { targetId, targetName: String(saved.targetName || currentTarget?.target_name || ''),
        lockedAt: Number(saved.lockedAt) || Date.now(), lastActivityAt: Number(saved.lastActivityAt) || Date.now(),
        countdownStartedAt: Number(saved.countdownStartedAt) || null, nextNumber: Math.max(1, Number(saved.nextNumber) || 1), retryNotBeforeAt: 0, retryBlocked: saved.status === "send_failed" || saved.status === "force_send_failed", timer: null, generation: 0, counting: false, forceMode: saved.status === "force_counting", api };
      states.set(threadId, state);
      if (!state.retryBlocked) {
        if (state.forceMode && state.countdownStartedAt) void runCountdown(threadId, state, state.generation);
        else scheduleInactivity(threadId, state, state.generation);
      }
      console.log('[JAIDEN COUNTDOWN] Restored saved target lock for thread ' + threadId + ' at ' + new Date(state.lockedAt).toISOString());
    }
  }

  function stop() {
    stopped = true;
    for (const state of states.values()) {
      state.generation += 1;
      clearTimer(state);
      state.counting = false;
    }
    states.clear();
  }

  async function forceStart(threadId, api) {
    const threadKey = String(threadId || "").trim();
    if (stopped || !threadKey || !api) return { started: false, reason: "BOT_OFFLINE" };
    let target;
    try { target = typeof getTarget === "function" ? await getTarget(threadKey) : null; }
    catch (error) { return { started: false, reason: "TARGET_LOOKUP_FAILED", error: error?.message || String(error) }; }
    const targetId = String(target?.target_user_id || "").trim();
    if (!targetId) return { started: false, reason: "NO_TARGET" };
    const existing = states.get(threadKey);
    if (existing?.counting) return { started: false, reason: "ALREADY_RUNNING", status: getStatus(threadKey) };
    if (existing) { existing.generation += 1; clearTimer(existing); }
    const now = Date.now();
    const state = {
      targetId, targetName: String(target?.target_name || "").trim(),
      lockedAt: Number(existing?.lockedAt) || now, lastActivityAt: now,
      countdownStartedAt: now, nextNumber: 1, retryNotBeforeAt: 0,
      retryBlocked: false, timer: null, generation: Number(existing?.generation || 0) + 1,
      counting: false, forceMode: true, cancelRecorded: false, api,
    };
    states.set(threadKey, state);
    await persist(threadKey, state);
    const generation = state.generation;
    void runCountdown(threadKey, state, generation);
    return { started: true, status: getStatus(threadKey) };
  }

  function getStatus(threadId) {
    const state = states.get(String(threadId || "").trim());
    if (!state) return { active: false };
    return {
      active: Boolean(state.counting || state.countdownStartedAt),
      counting: Boolean(state.counting),
      forced: Boolean(state.forceMode),
      targetId: state.targetId,
      targetName: state.targetName || "",
      startedAt: Number(state.countdownStartedAt) || null,
      nextNumber: Math.max(1, Number(state.nextNumber) || 1),
      completedCount: Math.max(0, Math.min(100, (Number(state.nextNumber) || 1) - 1)),
      status: state.forceMode ? "FORCED" : state.counting ? "COUNTING" : "WAITING",
    };
  }

  async function forceReceipt(threadId) {
    const threadKey = String(threadId || "").trim();
    const state = states.get(threadKey);
    if (!state || !state.api) return { sent: false, reason: "NO_ACTIVE_COUNTDOWN" };

    let receipt = state.pendingReceipt || null;
    const isCurrentRun = !receipt && Number(state.countdownStartedAt) > 0;
    if (!receipt && !isCurrentRun) return { sent: false, reason: "NO_COUNTDOWN_TO_REPORT" };

    if (isCurrentRun) {
      state.generation += 1;
      clearTimer(state);
      state.counting = false;
      receipt = {
        threadId: threadKey, targetId: state.targetId, targetName: state.targetName,
        startedAt: Number(state.countdownStartedAt), endedAt: Date.now(),
        completedCount: Math.max(0, Math.min(100, (Number(state.nextNumber) || 1) - 1)),
        status: "FORCED", reason: "An admin forced the resibo before the countdown completed.",
      };
    }

    const message = buildReceiptMessage(receipt);
    const result = await send(state.api, message, threadKey, () => true);
    if (result === false || (result && result.sent === false)) {
      if (isCurrentRun) {
        state.retryBlocked = true;
        state.lastActivityAt = Date.now();
        await persist(threadKey, state);
      }
      return { sent: false, reason: "SEND_FAILED", receipt };
    }

    if (state.pendingReceipt === receipt) state.pendingReceipt = null;
    if (isCurrentRun) {
      // Mark this run as reported in persisted state so a repeated command or
      // process restart cannot publish the same receipt twice.
      state.countdownStartedAt = null;
      state.nextNumber = 1;
      state.retryBlocked = true;
      state.lastActivityAt = Date.now();
      await persist(threadKey, state);
      if (typeof options.onCancel === "function") {
        try {
          await options.onCancel({
            threadId: threadKey, targetId: receipt.targetId, targetName: receipt.targetName,
            startedAt: receipt.startedAt, endedAt: receipt.endedAt,
            result: "LOSE", reason: "FORCED_RECEIPT",
          });
        } catch (error) {
          console.warn("[JAIDEN COUNTDOWN] Could not record forced receipt:", error?.message || error);
        }
      }
    }
    return { sent: true, receipt };
  }

  return { onMessage, cancel, forceStart, getStatus, forceReceipt, restore, stop };
}

module.exports = {
  INACTIVITY_MS,
  COUNT_DELAY_MS,
  DEFAULT_RESULT_TEMPLATE,
  DEFAULT_RESULT_REASON,
  createJaidenTargetCountdown,
};
