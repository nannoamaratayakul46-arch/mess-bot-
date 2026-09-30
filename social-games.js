"use strict";

// Social Chaos is intentionally self-contained: deterministic scoring, pure
// render functions, and no economy/RPG writes. This keeps the new games fun
// without creating a second persistence system.
const crypto = require("crypto");

const BATTLE_REASONS = [
  "Superior aura density.",
  "Unmatched levels of nonsense.",
  "The council has spoken.",
  "Too much confidence to ignore.",
  "Purely scientific results.",
  "The vibes were simply stronger.",
  "The spreadsheet has spoken.",
  "Absolutely nobody asked for this result.",
];

const VERDICTS = {
  rizz: ["zero game detected.", "rizz under construction.", "respectable game.", "dangerously smooth.", "walking charisma hazard."],
  simp: ["emotionally unavailable.", "light simp activity.", "the allegations are growing.", "certified simp behavior.", "down catastrophic."],
  clown: ["mostly normal.", "minor clown activity.", "red nose detected.", "full circus operations.", "CEO of the circus."],
  aura: ["aura buffering.", "aura detected.", "strong presence.", "main-character aura.", "the room changed temperature."],
  npc: ["main character detected.", "background character energy.", "NPC behavior observed.", "dialogue options exhausted.", "the quest giver has arrived."],
  delulu: ["grounded in reality.", "slightly delulu.", "optimism has entered the chat.", "delusion department active.", "reality has been blocked."],
  menace: ["harmless citizen.", "mild menace.", "questionable intentions.", "public safety has concerns.", "final boss behavior."],
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

function stableScore(type, target) {
  const hash = crypto.createHash("sha256").update(`${type}:${String(target).trim().toLowerCase()}`).digest();
  return hash.readUInt32BE(0) % 101;
}

function band(score) {
  if (score >= 90) return "LEGENDARY";
  if (score >= 75) return "ELITE";
  if (score >= 55) return "SOLID";
  if (score >= 30) return "QUESTIONABLE";
  return "COOKED";
}

function verdict(type, score) {
  const list = VERDICTS[type] || ["the vibes are inconclusive."];
  return list[Math.min(list.length - 1, Math.floor(score / 21))];
}

function renderMetric(type, label, target, title) {
  const score = stableScore(type, target);
  return [
    title,
    "━━━━━━━━━━━━━━━━━━",
    "",
    `Target: ${target}`,
    `${label}: ${score}/100`,
    `Rank: ${band(score)}`,
    "",
    verdict(type, score),
  ].join("\n");
}

function renderGrass(target) {
  const score = stableScore("grass", target);
  const days = Math.max(1, Math.ceil(score / 18));
  return [
    "🌱 TOUCH GRASS",
    "━━━━━━━━━━━━━━━━━━",
    "",
    `Target: ${target}`,
    `Grass proximity: ${100 - score}%`,
    `Recommended exposure: ${days} day${days === 1 ? "" : "s"}`,
    `Status: ${band(100 - score)}`,
    "",
    score >= 70 ? "please go outside. respectfully." : "grass contact is currently acceptable.",
  ].join("\n");
}

function renderBro(target) {
  const score = stableScore("bro", target);
  return [
    "🗿 BRO CHECK",
    "━━━━━━━━━━━━━━━━━━",
    "",
    `Target: ${target}`,
    `Bro rating: ${score}%`,
    `Rank: ${band(score)}`,
    "",
    BRO_RESULTS[score % BRO_RESULTS.length],
  ].join("\n");
}

function renderBattle(a, b) {
  const auraA = stableScore("aura", a);
  const auraB = stableScore("aura", b);
  const rizzA = stableScore("rizz", a);
  const rizzB = stableScore("rizz", b);
  const clownA = stableScore("clown", a);
  const clownB = stableScore("clown", b);
  const totalA = auraA * 2 + rizzA * 3 - clownA;
  const totalB = auraB * 2 + rizzB * 3 - clownB;
  const tie = totalA === totalB;
  const winner = tie ? "IT'S A DRAW" : totalA > totalB ? a : b;
  const gap = Math.abs(totalA - totalB);

  return [
    "⚔️ SOCIAL BATTLE",
    "━━━━━━━━━━━━━━━━━━",
    "",
    a,
    `🧿 Aura: ${auraA}`,
    `💘 Rizz: ${rizzA}`,
    `🤡 Clown: ${clownA}`,
    `⚔️ Power: ${totalA}`,
    "",
    "VS",
    "",
    b,
    `🧿 Aura: ${auraB}`,
    `💘 Rizz: ${rizzB}`,
    `🤡 Clown: ${clownB}`,
    `⚔️ Power: ${totalB}`,
    "",
    "━━━━━━━━━━━━━━━━━━",
    "",
    "🏆 RESULT",
    winner,
    tie ? "The universe refused to choose." : `Victory margin: ${gap}`,
    "",
    tie ? "Both contestants remain equally unserious." : BATTLE_REASONS[gap % BATTLE_REASONS.length],
  ].join("\n");
}

function renderCompatibility(a, b) {
  const score = stableScore("compatibility", `${a}|${b}`);
  const chemistry = stableScore("chemistry", `${a}|${b}`);
  const chaos = stableScore("chaos", `${a}|${b}`);
  return [
    "💞 COMPATIBILITY CHECK",
    "━━━━━━━━━━━━━━━━━━",
    "",
    `${a} × ${b}`,
    `💗 Chemistry: ${chemistry}/100`,
    `🧿 Vibe match: ${score}/100`,
    `🌪️ Chaos potential: ${chaos}/100`,
    "",
    `Verdict: ${score >= 75 ? "dangerously compatible." : score >= 50 ? "the vibes could work." : "the council recommends supervision."}`,
  ].join("\n");
}

function renderShip(a, b) {
  const score = stableScore("ship", `${a}|${b}`);
  const names = `${a} × ${b}`;
  const verdictText = score >= 85 ? "THE SHIP HAS LEFT THE HARBOR." : score >= 65 ? "the ship is boarding." : score >= 40 ? "the ship is still being assembled." : "the ship has hit a decorative iceberg.";
  return [
    "🚢 SHIP METER",
    "━━━━━━━━━━━━━━━━━━",
    "",
    names,
    `💗 Ship strength: ${score}%`,
    `🏷️ Status: ${band(score)}`,
    "",
    verdictText,
  ].join("\n");
}

function renderRoast(target) {
  const score = stableScore("roast", target);
  const roasts = [
    "your Wi-Fi signal has more presence than you.",
    "you bring tutorial-level confidence to boss-level situations.",
    "even your autocorrect has stopped defending you.",
    "the council reviewed the evidence and requested a timeout.",
    "you somehow lost an argument with the loading screen.",
    "your aura filed for annual leave.",
  ];
  return [
    "🔥 ROAST-O-METER",
    "━━━━━━━━━━━━━━━━━━",
    "",
    `Target: ${target}`,
    `Roast severity: ${score}/100`,
    "",
    roasts[score % roasts.length],
  ].join("\n");
}

function socialMenu() {
  return [
    "🎭 ECLIPSE SOCIAL CHAOS",
    "━━━━━━━━━━━━━━━━━━",
    "",
    "💘 !rizz [user] — measure fictional rizz",
    "🫡 !simp [user] — run the simp check",
    "🤡 !clown [user] — measure clownery",
    "🧿 !aura [user] — calculate aura",
    "🎮 !npc [user] — NPC assessment",
    "🌀 !delulu [user] — delulu meter",
    "😈 !menace [user] — menace check",
    "🌱 !grass [user] — touch grass check",
    "🗿 !bro [user] — bro check",
    "🔥 !roast [user] — harmless roast",
    "💞 !compat [u1] [u2] — compatibility",
    "🚢 !ship [u1] [u2] — ship meter",
    "⚔️ !battle [u1] [u2] — social battle",
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
    "♡ These are fictional social-chaos games.",
    "♡ Scores are deterministic for each name, so",
    "  the same target gets the same result.",
    "♡ They do not change coins, XP, RPG stats,",
    "  inventory, ranks, or permanent data.",
    "♡ Mention a user or type a name after the command.",
    "♡ Two-player games need two names/mentions.",
    "",
    "💘 RIZZ / 🫡 SIMP / 🤡 CLOWN / 🧿 AURA",
    "   Score a target from 0–100 and give a verdict.",
    "",
    "🎮 NPC / 🌀 DELULU / 😈 MENACE",
    "   Measure fictional chaos energy.",
    "",
    "🌱 GRASS / 🗿 BRO",
    "   Give a ridiculous but deterministic verdict.",
    "",
    "🔥 ROAST",
    "   !roast [user] — harmless fictional roast.",
    "",
    "💞 COMPATIBILITY",
    "   !compat [user1] [user2] — chemistry + vibe match.",
    "",
    "🚢 SHIP",
    "   !ship [user1] [user2] — fictional ship meter.",
    "",
    "⚔️ SOCIAL BATTLE",
    "   !battle [user1] [user2] — aura + rizz + clownery",
    "   are compared to produce a fictional result.",
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
    case "rizz": return renderMetric("rizz", "Rizz", target, "💘 RIZZ METER");
    case "simp": return renderMetric("simp", "Simp Level", target, "🫡 SIMP CHECK");
    case "clown": return renderMetric("clown", "Clownery", target, "🤡 CLOWN METER");
    case "aura": return renderMetric("aura", "Aura", target, "🧿 AURA CHECK");
    case "npc": return renderMetric("npc", "NPC Level", target, "🎮 NPC CHECK");
    case "delulu": return renderMetric("delulu", "Delulu Level", target, "🌀 DELULU METER");
    case "menace": return renderMetric("menace", "Menace Level", target, "😈 MENACE CHECK");
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
    "   ┊ !rizz       · measure fictional rizz",
    "   ┊ !simp       · run the simp check",
    "   ┊ !clown      · measure clownery",
    "   ┊ !aura       · calculate aura",
    "   ┊ !npc        · NPC assessment",
    "   ┊ !delulu     · delulu meter",
    "   ┊ !menace     · menace check",
    "   ┊ !grass      · touch grass check",
    "   ┊ !bro        · bro check",
    "   ┊ !roast      · harmless roast",
    "   ┊ !compat     · compatibility",
    "   ┊ !ship       · ship meter",
    "   ┊ !battle     · social battle",
    "   ┊ !vibes      · open social chaos",
    "   ┊ !vibes rules · how it works",
  ],
  getSocialGameRules: socialRules,
};