"use strict";

/**
 * Short-lived conversational context for Banat.
 *
 * This is not permanent memory and does not build user profiles.
 * It keeps only a small rolling window per thread so replies can
 * react to what just happened instead of behaving like isolated
 * one-liners.
 */

const MAX_MESSAGES = 8;
const MAX_BITS = 6;
const TTL_MS = Math.max(
  60_000,
  Number(process.env.ECLIPSE_BANAT_CONTEXT_TTL_MS || 15 * 60 * 1000)
);

const state = new Map();

function keyFor(threadId) {
  return String(threadId || "unknown");
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyIncoming(text) {
  const value = normalize(text);
  if (!value) return "empty";

  if (/\b(😭+|💀+|lmao|lmfao|haha+|hahaha+|lol+|🤣+)\b/i.test(value)) {
    return "laughing";
  }

  if (/\b(what|wdym|why|bakit|bat|pano|paano|sino|san|saan|ano)\b/i.test(value) || /\?$/.test(value)) {
    return "question";
  }

  if (/\b(tanga|bobo|gago|gaga|ulol|tarantado|weak|patawa|trash|loser|stupid|idiot)\b/i.test(value)) {
    return "insult";
  }

  if (/\b(haha|lol|lmao|joke|jk|char|eme|😭|💀)\b/i.test(value)) {
    return "teasing";
  }

  if (/\b(thanks|thank you|salamat|ty|tysm)\b/i.test(value)) {
    return "positive";
  }

  if (/\b(sorry|pasensya|my bad|mb)\b/i.test(value)) {
    return "apology";
  }

  return "general";
}

function extractBits(text) {
  const value = String(text || "").trim();
  if (!value) return [];

  const bits = [];
  const quoted = value.match(/["“”']([^"“”']{3,80})["“”']/g) || [];
  for (const item of quoted) bits.push(item.replace(/^["“”']|["“”']$/g, "").trim());

  const distinctive = value
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (distinctive.length >= 12 && distinctive.length <= 100) {
    bits.push(distinctive);
  }

  return [...new Set(bits)].slice(0, 3);
}

function getState(threadId) {
  const key = keyFor(threadId);
  const now = Date.now();
  let current = state.get(key);

  if (!current || now - current.at > TTL_MS) {
    current = {
      at: now,
      messages: [],
      bits: [],
      lastIntent: "general",
      streak: 0,
    };
    state.set(key, current);
  }

  current.at = now;
  return current;
}

function observeBanatMessage(threadId, text) {
  const value = String(text || "").trim();
  if (!value) return getState(threadId);

  const current = getState(threadId);
  const intent = classifyIncoming(value);

  current.messages.push({
    text: value.slice(0, 500),
    intent,
    at: Date.now(),
  });
  current.messages = current.messages.slice(-MAX_MESSAGES);

  if (intent === current.lastIntent) {
    current.streak += 1;
  } else {
    current.streak = 1;
  }

  current.lastIntent = intent;

  for (const bit of extractBits(value)) {
    current.bits = current.bits.filter((item) => item !== bit);
    current.bits.push(bit);
  }
  current.bits = current.bits.slice(-MAX_BITS);

  return current;
}

function getBanatContext(threadId) {
  const current = getState(threadId);

  const recent = current.messages.slice(-5);
  const previous = recent.length > 1 ? recent[recent.length - 2] : null;

  return {
    intent: current.lastIntent,
    streak: current.streak,
    recentMessages: recent,
    previousMessage: previous,
    runningBits: [...current.bits],
  };
}

function contextPrompt(context) {
  if (!context) return "No extra conversation context.";

  const recent = Array.isArray(context.recentMessages)
    ? context.recentMessages
        .map((item) => "[" + item.intent + "] " + item.text)
        .join("\n")
    : "";

  const bits = Array.isArray(context.runningBits)
    ? context.runningBits.join(" | ")
    : "";

  return [
    "Current conversation intent: " + String(context.intent || "general"),
    "Same-intent streak: " + String(context.streak || 1),
    "Recent messages:",
    recent || "(none)",
    "Possible running bits/callback material:",
    bits || "(none)",
  ].join("\n");
}

function scoreReply(reply, context) {
  const text = normalize(reply);
  if (!text || !context) return 0;

  let score = 0;
  const intent = context.intent;

  const short = text.split(/\s+/).filter(Boolean).length <= 5;

  if (intent === "laughing" && (/[😭💀🤣]/u.test(text) || /\b(haha|lol|lmao)\b/i.test(text))) {
    score += 3;
  }

  if (intent === "question" && (/[?]/.test(text) || /\b(ano|bat|why|wait|wdym|sino)\b/i.test(text))) {
    score += 2;
  }

  if (intent === "insult" && /\b(baby|bro|gago|tanga|bobo|weak|cute|logic|confidence)\b/i.test(text)) {
    score += 3;
  }

  if (intent === "teasing" && (/[😭💀]/u.test(text) || /\b(haha|lol|bro|baby)\b/i.test(text))) {
    score += 2;
  }

  if ((intent === "laughing" || intent === "general") && short) {
    score += 1;
  }

  if (context.streak >= 3 && short) {
    score += 2;
  }

  return score;
}

function cleanup() {
  const now = Date.now();
  for (const [key, value] of state) {
    if (now - value.at > TTL_MS) state.delete(key);
  }
}

module.exports = {
  TTL_MS,
  classifyIncoming,
  observeBanatMessage,
  getBanatContext,
  contextPrompt,
  scoreReply,
  cleanup,
};
