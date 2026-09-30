"use strict";

const GAMES = [
  ["roll", [], "LUCK", "roll the dice", "!roll <bet> [sides] [safe|balanced|risky]"],
  ["coinflip", ["flip"], "LUCK", "heads or tails", "!coinflip <bet> <heads|tails>"],
  ["slots", ["slot"], "LUCK", "try your luck", "!slots <bet> · five paylines; only triple matches pay"],
  ["guess", [], "SKILL", "guess the number", "!guess <min> <max> [bet]"],
  ["rps", [], "PLAY", "rock paper scissors", "!rps <rock|paper|scissors>"],
  ["blackjack", ["bj"], "PLAY", "beat the dealer", "!blackjack <bet> · !hit / !stand / !double"],
  ["trivia", [], "MIND", "test your knowledge", "!trivia · answer before the session expires"],
  ["riddle", [], "MIND", "solve a mystery", "!riddle · answer before the session expires"],
  ["math", [], "MIND", "quick calculation", "!math · solve the generated equation"],
  ["exam", [], "MIND", "take an examination", "!exam · use the exam flow"],
  ["8ball", ["8-ball"], "ECLIPSE", "ask me anything", "!8ball <question>"],
  ["chamber", ["roulette","lastchamber"], "TABLE", "Last Chamber PvP", "!chamber · use !chamber rules for full rules"],
  ["daily", [], "OTHER", "daily reward", "!daily"],
  ["work", [], "OTHER", "earn some coins", "!work"],
  ["rizz", [], "SOCIAL CHAOS", "measure the rizz", "!rizz [target]"],
  ["simp", [], "SOCIAL CHAOS", "measure simp activity", "!simp [target]"],
  ["clown", [], "SOCIAL CHAOS", "check clown level", "!clown [target]"],
  ["aura", [], "SOCIAL CHAOS", "check aura", "!aura [target]"],
  ["npc", [], "SOCIAL CHAOS", "check NPC energy", "!npc [target]"],
  ["delulu", [], "SOCIAL CHAOS", "measure delulu", "!delulu [target]"],
  ["menace", [], "SOCIAL CHAOS", "measure menace", "!menace [target]"],
  ["grass", [], "SOCIAL CHAOS", "check grass status", "!grass [target]"],
  ["bro", [], "SOCIAL CHAOS", "bro check", "!bro [target]"],
  ["roast", [], "SOCIAL CHAOS", "get roasted", "!roast [target]"],
  ["compat", ["compatibility"], "SOCIAL CHAOS", "compatibility check", "!compat <a> <b>"],
  ["ship", [], "SOCIAL CHAOS", "ship two people", "!ship <a> <b>"],
  ["battle", [], "SOCIAL CHAOS", "battle two people", "!battle <a> <b>"],
  ["vibes", ["social","socialgames"], "SOCIAL CHAOS", "Social Chaos menu", "!vibes / !social"]
].map(([command, aliases, category, description, rules]) => ({ command, aliases, category, description, rules }));

const BY_COMMAND = new Map();
for (const game of GAMES) {
  BY_COMMAND.set(game.command, game);
  for (const alias of game.aliases) BY_COMMAND.set(alias, game);
}

const COMMANDS = Object.freeze(Array.from(BY_COMMAND.keys()).sort((a,b) => b.length - a.length));
const COMMAND_PATTERN_SOURCE = COMMANDS.map((command) => command.replace(/[.*+?^$()|[\\]\\]/g, "\\$&")).join("|");

function getGame(command) {
  return BY_COMMAND.get(String(command || "").replace(/^!/, "").toLowerCase()) || null;
}

function renderMenu() {
  const categories = new Map();
  for (const game of GAMES) {
    if (!categories.has(game.category)) categories.set(game.category, []);
    categories.get(game.category).push(game);
  }
  const lines = [
    "╭──────────────────────────────╮",
    "          ♡ ECLIPSE ♡",
    "           GAME ROOM",
    "╰──────────────────────────────╯",
    "",
    "       ୨୧ choose something ୨୧",
    ""
  ];
  for (const [category, games] of categories) {
    lines.push("♡ " + category);
    for (const game of games) {
      const aliases = game.aliases.length ? " (" + game.aliases.map((a) => "!" + a).join(", ") + ")" : "";
      lines.push("   ┊ !" + game.command.padEnd(11) + " · " + game.description + aliases);
    }
    lines.push("");
  }
  lines.push("♡ !games rules  · complete rules", "♡ !games status · your game status", "", "          ♡ have fun ♡");
  return lines.join("\n");
}

function renderRules() {
  const lines = [
    "╭──────────────────────────────╮",
    "          ♡ ECLIPSE ♡",
    "           GAME RULES",
    "╰──────────────────────────────╯",
    ""
  ];
  for (const game of GAMES) lines.push("♡ !" + game.command, "   " + game.rules, "");
  lines.push("──────────────────────────────", "♡ Wagers are charged before resolution.", "♡ Game commands may be unavailable while the group has games disabled.");
  return lines.join("\n");
}

module.exports = Object.freeze({ GAMES, COMMANDS, COMMAND_PATTERN_SOURCE, getGame, renderMenu, renderRules });
