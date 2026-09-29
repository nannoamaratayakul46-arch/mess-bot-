"use strict";

/*
 * RPG command compatibility wrapper.
 *
 * The main bot imports "./rpg".  Node resolves this file before the
 * ./rpg/ directory, so we can add small routing fixes without touching
 * the large RPG router.  All existing RPG commands still go straight to
 * the original router.
 */

const original = require("./rpg/index.js");
const companions = require("./rpg/companions");
const { reply } = require("./util");

function tokens(value) {
  return String(value || "")
    .trim()
    .replace(/^!rpg\b/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function cleanId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
}

async function handleCompanionCompatibility(api, event, args) {
  const sub = cleanId(args[0] || "list");
  const id = cleanId(args[1]);

  if (sub === "evolve" || sub === "evolution") {
    if (!id) {
      await reply(
        api,
        event.threadID,
        "🐾 Usage: !rpg companion evolve <companion_id>"
      );
      return true;
    }

    const result = await companions.evolve(
      event.threadID,
      event.senderID,
      id
    );

    await reply(
      api,
      event.threadID,
      [
        "✨ COMPANION EVOLVED",
        "",
        `${result.emoji} ${result.name}`,
        `Rarity: ${result.rarity}`,
        `Evolution: Stage ${result.evolutionStage}/10 — ${result.evolutionName}`,
        `Level: ${result.level}`,
        `Unlocked: ${result.unlocked || "New evolution trait"}`,
        `Skill: ${result.skill || result.ability}`,
        `💰 Cost: ${Number(result.cost || 0).toLocaleString()} coins`,
      ].join("\n")
    );
    return true;
  }

  if (sub === "stages" || sub === "stage") {
    const stages = companions.getEvolutionStages();
    await reply(
      api,
      event.threadID,
      [
        "🐾 COMPANION EVOLUTION",
        "",
        ...stages.map(
          (stage) =>
            `Stage ${stage.stage}/10 — ${stage.name} · ${stage.unlock}`
        ),
        "",
        "Use !rpg companion evolve <id> when the requirements are met.",
      ].join("\n")
    );
    return true;
  }

  return false;
}

async function handleRpgCommand(api, event, text, originalText) {
  const args = tokens(text);

  if (
    (args[0] === "companion" ||
      args[0] === "companions" ||
      args[0] === "pet" ||
      args[0] === "pets") &&
    (cleanId(args[1]) === "evolve" ||
      cleanId(args[1]) === "evolution" ||
      cleanId(args[1]) === "stages" ||
      cleanId(args[1]) === "stage")
  ) {
    const handled = await handleCompanionCompatibility(
      api,
      event,
      args.slice(1)
    );
    if (handled) return true;
  }

  return original.handleRpgCommand(
    api,
    event,
    text,
    originalText
  );
}

module.exports = {
  handleRpgCommand,
};
