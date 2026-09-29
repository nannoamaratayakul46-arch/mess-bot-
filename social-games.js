"use strict";

const crypto = require("crypto");

const SOCIAL_GAMES = {
  rizz: {
    label: "RIZZ METER",
    icon: "💘",
    command: "!rizz",
    description: "measure the fictional smoothness",
  },
  simp: {
    label: "SIMP CHECK",
    icon: "🫡",
    command: "!simp",
    description: "detect suspicious levels of devotion",
  },
  clown: {
    label: "CLOWN METER",
    icon: "🤡",
    command: "!clown",
    description: "measure the tomfoolery",
  },
  aura: {
    label: "AURA CHECK",
    icon: "🧿",
    command: "!aura",
    description: "calculate fictional aura",
  },
  npc: {
    label: "NPC CHECK",
    icon: "🎮",
    command: "!npc",
    description: "measure background-character energy",
  },
  delulu: {
    label: "DELULU METER",
    icon: "🫧",
    command: "!delulu",
    description: "measure the distance from reality",
  },
  menace: {
    label: "MENACE CHECK",
    icon: "☠️",
    command: "!menace",
    description: "calculate certified menace energy",
  },
  grass: {
    label: "TOUCH GRASS",
    icon: "🌱",
    command: "!grass",
    description: "estimate outdoor exposure requirements",
  },
  bro: {
    label: "BRO CHECK",
    icon: "🗿",
    command: "!bro",
    description: "issue an extremely unofficial bro assessment",
  },
};

const TITLES = {
  rizz: [
    [10, "ROMANTIC LIABILITY"], [25, "BRO NEEDS ASSISTANCE"], [40, "LOADING RIZZ..."],
    [60, "ACCEPTABLE"], [75, "SMOOTH OPERATOR"], [89, "CERTIFIED CHARMER"], [99, "DANGEROUS"], [100, "RIZZ SINGULARITY"],
  ],
  simp: [[20, "HEALTHY"], [40, "SLIGHTLY INVESTED"], [60, "SUSPICIOUS"], [80, "CERTIFIED SIMP"], [100, "FINANCIALLY ENDANGERED"]],
  clown: [[20, "CLOWN-ADJACENT"], [40, "AMATEUR FOOL"], [60, "PROFESSIONAL FOOL"], [80, "CIRCUS MANAGEMENT"], [100, "THE CIRCUS IS YOURS"]],
  npc: [[20, "MAIN CHARACTER"], [40, "SIDE QUEST"], [60, "BACKGROUND CHARACTER"], [80, "NPC ELITE"], [100, "DIALOGUE OPTIONS EXHAUSTED"]],
  delulu: [[20, "GROUNDED"], [40, "OPTIMISTIC"], [60, "QUESTIONABLE"], [80, "DELUSIONAL"], [100, "REALITY HAS LEFT THE CHAT"]],
  menace: [[20, "HARMLESS"], [40, "SUSPICIOUS"], [60, "PROBLEMATIC"], [80, "UNSUPERVISED"], [100, "PUBLIC THREAT TO THE VIBES"]],
};

const BRO_RESULTS = [
  "bro is locked in.", "bro is cooked.", "bro has aura.", "bro should not be trusted with the aux.",
  "bro needs sleep.", "bro is operating without adult supervision.", "bro is somehow winning.",
];

const BATTLE_REASONS = [
  "superior aura density.", "more concentrated rizz.", "lower clown exposure.", "the vibes aligned.",
  "statistical nonsense favored them.", "the council has spoken.",
];

function stableScore(key, target) {
  const digest = crypto.createHash("sha256").update(`${key}:${target}`).digest();
  return digest.readUInt32BE(0) % 101;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function targetName(event, args, index = 0) {
  const mentions = event?.mentions ? Object.keys(event.mentions) : [];
  if (mentions[index]) return `@${event.mentions[mentions[index]]?.name || "user"}`;
  const raw = Array.isArray(args) ? args.join(" ").trim() : String(args || "").trim();
  return raw || "you";
}

function titleFor(type, score) {
  const list = TITLES[type];
  if (!list) return score >= 90 ? "EXTREME" : score >= 70 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW";
  for (const [threshold, title] of list) if (score <= threshold) return title;
  return list[list.length - 1][1];
}

function assessment(type, score) {
  switch (type) {
    case "rizz": return score >= 90 ? "dangerous levels detected." : score >= 70 ? "the room has noticed." : score <= 25 ? "please stop trying for everyone's safety." : "there is potential here.";
    case "simp": return score >= 80 ? "one good morning text away from bankruptcy." : score >= 60 ? "defending them in arguments they started." : "financial stability remains possible.";
    case "clown": return score >= 80 ? "the circus has requested your permanent residence." : score >= 60 ? "questionable decisions detected." : "limited tomfoolery detected.";
    case "npc": return score >= 80 ? "dialogue options exhausted." : score >= 60 ? "side quest energy detected." : "main-character privileges remain active.";
    case "delulu": return score >= 80 ? "reality connection: critically low." : score >= 60 ? "facts are currently under review." : "reality connection: operational.";
    case "menace": return score >= 80 ? "do not leave this person near the aux." : score >= 60 ? "supervision recommended." : "mostly safe. probably.";
    default: return "the algorithm refuses to elaborate.";
  }
}

function renderSingle(type, target) {
  const score = stableScore(type, target);
  const cfg = SOCIAL_GAMES[type];
  return [
    `${cfg.icon} ${cfg.label}`,
    "━━━━━━━━━━━━━━━━━━",
    "",
    `Target: ${target}`,
    `Score: ${score}%`,
    `Status: ${titleFor(type, score)}`,
    "",
    assessment(type, score),
    "",
    "✧ completely unofficial. scientifically questionable. ♡",
  ].join("\n");
}

function renderAura(target) {
  const score = stableScore("aura", target) * 20 - 1000;
  const label = score >= 800 ? "AURA SOVEREIGN" : score >= 500 ? "AURA OVERLOAD" : score >= 100 ? "POSITIVE AURA" : score >= -250 ? "NEUTRAL AURA" : score >= -600 ? "AURA DEFICIT" : "NEGATIVE AURA EVENT";
  return [`🧿 AURA CHECK`, "━━━━━━━━━━━━━━━━━━", "", `Target: ${target}`, `Aura: ${score >= 0 ? "+" : ""}${score}`, `Status: ${label}`, "", score >= 0 ? "the vibes are present." : "the vibes require immediate maintenance."].join("\n");
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
  return ["⚔️ SOCIAL BATTLE", "━━━━━━━━━━━━━━━━━━", "", `${a}",", `🧿 Aura: ${auraA}`, `💘 Rizz: ${rizzA}`, `🤡 Clown: ${clownA}`, "", "VS", "", `${b}`, `🧿 Aura: ${auraB}`, `💘 Rizz: ${rizzB}`, `🤡 Clown: ${clownB}`, "", "━━━━━━━━━━━━━━━━━━", "", `🏆 WINNER`, winner, "", BATTLE_REASONS[Math.abs(totalA - totalB) % BATTLE_REASONS.length]].join("\n").replace(`${a}",`, a);
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
    "🫧 !delulu [user] — delulu meter",
    "☠️ !menace [user] — menace check",
    "🌱 !grass [user] — touch grass report",
    "🗿 !bro [user] — bro assessment",
    "⚔️ !battle [user1] [user2] — social battle",
    "",
    "No coins. No XP. Just allegations. ♡",
  ].join("\n");
}

async function handleSocialGame(api, event, command, args = []) {
  const key = String(command || "").toLowerCase().replace(/^!/, "");
  if (key === "vibes" || key === "socialgames" || key === "social") {
    if (typeof api?.sendMessage === "function") await api.sendMessage(socialMenu(), event.threadID);
    return true;
  }
  if (!SOCIAL_GAMES[key] && key !== "battle") return false;

  const target = targetName(event, args);
  let text;
  if (key === "aura") text = renderAura(target);
  else if (key === "grass") text = renderGrass(target);
  else if (key === "bro") text = renderBro(target);
  else if (key === "battle") {
    const a = target;
    const b = args.slice(1).join(" ").trim() || "the group chat";
    text = renderBattle(a, b);
  } else text = renderSingle(key, target);

  if (typeof api?.sendMessage === "function") await api.sendMessage(text, event.threadID);
  return true;
}

function getSocialGameMenuLines() {
  return [
    "🎭 SOCIAL CHAOS",
    "!rizz  !simp  !clown  !aura  !npc",
    "!delulu  !menace  !grass  !bro  !battle",
  ];
}

module.exports = { handleSocialGame, socialMenu, getSocialGameMenuLines, SOCIAL_GAMES };
