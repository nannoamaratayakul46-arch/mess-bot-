"use strict";

const EMOJIS = Object.freeze(["😂", "😅", "🙌", "🔥", "👀", "✨", "👍", "😆"]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function randomInt(min, max, random = Math.random) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pick(items, random = Math.random) {
  return items[randomInt(0, items.length - 1, random)];
}

function applyEmojiVariation(text, random = Math.random) {
  if (random() >= 0.45) return text;
  const trailingEmoji = /\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?) *$/u;
  const match = text.match(trailingEmoji);
  if (match) return text.slice(0, match.index) + pick(EMOJIS, random);
  return text.trimEnd() + " " + pick(EMOJIS, random);
}

function createTypo(text, random = Math.random) {
  const matches = [...text.matchAll(/\b[A-Za-z]{2,}\b/g)];
  if (matches.length === 0) return null;
  const selected = pick(matches, random);
  const word = selected[0];
  const position = randomInt(0, word.length - 2, random);
  if (word[position] === word[position + 1]) return null;
  const swapped = word.slice(0, position) + word[position + 1] + word[position] + word.slice(position + 2);
  return text.slice(0, selected.index) + swapped + text.slice(selected.index + word.length);
}

function callProxyMethod(api, method, args) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(value ?? null);
    };
    try {
      // Traffic Governor proxy methods use an error-first callback and return
      // an enqueue boolean. Only the callback represents delivery completion.
      api[method](...args, finish);
    } catch (error) {
      finish(error);
    }
  });
}

async function sendMessage(api, threadID, message) {
  if (api.__eclipseTrafficProxy === true) {
    return callProxyMethod(api, "sendMessage", [message, String(threadID)]);
  }
  // Raw ws3-fca 3.5.2: sendMessage(message, threadID, replyToMessageID, isSingleUser).
  return api.sendMessage(message, String(threadID));
}

async function editMessage(api, message, messageID) {
  if (api.__eclipseTrafficProxy === true) {
    return callProxyMethod(api, "editMessage", [message, String(messageID)]);
  }
  return api.editMessage(message, String(messageID));
}

async function setTyping(api, threadID, active) {
  if (typeof api.sendTypingIndicator !== "function") return;
  try {
    // ws3-fca 3.5.2 signature: sendTypingIndicator(sendTyping, threadID).
    await api.sendTypingIndicator(Boolean(active), String(threadID));
  } catch (error) {
    // Typing feedback is best-effort and must not prevent message delivery.
  }
}

async function typeFor(api, threadID, durationMs, wait) {
  await setTyping(api, threadID, true);
  await wait(durationMs);
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

  // Underscored hooks keep the timing/random branches deterministic in tests.
  const random = typeof options._random === "function" ? options._random : Math.random;
  const wait = typeof options._sleep === "function" ? options._sleep : sleep;
  const chanceValue = Number(options.typoChance ?? 0.15);
  const typoChance = Number.isFinite(chanceValue) ? Math.max(0, Math.min(1, chanceValue)) : 0.15;
  const emojiVariation = options.emojiVariation !== false;
  // Deliberate typo mode is opt-in and requires same-message edit support.
  const correctionDemo = options.correctionDemo === true && typeof api.editMessage === "function";

  const cleanText = emojiVariation ? applyEmojiVariation(rawText.trim(), random) : rawText.trim();
  const typoText = correctionDemo && random() < typoChance ? createTypo(cleanText, random) : null;

  await typeFor(api, threadID, randomInt(2000, 3500, random), wait);
  await wait(randomInt(1500, 2500, random));
  const secondTypingMs = Math.min(4000, Math.max(1500, 1500 + Math.ceil(cleanText.length * 12)));
  await typeFor(api, threadID, secondTypingMs, wait);

  // On the bot's proxy, wait for the callback from the queued operation rather
  // than treating its immediate boolean enqueue result as a delivered message.
  const info = await sendMessage(api, threadID, typoText || cleanText);
  if (!typoText || !info?.messageID) return info;

  await wait(randomInt(2000, 3000, random));
  await typeFor(api, threadID, 1500, wait);
  try {
    // Correct the original message only. Never unsend + resend a duplicate.
    await editMessage(api, cleanText, info.messageID);
  } catch (error) {
    // If Messenger rejects the edit, leave the original message; do not duplicate it.
  }
  return info;
}

module.exports = { sendWithEffects };
