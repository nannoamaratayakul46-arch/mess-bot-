"use strict";

const db = require("../db");
const { ITEMS, getItem } = require("./items");

/*
 * Shared RPG loot layer.
 *
 * Inspired by the useful parts of the reviewed RPG projects:
 * - weighted rarity tables
 * - hidden per-item loot weights
 * - contextual loot pools
 *
 * This deliberately does NOT create a second inventory, equipment,
 * raid, quest, or market system. rpg/items.js + player.js remain
 * the source of truth for item ownership.
 */

const RARITIES = {
  Common: { weight: 598, emoji: "⚪" },
  Uncommon: { weight: 250, emoji: "🟢" },
  Rare: { weight: 100, emoji: "🔵" },
  Epic: { weight: 35, emoji: "🟣" },
  Legendary: { weight: 14, emoji: "🟠" },
  Mythic: { weight: 2, emoji: "🔴" },
  Celestial: { weight: 1, emoji: "✨" },
};

/*
 * The original Raiders Market implementation used rarity first and
 * then a hidden loot value to weight items within that rarity.
 *
 * ECLIPSE keeps that concept, but uses the rarities already present
 * in rpg/items.js instead of introducing a competing rarity model.
 */
const DEFAULT_ITEM_WEIGHT = 5;

const CONTEXT_POOLS = {
  dungeon: {
    allow: ["weapon", "armor", "material", "consumable"],
    exclude: ["companion"],
  },

  world_boss: {
    allow: ["weapon", "armor", "material"],
    exclude: ["consumable", "companion"],
  },

  guild_raid: {
    allow: ["weapon", "armor", "material"],
    exclude: ["consumable", "companion"],
  },

  exploration: {
    allow: ["material", "consumable", "weapon", "armor"],
    exclude: ["companion"],
  },
};

function rarityWeight(rarity) {
  return Number(RARITIES[String(rarity)]?.weight || 0);
}

function weightedPick(entries) {
  const total = entries.reduce(
    (sum, entry) => sum + Math.max(0, Number(entry.weight) || 0),
    0
  );

  if (total <= 0) return null;

  let roll = Math.random() * total;

  for (const entry of entries) {
    roll -= Math.max(0, Number(entry.weight) || 0);
    if (roll <= 0) return entry.value;
  }

  return entries[entries.length - 1]?.value || null;
}

function pickRarity(minRarity = null) {
  const names = Object.keys(RARITIES);

  const minimumIndex =
    minRarity && names.includes(minRarity)
      ? names.indexOf(minRarity)
      : 0;

  const eligible = names.slice(minimumIndex);

  return weightedPick(
    eligible.map((name) => ({
      value: name,
      weight: rarityWeight(name),
    }))
  );
}

function getPool(context = "exploration") {
  const config =
    CONTEXT_POOLS[context] ||
    CONTEXT_POOLS.exploration;

  return Object.values(ITEMS).filter((item) => {
    const type = String(item.type || "").toLowerCase();

    if (
      Array.isArray(config.allow) &&
      !config.allow.includes(type)
    ) {
      return false;
    }

    if (
      Array.isArray(config.exclude) &&
      config.exclude.includes(type)
    ) {
      return false;
    }

    return Boolean(
      item.rarity &&
      rarityWeight(item.rarity) > 0
    );
  });
}

function pickLootItem(context = "exploration", minRarity = null) {
  const rarity = pickRarity(minRarity);

  if (!rarity) return null;

  const pool = getPool(context).filter(
    (item) => item.rarity === rarity
  );

  if (!pool.length) {
    /*
     * Some high-end rarities may not have an item for every context.
     * Fall back to the nearest available rarity rather than inventing
     * an item or returning a broken reward.
     */
    const fallback = getPool(context).filter(
      (item) => rarityWeight(item.rarity) > 0
    );

    if (!fallback.length) return null;

    return weightedPick(
      fallback.map((item) => ({
        value: item,
        weight: Number(item.lootWeight || item.loot || DEFAULT_ITEM_WEIGHT),
      }))
    );
  }

  return weightedPick(
    pool.map((item) => ({
      value: item,
      /*
       * rpg/items.js currently has no loot field. Until one is added,
       * value is used only as a deterministic secondary weight.
       * Lower-value items remain slightly more common.
       */
      weight: Number(
        item.lootWeight ||
        Math.max(
          1,
          Math.round(1000 / Math.max(1, Number(item.value) || 1))
        )
      ),
    }))
  );
}

async function grantLoot(
  threadID,
  userID,
  {
    context = "exploration",
    rolls = 1,
    minRarity = null,
    guaranteedItem = null,
  } = {}
) {
  const rewards = [];

  if (guaranteedItem) {
    const item = getItem(guaranteedItem);

    if (item) {
      await db.addRpgItem(
        threadID,
        userID,
        item.id,
        1
      );

      rewards.push({
        item,
        rarity: item.rarity,
        guaranteed: true,
      });
    }
  }

  const count = Math.max(
    0,
    Math.min(5, Math.floor(Number(rolls) || 0))
  );

  for (let i = 0; i < count; i += 1) {
    const item = pickLootItem(
      context,
      minRarity
    );

    if (!item) continue;

    await db.addRpgItem(
      threadID,
      userID,
      item.id,
      1
    );

    rewards.push({
      item,
      rarity: item.rarity,
      guaranteed: false,
    });
  }

  return rewards;
}

function formatLoot(rewards) {
  if (!rewards?.length) {
    return ["No additional loot was found."];
  }

  return rewards.map((reward) => {
    const item = reward.item;
    const rarity = RARITIES[item.rarity] || {};

    return (
      (rarity.emoji || "✦") +
      " " +
      item.name +
      " · " +
      item.rarity +
      (reward.guaranteed ? " · guaranteed" : "")
    );
  });
}

function formatLootTable() {
  return Object.entries(RARITIES).map(
    ([name, definition]) =>
      definition.emoji +
      " " +
      name +
      " — " +
      definition.weight +
      " weight"
  );
}

module.exports = {
  RARITIES,
  CONTEXT_POOLS,
  formatLoot,
  formatLootTable,
  getPool,
  grantLoot,
  pickLootItem,
  pickRarity,
};
