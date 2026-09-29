const db = require("../db");
const { normalizeKey, totalUnits } = require("./utils");
const { applyResourceProduction } = require("./properties");

const UNITS = {
  infantry: {
    name: "Infantry",
    emoji: "⚔️",
    column: "infantry",
    cost: 10,
    attack: 1,
    defense: 1,
  },
  archers: {
    name: "Archers",
    emoji: "🏹",
    column: "archers",
    cost: 16,
    attack: 1.3,
    defense: 0.7,
  },
  spearmen: {
    name: "Spearmen",
    emoji: "🔱",
    column: "spearmen",
    cost: 13,
    attack: 1.1,
    defense: 1.3,
  },
  cavalry: {
    name: "Cavalry",
    emoji: "🐎",
    column: "cavalry",
    cost: 25,
    attack: 1.6,
    defense: 0.9,
  },
  heavy_swordsmen: {
    name: "Heavy Swordsmen",
    emoji: "🛡️",
    column: "heavy_swordsmen",
    cost: 30,
    attack: 1.5,
    defense: 1.7,
  },
  shielders: {
    name: "Shielders",
    emoji: "🛡️",
    column: "shielders",
    cost: 22,
    attack: 0.8,
    defense: 1.9,
  },
  mages: {
    name: "Mages",
    emoji: "🧙",
    column: "mages",
    cost: 40,
    attack: 2,
    defense: 0.5,
  },
  assassins: {
    name: "Assassins",
    emoji: "🗡️",
    column: "assassins",
    cost: 50,
    attack: 2.2,
    defense: 0.4,
  },
};

const FORMATIONS = {
  balanced: {
    name: "Balanced",
    emoji: "⚔️",
    attack: 1,
    defense: 1,
    speed: 1,
  },
  shield_wall: {
    name: "Shield Wall",
    emoji: "🛡️",
    attack: 0.85,
    defense: 1.35,
    speed: 0.85,
  },
  cavalry_charge: {
    name: "Cavalry Charge",
    emoji: "🐎",
    attack: 1.3,
    defense: 0.85,
    speed: 1.25,
  },
  archer_line: {
    name: "Archer Line",
    emoji: "🏹",
    attack: 1.2,
    defense: 0.9,
    speed: 0.95,
  },
  mage_formation: {
    name: "Mage Formation",
    emoji: "🔷",
    attack: 1.35,
    defense: 0.8,
    speed: 0.9,
  },
  assault: {
    name: "Assault",
    emoji: "🔥",
    attack: 1.45,
    defense: 0.7,
    speed: 1,
  },
  defensive: {
    name: "Defensive",
    emoji: "🏰",
    attack: 0.75,
    defense: 1.5,
    speed: 0.8,
  },
  ambush: {
    name: "Ambush",
    emoji: "🌑",
    attack: 1.25,
    defense: 0.75,
    speed: 1.1,
  },
};

/*
 * ARMY LOGISTICS
 *
 * 5 real seconds = 20 in-game minutes.
 * Armies consume food every in-game hour. This makes the domain economy,
 * population and military operate on the same simulation clock.
 *
 * 1 food feeds 10 soldiers for one in-game hour.
 * If food runs out, supplies fall. At zero supplies, a small number of
 * soldiers desert each processed hour rather than the army disappearing.
 */
const REAL_MS_PER_GAME_HOUR = 15_000;
const FOOD_PER_10_SOLDIERS_PER_HOUR = 1;
const SUPPLY_LOSS_PER_SHORTAGE_HOUR = 3;
const DESERTION_RATE_AT_ZERO_SUPPLY = 0.01;

let logisticsSchemaReady;

async function ensureLogisticsSchema() {
  if (!logisticsSchemaReady) {
    logisticsSchemaReady = db.query(`
      CREATE TABLE IF NOT EXISTS rpg_army_logistics (
        thread_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        last_tick_at BIGINT NOT NULL,
        PRIMARY KEY(thread_id, user_id)
      );
    `);
  }
  await logisticsSchemaReady;
}

async function tickArmyLogistics(threadID, userID) {
  await ensureLogisticsSchema();
  await applyResourceProduction(threadID, userID);

  const armyResult = await db.query(
    `SELECT * FROM rpg_armies WHERE thread_id = $1 AND user_id = $2 LIMIT 1`,
    [String(threadID), String(userID)]
  );
  const army = armyResult.rows[0];
  if (!army) return { hoursProcessed: 0, foodConsumed: 0, shortage: false, deserted: 0 };

  const now = Date.now();
  const stateResult = await db.query(
    `SELECT last_tick_at FROM rpg_army_logistics WHERE thread_id = $1 AND user_id = $2 LIMIT 1`,
    [String(threadID), String(userID)]
  );

  let lastTick = Number(stateResult.rows[0]?.last_tick_at || now);
  if (!stateResult.rows[0]) {
    await db.query(
      `INSERT INTO rpg_army_logistics (thread_id, user_id, last_tick_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (thread_id, user_id) DO NOTHING`,
      [String(threadID), String(userID), now]
    );
    lastTick = now;
  }

  const elapsed = Math.max(0, now - lastTick);
  const hours = Math.floor(elapsed / REAL_MS_PER_GAME_HOUR);
  if (hours <= 0) return { hoursProcessed: 0, foodConsumed: 0, shortage: false, deserted: 0 };

  let foodResult = await db.query(
    `SELECT food FROM rpg_domain_resources WHERE thread_id = $1 AND user_id = $2 LIMIT 1`,
    [String(threadID), String(userID)]
  );
  let food = Math.max(0, Number(foodResult.rows[0]?.food || 0));
  let supplies = Math.max(0, Math.min(100, Number(army.supplies || 0)));
  let foodConsumed = 0;
  let shortage = false;
  let deserted = 0;

  let units = totalUnits(army);
  const foodNeed = Math.max(1, Math.ceil(units / 10));

  for (let hour = 0; hour < hours; hour += 1) {
    if (units <= 0) break;

    if (food >= foodNeed) {
      food -= foodNeed;
      foodConsumed += foodNeed;
      supplies = Math.min(100, supplies + 1);
    } else {
      shortage = true;
      supplies = Math.max(0, supplies - SUPPLY_LOSS_PER_SHORTAGE_HOUR);

      if (supplies <= 0) {
        const loss = Math.max(1, Math.floor(units * DESERTION_RATE_AT_ZERO_SUPPLY));
        let remainingLoss = loss;
        for (const unit of Object.values(UNITS)) {
          if (remainingLoss <= 0) break;
          const count = Math.max(0, Number(army[unit.column] || 0));
          if (!count) continue;
          const taken = Math.min(count, remainingLoss);
          army[unit.column] = count - taken;
          remainingLoss -= taken;
          deserted += taken;
          units -= taken;
        }
      }
    }
  }

  const consumedMs = hours * REAL_MS_PER_GAME_HOUR;
  lastTick += consumedMs;

  await db.query(
    `UPDATE rpg_domain_resources
     SET food = $3, updated_at = $4
     WHERE thread_id = $1 AND user_id = $2`,
    [String(threadID), String(userID), Math.max(0, Math.floor(food)), now]
  );

  const unitColumns = Object.values(UNITS).map(unit => unit.column);
  const updateValues = [String(threadID), String(userID), supplies, now, ...unitColumns.map(column => Math.max(0, Math.floor(Number(army[column] || 0))))];
  const assignments = unitColumns.map((column, index) => `${column} = $${index + 5}`).join(",\n        ");

  await db.query(
    `UPDATE rpg_armies
     SET supplies = $3,
         updated_at = $4,
         ${assignments}
     WHERE thread_id = $1 AND user_id = $2`,
    updateValues
  );

  await db.query(
    `UPDATE rpg_army_logistics SET last_tick_at = $3 WHERE thread_id = $1 AND user_id = $2`,
    [String(threadID), String(userID), lastTick]
  );

  return {
    hoursProcessed: hours,
    foodConsumed,
    foodRemaining: Math.max(0, Math.floor(food)),
    shortage,
    supplies,
    deserted,
  };
}

async function getArmy(threadID, userID) {
  await tickArmyLogistics(threadID, userID);
  const result = await db.query(
    `
    SELECT *
    FROM rpg_armies
    WHERE thread_id = $1
      AND user_id = $2
    `,
    [String(threadID), String(userID)]
  );
  return result.rows[0] || null;
}

async function train(threadID, userID, unitName, amount) {
  const key = normalizeKey(unitName);
  const unit = UNITS[key];
  const count = Math.floor(Number(amount));
  if (!unit || !Number.isInteger(count) || count <= 0 || count > 10_000) {
    throw new Error(
      `Usage: !rpg train <${Object.keys(UNITS).join("|")}> <amount>`
    );
  }

  await tickArmyLogistics(threadID, userID);

  const cost = unit.cost * count;
  await db.spendBalance(
    threadID,
    userID,
    cost,
    `RPG training: ${unit.name} x${count}`
  );
  await db.query(
    `
    UPDATE rpg_armies
    SET ${unit.column} = ${unit.column} + $3,
        supplies = LEAST(100, supplies + $4),
        updated_at = $5
    WHERE thread_id = $1
      AND user_id = $2
    `,
    [String(threadID), String(userID), count, Math.ceil(count / 10), Date.now()]
  );
  return { unit, count, cost };
}

async function setFormation(threadID, userID, formationName) {
  const key = normalizeKey(formationName);
  const formation = FORMATIONS[key];
  if (!formation) {
    throw new Error(
      `Choose a formation: ${Object.keys(FORMATIONS).join(", ")}.`
    );
  }
  await db.query(
    `
    UPDATE rpg_armies
    SET formation = $3,
        updated_at = $4
    WHERE thread_id = $1
      AND user_id = $2
    `,
    [String(threadID), String(userID), key, Date.now()]
  );
  return { key, ...formation };
}

async function createRegiment(threadID, userID, name, unitType, amount) {
  const unit = UNITS[normalizeKey(unitType)];
  const count = Math.floor(Number(amount));
  if (!unit || !name || !Number.isInteger(count) || count <= 0) {
    throw new Error("Usage: !rpg regiment create <name> <unit> <amount>");
  }
  const result = await db.query(
    `
    INSERT INTO rpg_regiments (
      thread_id, user_id, name, unit_type, count, experience_tier, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, 'recruit', $6)
    RETURNING *
    `,
    [
      String(threadID),
      String(userID),
      String(name).slice(0, 48),
      unit.column,
      count,
      Date.now(),
    ]
  );
  return result.rows[0];
}

async function getRegiments(threadID, userID) {
  const result = await db.query(
    `
    SELECT *
    FROM rpg_regiments
    WHERE thread_id = $1
      AND user_id = $2
    ORDER BY id
    `,
    [String(threadID), String(userID)]
  );
  return result.rows;
}

function armyPower(army, formationName = "balanced") {
  const formation = FORMATIONS[formationName] || FORMATIONS.balanced;
  let attack = 0;
  let defense = 0;
  for (const [key, unit] of Object.entries(UNITS)) {
    const count = Number(army?.[unit.column] || 0);
    attack += count * unit.attack;
    defense += count * unit.defense;
  }
  return {
    attack: Math.round(attack * formation.attack),
    defense: Math.round(defense * formation.defense),
    strength: Math.round((attack + defense) * formation.attack),
    formation,
  };
}

module.exports = {
  FORMATIONS,
  UNITS,
  armyPower,
  createRegiment,
  getArmy,
  getRegiments,
  setFormation,
  tickArmyLogistics,
  totalUnits,
  train,
};
