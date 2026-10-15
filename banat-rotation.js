"use strict";

// One active speaker per group for each five-second rotation window.
// Speakers are learned from messages while a public Banat pool is enabled.
const configuredRotationInterval = Number(process.env.ECLIPSE_BANAT_TARGET_ROTATION_MS || 5000);
const ROTATION_INTERVAL_MS =
  Number.isFinite(configuredRotationInterval) && configuredRotationInterval >= 1000
    ? configuredRotationInterval
    : 5000;
const SPEAKER_TTL_MS = 60 * 60 * 1000;
const MAX_THREADS = 1000;
const MAX_SPEAKERS_PER_THREAD = 100;
const states = new Map();

function prune(now) {
  for (const [threadID, state] of states) {
    if (now - state.lastActivityAt > SPEAKER_TTL_MS) {
      states.delete(threadID);
    }
  }
  while (states.size > MAX_THREADS) {
    const oldest = states.keys().next().value;
    states.delete(oldest);
  }
}

function trackBanatRotation(threadID, senderID, options = {}) {
  const thread = String(threadID || "").trim();
  const sender = String(senderID || "").trim();
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const random = typeof options.random === "function" ? options.random : Math.random;

  if (!thread || !sender) {
    return { targetId: null, isTarget: false, rotated: false, speakerCount: 0 };
  }

  prune(now);
  let state = states.get(thread);
  if (!state) {
    state = {
      targetId: sender,
      targetStartedAt: now,
      speakers: [],
      lastActivityAt: now,
    };
    states.set(thread, state);
  }

  state.lastActivityAt = now;
  const known = state.speakers.find(item => item.id === sender);
  if (known) {
    known.lastSeenAt = now;
  } else {
    state.speakers.push({ id: sender, lastSeenAt: now });
    if (state.speakers.length > MAX_SPEAKERS_PER_THREAD) {
      state.speakers.sort((a, b) => a.lastSeenAt - b.lastSeenAt);
      state.speakers.splice(0, state.speakers.length - MAX_SPEAKERS_PER_THREAD);
    }
  }

  state.speakers = state.speakers.filter(item => now - item.lastSeenAt <= SPEAKER_TTL_MS);
  const alternatives = state.speakers
    .map(item => item.id)
    .filter(id => id !== state.targetId);

  let rotated = false;
  if (now - state.targetStartedAt >= ROTATION_INTERVAL_MS && alternatives.length) {
    const rawIndex = Math.floor(random() * alternatives.length);
    const index = Math.max(0, Math.min(alternatives.length - 1, rawIndex));
    const previousTarget = state.targetId;
    state.targetId = alternatives[index];
    state.targetStartedAt = now;
    rotated = state.targetId !== previousTarget;
  }

  return {
    targetId: state.targetId,
    isTarget: sender === state.targetId,
    rotated,
    speakerCount: state.speakers.length,
    intervalMs: ROTATION_INTERVAL_MS,
  };
}

function markBanatRotationReply(threadID, targetID, now = Date.now()) {
  const thread = String(threadID || "").trim();
  const target = String(targetID || "").trim();
  const state = states.get(thread);
  if (!state || !target || state.targetId !== target) return false;
  const timestamp = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  state.targetStartedAt = timestamp;
  state.lastActivityAt = timestamp;
  return true;
}

function clearBanatRotation(threadID) {
  if (threadID == null) {
    states.clear();
    return;
  }
  states.delete(String(threadID || "").trim());
}

module.exports = {
  ROTATION_INTERVAL_MS,
  trackBanatRotation,
  markBanatRotationReply,
  clearBanatRotation,
};
