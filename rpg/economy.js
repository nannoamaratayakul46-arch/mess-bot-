"use strict";

const db = require("../db");
const { applyResourceProduction, getProperty } = require("./properties");
const { getPopulation } = require("./population");
const { getArmy, totalUnits } = require("./army");

const RESOURCES = {
  food: { name: "Food", emoji: "🌾", buy: 8, sell: 5 },
  wood: { name: "Wood", emoji: "🪵", buy: 12, sell: 8 },
  stone: { name: "Stone", emoji: "🪨", buy: 15, sell: 10 },
  iron: { name: "Iron", emoji: "⛓️", buy: 24, sell: 16 },
};

const TAX_MIN = 0;
const TAX_MAX = 25;
const DEFAULT_TAX = 10;
const TAX_COOLDOWN_MS = 24 * 60 * 60 * 1000;

let schemaReady;

async function ensureEconomySchema() {
  if (!schemaReady) {
    schemaReady = db.query(`
      CREATE TABLE IF NOT EXISTS rpg_domain_economy (
        thread_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        tax_rate INTEGER NOT NULL DEFAULT ${DEFAULT_TAX},
        last_tax_at BIGINT NOT NULL DEFAULT 0,
        prosperity INTEGER NOT NULL DEFAULT 50,
        PRIMARY KEY(thread_id, user_id)
      );
    `);
  }
  await schemaReady;
}

async function ensureEconomy(threadID, userID) {
  await ensureEconomySchema();
  await db.query(
    `INSERT INTO rpg_domain_economy (thread_id, user_id, tax_rate, last_tax_at, prosperity)
     VALUES ($1, $2, $3, 0, 50)
     ON CONFLICT (thread_id, user_id) DO NOTHING`,
    [String(threadID), String(userID), DEFAULT_TAX]
  );
}

function resourceKey(value) {
  const key = String(value || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(RESOURCES, key) ? key : null;
}

async function resourceState(threadID, userID) {
  await applyResourceProduction(threadID, userID);
  const result = await db.query(
    `SELECT food, wood, stone, iron FROM rpg_domain_resources WHERE thread_id = $1 AND user_id = $2 LIMIT 1`,
    [String(threadID), String(userID)]
  );
  return result.rows[0] || { food: 0, wood: 0, stone: 0, iron: 0 };
}

async function marketTrade(threadID, userID, side, resource, amount) {
  const key = resourceKey(resource);
  const quantity = Math.floor(Number(amount));
  if (!key || !Number.isInteger(quantity) || quantity <= 0 || quantity > 100_000) {
    throw new Error("Usage: !rpg market <buy|sell> <food|wood|stone|iron> <amount>");
  }

  await ensureEconomy(threadID, userID);
  const property = await getProperty(threadID, userID);
  const marketResult = await db.query(
    `SELECT level FROM rpg_buildings WHERE thread_id = $1 AND user_id = $2 AND building_key = 'market' LIMIT 1`,
    [String(threadID), String(userID)]
  );
  const marketLevel = Number(marketResult.rows[0]?.level || 0);
  if (marketLevel <= 0) {
    throw new Error("🏪 Build a Market first: !rpg build market");
  }

  const stock = await resourceState(threadID, userID);
  const definition = RESOURCES[key];
  const price = side === "buy" ? definition.buy : definition.sell;
  const total = price * quantity;
  const capacity = 500 + Number(property.tier || 0) * 250 + marketLevel * 100;

  if (side === "buy") {
    const available = Math.max(0, capacity - Number(stock[key] || 0));
    if (quantity > available) {
      throw new Error(`📦 Storage only has room for ${available.toLocaleString()} ${definition.name}.`);
    }
    await db.spendBalance(threadID, userID, total, `RPG market: buy ${key} x${quantity}`);
    await db.query(
      `UPDATE rpg_domain_resources SET ${key} = ${key} + $3, updated_at = $4 WHERE thread_id = $1 AND user_id = $2`,
      [String(threadID), String(userID), quantity, Date.now()]
    );
  } else {
    if (Number(stock[key] || 0) < quantity) {
      throw new Error(`You only have ${Number(stock[key] || 0).toLocaleString()} ${definition.name}.`);
    }
    await db.query(
      `UPDATE rpg_domain_resources SET ${key} = ${key} - $3, updated_at = $4 WHERE thread_id = $1 AND user_id = $2 AND ${key} >= $3`,
      [String(threadID), String(userID), quantity, Date.now()]
    );
    await db.addBalance(threadID, userID, total, `RPG market: sell ${key} x${quantity}`);
  }

  return { side, resource: key, quantity, total, price, marketLevel };
}

async function setTaxRate(threadID, userID, requestedRate) {
  await ensureEconomy(threadID, userID);
  const rate = Math.floor(Number(requestedRate));
  if (!Number.isInteger(rate) || rate < TAX_MIN || rate > TAX_MAX) {
    throw new Error(`Tax rate must be between ${TAX_MIN}% and ${TAX_MAX}%.`);
  }
  await db.query(
    `UPDATE rpg_domain_economy SET tax_rate = $3 WHERE thread_id = $1 AND user_id = $2`,
    [String(threadID), String(userID), rate]
  );
  return rate;
}

function calculateProsperity({ population, capacity, food, armyUnits, taxRate, marketLevel, propertyTier }) {
  let score = 50;
  const foodNeed = Math.max(1, Math.ceil(Number(population || 0) / 5));
  const foodDays = Number(food || 0) / foodNeed;
  score += Math.min(20, foodDays * 2);
  score += Math.min(10, Number(marketLevel || 0) * 2);
  score += Math.min(10, Number(propertyTier || 0));
  if (capacity > 0 && population >= capacity) score -= 3;
  score -= Math.min(20, Math.max(0, Number(taxRate || 0) - 10) * 1.5);
  score -= Math.min(15, Number(armyUnits || 0) / 100);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function prosperityName(score) {
  if (score >= 85) return "Flourishing";
  if (score >= 70) return "Prosperous";
  if (score >= 50) return "Stable";
  if (score >= 30) return "Struggling";
  return "Distressed";
}

async function collectTaxes(threadID, userID) {
  await ensureEconomy(threadID, userID);
  await applyResourceProduction(threadID, userID);
  const economy = await getEconomy(threadID, userID);
  const population = await getPopulation(threadID, userID);
  const army = await getArmy(threadID, userID);
  const property = await getProperty(threadID, userID);
  const marketResult = await db.query(
    `SELECT level FROM rpg_buildings WHERE thread_id = $1 AND user_id = $2 AND building_key = 'market' LIMIT 1`,
    [String(threadID), String(userID)]
  );
  const marketLevel = Number(marketResult.rows[0]?.level || 0);
  const now = Date.now();
  if (now - Number(economy.last_tax_at || 0) < TAX_COOLDOWN_MS) {
    return { claimed: false, amount: 0, remainingMs: TAX_COOLDOWN_MS - (now - Number(economy.last_tax_at || 0)), taxRate: economy.tax_rate };
  }

  const basePerCitizen = 2;
  const gross = Math.floor(Number(population.population || 0) * basePerCitizen * (Number(economy.tax_rate || DEFAULT_TAX) / 10));
  const prosperity = calculateProsperity({
    population: population.population,
    capacity: population.capacity,
    food: population.food,
    armyUnits: totalUnits(army),
    taxRate: economy.tax_rate,
    marketLevel,
    propertyTier: property.tier,
  });
  const modifier = 0.75 + prosperity / 200;
  const amount = Math.max(0, Math.floor(gross * modifier));

  if (amount > 0) await db.addBalance(threadID, userID, amount, "RPG domain taxes");
  await db.query(
    `UPDATE rpg_domain_economy SET last_tax_at = $3, prosperity = $4 WHERE thread_id = $1 AND user_id = $2`,
    [String(threadID), String(userID), now, prosperity]
  );
  return { claimed: true, amount, taxRate: economy.tax_rate, prosperity, prosperityName: prosperityName(prosperity) };
}

async function getEconomy(threadID, userID) {
  await ensureEconomy(threadID, userID);
  const population = await getPopulation(threadID, userID);
  const army = await getArmy(threadID, userID);
  const property = await getProperty(threadID, userID);
  const stock = await resourceState(threadID, userID);
  const marketResult = await db.query(
    `SELECT level FROM rpg_buildings WHERE thread_id = $1 AND user_id = $2 AND building_key = 'market' LIMIT 1`,
    [String(threadID), String(userID)]
  );
  const marketLevel = Number(marketResult.rows[0]?.level || 0);
  const economyResult = await db.query(
    `SELECT tax_rate, last_tax_at, prosperity FROM rpg_domain_economy WHERE thread_id = $1 AND user_id = $2 LIMIT 1`,
    [String(threadID), String(userID)]
  );
  const economy = economyResult.rows[0] || { tax_rate: DEFAULT_TAX, last_tax_at: 0, prosperity: 50 };
  const prosperity = calculateProsperity({
    population: population.population,
    capacity: population.capacity,
    food: stock.food,
    armyUnits: totalUnits(army),
    taxRate: economy.tax_rate,
    marketLevel,
    propertyTier: property.tier,
  });
  return { ...economy, prosperity, prosperityName: prosperityName(prosperity), population, armyUnits: totalUnits(army), propertyTier: Number(property.tier || 0), marketLevel, stock };
}

module.exports = {
  RESOURCES,
  getEconomy,
  marketTrade,
  setTaxRate,
  collectTaxes,
  calculateProsperity,
  prosperityName,
};
