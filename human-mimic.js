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

function normalizeAbbreviations(abbreviations) {
  if (Array.isArray(abbreviations)) return abbreviations;
  if (!abbreviations || typeof abbreviations !== "object") return DEFAULT_ABBREVIATIONS;

  const pairs = [];
  for (const [from, replacements] of Object.entries(abbreviations)) {
    const values = Array.isArray(replacements) ? replacements : [replacements];
    for (const to of values) pairs.push([from, to]);
  }
  return pairs;
}

function replaceAbbreviations(text, abbreviations, random, rate = 0.08) {
  let output = String(text || "");
  if (random() >= rate) return output;

  const entries = normalizeAbbreviations(abbreviations)
    .filter((entry) => Array.isArray(entry) && entry.length >= 2)
    .sort((x, y) => String(y[0]).length - String(x[0]).length);

  const candidates = [];
  for (const [from, to] of entries) {
    const escaped = String(from).replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp("\\b" + escaped + "\\b", "i");
    if (pattern.test(output)) candidates.push({ pattern, to });
  }

  if (!candidates.length) return output;
  const choice = candidates[Math.floor(random() * candidates.length)];

  return output.replace(choice.pattern, (match) =>
    preserveCase(match, choice.to)
  );
}


function addTypo(text, random, rate = 0.025) {
  if (random() >= rate) return text;

  return text.replace(WORD_RE, (word) => {
    if (word.length < 5) return word;

    const mode = Math.floor(random() * 3);
    if (mode === 0 && word.length > 4) {
      const i = 1 + Math.floor(random() * (word.length - 2));
      return word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2);
    }

    if (mode === 1 && word.length > 5) {
      const i = 1 + Math.floor(random() * (word.length - 2));
      return word.slice(0, i) + word.slice(i + 1);
    }

    const i = 1 + Math.floor(random() * (word.length - 2));
    return word.slice(0, i) + word[i] + word.slice(i);
  });
}

function addCaseVariation(text, random, rate = 0) {
  if (text.length < 10 || random() >= rate) return text;
  const parts = text.split(/(\s+)/);
  const eligible = parts
    .map((value, index) => /^[A-Za-z]{3,}$/.test(value) ? index : -1)
    .filter((index) => index >= 0);

  if (!eligible.length) return text;
  const index = eligible[Math.floor(random() * eligible.length)];
  const word = parts[index];

  parts[index] = random() < 0.7
    ? word.toLowerCase()
    : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

  return parts.join("");
}

function addSpaceVariation(text, random, rate = 0) {
  if (text.length < 16 || random() >= rate) return text;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 3) return text;

  const index = 1 + Math.floor(random() * (words.length - 2));
  if (random() < 0.7) {
    words[index - 1] += words[index];
    words.splice(index, 1);
  } else {
    words[index - 1] += "  " + words[index];
  }

  return words.join(" ");
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
  const random = typeof options.random === "function"
    ? options.random
    : Math.random;

  let output = String(text || "").trim();
  if (!output) return output;

  if (options.abbreviate !== false) {
    output = replaceAbbreviations(
      output,
      options.abbreviations || DEFAULT_ABBREVIATIONS,
      random,
      Number.isFinite(options.abbreviationRate)
        ? options.abbreviationRate
        : 0.08
    );
  }

  if (options.typos !== false) {
    output = addTypo(
      output,
      random,
      Number.isFinite(options.typoRate)
        ? options.typoRate
        : 0.025
    );
  }

  output = addCaseVariation(
    output,
    random,
    Number.isFinite(options.caseVariationRate)
      ? options.caseVariationRate
      : 0
  );

  output = addSpaceVariation(
    output,
    random,
    Number.isFinite(options.spaceVariationRate)
      ? options.spaceVariationRate
      : 0
  );

  if (options.punctuation !== false) {
    output = addCasualPunctuation(output, random);
  }

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
