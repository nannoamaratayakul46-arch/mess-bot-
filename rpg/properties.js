const db = require("../db");
const { formatNumber } = require("./utils");

const PROPERTY_TIERS = [
  { key: "settlement", name: "Settlement", cost: 0, upkeep: 0 },
  { key: "cottage", name: "Cottage", cost: 500, upkeep: 2 },
  { key: "estate", name: "Estate", cost: 2_500, upkeep: 8 },
  { key: "manor", name: "Manor", cost: 7_500, upkeep: 20 },
  { key: "castle", name: "Castle", cost: 20_000, upkeep: 50 },
  { key: "fortress", name: "Fortress", cost: 50_000, upkeep: 120 },
  { key: "city", name: "City", cost: 150_000, upkeep: 300 },
  { key: "kingdom", name: "Kingdom", cost: 500_000, upkeep: 800 },
  { key: "empire", name: "Empire", cost: 1_500_000, upkeep: 2_000 },
];

/* 5 real seconds = 20 in-game minutes. No building exceeds 10 real minutes. */
const MAX_BUILD_TIME_MS = 10 * 60 * 1000;
const GAME_MINUTES_PER_REAL_SECOND = 4;

const BUILDINGS = {
  farm: {
    name: "Farm", emoji: "🌾", baseCost: 300, buildTime: 30_000,
    resources: { wood: 40, stone: 15, iron: 0, food: 20 },
    description: "Produces food and supports population.",
  },
  mine: {
    name: "Mine", emoji: "⛏️", baseCost: 500, buildTime: 60_000,
    resources: { wood: 50, stone: 60, iron: 10, food: 15 },
    description: "Produces ore and building materials.",
  },
  lumber: {
    name: "Lumber Camp", emoji: "🪵", baseCost: 400, buildTime: 45_000,
    resources: { wood: 45, stone: 20, iron: 5, food: 10 },
    description: "Produces timber for construction.",
  },
  market: {
    name: "Market", emoji: "🏪", baseCost: 750, buildTime: 90_000,
    resources: { wood: 70, stone: 50, iron: 10, food: 20 },
    description: "Improves trade and tax income.",
  },
  watchtower: {
    name: "Watchtower", emoji: "🗼", baseCost: 850, buildTime: 75_000,
    resources: { wood: 50, stone: 80, iron: 20, food: 15 },
    description: "Improves scouting and early warnings.",
  },
  guardpost: {
    name: "Guard Post", emoji: "🛡️", baseCost: 600, buildTime: 90_000,
    resources: { wood: 60, stone: 70, iron: 25, food: 20 },
    description: "Improves local defense and militia.",
  },
};

const RESOURCE_PRODUCTION = {
  // Production is measured per in-game hour. 5 real seconds = 20 in-game minutes.
  farm:   { food: 12 },
  lumber: { wood: 8 },
  mine:   { stone: 6, iron: 2 },
};

const PRODUCTION_GAME_MINUTES_PER_TICK = 60;
const REAL_MS_PER_GAME_MINUTE = 5000 / 20;

const DEFENSE_PARTS = {
  walls: { emoji: "🧱", name: "Walls", max: 100 },
  towers: { emoji: "🗼", name: "Towers", max: 100 },
  gates: { emoji: "🚪", name: "Gates", max: 100 },
  moats: { emoji: "🕳️", name: "Moats", max: 100 },
  guards: { emoji: "🛡️", name: "Guards", max: 100 },
  traps: { emoji: "🪤", name: "Traps", max: 100 },
  barrier: { emoji: "🔮", name: "Barrier", max: 100 },
};

let schemaReady;

async function ensureConstructionSchema() {
  if (!schemaReady) {
    schemaReady = db.query(`
      CREATE TABLE IF NOT EXISTS rpg_domain_resources (
        thread_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        food INTEGER NOT NULL DEFAULT 250,
        wood INTEGER NOT NULL DEFAULT 150,
        stone INTEGER NOT NULL DEFAULT 100,
        iron INTEGER NOT NULL DEFAULT 50,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY(thread_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS rpg_resource_production (
        thread_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        last_collected_at BIGINT NOT NULL,
        PRIMARY KEY(thread_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS rpg_build_construction (
        thread_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        building_key TEXT NOT NULL,
        target_level INTEGER NOT NULL,
        gold_cost INTEGER NOT NULL,
        food_cost INTEGER NOT NULL DEFAULT 0,
        wood_cost INTEGER NOT NULL DEFAULT 0,
        stone_cost INTEGER NOT NULL DEFAULT 0,
        iron_cost INTEGER NOT NULL DEFAULT 0,
        started_at BIGINT NOT NULL,
        completes_at BIGINT NOT NULL,
        PRIMARY KEY(thread_id, user_id)
      );
    `);
  }
  await schemaReady;
}

async function ensureProperty(threadID, userID) {
  await db.query(
    `
    INSERT INTO rpg_properties (
      thread_id, user_id, tier, name, maintenance,
      walls, towers, gates, moats, guards, traps, barrier, updated_at
    )
    VALUES ($1, $2, 0, NULL, 0, 0, 0, 0, 0, 0, 0, 0, $3)
    ON CONFLICT (thread_id, user_id) DO NOTHING
    `,
    [String(threadID), String(userID), Date.now()]
  );
  await ensureConstructionSchema();
  await db.query(
    `
    INSERT INTO rpg_domain_resources (
      thread_id, user_id, food, wood, stone, iron, updated_at
    )
    VALUES ($1, $2, 250, 150, 100, 50, $3)
    ON CONFLICT (thread_id, user_id) DO NOTHING
    `,
    [String(threadID), String(userID), Date.now()]
  );
}

function formatBuildTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function gameMinutes(ms) {
  return Math.round((Number(ms || 0) / 1000) * GAME_MINUTES_PER_REAL_SECOND);
}

async function completeConstruction(threadID, userID) {
  await ensureConstructionSchema();
  const pending = await db.query(
    `SELECT * FROM rpg_build_construction WHERE thread_id = $1 AND user_id = $2 LIMIT 1`,
    [String(threadID), String(userID)]
  );
  const row = pending.rows[0];
  if (!row) return null;
  if (Number(row.completes_at) > Date.now()) return row;

  await db.query(
    `
    INSERT INTO rpg_buildings (
      thread_id, user_id, building_key, level, updated_at
    )
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (thread_id, user_id, building_key)
    DO UPDATE SET level = GREATEST(rpg_buildings.level, EXCLUDED.level),
                  updated_at = EXCLUDED.updated_at
    `,
    [String(threadID), String(userID), row.building_key, Number(row.target_level), Date.now()]
  );

  await db.query(
    `DELETE FROM rpg_build_construction WHERE thread_id = $1 AND user_id = $2`,
    [String(threadID), String(userID)]
  );

  return { ...row, completed: true };
}

async function getProperty(threadID, userID) {
  await ensureProperty(threadID, userID);
  const result = await db.query(
    `SELECT * FROM rpg_properties WHERE thread_id = $1 AND user_id = $2`,
    [String(threadID), String(userID)]
  );
  return result.rows[0];
}

async function applyResourceProduction(threadID, userID) {
  await ensureProperty(threadID, userID);

  const now = Date.now();
  const state = await db.query(
    `SELECT last_collected_at FROM rpg_resource_production WHERE thread_id = $1 AND user_id = $2 LIMIT 1`,
    [String(threadID), String(userID)]
  );

  let last = Number(state.rows[0]?.last_collected_at || now);
  if (!state.rows[0]) {
    await db.query(
      `INSERT INTO rpg_resource_production (thread_id, user_id, last_collected_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [String(threadID), String(userID), now]
    );
    last = now;
  }

  const elapsed = Math.max(0, now - last);
  const gameMinutes = elapsed / REAL_MS_PER_GAME_MINUTE;
  const ticks = Math.floor(gameMinutes / PRODUCTION_GAME_MINUTES_PER_TICK);
  if (ticks <= 0) return getResourceState(threadID, userID);

  const buildings = await db.query(
    `SELECT building_key, level FROM rpg_buildings WHERE thread_id = $1 AND user_id = $2`,
    [String(threadID), String(userID)]
  );

  const gained = { food: 0, wood: 0, stone: 0, iron: 0 };
  for (const row of buildings.rows) {
    const rates = RESOURCE_PRODUCTION[row.building_key];
    const level = Math.max(0, Number(row.level || 0));
    if (!rates || level <= 0) continue;
    for (const [resource, amount] of Object.entries(rates)) {
      gained[resource] += amount * level * ticks;
    }
  }

  // Storage grows with the domain and market infrastructure.
  const property = await db.query(
    `SELECT tier FROM rpg_properties WHERE thread_id = $1 AND user_id = $2 LIMIT 1`,
    [String(threadID), String(userID)]
  );
  const tier = Math.max(0, Number(property.rows[0]?.tier || 0));
  const market = buildings.rows.find((row) => row.building_key === 'market');
  const capacity = 500 + tier * 250 + Math.max(0, Number(market?.level || 0)) * 100;

  const current = await getResourceState(threadID, userID);
  const next = {};
  for (const resource of ['food', 'wood', 'stone', 'iron']) {
    next[resource] = Math.min(capacity, Number(current[resource] || 0) + gained[resource]);
  }

  const consumedMs = ticks * PRODUCTION_GAME_MINUTES_PER_TICK * REAL_MS_PER_GAME_MINUTE;
  const newLast = last + consumedMs;
  await db.query(
    `UPDATE rpg_domain_resources
     SET food = $3, wood = $4, stone = $5, iron = $6, updated_at = $7
     WHERE thread_id = $1 AND user_id = $2`,
    [String(threadID), String(userID), next.food, next.wood, next.stone, next.iron, now]
  );
  await db.query(
    `UPDATE rpg_resource_production SET last_collected_at = $3 WHERE thread_id = $1 AND user_id = $2`,
    [String(threadID), String(userID), newLast]
  );

  return { ...next, capacity, gained };
}

async function getResourceState(threadID, userID) {
  await ensureProperty(threadID, userID);
  const result = await db.query(
    `SELECT food, wood, stone, iron FROM rpg_domain_resources WHERE thread_id = $1 AND user_id = $2 LIMIT 1`,
    [String(threadID), String(userID)]
  );
  const property = await db.query(
    `SELECT tier FROM rpg_properties WHERE thread_id = $1 AND user_id = $2 LIMIT 1`,
    [String(threadID), String(userID)]
  );
  const buildings = await db.query(
    `SELECT building_key, level FROM rpg_buildings WHERE thread_id = $1 AND user_id = $2`,
    [String(threadID), String(userID)]
  );
  const market = buildings.rows.find((row) => row.building_key === 'market');
  const capacity = 500 + Math.max(0, Number(property.rows[0]?.tier || 0)) * 250 + Math.max(0, Number(market?.level || 0)) * 100;
  return { ...(result.rows[0] || { food: 0, wood: 0, stone: 0, iron: 0 }), capacity };
}

async function getBuildings(threadID, userID) {
  await ensureProperty(threadID, userID);
  const resourceState = await applyResourceProduction(threadID, userID);
  await completeConstruction(threadID, userID);

  const result = await db.query(
    `
    SELECT building_key, level
    FROM rpg_buildings
    WHERE thread_id = $1 AND user_id = $2
    ORDER BY building_key
    `,
    [String(threadID), String(userID)]
  );

  const pending = await db.query(
    `
    SELECT building_key, target_level, completes_at
    FROM rpg_build_construction
    WHERE thread_id = $1 AND user_id = $2
    LIMIT 1
    `,
    [String(threadID), String(userID)]
  );
  const row = pending.rows[0];
  const stockEntry = {
    building_key: '📦 Resources',
    level: `🍎 ${resourceState.food} · 🪵 ${resourceState.wood} · 🪨 ${resourceState.stone} · ⛓️ ${resourceState.iron} / ${resourceState.capacity}`,
  };

  if (!row) return result.rows.concat(stockEntry);

  return result.rows.concat(stockEntry, {
    building_key: `${row.building_key} ⏳`,
    level: `${row.target_level} · ${formatBuildTime(Number(row.completes_at) - Date.now())}`,
  });
}

async function getConstructionStatus(threadID, userID) {
  await ensureProperty(threadID, userID);
  const completed = await completeConstruction(threadID, userID);
  if (completed?.completed) {
    return { status: "completed", buildingKey: completed.building_key, level: Number(completed.target_level) };
  }

  const result = await db.query(
    `SELECT * FROM rpg_build_construction WHERE thread_id = $1 AND user_id = $2 LIMIT 1`,
    [String(threadID), String(userID)]
  );
  const row = result.rows[0];
  if (!row) return { status: "idle" };

  const remaining = Math.max(0, Number(row.completes_at) - Date.now());
  return {
    status: "building",
    buildingKey: row.building_key,
    targetLevel: Number(row.target_level),
    remainingMs: remaining,
    remainingText: formatBuildTime(remaining),
    completesAt: Number(row.completes_at),
  };
}

async function buyProperty(threadID, userID, requestedKey) {
  const property = await getProperty(threadID, userID);
  const currentTier = Number(property.tier);
  const targetIndex = PROPERTY_TIERS.findIndex(
    (tier) => tier.key === String(requestedKey || "").toLowerCase()
  );
  if (targetIndex <= 0 || targetIndex !== currentTier + 1) {
    const next = PROPERTY_TIERS[currentTier + 1];
    throw new Error(
      next
        ? `Your next property upgrade is ${next.name}.`
        : "Your domain has reached the current progression limit."
    );
  }
  const target = PROPERTY_TIERS[targetIndex];
  await db.spendBalance(threadID, userID, target.cost, `RPG property: ${target.name}`);
  await db.query(
    `
    UPDATE rpg_properties
    SET tier = $3, name = $4, maintenance = $5, updated_at = $6
    WHERE thread_id = $1 AND user_id = $2
    `,
    [String(threadID), String(userID), targetIndex, target.name, target.upkeep, Date.now()]
  );
  await db.query(
    `
    UPDATE rpg_players
    SET property_tier = $3, property_name = $4, updated_at = $5
    WHERE thread_id = $1 AND user_id = $2
    `,
    [String(threadID), String(userID), targetIndex, target.name, Date.now()]
  );
  return target;
}

async function build(threadID, userID, buildingKey) {
  await applyResourceProduction(threadID, userID);
  const property = await getProperty(threadID, userID);
  const key = String(buildingKey || "").toLowerCase();
  const definition = BUILDINGS[key];
  if (!definition) {
    throw new Error(`Choose a building: ${Object.keys(BUILDINGS).join(", ")}.`);
  }
  if (Number(property.tier) < 1) {
    throw new Error("Buy a cottage before building inside your domain.");
  }

  const finished = await completeConstruction(threadID, userID);
  if (finished?.completed) {
    return {
      definition: BUILDINGS[finished.building_key] || definition,
      level: Number(finished.target_level),
      cost: Number(finished.gold_cost),
      completed: true,
      completedBuilding: finished.building_key,
    };
  }

  const active = await db.query(
    `SELECT * FROM rpg_build_construction WHERE thread_id = $1 AND user_id = $2 LIMIT 1`,
    [String(threadID), String(userID)]
  );
  if (active.rows[0]) {
    const row = active.rows[0];
    throw new Error(
      `Your ${BUILDINGS[row.building_key]?.name || row.building_key} is still under construction. ` +
      `${formatBuildTime(Number(row.completes_at) - Date.now())} remaining.`
    );
  }

  const result = await db.query(
    `
    SELECT level FROM rpg_buildings
    WHERE thread_id = $1 AND user_id = $2 AND building_key = $3
    `,
    [String(threadID), String(userID), key]
  );
  const currentLevel = Number(result.rows[0]?.level || 0);
  const nextLevel = currentLevel + 1;
  const goldCost = definition.baseCost * nextLevel;
  const durationMs = Math.min(MAX_BUILD_TIME_MS, definition.buildTime * nextLevel);
  const resourceCost = Object.fromEntries(
    Object.entries(definition.resources).map(([name, amount]) => [name, Number(amount || 0) * nextLevel])
  );

  const user = await db.getUser(threadID, userID);
  if (Number(user?.balance || 0) < goldCost) {
    throw new Error(`You need ${formatNumber(goldCost)} coins to start this construction.`);
  }

  const resourceResult = await db.query(
    `
    SELECT food, wood, stone, iron
    FROM rpg_domain_resources
    WHERE thread_id = $1 AND user_id = $2 LIMIT 1
    `,
    [String(threadID), String(userID)]
  );
  const resources = resourceResult.rows[0] || { food: 0, wood: 0, stone: 0, iron: 0 };
  for (const name of ["food", "wood", "stone", "iron"]) {
    if (Number(resources[name] || 0) < Number(resourceCost[name] || 0)) {
      throw new Error(
        `Not enough ${name}. Need ${formatNumber(resourceCost[name] || 0)}, ` +
        `have ${formatNumber(resources[name] || 0)}.`
      );
    }
  }

  await db.spendBalance(
    threadID,
    userID,
    goldCost,
    `RPG construction: ${definition.name} level ${nextLevel}`
  );

  let chargedGold = true;
  try {
    const startedAt = Date.now();
    const completesAt = startedAt + durationMs;
    const inserted = await db.query(
      `
      WITH deducted AS (
        UPDATE rpg_domain_resources
        SET food = food - $3, wood = wood - $4, stone = stone - $5,
            iron = iron - $6, updated_at = $7
        WHERE thread_id = $1 AND user_id = $2
          AND food >= $3 AND wood >= $4 AND stone >= $5 AND iron >= $6
        RETURNING thread_id
      )
      INSERT INTO rpg_build_construction (
        thread_id, user_id, building_key, target_level,
        gold_cost, food_cost, wood_cost, stone_cost, iron_cost,
        started_at, completes_at
      )
      SELECT $1, $2, $8, $9, $10, $3, $4, $5, $6, $7, $11
      FROM deducted
      RETURNING *
      `,
      [
        String(threadID), String(userID), resourceCost.food || 0, resourceCost.wood || 0,
        resourceCost.stone || 0, resourceCost.iron || 0, startedAt,
        key, nextLevel, goldCost, completesAt,
      ]
    );

    if (!inserted.rows[0]) {
      await db.addBalance(threadID, userID, goldCost);
      chargedGold = false;
      throw new Error("Your resources changed before construction could start. Try again.");
    }

    return {
      definition: {
        ...definition,
        name: `${definition.name} — construction started`,
      },
      level: `${nextLevel} · ${formatBuildTime(durationMs)}`,
      cost: goldCost,
      resources: resourceCost,
      durationMs,
      durationText: formatBuildTime(durationMs),
      gameMinutes: gameMinutes(durationMs),
      completesAt,
      pending: true,
    };
  } catch (error) {
    if (chargedGold) await db.addBalance(threadID, userID, goldCost).catch(() => {});
    throw error;
  }
}

async function improveDefense(threadID, userID, part) {
  const key = String(part || "").toLowerCase();
  const definition = DEFENSE_PARTS[key];
  if (!definition) {
    throw new Error(`Choose a defense: ${Object.keys(DEFENSE_PARTS).join(", ")}.`);
  }
  const property = await getProperty(threadID, userID);
  const current = Number(property[key] || 0);
  const next = Math.min(100, current + 10);
  if (current >= 100) {
    throw new Error(`${definition.name} are already fully upgraded.`);
  }
  const cost = 750 + current * 25;
  await db.spendBalance(threadID, userID, cost, `RPG defense: ${definition.name}`);
  await db.query(
    `
    UPDATE rpg_properties SET ${key} = $3, updated_at = $4
    WHERE thread_id = $1 AND user_id = $2
    `,
    [String(threadID), String(userID), next, Date.now()]
  );
  return { definition, level: next, cost };
}

function propertyTier(tier) {
  return PROPERTY_TIERS[Number(tier)] || PROPERTY_TIERS[0];
}

function propertySummary(property) {
  const tier = propertyTier(property.tier);
  return {
    tier,
    maintenance: Number(property.maintenance || tier.upkeep),
    defense: Object.fromEntries(
      Object.keys(DEFENSE_PARTS).map((key) => [key, Number(property[key] || 0)])
    ),
    maintenanceText: `${formatNumber(Number(property.maintenance || tier.upkeep))} coins/day`,
  };
}

module.exports = {
  BUILDINGS,
  DEFENSE_PARTS,
  PROPERTY_TIERS,
  build,
  buyProperty,
  getBuildings,
  getConstructionStatus,
  getResourceState,
  applyResourceProduction,
  getProperty,
  improveDefense,
  propertySummary,
  propertyTier,
};
