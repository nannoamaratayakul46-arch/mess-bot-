"use strict";

const original = require("./rpg/index.js");
const companions = require("./rpg/companions");
const economy = require("./rpg/economy");
const domainEvents = require("./rpg/domain-events");
const tradeRoutes = require("./rpg/trade-routes");
const { HUNT_MILESTONES, getTotalHunts } = require("./rpg/adventure");
const { reply } = require("./util");

function tokens(value) {
  return String(value || "").trim().replace(/^!rpg\b/i, "").trim().split(/\s+/).filter(Boolean);
}
function cleanId(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

async function handleCompanionCompatibility(api, event, args) {
  const sub = cleanId(args[0] || "list");
  const id = cleanId(args[1]);
  if (sub === "evolve" || sub === "evolution") {
    if (!id) { await reply(api, event.threadID, "🐾 Usage: !rpg companion evolve <companion_id>"); return true; }
    const result = await companions.evolve(event.threadID, event.senderID, id);
    await reply(api, event.threadID, ["✨ COMPANION EVOLVED", "", `${result.emoji} ${result.name}`, `Rarity: ${result.rarity}`, `Evolution: Stage ${result.evolutionStage}/10 — ${result.evolutionName}`, `Level: ${result.level}`, `Unlocked: ${result.unlocked || "New evolution trait"}`, `Skill: ${result.skill || result.ability}`, `💰 Cost: ${Number(result.cost || 0).toLocaleString()} coins`].join("\n"));
    return true;
  }
  if (sub === "stages" || sub === "stage") {
    const stages = companions.getEvolutionStages();
    await reply(api, event.threadID, ["🐾 COMPANION EVOLUTION", "", ...stages.map(stage => `Stage ${stage.stage}/10 — ${stage.name} · ${stage.unlock}`), "", "Use !rpg companion evolve <id> when the requirements are met."].join("\n"));
    return true;
  }
  return false;
}

async function handleEconomyCompatibility(api, event, args) {
  const sub = cleanId(args[0] || "status");
  if (!["economy", "domain", "prosperity", "market", "tax", "taxes", "event", "events", "route", "routes", "trade"].includes(sub)) return false;

  if (sub === "route" || sub === "routes" || sub === "trade") {
    const action = cleanId(args[1] || "list");
    try {
      if (action === "list") {
        const routes = await tradeRoutes.listRoutes(event.threadID, event.senderID);
        if (!routes.length) { await reply(api, event.threadID, "🛤️ TRADE ROUTES\n\nNo trade routes established yet.\nUse !rpg route establish <origin> <destination>"); return true; }
        await reply(api, event.threadID, ["🛤️ TRADE ROUTES", "", ...routes.map(route => `• ${route.origin_location_id} → ${route.destination_location_id} · ${route.successful_runs} successful · ${route.disrupted_runs} disrupted`), "", "Use !rpg route dispatch <origin> <destination>"].join("\n"));
        return true;
      }
      if (action === "establish" || action === "create") {
        if (!args[2] || !args[3]) throw new Error("Usage: !rpg route establish <origin> <destination>");
        const result = await tradeRoutes.establishRoute(event.threadID, event.senderID, args[2], args[3]);
        if (result.alreadyExists) await reply(api, event.threadID, `🛤️ That route already exists: ${result.origin.name} → ${result.destination.name}.`);
        else await reply(api, event.threadID, [`🛤️ TRADE ROUTE ESTABLISHED`, "", `${result.origin.name} → ${result.destination.name}`, `Distance: ${result.distance}`, `Kingdom relation: ${result.relation}`, `Establishment cost: ${result.cost.toLocaleString()} coins`].join("\n"));
        return true;
      }
      if (action === "dispatch" || action === "run") {
        if (!args[2] || !args[3]) throw new Error("Usage: !rpg route dispatch <origin> <destination>");
        const result = await tradeRoutes.dispatchRoute(event.threadID, event.senderID, args[2], args[3]);
        if (!result.dispatched) await reply(api, event.threadID, `⏳ That caravan is not ready. Next dispatch in about ${Math.ceil(result.remainingMs / 60000)} minute(s).`);
        else if (result.success) await reply(api, event.threadID, [`🚚 CARAVAN ARRIVED`, "", `${result.info.origin.name} → ${result.info.destination.name}`, `💰 Revenue: ${result.revenue.toLocaleString()} coins`, `🛡️ Route safety: ${Math.round(result.safety * 100)}%`, `🤝 Relation: ${result.info.relation}`].join("\n"));
        else await reply(api, event.threadID, [`🛑 CARAVAN DISRUPTED`, "", `${result.info.origin.name} → ${result.info.destination.name}`, `🛡️ Route safety: ${Math.round(result.safety * 100)}%`, `🤝 Relation: ${result.info.relation}`, "No revenue was recovered from this run."].join("\n"));
        return true;
      }
      throw new Error("Route commands: list, establish <origin> <destination>, dispatch <origin> <destination>");
    } catch (error) { await reply(api, event.threadID, `❌ ${error.message}`); }
    return true;
  }

  if (sub === "event" || sub === "events") {
    const action = cleanId(args[1] || "roll");
    if (action === "list") { await reply(api, event.threadID, ["🌍 DOMAIN EVENTS", "", ...domainEvents.EVENTS.map(item => `${item.title} — ${item.description}`), "", "Events are influenced by domain prosperity.", "Use !rpg event roll to resolve one when available."].join("\n")); return true; }
    try {
      const result = await domainEvents.rollDomainEvent(event.threadID, event.senderID, { force: action === "force" });
      if (!result.triggered) await reply(api, event.threadID, `⏳ No domain event yet. Another event can occur in about ${Math.ceil(result.remainingMs / 60000)} minute(s).`);
      else await reply(api, event.threadID, [`🌍 ${result.event.title}`, "", result.event.description, "", "Effects:", ...Object.entries(result.event.effects || {}).map(([key, value]) => `${value >= 0 ? "✦" : "✧"} ${key}: ${value >= 0 ? "+" : ""}${value}`)].join("\n"));
    } catch (error) { await reply(api, event.threadID, `❌ ${error.message}`); }
    return true;
  }

  if (sub === "market") {
    const action = cleanId(args[1]);
    if (action === "buy" || action === "sell") {
      try {
        const result = await economy.marketTrade(event.threadID, event.senderID, action, args[2], args[3]);
        await reply(api, event.threadID, `${action === "buy" ? "🏪 PURCHASE" : "💰 MARKET SALE"}\n\n${economy.RESOURCES[result.resource].emoji} ${economy.RESOURCES[result.resource].name} × ${result.quantity.toLocaleString()}\nRate: ${result.price.toLocaleString()} coins each\nTotal: ${result.total.toLocaleString()} coins`);
      } catch (error) { await reply(api, event.threadID, `❌ ${error.message}`); }
      return true;
    }
  }

  if (sub === "tax" || sub === "taxes") {
    const action = cleanId(args[1]);
    if (action === "set") {
      try { const rate = await economy.setTaxRate(event.threadID, event.senderID, args[2]); await reply(api, event.threadID, `🏛️ Domain tax rate set to ${rate}%. Taxes can be collected once every 24 hours.`); } catch (error) { await reply(api, event.threadID, `❌ ${error.message}`); }
      return true;
    }
    if (action === "collect" || action === "claim") {
      try {
        const result = await economy.collectTaxes(event.threadID, event.senderID);
        if (!result.claimed) await reply(api, event.threadID, `⏳ Taxes are not ready yet. Next collection in about ${Math.ceil(result.remainingMs / 60000)} minute(s).`);
        else await reply(api, event.threadID, `🏛️ TAXES COLLECTED\n\n💰 Revenue: ${result.amount.toLocaleString()} coins\n📊 Prosperity: ${result.prosperity}/100 · ${result.prosperityName}\n📜 Tax rate: ${result.taxRate}%`);
      } catch (error) { await reply(api, event.threadID, `❌ ${error.message}`); }
      return true;
    }
  }

  try {
    const state = await economy.getEconomy(event.threadID, event.senderID);
    await reply(api, event.threadID, ["🏰 DOMAIN ECONOMY", "", `🌟 Prosperity: ${state.prosperity}/100 · ${state.prosperityName}`, `👥 Population: ${state.population.population.toLocaleString()} / ${state.population.capacity.toLocaleString()}`, `⚔️ Army: ${state.armyUnits.toLocaleString()} soldiers`, `🏪 Market: Level ${state.marketLevel}`, `📜 Tax rate: ${state.tax_rate}%`, "", `🌾 Food: ${Number(state.stock.food).toLocaleString()}`, `🪵 Wood: ${Number(state.stock.wood).toLocaleString()}`, `🪨 Stone: ${Number(state.stock.stone).toLocaleString()}`, `⛓️ Iron: ${Number(state.stock.iron).toLocaleString()}`, `📦 Storage: ${state.stock.capacity.toLocaleString()}`, "", "Commands:", "!rpg market buy <resource> <amount>", "!rpg market sell <resource> <amount>", "!rpg tax set <0-25>", "!rpg tax collect", "!rpg event roll", "!rpg event list", "!rpg route list", "!rpg route establish <origin> <destination>", "!rpg route dispatch <origin> <destination>"].join("\n"));
  } catch (error) { await reply(api, event.threadID, `❌ ${error.message}`); }
  return true;
}

async function handleRpgCommand(api, event, text, originalText) {
  const args = tokens(text);
  if (["companion", "companions", "pet", "pets"].includes(args[0]) && ["evolve", "evolution", "stages", "stage"].includes(cleanId(args[1]))) {
    if (await handleCompanionCompatibility(api, event, args.slice(1))) return true;
  }
  if (await handleEconomyCompatibility(api, event, args)) return true;

  const isHuntCommand = args[0] === "hunt";
  let beforeHunts = null;
  if (isHuntCommand) {
    try { beforeHunts = await getTotalHunts(event.threadID, event.senderID); } catch (_) {}
  }

  const result = await original.handleRpgCommand(api, event, text, originalText);

  // The canonical combat/adventure systems grant the reward. This wrapper
  // only reports the newly crossed milestone; it never grants it twice.
  if (isHuntCommand && beforeHunts !== null) {
    try {
      const afterHunts = await getTotalHunts(event.threadID, event.senderID);
      if (afterHunts > beforeHunts) {
        const milestone = HUNT_MILESTONES.find(item => item.hunts === afterHunts);
        if (milestone) {
          const lines = [`🎁 HUNT MILESTONE — ${afterHunts} HUNTS`, ""];
          if (milestone.special) lines.push(`🌟 Special Move: ${milestone.special.replace(/_/g, " ")}`);
          if (milestone.specialPoints) lines.push(`✨ Special Points: +${milestone.specialPoints}`);
          lines.push("", "The reward has been permanently added to your RPG profile.");
          await reply(api, event.threadID, lines.join("\n"));
        }
      }
    } catch (error) { console.error("[RPG] Hunt milestone display failed:", error); }
  }

  return result;
}

module.exports = { handleRpgCommand };
