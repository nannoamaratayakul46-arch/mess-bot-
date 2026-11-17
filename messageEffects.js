"use strict";

const EMOJIS = Object.freeze(["😂", "😅", "🙌", "🔥", "👀", "✨", "👍", "😆"]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(items) {
  return items[randomInt(0, items.length - 1)];
}

function applyEmojiVariation(text) {
  if (Math.random() >= 0.45) return text;

  // Replace one trailing emoji (including common variation-selector and
  // zero-width-joiner sequences), otherwise append a random emoji.
  const trailingEmoji = /\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?) *$/u;
  const match = text.match(trailingEmoji);

  if (match) {
    return text.slice(0, match.index) + pick(EMOJIS);
  }

  return text.trimEnd() + " " + pick(EMOJIS);
}

function createTypo(text) {
  const matches = [...text.matchAll(/\b[A-Za-z]{2,}\b/g)];
  if (matches.length === 0) return null;

  const selected = pick(matches);
  const word = selected[0];
  const position = randomInt(0, word.length - 2);

  if (word[position] === word[position + 1]) return null;

  const swapped =
    word.slice(0, position) +
    word[position + 1] +
    word[position] +
    word.slice(position + 2);

  return (
    text.slice(0, selected.index) +
    swapped +
    text.slice(selected.index + word.length)
  );
}

async function setTyping(api, threadID, active) {
  if (typeof api.sendTypingIndicator !== "function") return;

  try {
    // ws3-fca 3.5.2 signature: sendTypingIndicator(sendTyping, threadID).
    await api.sendTypingIndicator(Boolean(active), threadID);
  } catch (error) {
    // Typing feedback is best-effort and must not prevent message delivery.
  }
}

async function typeFor(api, threadID, durationMs) {
  await setTyping(api, threadID, true);
  await sleep(durationMs);
  await setTyping(api, threadID, false);
}

async function sendWithEffects(api, threadID, rawText, options = {}) {
  if (!api || typeof api.sendMessage !== "function") {
    throw new TypeError("A valid ws3-fca API instance with sendMessage is required.");
  }
  if (threadID === undefined || threadID === null || String(threadID).trim() === "") {
    throw new TypeError("threadID is required.");
  }
  if (typeof rawText !== "string" || rawText.trim() === "") {
    throw new TypeError("rawText must be a non-empty string.");
  }

  const typoChanceValue = Number(options.typoChance ?? 0.15);
  const typoChance = Number.isFinite(typoChanceValue)
    ? Math.max(0, Math.min(1, typoChanceValue))
    : 0.15;
  const emojiVariation = options.emojiVariation !== false;
  const correctionDemo = options.correctionDemo !== false;

  const cleanText = emojiVariation
    ? applyEmojiVariation(rawText.trim())
    : rawText.trim();

  const typoText =
    correctionDemo && Math.random() < typoChance
      ? createTypo(cleanText)
      : null;

  // Stage one: type for 2–3.5 seconds, explicitly turning the indicator off.
  await typeFor(api, threadID, randomInt(2000, 3500));

  // Pause with typing off before the second typing stage.
  await sleep(randomInt(1500, 2500));

  // Stage two: 1.5–4 seconds, with a modest text-length adjustment.
  const secondTypingMs = Math.min(
    4000,
    Math.max(1500, 1500 + Math.ceil(cleanText.length * 12))
  );
  await typeFor(api, threadID, secondTypingMs);

  const info = await api.sendMessage(typoText || cleanText, threadID);

  if (!typoText || !info?.messageID) return info;

  // Correction demo: leave the typo visible briefly, then type again.
  await sleep(randomInt(2000, 3000));
  await typeFor(api, threadID, 1500);

  if (Math.random() < 0.70) {
    try {
      if (typeof api.editMessage !== "function") {
        throw new Error("api.editMessage is unavailable.");
      }
      await api.editMessage(cleanText, info.messageID);
    } catch (error) {
      // Editing is best-effort; do not send a duplicate as an implicit fallback.
    }
  } else {
    try {
      if (typeof api.unsendMessage !== "function") {
        throw new Error("api.unsendMessage is unavailable.");
      }
      await api.unsendMessage(info.messageID);
      await api.sendMessage(cleanText, threadID);
    } catch (error) {
      // Unsend/correct is best-effort; preserve the original send result.
    }
  }

  return info;
}

module.exports = { sendWithEffects };
