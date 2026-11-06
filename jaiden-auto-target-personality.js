"use strict";

// Jaiden Auto Target's separate line personality.
// This module only supplies lines and rendering/selection helpers; it does not
// alter target detection, inactivity timing, countdown, cancellation, or results.

const DEFAULT_FALLBACK_NAME = "target";
const MAX_NAME_LENGTH = 80;

function buildLinePool(existing, openings, endings) {
  const lines = existing.slice();
  const seen = new Set(lines);
  for (const opening of openings) {
    for (const ending of endings) {
      const line = opening + " " + ending;
      if (!seen.has(line)) { seen.add(line); lines.push(line); }
      if (lines.length === 100) return Object.freeze(lines);
    }
  }
  throw new Error("Jaiden Auto Target line pool must contain 100 unique lines");
}

const LINE_POOLS = Object.freeze({
  general: buildLinePool(
    [
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
      "iba talaga tama mo pag si HEV ABI kaharap mo, {{NAME}}☄️☄️"
    ],
    [
      "{{NAME}}, ang reply mo —",
      "Uy {{FIRST_NAME}}, ang comeback mo —",
      "Boss {{NAME}}, todo angas ka —",
      "{{NAME}}, ang dami mong sinabi —",
      "HEV ABI ang kaharap mo, {{NAME}} —",
      "{{NAME}}, akala mo may impact —",
      "Bossing {{NAME}}, todo effort ka —",
      "{{NAME}}, sa dami ng banat mo —",
      "{{FIRST_NAME}}, nagparamdam ka pa —",
      "{{NAME}}, mukhang seryoso ka —"
    ],
    [
      "pero hanggang intro ka lang 😂☄️",
      "kaso wala pa ring solid na punto 😂",
      "pero mas mabilis pa mag-load ang comeback mo kaysa dumating 😂",
      "kaso parang draft pa rin ang final answer mo ☄️",
      "pero tahimik ang GC pagkatapos mong magsalita 😂",
      "kaso mas malakas pa ang confidence kaysa ebidensya ☄️😂",
      "pero hindi pa rin kumpleto ang punchline mo 😂",
      "kaso wala pang resibong sumasabay sa yabang mo ☄️",
      "pero mukhang ikaw lang ang impressed sa sarili mo 😂",
      "kaso bitin na naman ang ending ng kwento mo ☄️😂"
    ]
  ),
  insult: buildLinePool(
    [
      "may point ka sana {{NAME}}, kaso naiwan ata sa draft☄️😂",
      "{{NAME}} lakas ng loob mo, nasaan yung laman ng sinabi mo?☄️☄️😂",
      "gets ka namin {{FIRST_NAME}}, hindi lang namin makita yung sense😂☄️",
      "{{NAME}} nag-reply ka na naman pero wala pa ring nadagdag sa usapan☄️😂"
    ],
    [
      "{{NAME}}, ang argumento mo —",
      "{{FIRST_NAME}}, ang logic mo —",
      "Boss {{NAME}}, ang paliwanag mo —",
      "{{NAME}}, kahit pahabain mo pa —",
      "Uy {{FIRST_NAME}}, ang point mo —",
      "{{NAME}}, sa dami ng sinabi mo —",
      "Bossing {{NAME}}, ang depensa mo —",
      "{{NAME}}, kung susuriin ang reply mo —",
      "{{FIRST_NAME}}, ang explanation mo —",
      "{{NAME}}, ang pinagmamalaki mong argumento —"
    ],
    [
      "parang hinanap muna ang sense bago ipinadala 😂",
      "pero hindi pa rin makita kung saan papunta ☄️",
      "parang confidence lang ang kumpleto, kulang ang detalye 😂",
      "pero mas malinaw pa ang typing indicator kaysa punto mo ☄️😂",
      "parang headline na walang laman ang article 😂",
      "pero walang ebidensyang sumuporta sa claim mo ☄️",
      "parang sinulat habang hindi pa tapos mag-isip 😂",
      "pero paikot-ikot pa rin sa parehong palusot ☄️😂",
      "parang may simula pero walang matinong konklusyon 😂",
      "pero kahit ulitin natin, hindi pa rin nagiging convincing ☄️"
    ]
  ),
  laugh: buildLinePool(
    [
      "tawa ka pa {{NAME}}, yun na ba pinakamalakas mong ambag?😂☄️☄️",
      "{{NAME}} HAHAHA buti pa tawa mo may energy, argumento wala☄️😂",
      "sige {{FIRST_NAME}}, tawa ka muna habang naghahanap ka ng comeback😂☄️"
    ],
    [
      "HAHAHA {{NAME}}, ang lakas ng tawa mo —",
      "{{FIRST_NAME}}, enjoy na enjoy ka —",
      "Boss {{NAME}}, sige lang sa kakatawa —",
      "{{NAME}}, pati emoji mo —",
      "HAHAHA {{FIRST_NAME}}, mukhang aliw na aliw ka —",
      "{{NAME}}, tawa ka muna —",
      "Uy {{NAME}}, may sound effects pa —",
      "Bossing {{NAME}}, tuloy mo lang ang tawa —",
      "{{FIRST_NAME}}, parang laugh trip na naman —",
      "{{NAME}}, ang saya mo yata —"
    ],
    [
      "pero wala pa ring comeback na kasunod 😂",
      "kaso hindi counted ang tawa bilang sagot ☄️",
      "pero kami pa rin ang naghihintay sa punchline 😂",
      "kaso mas marami pang emoji kaysa paliwanag 😂☄️",
      "pero hindi nabubura ng tawa ang pagkatalo mo 😂",
      "kaso hindi nagiging argumento ang HAHAHA ☄️",
      "pero parang naka-loop na ang reaction mo 😂",
      "kaso wala pa ring bagong ambag sa usapan ☄️😂",
      "pero pati GC naghihintay na matapos ang laugh track 😂",
      "kaso mas mabilis ang tawa mo kaysa utak ng reply mo ☄️"
    ]
  ),
  command: buildLinePool(
    [
      "utos ka nang utos {{NAME}}, akala mo may command privilege ka☄️😂",
      "{{NAME}} kalma, hindi ikaw ang admin ng utak ko☄️☄️😂",
      "noted boss {{NAME}}, isasama ko sa listahan ng walang epekto😂☄️"
    ],
    [
      "{{NAME}}, utos ka nang utos —",
      "Boss {{NAME}}, hindi porket naka-caps lock ka —",
      "{{FIRST_NAME}}, kalma lang sa pag-uutos —",
      "{{NAME}}, akala mo may admin panel ka —",
      "Uy boss {{NAME}}, bago ka mag-demand —",
      "{{NAME}}, noted ang request mo —",
      "Bossing {{NAME}}, bago ka magbigay ng command —",
      "{{NAME}}, puwede kang mag-request —",
      "{{FIRST_NAME}}, hindi lahat ng sinabi mo —",
      "{{NAME}}, kung gusto mong masunod —"
    ],
    [
      "hindi ibig sabihin ikaw na ang masusunod 😂",
      "may kailangan ka pa ring patunayan ☄️",
      "hindi automatic na susunod ang buong GC 😂",
      "check mo muna kung may permission ka ☄️😂",
      "respeto muna bago sunod-sunod na utos 😂",
      "hindi kasama sa settings ang ego mo ☄️",
      "pila muna bago mag-utos 😂",
      "hindi lahat ng caps lock ay authority ☄️😂",
      "mas okay kung maayos ang pagkakasabi mo 😂",
      "tandaan mong request pa rin iyan, hindi batas ☄️"
    ]
  ),
  boast: buildLinePool(
    [
      "angas mo naman {{NAME}}, akala ko may kasunod na proof☄️😂",
      "{{NAME}} champion ka na sa kwento mo, sa actual kaya?☄️☄️😂",
      "HEV ABI OWNS {{UPPER_NAME}}, kahit ilang beses mo pang i-announce🥷🩸🩸"
    ],
    [
      "{{NAME}}, ang taas ng flex mo —",
      "Boss {{NAME}}, champion ka sa kwento —",
      "{{FIRST_NAME}}, ang dami mong claims —",
      "{{NAME}}, kung trophy ang yabang —",
      "HEV ABI narinig ang flex mo, {{NAME}} —",
      "{{NAME}}, puro highlight ang kwento mo —",
      "Uy {{NAME}}, undefeated ka raw —",
      "Bossing {{NAME}}, ang lakas ng intro mo —",
      "{{NAME}}, ang record mo sa sariling kwento —",
      "{{FIRST_NAME}}, sige, i-announce mo pa —"
    ],
    [
      "pero nasaan naman ang replay? 😂☄️",
      "kaso wala pang scoreboard na sumusuporta 😂",
      "pero puro claims at wala pang resibo ☄️",
      "kaso sa actual round tayo mag-usap 😂",
      "parang trailer na walang movie ☄️😂",
      "pero hindi pa lumalabas ang totoong resulta 😂",
      "kaso headline lang ang meron, walang proof ☄️",
      "pero kahit isang konkretong example wala 😂",
      "parang fan fiction ang stats mo ☄️😂",
      "kaso naghihintay pa rin kami ng ebidensya 😂"
    ]
  ),
  slow: buildLinePool(
    [
      "bumagal ka ata {{NAME}}, pati reply mo nag-buffer☄️☄️😂",
      "{{NAME}} bilisan mo, naghihintay pa yung punchline mo😂☄️",
      "loading pa rin ba {{FIRST_NAME}}? kanina pa kami nandito☄️😂"
    ],
    [
      "{{NAME}}, ang tagal ng reply mo —",
      "{{FIRST_NAME}}, nag-loading ka na naman —",
      "Boss {{NAME}}, parang naka-dial-up ang sagot mo —",
      "{{NAME}}, baka kailangan mo ng restart —",
      "Uy {{NAME}}, nag-timeout na yata —",
      "{{NAME}}, habang naghihintay kami —",
      "Bossing {{NAME}}, ang bagal ng pacing mo —",
      "{{FIRST_NAME}}, baka nasa buffering screen ka —",
      "{{NAME}}, ang comeback mo yata —",
      "{{NAME}}, bilisan mo nang konti —"
    ],
    [
      "pati notification namin inantok na 😂",
      "mas matagal pa sa update na stuck sa one percent ☄️",
      "parang naka-pause pa rin ang punchline mo 😂",
      "pati audience mo nag-timeout na ☄️😂",
      "mas mabilis pa ang typing indicator kaysa sagot mo 😂",
      "kanina pa naghihintay ang buong GC ☄️",
      "parang kailangan mo ng mas stable na signal 😂",
      "hindi na namin alam kung reply pa ba ang hinihintay ☄️😂",
      "baka bukas pa dumating ang final answer mo 😂",
      "kahit oras nag-overtime na kakahintay ☄️"
    ]
  ),
});

let activeLinePools = LINE_POOLS;
let activeEnabledCategories = Object.fromEntries(
  Object.keys(LINE_POOLS).map((name) => [name, true])
);

function getDefaultJaidenAutoTargetPools() {
  return Object.fromEntries(
    Object.entries(LINE_POOLS).map(([name, lines]) => [name, lines.slice()])
  );
}

function setJaidenAutoTargetConfiguration(configuration = {}) {
  const nextPools = {};
  const nextEnabled = {};
  for (const name of Object.keys(LINE_POOLS)) {
    const candidate = configuration.lines && configuration.lines[name];
    const lines = Array.isArray(candidate)
      ? candidate.map((line) => String(line || "").trim()).filter(Boolean)
      : LINE_POOLS[name].slice();
    nextPools[name] = Object.freeze(lines.length ? lines : LINE_POOLS[name].slice());
    nextEnabled[name] = typeof configuration.enabledCategories?.[name] === "boolean"
      ? configuration.enabledCategories[name]
      : true;
  }
  if (!Object.values(nextEnabled).some(Boolean)) {
    throw new Error("At least one Jaiden Auto Target Banat category must remain enabled.");
  }
  activeLinePools = Object.freeze(nextPools);
  activeEnabledCategories = Object.freeze(nextEnabled);
  return {
    lines: Object.fromEntries(Object.entries(activeLinePools).map(([name, lines]) => [name, lines.slice()])),
    enabledCategories: { ...activeEnabledCategories },
  };
}

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
const emojiByThread = new Map();
const MAX_TRACKED_THREADS = 500;

const EMOJI_VARIANTS = Object.freeze({
  general: ["😂", "☄️", "💀", "🥷", "😭", "⚡"],
  insult: ["🤡", "💀", "☠️", "🥴", "😭", "😂"],
  laugh: ["😂", "🤣", "😭", "💀", "😹", "☠️"],
  command: ["🫡", "⚠️", "☝️", "💀", "😂", "🚨"],
  boast: ["👑", "🥶", "🔥", "💯", "☄️", "😂"],
  slow: ["🐢", "⏳", "💤", "🫠", "😂", "☄️"],
});

function addVariedEmoji(line, usedKey, poolName) {
  const variants = EMOJI_VARIANTS[poolName] || EMOJI_VARIANTS.general;
  const previous = emojiByThread.get(usedKey);
  const candidates = variants.filter((emoji) => emoji !== previous);
  const choices = candidates.length ? candidates : variants;
  const emoji = choices[Math.floor(Math.random() * choices.length)];
  emojiByThread.delete(usedKey);
  emojiByThread.set(usedKey, emoji);
  // Replace only a trailing emoji run; keep meaningful emoji elsewhere in
  // the authored line while ensuring consecutive sends end differently.
  const withoutTrailingEmoji = String(line).replace(/(?:\s*[\p{Extended_Pictographic}\uFE0F\u200D]+)+\s*$/u, "").trimEnd();
  return withoutTrailingEmoji + emoji;
}

function detectJaidenAutoTargetContext(message) {
  const text = String(message || "").normalize("NFKC").toLocaleLowerCase("en");
  if (!text.trim()) return "general";
  const has = (patterns) => patterns.some((pattern) => pattern.test(text));
  // Check explicit emotional/intent signals before generic insults.
  if (has([/\b(?:hahaha+|ahaha+|hehe+|lmao|lol|😂|🤣)\b/i, /(?:😂|🤣){1,}/])) return "laugh";
  if (has([/\b(?:utos|order|command|sumunod|sundin|tumigil|stop|shut up|wag ka)\b/i, /\b(?:do this|listen|obey)\b/i])) return "command";
  if (has([/\b(?:ako ang| ako pinaka|number one|undefeated|champion|malakas ako|panalo ako|flex|angas ko)\b/i, /\b(?:best|strongest|top 1|never lose)\b/i])) return "boast";
  if (has([/\b(?:bobo|tanga|gago|inutil|stupid|idiot|weak|mahina|loser|pangit)\b/i])) return "insult";
  if (has([/\b(?:tagal|ang bagal|late|delay|loading|buffer|timeout|bilis|hurry|waiting)\b/i])) return "slow";
  return "general";
}

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
  const requestedPoolName = CONTEXT_ALIASES[contextKey] || "general";
  const fallbackPoolName = activeEnabledCategories.general
    ? "general"
    : Object.keys(activeLinePools).find((name) => activeEnabledCategories[name]) || "general";
  const poolName = activeEnabledCategories[requestedPoolName]
    ? requestedPoolName
    : fallbackPoolName;
  const pool = activeLinePools[poolName] || LINE_POOLS.general;
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
    emojiByThread.delete(oldest);
  }
  const rendered = renderJaidenAutoTargetLine(
    selected,
    options.targetName,
    options.fallbackName
  );
  return addVariedEmoji(rendered, usedKey, poolName);
}

function getJaidenAutoTargetPools() {
  return Object.fromEntries(
    Object.entries(activeLinePools).map(([name, lines]) => [name, lines.slice()])
  );
}

function resetJaidenAutoTargetHistory(threadId) {
  if (threadId == null) {
    lastByThread.clear();
    usedByThread.clear();
    emojiByThread.clear();
    return;
  }
  const prefix = String(threadId) + ":";
  for (const key of lastByThread.keys()) {
    if (key.startsWith(prefix)) {
      lastByThread.delete(key);
      usedByThread.delete(key);
      emojiByThread.delete(key);
    }
  }
}

module.exports = {
  DEFAULT_FALLBACK_NAME,
  detectJaidenAutoTargetContext,
  getDefaultJaidenAutoTargetPools,
  getJaidenAutoTargetPools,
  setJaidenAutoTargetConfiguration,
  pickJaidenAutoTargetLine,
  renderJaidenAutoTargetLine,
  resetJaidenAutoTargetHistory,
};
