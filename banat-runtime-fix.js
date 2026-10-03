"use strict";

const Module = require("module");

const GAP_MS = 5_000;
const COALESCE_MS = 750;
const PENDING_PER_THREAD = 16;

const originalLoader = Module._extensions[".js"];

Module._extensions[".js"] = function banatRuntimeLoader(module, filename) {
  let source = null;

  if (filename.endsWith("/index.js") || filename.endsWith("\\index.js")) {
    source = require("fs").readFileSync(filename, "utf8");

    const start = source.indexOf("function acceptBanatBurstMessage(threadID, job) {");
    const end = source.indexOf("\nasync function handleAutomaticBanatMessage({", start);

    if (start >= 0 && end > start) {
      const replacement = `
function acceptBanatBurstMessage(threadID, job) {
  const key = String(threadID || "");
  let state = banatBurstState.get(key);

  if (!state) {
    state = {
      queue: [],
      running: false,
      lastSentAt: 0,
      coalesceTimer: null,
      cleanupTimer: null,
    };
    banatBurstState.set(key, state);
  }

  if (state.cleanupTimer) {
    clearTimeout(state.cleanupTimer);
    state.cleanupTimer = null;
  }

  const senderKey = String(job.senderId || "");

  // Keep only the newest message from each sender. This prevents one noisy
  // person from filling the queue while still letting several people compete
  // for the next randomized turn.
  if (senderKey) {
    const existingIndex = state.queue.findIndex(
      (candidate) => String(candidate.senderId || "") === senderKey
    );

    if (existingIndex >= 0) {
      state.queue[existingIndex] = {
        ...job,
        queuedAt: Date.now(),
      };
    } else {
      state.queue.push({
        ...job,
        queuedAt: Date.now(),
      });
    }
  } else {
    state.queue.push({
      ...job,
      queuedAt: Date.now(),
    });
  }

  if (state.queue.length > PENDING_PER_THREAD) {
    state.queue.splice(0, state.queue.length - PENDING_PER_THREAD);
  }

  if (!state.running && !state.coalesceTimer) {
    const sinceLast = Date.now() - state.lastSentAt;
    const waitMs = state.lastSentAt
      ? Math.max(0, GAP_MS - sinceLast)
      : COALESCE_MS;

    state.coalesceTimer = setTimeout(() => {
      state.coalesceTimer = null;
      runBanatBurstQueue(key).catch((error) => {
        console.error("[BANAT] Burst queue failed:", error);
      });
    }, waitMs);
  }

  return true;
}

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

async function runBanatBurstQueue(threadID) {
  const key = String(threadID || "");
  const state = banatBurstState.get(key);

  if (!state || state.running || !state.queue.length) {
    return;
  }

  state.running = true;

  try {
    const sinceLast = Date.now() - state.lastSentAt;
    if (state.lastSentAt && sinceLast < GAP_MS) {
      await sleep(GAP_MS - sinceLast);
    }

    if (!state.queue.length) {
      return;
    }

    // One reply per 5-second window. Take the newest message from each
    // sender, then randomly choose exactly one sender for this turn.
    const pending = state.queue.splice(0, state.queue.length);
    const eligible = pending.filter(
      (candidate) => String(candidate.senderId || "") !== ""
    );

    if (!eligible.length) {
      return;
    }

    const job =
      eligible[Math.floor(Math.random() * eligible.length)];

    const age = Date.now() - Number(job.queuedAt || Date.now());
    if (age > BANAT_STALE_JOB_MS) {
      console.log("[BANAT] Dropping stale queued reply in " + key);
      return;
    }

    const sent = await sendBanatReplyWithTyping(
      job.api,
      job.message,
      key,
      job.replyToMessageID,
      job.attachMeme,
      job.linkUrl,
      0,
      job.incomingText || ""
    );

    if (sent) {
      state.lastSentAt = Date.now();
    }
  } finally {
    const current = banatBurstState.get(key);

    if (current !== state) {
      return;
    }

    state.running = false;

    if (state.queue.length) {
      const sinceLast = Date.now() - state.lastSentAt;
      const waitMs = state.lastSentAt
        ? Math.max(0, GAP_MS - sinceLast)
        : COALESCE_MS;

      if (!state.coalesceTimer) {
        state.coalesceTimer = setTimeout(() => {
          state.coalesceTimer = null;
          runBanatBurstQueue(key).catch((error) => {
            console.error("[BANAT] Burst queue continuation failed:", error);
          });
        }, waitMs);
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
      }, GAP_MS);
    }
  }
}
`;

      source = source.slice(0, start) + replacement + source.slice(end);
    }

    source = source.replace(
      "incomingText: body,\n      }\n    );",
      "incomingText: body,\n        senderId,\n      }\n    );"
    );
  }

  module._compile(source, filename);
};

module.exports = {};
