"use strict";

/**
 * ECLIPSE English vocabulary layer.
 *
 * The full source is generated from dwyl/english-words by:
 *   npm run sync:english
 *
 * Runtime never fetches GitHub. It reads the local snapshot when present.
 */

const fs = require("fs");
const path = require("path");

const WORDS_PATH = path.join(__dirname, "data", "english", "words.json");

const FALLBACK_WORDS = new Set([
  "about","after","again","against","almost","always","another","answer","around",
  "because","before","being","between","better","could","different","doing","during",
  "every","everything","everyone","favorite","first","follow","friend","from",
  "going","good","great","guess","happen","having","hello","help","here","how",
  "just","know","later","little","maybe","message","more","most","much","never",
  "nothing","now","okay","only","other","people","probably","really","right",
  "same","something","someone","still","sure","take","talk","than","that","their",
  "there","thing","think","this","though","through","today","together","tomorrow",
  "tonight","trying","understand","very","want","what","when","where","which",
  "while","with","without","would","yeah","your","you","you're","because","actually",
  "literally","already","maybe","please","sorry","thanks","welcome","bro","bruh",
  "lol","lmao","haha","nah","wait","wtf","omg"
]);

let loadedWords = null;

function loadWords() {
  if (loadedWords) return loadedWords;

  try {
    const raw = fs.readFileSync(WORDS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) {
      loadedWords = new Set(
        parsed
          .map((word) => String(word).trim().toLowerCase())
          .filter((word) => /^[a-z]+$/.test(word))
      );
      return loadedWords;
    }
  } catch (_) {
    // The sync command has not been run yet. Use the safe fallback.
  }

  loadedWords = FALLBACK_WORDS;
  return loadedWords;
}

function hasFullVocabulary() {
  try {
    const raw = fs.readFileSync(WORDS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 1000;
  } catch (_) {
    return false;
  }
}

function isEnglishWord(word) {
  const value = String(word || "").trim().toLowerCase();
  if (!/^[a-z]+$/.test(value)) return false;
  return loadWords().has(value);
}

function isLikelyEnglishWord(word) {
  const value = String(word || "").trim().toLowerCase();
  if (!/^[a-z]+$/.test(value)) return false;

  // Before the full snapshot exists, do not block otherwise valid
  // human-looking typo candidates just because the fallback is small.
  if (!hasFullVocabulary()) return true;

  return loadWords().has(value);
}

function getVocabularySize() {
  return loadWords().size;
}

module.exports = {
  isEnglishWord,
  isLikelyEnglishWord,
  getVocabularySize,
  hasFullVocabulary,
};
