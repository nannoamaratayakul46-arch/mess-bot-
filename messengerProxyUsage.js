"use strict";

const MONTHLY_ALLOWANCE_BYTES = 2_000_000_000;
const HARD_STOP_BYTES = 1_800_000_000;
const WARNING_BYTES = 1_400_000_000;
const CRITICAL_BYTES = 1_700_000_000;
const SAMPLE_INTERVAL_MS = 1_000;
const FLUSH_INTERVAL_MS = 5_000;
const sockets = new Map();

let db = null;
let ready = false;
let blocked = false;
let uploadedBytes = 0;
let downloadedBytes = 0;
let pendingUploadBytes = 0;
let pendingDownloadBytes = 0;
let cycleKey = null;
let sampleTimer = null;
let flushTimer = null;
let onLimit = null;
let lastAlert = "none";

function currentCycleKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return values.year + "-" + values.month;
}

function totalBytes() {
  return uploadedBytes + downloadedBytes + pendingUploadBytes + pendingDownloadBytes;
}

function getStatus() {
  const used = totalBytes();
  return {
    ready,
    blocked,
    cycle: cycleKey,
    allowance_bytes: MONTHLY_ALLOWANCE_BYTES,
    allowance_gb: 2,
    used_bytes: used,
    used_gb: Number((used / 1_000_000_000).toFixed(3)),
    uploaded_bytes: uploadedBytes + pendingUploadBytes,
    downloaded_bytes: downloadedBytes + pendingDownloadBytes,
    remaining_bytes: Math.max(0, HARD_STOP_BYTES - used),
    hard_stop_bytes: HARD_STOP_BYTES,
    hard_stop_gb: 1.8,
    warning_threshold_bytes: WARNING_BYTES,
    critical_threshold_bytes: CRITICAL_BYTES,
    last_alert: lastAlert,
    accounting: "estimated_proxy_socket_bytes",
    note: "Estimated from instrumented Messenger proxy sockets; verify against Flame Proxies usage."
  };
}

function enforceLimit() {
  const used = totalBytes();
  if (!blocked && used >= HARD_STOP_BYTES) {
    blocked = true;
    lastAlert = "hard_stop";
    for (const socket of sockets.keys()) {
      try { socket.destroy(new Error("ECLIPSE proxy bandwidth hard limit reached.")); } catch {}
    }
    sockets.clear();
    console.error("[PROXY USAGE] 1.8 GB safety cap reached. Messenger proxy sockets were closed; new proxy logins are blocked.");
    if (typeof onLimit === "function") {
      try { onLimit(getStatus()); } catch {}
    }
    return;
  }
  if (used >= CRITICAL_BYTES && lastAlert !== "critical" && lastAlert !== "hard_stop") {
    lastAlert = "critical";
    console.warn("[PROXY USAGE] Critical: estimated Messenger proxy usage reached 1.7 GB of the 2 GB allowance.");
  } else if (used >= WARNING_BYTES && lastAlert === "none") {
    lastAlert = "warning";
    console.warn("[PROXY USAGE] Warning: estimated Messenger proxy usage reached 1.4 GB of the 2 GB allowance.");
  }
}

function trackSocket(socket) {
  if (!socket || typeof socket !== "object" || sockets.has(socket) || blocked) {
    if (socket && blocked) socket.destroy(new Error("ECLIPSE proxy bandwidth hard limit reached."));
    return socket;
  }
  sockets.set(socket, {
    read: Number(socket.bytesRead) || 0,
    written: Number(socket.bytesWritten) || 0
  });
  const remove = () => sockets.delete(socket);
  socket.once?.("close", remove);
  socket.once?.("error", remove);
  return socket;
}

function sampleSockets() {
  for (const [socket, previous] of sockets) {
    if (socket.destroyed) {
      sockets.delete(socket);
      continue;
    }
    const read = Number(socket.bytesRead) || previous.read;
    const written = Number(socket.bytesWritten) || previous.written;
    const down = Math.max(0, read - previous.read);
    const up = Math.max(0, written - previous.written);
    previous.read = read;
    previous.written = written;
    // Add a conservative 5% overhead allowance for proxy/tunnel framing.
    pendingDownloadBytes += Math.ceil(down * 1.05);
    pendingUploadBytes += Math.ceil(up * 1.05);
  }
  enforceLimit();
}

async function flushUsage() {
  if (!db || !cycleKey || (!pendingUploadBytes && !pendingDownloadBytes)) return;
  const upload = pendingUploadBytes;
  const download = pendingDownloadBytes;
  pendingUploadBytes = 0;
  pendingDownloadBytes = 0;
  try {
    await db.query(
      `INSERT INTO eclipse_messenger_proxy_usage (cycle_key, uploaded_bytes, downloaded_bytes, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (cycle_key) DO UPDATE SET
         uploaded_bytes = eclipse_messenger_proxy_usage.uploaded_bytes + EXCLUDED.uploaded_bytes,
         downloaded_bytes = eclipse_messenger_proxy_usage.downloaded_bytes + EXCLUDED.downloaded_bytes,
         updated_at = NOW()`,
      [cycleKey, upload, download]
    );
    uploadedBytes += upload;
    downloadedBytes += download;
  } catch (error) {
    pendingUploadBytes += upload;
    pendingDownloadBytes += download;
    ready = false;
    blocked = true;
    console.error("[PROXY USAGE] Could not persist bandwidth usage; fail-closed proxy login protection activated:", error?.message || error);
    for (const socket of sockets.keys()) {
      try { socket.destroy(new Error("ECLIPSE proxy usage storage unavailable.")); } catch {}
    }
    sockets.clear();
  }
  enforceLimit();
}

async function initialize(database, options = {}) {
  db = database;
  onLimit = typeof options.onLimit === "function" ? options.onLimit : null;
  cycleKey = currentCycleKey();
  await db.query(`
    CREATE TABLE IF NOT EXISTS eclipse_messenger_proxy_usage (
      cycle_key TEXT PRIMARY KEY,
      uploaded_bytes BIGINT NOT NULL DEFAULT 0,
      downloaded_bytes BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const result = await db.query(
    "SELECT uploaded_bytes, downloaded_bytes FROM eclipse_messenger_proxy_usage WHERE cycle_key = $1 LIMIT 1",
    [cycleKey]
  );
  uploadedBytes = Number(result.rows?.[0]?.uploaded_bytes || 0);
  downloadedBytes = Number(result.rows?.[0]?.downloaded_bytes || 0);
  blocked = totalBytes() >= HARD_STOP_BYTES;
  ready = true;
  if (!sampleTimer) {
    sampleTimer = setInterval(sampleSockets, SAMPLE_INTERVAL_MS);
    sampleTimer.unref?.();
  }
  if (!flushTimer) {
    flushTimer = setInterval(() => { void flushUsage(); }, FLUSH_INTERVAL_MS);
    flushTimer.unref?.();
  }
  enforceLimit();
  console.log("[PROXY USAGE] Meter ready for " + cycleKey + ": " + getStatus().used_gb + " GB estimated.");
  return getStatus();
}

function instrumentAgent(agent) {
  if (!agent || agent.__eclipseUsageMetered || typeof agent.callback !== "function") return agent;
  const original = agent.callback;
  agent.callback = function eclipseMeteredProxyCallback(...args) {
    const result = original.apply(this, args);
    if (result && typeof result.then === "function") {
      return result.then(socket => trackSocket(socket));
    }
    return trackSocket(result);
  };
  Object.defineProperty(agent, "__eclipseUsageMetered", { value: true });
  return agent;
}

function isAllowed() {
  return ready && !blocked && totalBytes() < HARD_STOP_BYTES;
}

module.exports = {
  initialize,
  instrumentAgent,
  trackSocket,
  getStatus,
  isAllowed,
  constants: {
    MONTHLY_ALLOWANCE_BYTES,
    HARD_STOP_BYTES,
    WARNING_BYTES,
    CRITICAL_BYTES
  }
};
