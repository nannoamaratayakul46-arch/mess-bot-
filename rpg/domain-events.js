"use strict";

const crypto = require("crypto");
const db = require("../db");
const { getEconomy } = require("./economy");

const EVENT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const EVENTS = [
  {
    id: "harvest_bounty",
    title: "🌾 Bountiful Harvest",
    description: "Your farms produced an exceptional harvest.",
    weight: 10,
    effects: { food: 120, prosperity: 4 },
  },
  {
    id: "trade_boom",
    title: "🏪 Trade Boom",
    description: "Merchants are flocking to your market.",
    weight: 8,
    effects: { coins: 250, prosperity: 5 },
  },
  {
    id: "migration",
    title: "👥 Settlers Arrive",
    description: "Families seeking opportunity have arrived at your domain.",
    weight: 7,
    effects: { population: 8, prosperity: 3 },
  },
  {
    id: "bandits",
    title: "🗡️ Bandit Pressure",
    description: "Bandits are disrupting trade routes near the domain.",
    weight: 7,
    effects: { coins: -150, prosperity: -5 },
  },
  {
    id: "tax_unrest",
    title: "🔥 Tax Unrest",
    description: "Heavy taxation is creating unrest among the population.",
    weight: 6,
    effects: { population: -3, prosperity: -8 },
  },
  {
    id: "mine_collapse",
    title: "⛏️ Mine Collapse",
    description: "A section of the mine has collapsed, temporarily disrupting extraction.",
    weight: 5,
    effects: { stone: -60, iron: -40, prosperity: -3 },
  },
  {
    id: "military_recruitment",
    title: "⚔️ Recruitment Surge",
    description: "The military has attracted new volunteers.",
    weight: 5,
    effects: { prosperity: 2 },
  },
];

let schemaReady;

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = db.query(`
      CREATE TABLE IF NOT EXISTS rpg_domain_events (
        thread_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        last_event_at BIGINT NOT NULL DEFAULT 0,
        total_events INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(thread_id, user_id)
      );
    `);
  }
  await schemaReady;
}

function pickEvent(prosperity) {
  const adjusted = EVENTS.map(event => {
    let weight = event.weight;
    if (prosperity >= 85 && ["harvest_bounty", "trade_boom", "migration"].includes(event.id)) weight *= 2;
    if (prosperity < 30 && ["bandits", "tax_unrest", "mine_collapse"].includes(event.id)) weight *= 2;
    return { event, weight };
  });
  const total = adjusted.reduce((sum, item) => sum + item.weight, 0);
  let roll = crypto.randomInt(0, Math.max(1, Math.floor(total * 1000))) / 1000;
  for (const item of adjusted) {
    roll -= item.weight;
    if (roll <= 0) return item.event;
  }
  return EVENTS[0];
}

async function mutateResources(threadID, userID, effects) {
  const resourceColumns = ["food", "wood", "stone", "iron"];
  const sets = [];
  const values = [String(threadID), String(userID), Date.now()];
  let index = 4;
  for (const key of resourceColumns) {
    if (!Object.prototype.hasOwnProperty.call(effects, key)) continue;
    sets.push(`${key} = GREATEST(0, ${key} + $${index})`);
    values.push(Number(effects[key]) || 0);
    index += 1;
  }
  if (!sets.length) return;
  sets.push(`updated_at = $3`);
  await db.query(
    `UPDATE rpg_domain_resources SET ${sets.join(", ")} WHERE thread_id = $1 AND user_id = $2`,
    values
  );
}

async function applyEvent(threadID, userID, event) {
  const effects = event.effects || {};
  await mutateResources(threadID, userID, effects);

  if (effects.coins) {
    if (effects.coins > 0) await db.addBalance(threadID, userID, effects.coins, `RPG event: ${event.id}`);
    else await db.spendBalance(threadID, userID, Math.abs(effects.coins), `RPG event: ${event.id}`).catch(() => {});
  }

  if (effects.population) {
    await db.query(
      `UPDATE rpg_population SET population = GREATEST(1, population + $3) WHERE thread_id = $1 AND user_id = $2`,
      [String(threadID), String(userID), Number(effects.population)]
    );
  }

  if (effects.prosperity) {
    await db.query(
      `UPDATE rpg_domain_economy SET prosperity = GREATEST(0, LEAST(100, prosperity + $3)) WHERE thread_id = $1 AND user_id = $2`,
      [String(threadID), String(userID), Number(effects.prosperity)]
    );
  }
}

async function rollDomainEvent(threadID, userID, { force = false } = {}) {
  await ensureSchema();
  const state = await getEconomy(threadID, userID);
  const now = Date.now();
  const result = await db.query(
    `SELECT last_event_at FROM rpg_domain_events WHERE thread_id = $1 AND user_id = $2 LIMIT 1`,
    [String(threadID), String(userID)]
  );
  const last = Number(result.rows[0]?.last_event_at || 0);
  if (!force && now - last < EVENT_COOLDOWN_MS) {
    return {
      triggered: false,
      remainingMs: EVENT_COOLDOWN_MS - (now - last),
    };
  }

  const event = pickEvent(Number(state.prosperity || 50));
  await applyEvent(threadID, userID, event);
  await db.query(
    `INSERT INTO rpg_domain_events (thread_id, user_id, event_id, last_event_at, total_events)
     VALUES ($1, $2, $3, $4, 1)
     ON CONFLICT (thread_id, user_id)
     DO UPDATE SET event_id = EXCLUDED.event_id,
                   last_event_at = EXCLUDED.last_event_at,
                   total_events = rpg_domain_events.total_events + 1`,
    [String(threadID), String(userID), event.id, now]
  );

  return { triggered: true, event };
}

async function getEventHistory(threadID, userID, limit = 10) {
  await ensureSchema();
  const safeLimit = Math.max(1, Math.min(50, Math.floor(Number(limit) || 10)));
  const result = await db.query(
    `SELECT event_id, last_event_at, total_events
     FROM rpg_domain_events
     WHERE thread_id = $1 AND user_id = $2
     LIMIT 1`,
    [String(threadID), String(userID)]
  );
  return result.rows[0] || { event_id: null, last_event_at: 0, total_events: 0, limit: safeLimit };
}

module.exports = {
  EVENTS,
  EVENT_COOLDOWN_MS,
  getEventHistory,
  pickEvent,
  rollDomainEvent,
};
