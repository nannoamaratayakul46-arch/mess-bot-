"use strict";

/**
 * ECLIPSE Human Delay
 * -------------------
 * Calculates reading/thinking delays. It never sends messages and never
 * controls a typing indicator; those responsibilities belong elsewhere.
 */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function seededJitter(random, min, max) {
  return min + random() * (max - min);
}

function responseHesitationMs(text, context = {}, options = {}) {
  const random = options.random || Math.random;
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  const recent = Number(context.recentMessages || 0);
  const base = 320 + words * 65 + Math.min(recent, 4) * 90;
  return Math.round(clamp(base + seededJitter(random, -160, 420), 220, options.max || 2200));
}

function typingCadenceMs(text, options = {}) {
  const random = options.random || Math.random;
  const chars = String(text || "").length;
  const cps = seededJitter(random, options.minCps || 5.5, options.maxCps || 10.5);
  const punctuationPause = (String(text || "").match(/[,.!?;:]/g) || []).length * 55;
  return Math.round(clamp((chars / cps) * 1000 + punctuationPause, 350, options.max || 6500));
}

function typingBurstsMs(text, options = {}) {
  const random = options.random || Math.random;
  const chars = String(text || "").length;
  const pauses = Math.min(7, Math.floor(chars / 45));
  return Math.round(pauses * seededJitter(random, 80, 260));
}

function calculateHumanDelay(text, context = {}, options = {}) {
  const reaction = responseHesitationMs(text, context, options);
  const typing = typingCadenceMs(text, options) + typingBurstsMs(text, options);
  return {
    reactionMs: reaction,
    typingMs: clamp(typing, 350, options.maxTypingMs || 6500),
    totalMs: reaction + clamp(typing, 350, options.maxTypingMs || 6500),
  };
}

module.exports = {
  clamp,
  responseHesitationMs,
  typingCadenceMs,
  typingBurstsMs,
  calculateHumanDelay,
};
