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
  return ["🌱 TOUCH GRASS", "━━━━━━━━━━━━━━━━━━", "", `Target: ${target}`, `Grass proximity: ${100 - score}%`, `Recommended exposure: ${days} day${days === 1 ? "" : "s"}`, "", score >= 70 ? "please go outside. respectfully." : "grass contact is currently acceptable."].join("\n");
}

function renderBro(target) {
  const score = stableScore("bro", target);
  return ["🗿 BRO CHECK", "━━━━━━━━━━━━━━━━━━", "", `Target: ${target}`, `Bro rating: ${score}%`, "", BRO_RESULTS[score % BRO_RESULTS.length]].join("\n");
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
  const target = args[0] || "you";
  switch (String(command).toLowerCase()) {
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
      return socialMenu();
    default:
      return null;
  }
}

module.exports = {
  handleSocialGame,
  socialMenu,
};
