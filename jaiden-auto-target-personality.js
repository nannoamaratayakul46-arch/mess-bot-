"use strict";

// Jaiden Auto Target's separate line personality.
// This module only supplies lines and rendering/selection helpers; it does not
// alter target detection, inactivity timing, countdown, cancellation, or results.

const DEFAULT_FALLBACK_NAME = "target";
const MAX_NAME_LENGTH = 80;

const LINE_POOLS = Object.freeze({
  general: [
    "{{NAME}} moka tanga😂😂☄️☄️",
    "boss {{NAME}} amo moko☄️☄️😂",
    "bumagal ata si {{NAME}} gago☄️☄️☄️😂",
    "HEV ABI OWNS {{UPPER_NAME}}🥷🩸🩸",
    "{{NAME}} wag ka magtago jan☄️☄️😂",
    "pota {{NAME}} malapad noo mo☄️☄️😂",
    "{{FIRST_NAME}} ano na, bumigay ka na ba?😂☄️",
    "kanino ka ba lumalaban dito {{NAME}}☄️😂",
    "boss {{NAME}} mo na nga natalo ka pa☄️☄️😂",
    "bilisan mo naman {{NAME}}, parang naglalakad utak mo☄️😂",
    "wag ka na magtago {{NAME}}, alam na namin galawan mo☄️☄️😂",
    "sige pa {{NAME}} boss, natatawa na kami sayo☄️😂",
    "iba talaga tama mo pag si HEV ABI kaharap mo, {{NAME}}☄️☄️",
  ],
  insult: [
    "may point ka sana {{NAME}}, kaso naiwan ata sa draft☄️😂",
    "{{NAME}} lakas ng loob mo, nasaan yung laman ng sinabi mo?☄️☄️😂",
    "gets ka namin {{FIRST_NAME}}, hindi lang namin makita yung sense😂☄️",
    "{{NAME}} nag-reply ka na naman pero wala pa ring nadagdag sa usapan☄️😂",
  ],
  laugh: [
    "tawa ka pa {{NAME}}, yun na ba pinakamalakas mong ambag?😂☄️☄️",
    "{{NAME}} HAHAHA buti pa tawa mo may energy, argumento wala☄️😂",
    "sige {{FIRST_NAME}}, tawa ka muna habang naghahanap ka ng comeback😂☄️",
  ],
  command: [
    "utos ka nang utos {{NAME}}, akala mo may command privilege ka☄️😂",
    "{{NAME}} kalma, hindi ikaw ang admin ng utak ko☄️☄️😂",
    "noted boss {{NAME}}, isasama ko sa listahan ng walang epekto😂☄️",
  ],
  boast: [
    "angas mo naman {{NAME}}, akala ko may kasunod na proof☄️😂",
    "{{NAME}} champion ka na sa kwento mo, sa actual kaya?☄️☄️😂",
    "HEV ABI OWNS {{UPPER_NAME}}, kahit ilang beses mo pang i-announce🥷🩸🩸",
  ],
  slow: [
    "bumagal ka ata {{NAME}}, pati reply mo nag-buffer☄️☄️😂",
    "{{NAME}} bilisan mo, naghihintay pa yung punchline mo😂☄️",
    "loading pa rin ba {{FIRST_NAME}}? kanina pa kami nandito☄️😂",
  ],
});

const CONTEXT_ALIASES = Object.freeze({
  insult: "insult",
  insulted: "insult",
  roast: "insult",
  laugh: "laugh",
  laughing: "laugh",
  haha: "laugh",
  command: "command",
  order: "command",
  stop: "command",
  boast: "boast",
  brag: "boast",
  flex: "boast",
  slow: "slow",
  delayed: "slow",
  default: "general",
  general: "general",
});

const lastByThread = new Map();
const usedByThread = new Map();
const MAX_TRACKED_THREADS = 500;

function cleanTargetName(value) {
  const cleaned = String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  if (!cleaned || /^\d{6,32}$/.test(cleaned) || /^unknown target$/i.test(cleaned)) {
    return "";
  }
  return cleaned;
}

function renderJaidenAutoTargetLine(template, targetName, fallbackName = DEFAULT_FALLBACK_NAME) {
  const fallback = cleanTargetName(fallbackName) || DEFAULT_FALLBACK_NAME;
  const name = cleanTargetName(targetName) || fallback;
  const firstName = name.split(/\s+/)[0] || fallback;
  const values = {
    NAME: name,
    FIRST_NAME: firstName,
    UPPER_NAME: name.toLocaleUpperCase("en-US"),
  };
  return String(template || "").replace(
    /\{\{\s*(NAME|FIRST_NAME|UPPER_NAME)\s*\}\}/gi,
    (_match, key) => values[String(key).toUpperCase()]
  );
}

function pickJaidenAutoTargetLine(options = {}) {
  const threadId = String(options.threadId || "global");
  const contextKey = String(options.context || "general").trim().toLowerCase();
  const poolName = CONTEXT_ALIASES[contextKey] || "general";
  const pool = LINE_POOLS[poolName];
  const usedKey = threadId + ":" + poolName;
  const used = usedByThread.get(usedKey) || new Set();
  let candidates = pool.filter((line) => !used.has(line));
  if (!candidates.length) {
    used.clear();
    candidates = pool.slice();
  }
  const previous = lastByThread.get(usedKey);
  if (candidates.length > 1 && previous) {
    const fresh = candidates.filter((line) => line !== previous);
    if (fresh.length) candidates = fresh;
  }
  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  used.add(selected);
  lastByThread.delete(usedKey);
  lastByThread.set(usedKey, selected);
  usedByThread.delete(usedKey);
  usedByThread.set(usedKey, used);
  while (lastByThread.size > MAX_TRACKED_THREADS) {
    const oldest = lastByThread.keys().next().value;
    lastByThread.delete(oldest);
    usedByThread.delete(oldest);
  }
  return renderJaidenAutoTargetLine(
    selected,
    options.targetName,
    options.fallbackName
  );
}

function getJaidenAutoTargetPools() {
  return Object.fromEntries(
    Object.entries(LINE_POOLS).map(([name, lines]) => [name, lines.slice()])
  );
}

function resetJaidenAutoTargetHistory(threadId) {
  if (threadId == null) {
    lastByThread.clear();
    usedByThread.clear();
    return;
  }
  const prefix = String(threadId) + ":";
  for (const key of lastByThread.keys()) {
    if (key.startsWith(prefix)) {
      lastByThread.delete(key);
      usedByThread.delete(key);
    }
  }
}

module.exports = {
  DEFAULT_FALLBACK_NAME,
  getJaidenAutoTargetPools,
  pickJaidenAutoTargetLine,
  renderJaidenAutoTargetLine,
  resetJaidenAutoTargetHistory,
};
