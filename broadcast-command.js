"use strict";

const { isAdmin } = require("./permissions");

const seenThreads = new Map();
const pendingTimers = new Set();
const recentBroadcasts = new Map();

const THREAD_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const BROADCAST_GAP_MS = Math.max(
  500,
  Number(process.env.ECLIPSE_BROADCAST_GAP_MS || 500)
);
const MAX_THREADS = Math.max(
  50,
  Math.min(5000, Number(process.env.ECLIPSE_BROADCAST_MAX_THREADS || 1000))
);
const DUPLICATE_WINDOW_MS = 60_000;

function rememberThread(threadID) {
  const key = String(threadID || "").trim();
  if (!key) return;

  seenThreads.set(key, Date.now());

  if (seenThreads.size <= MAX_THREADS) return;

  const entries = Array.from(seenThreads.entries()).sort(
    (a, b) => a[1] - b[1]
  );

  const excess = seenThreads.size - MAX_THREADS;
  for (let i = 0; i < excess; i++) {
    seenThreads.delete(entries[i][0]);
  }
}

function cleanupThreads() {
  const now = Date.now();
  for (const [threadID, timestamp] of seenThreads.entries()) {
    if (now - timestamp > THREAD_EXPIRY_MS) {
      seenThreads.delete(threadID);
    }
  }

  for (const [fingerprint, timestamp] of recentBroadcasts.entries()) {
    if (now - timestamp > DUPLICATE_WINDOW_MS) {
      recentBroadcasts.delete(fingerprint);
    }
  }
}

function send(api, message, threadID, callback) {
  try {
    const result = api.sendMessage(message, threadID, callback);

    if (result && typeof result.then === "function") {
      result.then(
        (value) => callback?.(null, value),
        (error) => callback?.(error)
      );
    }

    return result;
  } catch (error) {
    callback?.(error);
    return null;
  }
}

function broadcast(api, message) {
  cleanupThreads();

  const text = String(message || "").trim();
  if (!text) {
    return {
      queued: false,
      targetCount: 0,
      reason: "empty",
    };
  }

  const fingerprint = text.toLowerCase();
  const previous = recentBroadcasts.get(fingerprint);

  if (previous && Date.now() - previous < DUPLICATE_WINDOW_MS) {
    console.warn("[BROADCAST] Duplicate broadcast suppressed.");
    return {
      queued: false,
      targetCount: 0,
      reason: "duplicate",
    };
  }

  recentBroadcasts.set(fingerprint, Date.now());

  const threads = Array.from(seenThreads.keys());

  if (!threads.length) {
    return {
      queued: false,
      targetCount: 0,
      reason: "no-active-threads",
    };
  }

  const outgoing =
    "makinig kayong mga gago kayo sa talata ko: " + text;

  console.log(`[BROADCAST] Queueing ${threads.length} thread(s).`);

  threads.forEach((threadID, index) => {
    const timer = setTimeout(() => {
      pendingTimers.delete(timer);

      send(api, outgoing, threadID, (error) => {
        if (error) {
          console.error(`[BROADCAST] Failed for ${threadID}:`, error);
        } else {
          console.log(`[BROADCAST] Sent to ${threadID}.`);
        }
      });
    }, index * BROADCAST_GAP_MS);

    pendingTimers.add(timer);
  });

  return {
    queued: true,
    targetCount: threads.length,
  };
}

function handleBroadcastEvent(api, event) {
  if (!event || !event.threadID) return false;

  const threadID = String(event.threadID);
  rememberThread(threadID);

  if (event.type !== "message" && event.type !== "message_reply") {
    return false;
  }

  const senderID = String(event.senderID || "").trim();
  const body = typeof event.body === "string" ? event.body.trim() : "";

  if (!/^!broadcast(?:\s|$)/i.test(body)) {
    return false;
  }

  // Let the normal router handle unauthorized attempts so its existing
  // admin-denial response remains unchanged.
  if (!isAdmin(senderID)) {
    return false;
  }

  const message = body.replace(/^!broadcast\s*/i, "").trim();

  if (!message) {
    send(
      api,
      "╭────── 🎀  BROADCAST  🎀 ──────╮\n\n୨୧ usage\n    ♡ !broadcast <message>\n\n୨୧ sends to all active threads\n\n╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
      threadID
    );
    return true;
  }

  const result = broadcast(api, message);

  if (result.reason === "no-active-threads") {
    send(
      api,
      "🔴 Broadcast could not start: no active Messenger threads have been seen since this process started.",
      threadID
    );
    return true;
  }

  if (result.reason === "duplicate") {
    send(api, "🟡 Duplicate broadcast suppressed.", threadID);
    return true;
  }

  if (result.queued) {
    send(
      api,
      `📡 Broadcast queued for ${result.targetCount} active thread(s).`,
      threadID
    );
  }

  return true;
}

function installBroadcastCommand() {
  let fca;
  try {
    fca = require("ws3-fca");
  } catch (error) {
    console.error("[BROADCAST] Unable to load ws3-fca:", error);
    return;
  }

  if (!fca || typeof fca.login !== "function") {
    console.error("[BROADCAST] ws3-fca login function is unavailable.");
    return;
  }

  if (fca.__eclipseBroadcastWrapped) return;

  const originalLogin = fca.login;

  fca.login = function eclipseBroadcastLogin(...args) {
    const callbackIndex = args.findLastIndex(
      (value) => typeof value === "function"
    );

    if (callbackIndex < 0) {
      return originalLogin.apply(this, args);
    }

    const originalCallback = args[callbackIndex];

    args[callbackIndex] = function wrappedLoginCallback(error, api, ...rest) {
      if (!error && api && typeof api.listenMqtt === "function") {
        const originalListenMqtt = api.listenMqtt;

        if (!api.__eclipseBroadcastListenWrapped) {
          api.listenMqtt = function wrappedListenMqtt(callback, ...listenArgs) {
            if (typeof callback !== "function") {
              return originalListenMqtt.call(this, callback, ...listenArgs);
            }

            return originalListenMqtt.call(this, (listenError, event) => {
              if (listenError) {
                return callback(listenError, event);
              }

              try {
                if (handleBroadcastEvent(api, event)) {
                  return;
                }
              } catch (broadcastError) {
                console.error("[BROADCAST] Command handler failed:", broadcastError);
              }

              return callback(null, event);
            }, ...listenArgs);
          };

          api.__eclipseBroadcastListenWrapped = true;
        }
      }

      return originalCallback(error, api, ...rest);
    };

    return originalLogin.apply(this, args);
  };

  fca.__eclipseBroadcastWrapped = true;
  console.log("[BROADCAST] Command router installed.");
}

function shutdownBroadcastCommand() {
  for (const timer of pendingTimers) {
    clearTimeout(timer);
  }
  pendingTimers.clear();
}

module.exports = {
  installBroadcastCommand,
  shutdownBroadcastCommand,
};
