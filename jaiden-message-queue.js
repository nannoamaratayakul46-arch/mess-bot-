"use strict";

// Dedicated FIFO for dashboard-selected Jaiden replies.
// Jobs are never coalesced, replaced, or passed through a burst decision window.
function createJaidenMessageQueue(options = {}) {
  const send = options.send;
  const maxQueuePerThread = Math.max(1, Number(options.maxQueuePerThread) || 1000);
  const retryDelays = Array.isArray(options.retryDelays)
    ? options.retryDelays.filter((n) => Number.isFinite(n) && n >= 0).slice(0, 3)
    : [500, 1500];
  const queues = new Map();
  let stopped = false;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function drain(threadKey, state) {
    if (state.running || stopped) return;
    state.running = true;
    try {
      while (!stopped && state.jobs.length) {
        const item = state.jobs[0];
        const gap = Math.max(0, item.intervalMs - (Date.now() - state.lastStartedAt));
        if (gap) await wait(gap);
        if (stopped) break;
        let completed = false;
        let thrownRetries = 0;
        while (!stopped && !completed) {
          state.lastStartedAt = Date.now();
          try {
            const result = await send(item.job);
            // False can mean a timeout after Messenger accepted the send. Never retry blindly.
            if (result === false) item.resolve({ accepted: true, sent: false, attempts: thrownRetries + 1, outcome: "send-failed-or-unknown" });
            else item.resolve({ accepted: true, sent: true, attempts: thrownRetries + 1 });
            completed = true;
          } catch (error) {
            if (thrownRetries >= retryDelays.length) {
              item.resolve({ accepted: true, sent: false, attempts: thrownRetries + 1, outcome: "processor-error" });
              console.error("[JAIDEN QUEUE] Job failed after bounded retries:", error?.message || error);
              completed = true;
            } else {
              const delay = retryDelays[thrownRetries++];
              await wait(delay);
            }
          }
        }
        state.jobs.shift();
      }
    } finally {
      state.running = false;
      if (!state.jobs.length) queues.delete(threadKey);
      else if (!stopped) setImmediate(() => drain(threadKey, state));
    }
  }

  function enqueue(threadID, job, intervalMs = 3000) {
    const threadKey = String(threadID || "").trim();
    if (stopped || !threadKey || !job || !job.api || !job.message || typeof send !== "function")
      return Promise.resolve({ accepted: false, sent: false, outcome: "invalid-or-stopped" });
    let state = queues.get(threadKey);
    if (!state) { state = { jobs: [], running: false, lastStartedAt: 0 }; queues.set(threadKey, state); }
    if (state.jobs.length >= maxQueuePerThread) {
      console.error("[JAIDEN QUEUE] Queue full for thread " + threadKey + "; message was not accepted.");
      return Promise.resolve({ accepted: false, sent: false, outcome: "queue-full" });
    }
    const requestedInterval = Number(intervalMs);
    const safeInterval = Number.isFinite(requestedInterval) ? Math.max(0, Math.min(120000, requestedInterval)) : 3000;
    const result = new Promise((resolve) => state.jobs.push({ job: { ...job }, intervalMs: safeInterval, resolve }));
    drain(threadKey, state);
    return result;
  }

  function clear(threadID) {
    const prefix = threadID == null ? null : String(threadID || "").trim();
    let cleared = 0;
    for (const [key, state] of queues) {
      if (prefix !== null && key !== prefix) continue;
      for (const item of state.jobs) { item.resolve({ accepted: false, sent: false, outcome: "cleared" }); cleared++; }
      state.jobs.length = 0;
      if (!state.running) queues.delete(key);
    }
    return cleared;
  }

  function stats(threadID) {
    const state = queues.get(String(threadID || "").trim());
    return { pending: state ? state.jobs.length : 0, running: Boolean(state?.running) };
  }
  function stop() { stopped = true; clear(); }
  return { enqueue, clear, stats, stop };
}

module.exports = { createJaidenMessageQueue };
