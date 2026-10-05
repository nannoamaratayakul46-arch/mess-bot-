"use strict";

/**
 * Small per-thread Banat memory.
 *
 * Keeps recent replies out of immediate rotation and delegates pool rotation
 * to the shared no-repeat randomizer. Memory is intentionally in-process.
 */

const { pickFromBag } = require("./banat-randomizer");

const MAX_RECENT = Math.max(
  20,
  Math.min(60, Number(process.env.ECLIPSE_BANAT_MEMORY_SIZE || 36))
);

const TTL_MS = Math.max(
  60_000,
  Number(process.env.ECLIPSE_BANAT_MEMORY_TTL_MS || 20 * 60 * 1000)
);

const state = new Map();

function keyFor(threadId) {
  return String(threadId || "unknown");
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[“”‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function signature(value) {
  const text = normalize(value)
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text.split(" ").filter(Boolean).slice(0, 7).join(" ");
}

function getRecent(threadId) {
  const key = keyFor(threadId);
  const now = Date.now();
  const current = state.get(key);

  if (!current || now - current.at > TTL_MS) {
    const fresh = { at: now, replies: [], signatures: [] };
    state.set(key, fresh);
    return fresh;
  }

  current.at = now;
  return current;
}

function rememberBanatReply(threadId, reply) {
  const text = String(reply || "").trim();
  if (!text) return;

  const current = getRecent(threadId);
  const sig = signature(text);

  current.replies = current.replies.filter((item) => item !== text);
  current.replies.push(text);

  if (sig) {
    current.signatures = current.signatures.filter((item) => item !== sig);
    current.signatures.push(sig);
  }

  current.replies = current.replies.slice(-MAX_RECENT);
  current.signatures = current.signatures.slice(-MAX_RECENT);

  if (state.size > 1000) {
    for (const [key, value] of state) {
      if (Date.now() - value.at > TTL_MS) state.delete(key);
    }
  }
}

function isRecent(threadId, reply, fallbackRecent = []) {
  const text = String(reply || "").trim();
  const current = getRecent(threadId);
  const sig = signature(text);

  if (current.replies.includes(text)) return true;
  if (sig && current.signatures.includes(sig)) return true;
  return Array.isArray(fallbackRecent) && fallbackRecent.includes(text);
}

function pickBanatReply(threadId, replies, fallbackRecent = []) {
  if (!Array.isArray(replies) || replies.length === 0) return null;

  const fresh = replies.filter(
    (reply) => !isRecent(threadId, reply, fallbackRecent)
  );

  // The shared shuffle bag guarantees that a reply is consumed once before
  // the pool is recycled. This is stronger than ordinary Math.random().
  if (fresh.length > 0) {
    const selected = pickFromBag(
      keyFor(threadId),
      "reply-pool",
      fresh
    );
    if (selected) return selected;
  }

  // If the recent memory is temporarily exhausted, prefer an exact-fresh
  // item before allowing a true repeat.
  const exactFresh = replies.filter((reply) => {
    const text = String(reply || "").trim();
    return !getRecent(threadId).replies.includes(text);
  });

  if (exactFresh.length > 0) {
    return pickFromBag(keyFor(threadId), "reply-pool-fallback", exactFresh);
  }

  return pickFromBag(keyFor(threadId), "reply-pool-recycle", replies);
}

module.exports = {
  MAX_RECENT,
  TTL_MS,
  rememberBanatReply,
  pickBanatReply,
  isRecent,
};
