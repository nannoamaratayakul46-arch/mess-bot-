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
        "{{NAME}} akala mo ba hindi namin napansin",
        "boss {{NAME}} eto na naman tayo sa eksena mong",
        "{{FIRST_NAME}} tahimik ka bigla, parang",
        "HEV ABI na naman ang laman ng isip ni {{NAME}},",
        "{{NAME}} ang tapang mo sa chat pero",
        "bossing {{NAME}} may bagong entry ka na naman sa",
        "{{NAME}} kahit anong angas mo,",
        "uy {{FIRST_NAME}}, mukhang kailangan mo ng",
        "{{NAME}} nagparamdam ka lang para",
        "HEV ABI check muna, {{NAME}} baka"
    ],
    [
        "puro intro, walang ending😂☄️",
        "nasa loading screen pa rin ang comeback mo😂",
        "parang draft na hindi na na-save☄️😂",
        "puro ingay pero bitin ang punchline😂☄️",
        "naghahanap pa rin ng tamang timing🥷😂",
        "napa-second look tuloy buong GC☄️",
        "parang nag-buffer pati confidence mo😂",
        "ang bilis mawala ng yabang mo rito☄️😂",
        "may audience ka pero walang applause😂",
        "subukan mo ulit pag ready na ang banat mo☄️"
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
        "{{NAME}} ang argumento mo ay parang",
        "{{FIRST_NAME}} may sense sana yung sinabi mo kung",
        "boss {{NAME}} ang lakas ng confidence mo,",
        "{{NAME}} nag-type ka nang mahaba para",
        "{{NAME}} parang nag-research ka pero",
        "uy {{FIRST_NAME}}, yung logic mo",
        "{{NAME}} ang point mo yata ay",
        "bossing {{NAME}} kahit i-replay natin,",
        "{{NAME}} ang reply mo ay",
        "{{FIRST_NAME}} hindi naman masama magkamali,"
    ],
    [
        "nawala sa unang sentence😂☄️",
        "hindi pa rin makita ang main point😂",
        "nauna pa ang yabang kaysa ebidensya☄️😂",
        "mas maraming typo kaysa paliwanag😂",
        "kulang pa sa final answer☄️",
        "parang hiniram lang sa comment section😂",
        "may simula pero walang direksyon☄️😂",
        "hindi umabot sa conclusion😂",
        "mas bagay pang draft kaysa argumento☄️",
        "bawi ka na lang sa next reply😂"
    ]
  ),
  laugh: buildLinePool(
    [
        "tawa ka pa {{NAME}}, yun na ba pinakamalakas mong ambag?😂☄️☄️",
        "{{NAME}} HAHAHA buti pa tawa mo may energy, argumento wala☄️😂",
        "sige {{FIRST_NAME}}, tawa ka muna habang naghahanap ka ng comeback😂☄️"
    ],
    [
        "HAHAHA {{NAME}} tawa ka nang tawa,",
        "{{FIRST_NAME}} ang saya mo yata,",
        "{{NAME}} kung tawa ang laban,",
        "boss {{NAME}} sige lang tumawa,",
        "{{NAME}} pati emoji mo",
        "HAHAHA bossing, {{NAME}}",
        "{{FIRST_NAME}} mukhang laugh trip ka na naman,",
        "{{NAME}} tawa muna bago",
        "uy {{NAME}}, ang lakas ng tawa mo,",
        "{{NAME}} may sound effects pa"
    ],
    [
        "pero nasaan ang comeback?😂☄️",
        "kami na ang naghihintay sa punchline😂",
        "baka matabunan na ang argumento mo😂☄️",
        "kahit tawa mo may sariling cooldown😂",
        "isang solid na reply naman diyan☄️😂",
        "hindi counted ang tawa bilang sagot😂",
        "parang naka-loop na ang reaction mo😂☄️",
        "balik ka pag may bagong banat😂",
        "pati GC napatingin sa tawa mo😂",
        "pero wala pa ring point na lumalabas☄️"
    ]
  ),
  command: buildLinePool(
    [
        "utos ka nang utos {{NAME}}, akala mo may command privilege ka☄️😂",
        "{{NAME}} kalma, hindi ikaw ang admin ng utak ko☄️☄️😂",
        "noted boss {{NAME}}, isasama ko sa listahan ng walang epekto😂☄️"
    ],
    [
        "{{NAME}} utos ka nang utos,",
        "boss {{NAME}} hindi porket nag-capital letters ka,",
        "{{FIRST_NAME}} kalma lang sa pag-uutos,",
        "{{NAME}} akala mo may admin panel ka,",
        "uy boss {{NAME}},",
        "{{NAME}} noted ang request mo,",
        "bossing {{NAME}} bago ka mag-demand,",
        "{{NAME}} hindi lahat ng sinabi mo",
        "{{FIRST_NAME}} may command ka na naman,",
        "{{NAME}} pwede kang mag-request pero"
    ],
    [
        "wala kang shortcut dito😂☄️",
        "hindi automatic na susunod ang mundo😂",
        "check mo muna kung may permission ka☄️😂",
        "hindi ako naka-auto-approve sa yabang😂",
        "ilagay mo muna sa suggestion box😂☄️",
        "hindi kasama sa settings ang ego mo😂",
        "pila muna bago mag-utos☄️",
        "hindi lahat ng caps lock ay authority😂",
        "may limit din ang boss mode mo😂☄️",
        "respeto muna bago request😂"
    ]
  ),
  boast: buildLinePool(
    [
        "angas mo naman {{NAME}}, akala ko may kasunod na proof☄️😂",
        "{{NAME}} champion ka na sa kwento mo, sa actual kaya?☄️☄️😂",
        "HEV ABI OWNS {{UPPER_NAME}}, kahit ilang beses mo pang i-announce🥷🩸🩸"
    ],
    [
        "{{NAME}} ang taas ng flex mo,",
        "boss {{NAME}} champion ka sa kwento,",
        "{{FIRST_NAME}} ang dami mong claims,",
        "{{NAME}} kung trophy ang yabang,",
        "HEV ABI narinig ang flex mo, {{NAME}},",
        "{{NAME}} puro highlight ang kwento mo,",
        "uy {{NAME}}, mukhang undefeated ka raw,",
        "bossing {{NAME}} ang lakas ng intro mo,",
        "{{NAME}} ang record mo sa sariling kwento,",
        "{{FIRST_NAME}} sige, i-announce mo pa"
    ],
    [
        "nasaan naman ang replay?😂☄️",
        "pahingi naman ng proof para kumpleto😂",
        "pero wala pang scoreboard na makita☄️😂",
        "sa actual round tayo mag-usap😂",
        "parang trailer na walang movie😂☄️",
        "baka fan fiction ang stats mo😂",
        "puro headline, kulang sa result☄️😂",
        "naghihintay pa ang resibo😂",
        "kahit echo mo napagod na kakapalakpak😂",
        "next time may evidence naman😂☄️"
    ]
  ),
  slow: buildLinePool(
    [
        "bumagal ka ata {{NAME}}, pati reply mo nag-buffer☄️☄️😂",
        "{{NAME}} bilisan mo, naghihintay pa yung punchline mo😂☄️",
        "loading pa rin ba {{FIRST_NAME}}? kanina pa kami nandito☄️😂"
    ],
    [
        "{{NAME}} ang tagal ng reply mo,",
        "{{FIRST_NAME}} nag-loading ka na naman,",
        "boss {{NAME}} parang naka-dial-up ang",
        "{{NAME}} baka kailangan mo ng restart,",
        "uy {{NAME}}, nag-timeout na yata",
        "{{NAME}} habang naghihintay kami,",
        "bossing {{NAME}} ang bagal ng pacing mo,",
        "{{FIRST_NAME}} baka nasa buffering screen ka,",
        "{{NAME}} ang comeback mo yata ay",
        "{{NAME}} bilisan mo nang konti,"
    ],
    [
        "pati notification namin inantok😂☄️",
        "may loading icon pa rin sa utak ng reply😂",
        "kahit oras nag-overtime na kakahintay☄️😂",
        "parang update na stuck sa 1 percent😂",
        "naka-pause pa rin ang punchline mo☄️",
        "bumalik ka pag tapos na mag-load😂",
        "nag-timeout na ang audience mo😂☄️",
        "pati seen status mo naghintay😂",
        "mas mabilis pa ang typing indicator kaysa sa'yo😂",
        "baka kailangan mo ng mas stable na signal☄️😂"
    ]
  ),
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
