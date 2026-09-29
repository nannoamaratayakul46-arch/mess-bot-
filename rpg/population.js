"use strict";

const db = require("../db");
const { applyResourceProduction } = require("./properties");

/*
 * Domain population simulation.
 * 5 real seconds = 20 in-game minutes.
 * 15 real seconds = 1 in-game hour.
 * 6 real minutes = 1 in-game day.
 */
const REAL_MS_PER_GAME_HOUR = 15_000;
const BASE_POPULATION = 25;
const BASE_CAPACITY = 40;
const FARM_CAPACITY = 20;
const PROPERTY_CAPACITY = [0, 40, 100, 220, 500, 1_000, 2_500, 6_000, 15_000];
const FOOD_PER_5_POP_PER_HOUR = 1;
const GROWTH_INTERVAL_HOURS = 24;
const MAX_PROCESSED_HOURS = 24 * 30;

let schemaReady;

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = db.query(`
      CREATE TABLE IF NOT EXISTS rpg_population (
        thread_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        population INTEGER NOT NULL DEFAULT ${BASE_POPULATION},
        last_tick_at BIGINT NOT NULL,
        PRIMARY KEY(thread_id, user_id)
      );
    `);
  }
  await schemaReady;
}

async function ensurePopulation(threadID, userID) {
  await ensureSchema();
  const now = Date.now();
  await db.query(
    `
    INSERT INTO rpg_population (thread_id, user_id, population, last_tick_at)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (thread_id, user_id) DO NOTHING
    `,
    [String(threadID), String(userID), BASE_POPULATION, now]
  );
}

async function getBuildings(threadID, userID) {
  const result = await db.query(
    `SELECT building_key, level FROM rpg_buildings WHERE thread_id = $1 AND user_id = $2`,
    [String(threadID), String(userID)]
  );
  return result.rows;
}

function capacityFor(propertyTier, buildings) {
  const tier = Math.max(
    0,
    Math.min(PROPERTY_CAPACITY.length - 1, Number(propertyTier || 0))
  );

  const farmLevels = buildings
    .filter((row) => row.building_key === "farm")
    .reduce((sum, row) => sum + Math.max(0, Number(row.level || 0)), 0);

  return Math.max(
    BASE_CAPACITY,
    (PROPERTY_CAPACITY[tier] || BASE_CAPACITY) + farmLevels * FARM_CAPACITY
  );
}

function hourlyFoodNeed(population) {
  return Math.max(
    1,
    Math.ceil(Math.max(1, Number(population || 0)) / 5) * FOOD_PER_5_POP_PER_HOUR
  );
}

async function tickPopulation(threadID, userID) {
  await ensurePopulation(threadID, userID);

  // Materialize passive production before consumption so farms can feed the domain.
  const produced = await applyResourceProduction(threadID, userID);

  const [popResult, propertyResult, resourceResult, buildings] = await Promise.all([
    db.query(
      `SELECT population, last_tick_at FROM rpg_population WHERE thread_id = $1 AND user_id = $2`,
      [String(threadID), String(userID)]
    ),
    db.query(
      `SELECT tier FROM rpg_properties WHERE thread_id = $1 AND user_id = $2`,
      [String(threadID), String(userID)]
    ),
    db.query(
      `SELECT food, wood, stone, iron FROM rpg_domain_resources WHERE thread_id = $1 AND user_id = $2`,
      [String(threadID), String(userID)]
    ),
    getBuildings(threadID, userID),
  ]);

  let population = Math.max(1, Number(popResult.rows[0]?.population || BASE_POPULATION));
  let lastTick = Number(popResult.rows[0]?.last_tick_at || Date.now());
  const tier = Number(propertyResult.rows[0]?.tier || 0);
  const resources = resourceResult.rows[0] || {
    food: produced?.food || 0,
    wood: 0,
    stone: 0,
    iron: 0,
  };
  const capacity = capacityFor(tier, buildings);

  const elapsed = Math.max(0, Date.now() - lastTick);
  const rawHours = Math.floor(elapsed / REAL_MS_PER_GAME_HOUR);
  const hours = Math.min(MAX_PROCESSED_HOURS, rawHours);

  if (hours <= 0) {
    return {
      population,
      capacity,
      food: Number(resources.food || 0),
      foodNeedPerHour: hourlyFoodNeed(population),
      hoursProcessed: 0,
      growth: 0,
      shortage: false,
      production: produced,
    };
  }

  let food = Math.max(0, Number(resources.food || 0));
  let consumed = 0;
  let growth = 0;
  let shortage = false;

  for (let hour = 0; hour < hours; hour += 1) {
    const need = hourlyFoodNeed(population);

    if (food >= need) {
      food -= need;
      consumed += need;
      continue;
    }

    shortage = true;
    food = 0;

    // Starvation is gradual rather than an instant wipe.
    const loss = Math.max(1, Math.floor(population * 0.01));
    population = Math.max(1, population - loss);
  }

  const days = Math.floor(hours / GROWTH_INTERVAL_HOURS);
  if (!shortage && days > 0 && population < capacity) {
    const dailyGrowth = Math.max(1, Math.floor(population * 0.02));
    growth = Math.min(capacity - population, dailyGrowth * days);
    population += growth;
  }

  // Keep any unprocessed time for the next visit when the 30-day safety cap applies.
  lastTick += hours * REAL_MS_PER_GAME_HOUR;

  await db.query(
    `
    UPDATE rpg_domain_resources
    SET food = $3, updated_at = $4
    WHERE thread_id = $1 AND user_id = $2
    `,
    [String(threadID), String(userID), Math.max(0, Math.floor(food)), Date.now()]
  );

  await db.query(
    `
    UPDATE rpg_population
    SET population = $3, last_tick_at = $4
    WHERE thread_id = $1 AND user_id = $2
    `,
    [String(threadID), String(userID), population, lastTick]
  );

  return {
    population,
    capacity,
    food: Math.max(0, Math.floor(food)),
    foodNeedPerHour: hourlyFoodNeed(population),
    consumed,
    hoursProcessed: hours,
    growth,
    shortage,
    production: produced,
  };
}

async function getPopulation(threadID, userID) {
  return tickPopulation(threadID, userID);
}

module.exports = {
  ensurePopulation,
  getPopulation,
  tickPopulation,
};
