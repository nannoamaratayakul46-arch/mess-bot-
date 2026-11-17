"use strict";

// Queue up to 700 operator-authored announcements. Each run is deliberately
// bounded to 20 sends; remaining items stay queued for a later operator start.
const MAX_BATCH = 20;
const MAX_QUEUE_ITEMS = 700;
const DEFAULT_MAX_MINUTES = 5;
const MIN_MAX_MINUTES = 1;
const MAX_MAX_MINUTES = 10;
const MIN_DELAY_MS = 30_000;
const TIME_CHECK_PROBABILITY = 0.2;

const queues = new Map();
const activeSessions = new Map();

function normalizeThreadID(threadID) {
  const id = String(threadID || "").trim();
  if (!id || id.length > 128) throw new Error("A valid threadID is required.");
  return id;
}

function getQueue(threadID) {
  const id = normalizeThreadID(threadID);
  let state = queues.get(id);
  if (!state) {
    state = { items: [], sent: 0, failed: 0, timeChecks: 0, lastError: null, updatedAt: null };
    queues.set(id, state);
  }
  return state;
}

function enqueueItems(threadID, items) {
  const id = normalizeThreadID(threadID);
  const state = getQueue(id);
  if (activeSessions.has(id)) throw new Error("A scheduler batch is already running in this group.");
  if (!Array.isArray(items) || items.length === 0) throw new Error("Provide at least one announcement.");
  if (items.length > MAX_QUEUE_ITEMS) throw new Error("A schedule can contain at most " + MAX_QUEUE_ITEMS + " items.");
  if (state.items.length) throw new Error("This group already has pending items. Resume the existing queue first.");
  const normalized = items.map((item, index) => {
    const value = typeof item === "string" ? item : item?.text;
    if (typeof value !== "string" || !value.trim()) throw new Error("Item " + (index + 1) + " is empty or invalid.");
    if (value.length > 2000) throw new Error("Item " + (index + 1) + " exceeds 2,000 characters.");
    return value.trim();
  });
  state.items.push(...normalized);
  state.lastError = null;
  state.updatedAt = new Date().toISOString();
  return { threadID: id, added: normalized.length, queued: state.items.length, pending: state.items.length };
}

function randomDelayMs(maxMinutes, minimumMs = MIN_DELAY_MS, maximumMs = maxMinutes * 60_000) {
  const lower = Math.max(1, Math.floor(minimumMs));
  const upper = Math.max(lower, Math.floor(maximumMs));
  return Math.floor(lower + Math.random() * (upper - lower + 1));
}

function formatManilaTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const hour24 = Number(parts.find(part => part.type === "hour")?.value || 0);
  const minute = parts.find(part => part.type === "minute")?.value || "00";
  return String(hour24 % 12 || 12) + ":" + minute;
}

function sendMessageAsync(api, message, threadID, sendOverride) {
  return new Promise((resolve, reject) => {
    const send = typeof sendOverride === "function"
      ? sendOverride
      : (messenger, text, targetThreadID, callback) => messenger.sendMessage(text, targetThreadID, callback);
    if (typeof send !== "function" || (typeof sendOverride !== "function" && typeof api?.sendMessage !== "function")) {
      return reject(new Error("Messenger send function is unavailable."));
    }
    let settled = false;
    const finish = (error, info) => {
      if (settled) return;
      settled = true;
      error ? reject(error) : resolve(info);
    };
    try {
      const result = send(api, message, threadID, (error, info) => finish(error, info));
      if (result && typeof result.then === "function") result.then(info => finish(null, info), error => finish(error));
    } catch (error) { finish(error); }
  });
}

function interruptibleSleep(session, ms) {
  if (session.stopped) return Promise.resolve(false);
  return new Promise(resolve => {
    let settled = false;
    let timer;
    const finish = completed => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (session.cancelSleep === cancel) session.cancelSleep = null;
      resolve(completed);
    };
    const cancel = () => finish(false);
    timer = setTimeout(() => finish(!session.stopped), ms);
    session.cancelSleep = cancel;
  });
}

async function startSession(api, threadID, options = {}) {
  const id = normalizeThreadID(threadID);
  if (activeSessions.has(id)) throw new Error("A scheduler batch is already active in this group.");
  const state = getQueue(id);
  if (!state.items.length) throw new Error("There are no pending announcements for this group.");

  const maxMinutes = options.maxMinutes == null ? DEFAULT_MAX_MINUTES : Number(options.maxMinutes);
  if (!Number.isFinite(maxMinutes) || maxMinutes < MIN_MAX_MINUTES || maxMinutes > MAX_MAX_MINUTES) {
    throw new Error("maxMinutes must be between 1 and 10.");
  }
  const sendOverride = options.sendMessage;
  if (sendOverride !== undefined && typeof sendOverride !== "function") throw new TypeError("sendMessage must be a function.");
  if (typeof sendOverride !== "function" && typeof api?.sendMessage !== "function") throw new Error("api.sendMessage is unavailable.");

  const session = {
    threadID: id, stopped: false, sentThisBatch: 0, timeCheckActive: false,
    timeCheckSentThisBatch: false, timeChecksThisBatch: 0,
    enableTimeCheck: options.enableTimeCheck === true,
    startedAt: new Date().toISOString(), cancelSleep: null,
    stop() {
      if (this.stopped) return;
      this.stopped = true;
      if (this.cancelSleep) { this.cancelSleep(); this.cancelSleep = null; }
    },
  };
  activeSessions.set(id, session);

  try {
    while (!session.stopped && session.sentThisBatch < MAX_BATCH && state.items.length) {
      const text = state.items[0];
      try {
        await sendMessageAsync(api, text, id, sendOverride);
        state.items.shift();
        state.sent += 1;
        session.sentThisBatch += 1;
        state.lastError = null;
        state.updatedAt = new Date().toISOString();
      } catch (error) {
        state.failed += 1;
        state.lastError = String(error?.message || error).slice(0, 500);
        state.updatedAt = new Date().toISOString();
        console.error("[SCHEDULER] Announcement send failed; batch paused:", state.lastError);
        break;
      }

      if (session.stopped || session.sentThisBatch >= MAX_BATCH || !state.items.length) break;
      const waited = await interruptibleSleep(session, randomDelayMs(maxMinutes, options.minDelayMs, options.maxDelayMs));
      if (!waited || session.stopped) break;

      // Time Check is optional and capped to one status post per bounded run.
      if (session.enableTimeCheck && !session.timeCheckSentThisBatch &&
          Math.random() < TIME_CHECK_PROBABILITY && !session.stopped) {
        session.timeCheckActive = true;
        try {
          const timeMessage = "time check: " + formatManilaTime() + ", wag sana d.o isa jan";
          await sendMessageAsync(api, timeMessage, id, sendOverride);
          session.timeCheckSentThisBatch = true;
          session.timeChecksThisBatch += 1;
          state.timeChecks += 1;
          state.updatedAt = new Date().toISOString();
        } catch (error) {
          state.lastError = "Time Check failed: " + String(error?.message || error).slice(0, 450);
          state.updatedAt = new Date().toISOString();
          console.warn("[SCHEDULER]", state.lastError);
        } finally {
          session.timeCheckActive = false;
        }
      }
    }
    return getSessionStatus(id);
  } finally {
    session.stop();
    session.timeCheckActive = false;
    if (activeSessions.get(id) === session) activeSessions.delete(id);
  }
}

function stopSession(threadID) {
  const id = normalizeThreadID(threadID);
  const session = activeSessions.get(id);
  if (!session) return false;
  session.stop();
  return true;
}

function getSessionStatus(threadID) {
  const id = normalizeThreadID(threadID);
  const state = getQueue(id);
  const session = activeSessions.get(id);
  return {
    threadID: id, active: Boolean(session), stopped: Boolean(session?.stopped),
    sentThisBatch: session?.sentThisBatch || 0, sent: state.sent,
    remaining: state.items.length, pending: state.items.length, failed: state.failed,
    timeCheckActive: Boolean(session?.timeCheckActive),
    timeChecks: state.timeChecks,
    timeChecksThisBatch: session?.timeChecksThisBatch || 0,
    lastError: state.lastError, startedAt: session?.startedAt || null,
    updatedAt: state.updatedAt, maxBatch: MAX_BATCH, maxQueueItems: MAX_QUEUE_ITEMS,
  };
}

function getActiveThreadIDs() { return Array.from(activeSessions.keys()); }

module.exports = {
  MAX_BATCH, MAX_QUEUE_ITEMS, DEFAULT_MAX_MINUTES,
  enqueueItems, startSession, stopSession, getSessionStatus, getActiveThreadIDs,
  randomDelayMs, formatManilaTime,
};
