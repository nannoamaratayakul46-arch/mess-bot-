"use strict";

const crypto = require("crypto");

const BATTLE_REASONS = [
  "Superior aura density.",
  "Unmatched levels of nonsense.",
  "The council has spoken.",
  "Too much confidence to ignore.",
  "Purely scientific results.",
  "The vibes were simply stronger.",
];

const BRO_RESULTS = [
  "bro is locked in.",
  "bro is cooked.",
  "bro has aura.",
  "bro should not be trusted with the aux.",
  "bro needs sleep.",
  "bro is suspicious.",
];

function stableScore(type, target) {
  const hash = crypto.createHash("sha256").update(`${type}:${String(target).toLowerCase()}`).digest();
  return hash.readUInt32BE(0) % 101;
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
    "",
    BRO_RESULTS[score % BRO_RESULTS.length],
  ].join("\n");
}

function renderBattle(a, b) {
  const auraA = stableScore("aura", a) * 20 - 1000;
  const auraB = stableScore("aura", b) * 20 - 1000;
  const rizzA = stableScore("rizz", a);
  const rizzB = stableScore("rizz", b);
  const clownA = stableScore("clown", a);
  const clownB = stableScore("clown", b);
  const totalA = auraA + rizzA * 8 - clownA * 4;
  const totalB = auraB + rizzB * 8 - clownB * 4;
  const winner = totalA >= totalB ? a : b;

  return [
    "⚔️ SOCIAL BATTLE",
    "━━━━━━━━━━━━━━━━━━",
    "",
    a,
    `🧿 Aura: ${auraA}`,
    `💘 Rizz: ${rizzA}`,
    `🤡 Clown: ${clownA}`,
    "",
    "VS",
    "",
    b,
    `🧿 Aura: ${auraB}`,
    `💘 Rizz: ${rizzB}`,
    `🤡 Clown: ${clownB}`,
    "",
    "━━━━━━━━━━━━━━━━━━",
    "",
    "🏆 WINNER",
    winner,
    "",
    BATTLE_REASONS[Math.abs(totalA - totalB) % BATTLE_REASONS.length],
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
    "⚔️ !battle [user1] [user2] — social battle",
    "",
    "♡ !vibes — open this menu",
    "♡ !vibes rules — see how it works",
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
    "♡ These are fictional social-chaos meters.",
    "♡ Scores are deterministic for each name, so",
    "  checking the same target gives the same result.",
    "♡ They do not change coins, XP, RPG stats,",
    "  inventory, ranks, or other permanent data.",
    "♡ Mention a user or type a name after the command.",
    "",
    "💘 RIZZ",
    "   !rizz [user]",
    "   Measures fictional rizz from 0–100.",
    "",
    "🫡 SIMP",
    "   !simp [user]",
    "   Measures fictional simp energy from 0–100.",
    "",
    "🤡 CLOWN",
    "   !clown [user]",
    "   Measures fictional clownery from 0–100.",
    "",
    "🧿 AURA",
    "   !aura [user]",
    "   Gives a fictional aura score.",
    "",
    "🎮 NPC",
    "   !npc [user]",
    "   Measures fictional NPC energy.",
    "",
    "🌀 DELULU",
    "   !delulu [user]",
    "   Measures fictional delusion levels.",
    "",
    "😈 MENACE",
    "   !menace [user]",
    "   Measures fictional menace energy.",
    "",
    "🌱 GRASS",
    "   !grass [user]",
    "   Estimates how badly the target needs grass.",
    "",
    "🗿 BRO",
    "   !bro [user]",
    "   Gives a random-style bro verdict from a stable score.",
    "",
    "⚔️ SOCIAL BATTLE",
    "   !battle [user1] [user2]",
    "   Compares aura, rizz, and clownery to pick",
    "   a fictional winner and a ridiculous reason.",
    "",
    "♡ No betting. No penalties. Just vibes. ♡",
  ].join("\n");
}

function renderMetric(type, label, target, title, unit = "%") {
  const score = stableScore(type, target);
  return [
    title,
    "━━━━━━━━━━━━━━━━━━",
    "",
    `Target: ${target}`,
    `${label}: ${score}${unit}`,
  ].join("\n");
}

function handleSocialGame(command, args = []) {
  const normalized = String(command).toLowerCase();
  const target = args[0] || "you";

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
    case "battle": return renderBattle(args[0] || "Player 1", args[1] || "Player 2");
    case "vibes":
    case "social":
    case "socialgames":
      return socialMenu();
    default:
      return null;
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
    "   ┊ !battle     · social battle",
    "   ┊ !vibes      · open social chaos",
    "   ┊ !vibes rules · how it works",
  ],
  getSocialGameRules: socialRules,
};