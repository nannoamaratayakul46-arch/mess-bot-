"use strict";

// SOCIAL CHAOS
// One existing system, no extra persistence and no economy/RPG writes.
// Scores are deterministic, but each game now produces a small "profile" instead
// of a bare number so the commands feel like actual mini-games.
const crypto = require("crypto");

const BATTLE_REASONS = [
  "The council has reviewed the evidence.",
  "The vibes department has filed its report.",
  "Nobody understands the mathematics, including the mathematics.",
  "The scoreboard refuses to explain itself.",
  "Purely scientific. Probably.",
  "The room collectively went silent.",
  "An extremely serious committee approved this result.",
  "This outcome will be discussed for generations.",
];

const PROFILES = {
  rizz: [
    ["THE STRUGGLER", "game still loading", "eye contact DLC required"],
    ["APPRENTICE", "some game detected", "keep cooking"],
    ["SMOOTH OPERATOR", "respectable game", "dangerously close to working"],
    ["HEART THIEF", "dangerously smooth", "the room noticed"],
    ["CHARISMA RAID BOSS", "walking charisma hazard", "please stop making it look easy"],
  ],
  simp: [
    ["INDEPENDENT", "emotionally unavailable", "no allegations sustained"],
    ["SOFT SPOT", "light simp activity", "suspiciously wholesome"],
    ["DEVOTED", "the allegations are growing", "screenshots may exist"],
    ["DOWN BAD", "certified simp behavior", "defense counsel has resigned"],
    ["CATASTROPHIC", "down catastrophic", "the group chat knows"],
  ],
  clown: [
    ["CITIZEN", "mostly normal", "the circus is closed"],
    ["ASSISTANT CLOWN", "minor clown activity", "one red nose issued"],
    ["CIRCUS REGULAR", "red nose detected", "suspicious honking reported"],
    ["RINGMASTER", "full circus operations", "three elephants have been notified"],
    ["CLOWN EMPEROR", "CEO of the circus", "the tent belongs to you now"],
  ],
  aura: [
    ["DIMMED", "aura buffering", "try turning yourself off and on again"],
    ["NOTICEABLE", "aura detected", "small ripple in the room"],
    ["PRESENT", "strong presence", "people looked up"],
    ["MAIN CHARACTER", "main-character aura", "camera crew incoming"],
    ["EVENT BOSS", "the room changed temperature", "background music intensified"],
  ],
  npc: [
    ["MAIN CHARACTER", "main character detected", "plot armor installed"],
    ["SIDE QUEST", "background character energy", "dialogue options available"],
    ["NPC", "NPC behavior observed", "default dialogue equipped"],
    ["QUEST GIVER", "dialogue options exhausted", "you have been given a mysterious task"],
    ["FINAL QUEST", "the quest giver has arrived", "everyone suddenly needs something from you"],
  ],
  delulu: [
    ["GROUNDED", "grounded in reality", "reality still has admin access"],
    ["OPTIMIST", "slightly delulu", "one questionable assumption detected"],
    ["HOPEFUL", "optimism has entered the chat", "evidence is currently optional"],
    ["VISIONARY", "delusion department active", "reality has been placed on mute"],
    ["ARCHMAGE", "reality has been blocked", "the prophecy is self-written"],
  ],
  menace: [
    ["CITIZEN", "harmless citizen", "public safety approves"],
    ["MISCHIEF", "mild menace", "one suspicious eyebrow raised"],
    ["SUSPECT", "questionable intentions", "authorities are taking notes"],
    ["THREAT", "public safety has concerns", "three warning signs deployed"],
    ["FINAL BOSS", "final boss behavior", "evacuation music detected"],
  ],
};

const BRO_RESULTS = [
  "bro is locked in.",
  "bro is cooked.",
  "bro has aura.",
  "bro should not be trusted with the aux.",
  "bro needs sleep.",
  "bro is suspicious.",
  "bro has been promoted to bro-in-chief.",
  "bro survived the allegations.",
];

const ROASTS = [
  "your Wi-Fi signal has more presence than you.",
  "you bring tutorial-level confidence to boss-level situations.",
  "even your autocorrect has stopped defending you.",
  "the council reviewed the evidence and requested a timeout.",
  "you somehow lost an argument with the loading screen.",
  "your aura filed for annual leave.",
  "your character build has one stat point and it is confidence.",
  "the patch notes specifically mentioned you.",
];

const ARCHETYPES = [
  "CHAOTIC NEUTRAL", "ACCIDENTAL MAIN CHARACTER", "GROUP CHAT MENACE",
  "SUSPICIOUSLY WHOLESOME", "UNLICENSED LEGEND", "WALKING SIDE QUEST",
  "CERTIFIED WILDCARD", "PROBLEMATIC BUT ENTERTAINING",
];

function stableScore(type, target) {
  const hash = crypto.createHash("sha256").update(`${type}:${String(target).trim().toLowerCase()}`).digest();
  return hash.readUInt32BE(0) % 101;
}

function pairScore(type, a, b) {
  return stableScore(type, `${String(a).trim().toLowerCase()}|${String(b).trim().toLowerCase()}`);
}

function band(score) {
  if (score >= 90) return "LEGENDARY";
  if (score >= 75) return "ELITE";
  if (score >= 55) return "SOLID";
  if (score >= 30) return "QUESTIONABLE";
  return "COOKED";
}

function bar(score, size = 10) {
  const filled = Math.round((score / 100) * size);
  return "▰".repeat(filled) + "▱".repeat(size - filled);
}

function profile(type, score) {
  const list = PROFILES[type] || [["UNKNOWN", "the vibes are inconclusive", "no further evidence"]];
  return list[Math.min(list.length - 1, Math.floor(score / 21))];
}

function archetype(target) {
  const score = stableScore("archetype", target);
  return ARCHETYPES[score % ARCHETYPES.length];
}

function renderMetric(type, label, target, title, icon) {
  const score = stableScore(type, target);
  const [rankName, verdict, flavor] = profile(type, score);
  const secondary = stableScore(`${type}:secondary`, target);
  const consistency = stableScore(`${type}:consistency`, target);

  return [
    `╭──────── ${icon} ECLIPSE ────────╮`,
    `          ${title}`,
    "╰──────────────────────────────╯",
    "",
    `👤 ${target}`,
    `🏷️ ${rankName}`,
    "",
    `${icon} ${label}: ${score}%`,
    `${bar(score)}`,
    "",
    `⚡ ${label === "Rizz" ? "Smoothness" : "Chaos"}: ${secondary}%`,
    `🧬 Consistency: ${consistency}%`,
    `🎭 Archetype: ${archetype(target)}`,
    "",
    `> ${verdict}`,
    `↳ ${flavor}`,
    "",
    "♡ result generated by the highly questionable ECLIPSE laboratory ♡",
  ].join("\n");
}

function renderGrass(target) {
  const score = stableScore("grass", target);
  const outside = 100 - score;
  const days = Math.max(1, Math.ceil(score / 18));
  const urgency = score >= 80 ? "CRITICAL" : score >= 55 ? "ELEVATED" : score >= 30 ? "NORMAL" : "LOW";
  return [
    "╭──────── 🌱 ECLIPSE ────────╮",
    "          TOUCH GRASS",
    "╰──────────────────────────────╯",
    "",
    `👤 ${target}`,
    `🌱 Grass proximity: ${outside}%`,
    `${bar(outside)}`,
    "",
    `🚨 Grass emergency: ${urgency}`,
    `☀️ Recommended exposure: ${days} day${days === 1 ? "" : "s"}`,
    `🧭 Outdoor readiness: ${stableScore("outdoor", target)}%`,
    "",
    score >= 70 ? "> please go outside. respectfully." : "> grass contact is currently acceptable.",
    `↳ ${score >= 70 ? "the screen has defeated you." : "nature has not filed a complaint."}`,
  ].join("\n");
}

function renderBro(target) {
  const score = stableScore("bro", target);
  const loyalty = stableScore("bro:loyalty", target);
  const aux = stableScore("bro:aux", target);
  return [
    "╭──────── 🗿 ECLIPSE ────────╮",
    "            BRO CHECK",
    "╰──────────────────────────────╯",
    "",
    `👤 ${target}`,
    `🗿 Bro rating: ${score}%`,
    `${bar(score)}`,
    "",
    `🤝 Bro loyalty: ${loyalty}%`,
    `🎧 Aux privileges: ${aux}%`,
    `🏷️ Rank: ${band(score)}`,
    "",
    `> ${BRO_RESULTS[score % BRO_RESULTS.length]}`,
    `↳ archetype: ${archetype(target)}`,
  ].join("\n");
}

function renderRoast(target) {
  const severity = stableScore("roast", target);
  const creativity = stableScore("roast:creativity", target);
  const mercy = 100 - stableScore("roast:mercy", target);
  return [
    "╭──────── 🔥 ECLIPSE ────────╮",
    "          ROAST-O-METER",
    "╰──────────────────────────────╯",
    "",
    `🎯 ${target}`,
    `🔥 Severity: ${severity}/100`,
    `${bar(severity)}`,
    `🧠 Creativity: ${creativity}%`,
    `🛡️ Mercy: ${mercy}%`,
    "",
    `> ${ROASTS[severity % ROASTS.length]}`,
    "",
    severity >= 80 ? "⚠️ emotional damage protocol activated." : "♡ roast delivered with questionable affection.",
  ].join("\n");
}

function renderBattle(a, b) {
  const auraA = stableScore("aura", a);
  const auraB = stableScore("aura", b);
  const rizzA = stableScore("rizz", a);
  const rizzB = stableScore("rizz", b);
  const clownA = stableScore("clown", a);
  const clownB = stableScore("clown", b);
  const menaceA = stableScore("menace", a);
  const menaceB = stableScore("menace", b);
  const totalA = auraA * 2 + rizzA * 3 + menaceA - clownA;
  const totalB = auraB * 2 + rizzB * 3 + menaceB - clownB;
  const tie = totalA === totalB;
  const winner = tie ? "IT'S A DRAW" : totalA > totalB ? a : b;
  const gap = Math.abs(totalA - totalB);
  const momentum = stableScore("momentum", `${a}|${b}`);

  return [
    "╭──────── ⚔️ ECLIPSE ────────╮",
    "          SOCIAL BATTLE",
    "╰──────────────────────────────╯",
    "",
    `⚔️ ${a}`,
    `🧿 Aura   ${bar(auraA, 8)} ${auraA}`,
    `💘 Rizz   ${bar(rizzA, 8)} ${rizzA}`,
    `😈 Menace ${bar(menaceA, 8)} ${menaceA}`,
    `🤡 Clown  ${bar(clownA, 8)} ${clownA}`,
    `⚡ Power: ${totalA}`,
    "",
    "             VS",
    "",
    `⚔️ ${b}`,
    `🧿 Aura   ${bar(auraB, 8)} ${auraB}`,
    `💘 Rizz   ${bar(rizzB, 8)} ${rizzB}`,
    `😈 Menace ${bar(menaceB, 8)} ${menaceB}`,
    `🤡 Clown  ${bar(clownB, 8)} ${clownB}`,
    `⚡ Power: ${totalB}`,
    "",
    "━━━━━━━━━━━━━━━━━━",
    `🏆 ${winner}`,
    tie ? "The universe refused to choose." : `Victory margin: ${gap}`,
    `🌪️ Battle momentum: ${momentum}%`,
    "",
    tie ? "Both contestants remain equally unserious." : BATTLE_REASONS[gap % BATTLE_REASONS.length],
  ].join("\n");
}

function renderCompatibility(a, b) {
  const chemistry = pairScore("chemistry", a, b);
  const vibe = pairScore("compatibility", a, b);
  const chaos = pairScore("chaos", a, b);
  const communication = pairScore("communication", a, b);
  const finalScore = Math.round(chemistry * 0.35 + vibe * 0.3 + communication * 0.2 + (100 - chaos) * 0.15);
  const verdict = finalScore >= 85 ? "dangerously compatible." : finalScore >= 70 ? "the group chat may have a point." : finalScore >= 50 ? "the vibes could work." : "the council recommends supervision.";
  return [
    "╭──────── 💞 ECLIPSE ────────╮",
    "       COMPATIBILITY LAB",
    "╰──────────────────────────────╯",
    "",
    `💞 ${a}`,
    `       ×`,
    `💞 ${b}`,
    "",
    `💗 Chemistry     ${bar(chemistry, 8)} ${chemistry}`,
    `🧿 Vibe match     ${bar(vibe, 8)} ${vibe}`,
    `💬 Communication  ${bar(communication, 8)} ${communication}`,
    `🌪️ Chaos risk     ${bar(chaos, 8)} ${chaos}`,
    "",
    `💘 Compatibility: ${finalScore}%`,
    `${bar(finalScore)}`,
    `🏷️ ${band(finalScore)}`,
    "",
    `> ${verdict}`,
  ].join("\n");
}

function renderShip(a, b) {
  const score = pairScore("ship", a, b);
  const chemistry = pairScore("ship:chemistry", a, b);
  const chaos = pairScore("ship:chaos", a, b);
  const stability = 100 - chaos;
  const status = score >= 85 ? "THE SHIP HAS LEFT THE HARBOR." : score >= 65 ? "the ship is boarding." : score >= 40 ? "the ship is still being assembled." : "the ship has hit a decorative iceberg.";
  return [
    "╭──────── 🚢 ECLIPSE ────────╮",
    "           SHIP METER",
    "╰──────────────────────────────╯",
    "",
    `🚢 ${a} × ${b}`,
    "",
    `💗 Ship strength ${score}%`,
    `${bar(score)}`,
    `✨ Chemistry      ${chemistry}%`,
    `🛟 Stability      ${stability}%`,
    `🌪️ Chaos factor   ${chaos}%`,
    "",
    `🏷️ Status: ${band(score)}`,
    `> ${status}`,
  ].join("\n");
}

function socialMenu() {
  return [
    "╭──────────────────────────────╮",
    "          ♡ ECLIPSE ♡",
    "        🎭 SOCIAL CHAOS",
    "╰──────────────────────────────╯",
    "",
    "୨୧ choose your victim ୨୧",
    "",
    "♡ SINGLE TARGET",
    "   ┊ !rizz [user]   · charisma profile",
    "   ┊ !simp [user]   · simp investigation",
    "   ┊ !clown [user]  · circus assessment",
    "   ┊ !aura [user]   · aura profile",
    "   ┊ !npc [user]    · NPC assessment",
    "   ┊ !delulu [user] · reality audit",
    "   ┊ !menace [user] · threat assessment",
    "   ┊ !grass [user]  · outdoor intervention",
    "   ┊ !bro [user]    · bro credentials",
    "   ┊ !roast [user]  · harmless roast",
    "",
    "♡ TWO PLAYER",
    "   ┊ !compat [u1] [u2] · chemistry lab",
    "   ┊ !ship [u1] [u2]   · ship meter",
    "   ┊ !battle [u1] [u2] · social battle",
    "",
    "♡ !vibes rules · complete rules",
  ].join("\n");
}

function socialRules() {
  return [
    "╭──────────────────────────────╮",
    "          ♡ ECLIPSE ♡",
    "        🎭 SOCIAL CHAOS",
    "╰──────────────────────────────╯",
    "",
    "୨୧ HOW IT WORKS",
    "",
    "♡ Every command generates a fictional profile,",
    "  not just a naked number.",
    "♡ Results include ranks, stat bars, verdicts,",
    "  secondary traits and funny context.",
    "♡ Scores are deterministic, so the same target",
    "  gets the same result instead of rerolling.",
    "♡ They do not change coins, XP, RPG stats,",
    "  inventory, ranks, or permanent data.",
    "♡ Mention a user or type a name after a command.",
    "♡ Two-player games need two names/mentions.",
    "",
    "💘 RIZZ",
    "   Builds a charisma profile with smoothness,",
    "   consistency, archetype and a verdict.",
    "",
    "🫡 SIMP / 🤡 CLOWN / 🧿 AURA / 🎮 NPC",
    "   Each has its own themed profile and secondary stat.",
    "",
    "🌀 DELULU / 😈 MENACE",
    "   Turns the target into a fictional case file.",
    "",
    "🌱 GRASS / 🗿 BRO / 🔥 ROAST",
    "   Multi-stat comedy checks with unique outcomes.",
    "",
    "💞 COMPAT",
    "   Chemistry + vibe + communication − chaos.",
    "",
    "🚢 SHIP",
    "   Ship strength + chemistry + stability + chaos.",
    "",
    "⚔️ BATTLE",
    "   Aura + rizz + menace − clownery becomes power.",
    "   Both fighters get full stat cards before the result.",
    "",
    "♡ No betting. No penalties. Just chaos. ♡",
  ].join("\n");
}

function handleSocialGame(command, args = []) {
  const normalized = String(command).toLowerCase().replace(/^!/, "");
  const normalizedArgs = Array.isArray(args) ? args.filter(Boolean) : [];
  const target = normalizedArgs[0] || "you";

  if ((normalized === "vibes" || normalized === "social" || normalized === "socialgames") && target.toLowerCase() === "rules") {
    return socialRules();
  }

  switch (normalized) {
    case "rizz": return renderMetric("rizz", "Rizz", target, "RIZZ PROFILE", "💘");
    case "simp": return renderMetric("simp", "Simp Level", target, "SIMP CASE FILE", "🫡");
    case "clown": return renderMetric("clown", "Clownery", target, "CLOWN PROFILE", "🤡");
    case "aura": return renderMetric("aura", "Aura", target, "AURA PROFILE", "🧿");
    case "npc": return renderMetric("npc", "NPC Level", target, "NPC CASE FILE", "🎮");
    case "delulu": return renderMetric("delulu", "Delulu Level", target, "REALITY AUDIT", "🌀");
    case "menace": return renderMetric("menace", "Menace Level", target, "THREAT ASSESSMENT", "😈");
    case "grass": return renderGrass(target);
    case "bro": return renderBro(target);
    case "roast": return renderRoast(target);
    case "compat":
    case "compatibility": return renderCompatibility(normalizedArgs[0] || "Player 1", normalizedArgs[1] || "Player 2");
    case "ship": return renderShip(normalizedArgs[0] || "Player 1", normalizedArgs[1] || "Player 2");
    case "battle": return renderBattle(normalizedArgs[0] || "Player 1", normalizedArgs[1] || "Player 2");
    case "vibes":
    case "social":
    case "socialgames": return socialMenu();
    default: return null;
  }
}

module.exports = {
  handleSocialGame,
  socialMenu,
  getSocialGameMenuLines: () => [
    "",
    "♡ SOCIAL CHAOS",
    "   ┊ !rizz       · charisma profile",
    "   ┊ !simp       · simp investigation",
    "   ┊ !clown      · circus assessment",
    "   ┊ !aura       · aura profile",
    "   ┊ !npc        · NPC assessment",
    "   ┊ !delulu     · reality audit",
    "   ┊ !menace     · threat assessment",
    "   ┊ !grass      · outdoor intervention",
    "   ┊ !bro        · bro credentials",
    "   ┊ !roast      · harmless roast",
    "   ┊ !compat     · chemistry lab",
    "   ┊ !ship       · ship meter",
    "   ┊ !battle     · social battle",
    "   ┊ !vibes      · open social chaos",
    "   ┊ !vibes rules · how it works",
  ],
  getSocialGameRules: socialRules,
};
