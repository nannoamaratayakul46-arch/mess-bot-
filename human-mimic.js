"use strict";

/**
 * ECLIPSE Human Mimic
 * -------------------
 * Pure text transformation only. No timers, Messenger API calls, or queues.
 * Keep this module deterministic when a seed/random function is supplied so
 * Banat can test it without touching the network.
 */

const DEFAULT_ABBREVIATIONS = Object.freeze([
  ["right now", "rn"],
  ["of course", "ofc"],
  ["i don't know", "idk"],
  ["i dont know", "idk"],
  ["i don't care", "idc"],
  ["i dont care", "idc"],
  ["not gonna lie", "ngl"],
  ["to be honest", "tbh"],
  ["in my opinion", "imo"],
  ["as soon as possible", "asap"],
  ["because", "bc"],
  ["though", "tho"],
  ["through", "thru"],
  ["with", "w/"],
  ["without", "w/o"],
  ["you", "u"],
  ["your", "ur"],
  ["you're", "ur"],
  ["youre", "ur"],
  ["are", "r"],
  ["why", "y"],
  ["please", "pls"],
  ["people", "ppl"],
  ["something", "smth"],
  ["someone", "sm1"],
  ["everyone", "evryone"],
  ["really", "rlly"],
  ["probably", "prob"],
  ["maybe", "mb"],
  ["message", "msg"],
  ["tomorrow", "tmrw"],
  ["tonight", "tn"],
  ["laughing", "lmao"],
]);

const WORD_RE = /[A-Za-z']+/g;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pick(random, probability) {
  return random() < probability;
}

function preserveCase(original, replacement) {
  if (original === original.toUpperCase()) return replacement.toUpperCase();
  if (original[0] === original[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function replaceAbbreviations(text, abbreviations, random) {
  let output = String(text || "");
  const entries = [...abbreviations].sort((a, b) => b[0].length - a[0].length);

  for (const [from, to] of entries) {
    if (!pick(random, 0.08)) continue;
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output.replace(new RegExp(`\\b${escaped}\\b`, "gi"), (match) =>
      preserveCase(match, to)
    );
  }

  return output;
}

function addTypo(text, random) {
  return text.replace(WORD_RE, (word) => {
    if (word.length < 5 || !pick(random, 0.025)) return word;

    const mode = Math.floor(random() * 3);

    // Transposition: "teh"-style human typo.
    if (mode === 0 && word.length > 4) {
      const i = 1 + Math.floor(random() * (word.length - 2));
      return word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2);
    }

    // Missing character.
    if (mode === 1 && word.length > 5) {
      const i = 1 + Math.floor(random() * (word.length - 2));
      return word.slice(0, i) + word.slice(i + 1);
    }

    // Repeated character.
    const i = 1 + Math.floor(random() * (word.length - 2));
    return word.slice(0, i) + word[i] + word.slice(i);
  });
}

function addCasualPunctuation(text, random) {
  let output = String(text || "").trim();
  if (!output) return output;

  if (pick(random, 0.12)) output = output.replace(/\.$/, "");
  if (pick(random, 0.08) && !/[!?…]$/.test(output)) output += "...";
  if (pick(random, 0.06)) output = output.replace(/, /g, ",  ");
  return output;
}

function humanize(text, options = {}) {
  const random = typeof options.random === "function" ? options.random : Math.random;
  let output = String(text || "").trim();
  if (!output) return output;

  if (options.abbreviate !== false) {
    output = replaceAbbreviations(
      output,
      options.abbreviations || DEFAULT_ABBREVIATIONS,
      random
    );
  }

  if (options.typos !== false) output = addTypo(output, random);
  if (options.punctuation !== false) output = addCasualPunctuation(output, random);

  return output;
}

function humanizationProfile(text) {
  const length = String(text || "").length;
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  return {
    length,
    words,
    complexity: clamp(words * 0.08 + length * 0.006, 0, 1),
  };
}

module.exports = {
  DEFAULT_ABBREVIATIONS,
  humanize,
  humanizationProfile,
};
