"use strict";

const db = require("../db");
const { resolveLocation, distanceBetween, marchDurationMs } = require("./world");
const { getLocationOwner } = require("./kingdoms");
const { getRelation } = require("./diplomacy");

const ROUTE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const ROUTE_COST = 250;
const BASE_REVENUE = 150;

let schemaReady;

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = db.query(`
      CREATE TABLE IF NOT EXISTS rpg_trade_routes (
        thread_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        origin_location_id TEXT NOT NULL,
        destination_location_id TEXT NOT NULL,
        established_at BIGINT NOT NULL,
        last_dispatch_at BIGINT NOT NULL DEFAULT 0,
        successful_runs INTEGER NOT NULL DEFAULT 0,
        disrupted_runs INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(thread_id, user_id, origin_location_id, destination_location_id)
      );
    `);
  }
  await schemaReady;
}

function routeKey(origin, destination) {
  return [origin, destination].sort().join(":");
}

async function inspectRoute(threadID, originId, destinationId) {
  const origin = resolveLocation(originId);
  const destination = resolveLocation(destinationId);
  if (!origin || !destination) throw new Error("Both trade-route locations must exist in the RPG world.");
  if (origin.id === destination.id) throw new Error("A trade route needs two different locations.");

  const originOwner = await getLocationOwner(threadID, origin.id);
  const destinationOwner = await getLocationOwner(threadID, destination.id);
  const relation = originOwner && destinationOwner && originOwner !== destinationOwner
    ? await getRelation(threadID, originOwner, destinationOwner)
    : "friendly";

  return {
    origin,
    destination,
    originOwner,
    destinationOwner,
    relation,
    distance: distanceBetween(origin, destination),
    durationMs: marchDurationMs(origin, destination),
  };
}

function routeSafety(info) {
  if (info.relation === "at_war") return 0.35;
  if (info.relation === "hostile") return 0.55;
  if (info.relation === "neutral") return 0.82;
  if (info.relation === "friendly") return 0.95;
  if (info.relation === "allied") return 1.08;
  return 1;
}

async function establishRoute(threadID, userID, originId, destinationId) {
  await ensureSchema();
  const info = await inspectRoute(threadID, originId, destinationId);
  if (info.relation === "at_war") {
    throw new Error("Those locations are controlled by kingdoms at war. The route cannot be established.");
  }

  await db.addBalance(threadID, userID, -ROUTE_COST, "RPG trade route establishment").catch(() => {
    throw new Error(`Establishing a trade route costs ${ROUTE_COST.toLocaleString()} coins.`);
  });

  const now = Date.now();
  await db.query(
    `INSERT INTO rpg_trade_routes
      (thread_id, user_id, origin_location_id, destination_location_id, established_at, last_dispatch_at)
     VALUES ($1, $2, $3, $4, $5, 0)
     ON CONFLICT (thread_id, user_id, origin_location_id, destination_location_id)
     DO NOTHING`,
    [String(threadID), String(userID), info.origin.id, info.destination.id, now]
  );

  return { ...info, cost: ROUTE_COST };
}

async function dispatchRoute(threadID, userID, originId, destinationId) {
  await ensureSchema();
  const info = await inspectRoute(threadID, originId, destinationId);
  const result = await db.query(
    `SELECT * FROM rpg_trade_routes
     WHERE thread_id = $1 AND user_id = $2
       AND origin_location_id = $3 AND destination_location_id = $4
     LIMIT 1`,
    [String(threadID), String(userID), info.origin.id, info.destination.id]
  );
  const route = result.rows[0];
  if (!route) throw new Error("That trade route has not been established yet.");

  const now = Date.now();
  const remaining = ROUTE_COOLDOWN_MS - (now - Number(route.last_dispatch_at || 0));
  if (remaining > 0) return { dispatched: false, remainingMs: remaining };

  const safety = routeSafety(info);
  const success = Math.random() < Math.min(1, safety);
  const revenue = Math.max(
    50,
    Math.floor((BASE_REVENUE + info.distance * 75) * safety)
  );

  if (success) {
    await db.addBalance(threadID, userID, revenue, `RPG trade route: ${info.origin.id} -> ${info.destination.id}`);
    await db.query(
      `UPDATE rpg_trade_routes
       SET last_dispatch_at = $5, successful_runs = successful_runs + 1
       WHERE thread_id = $1 AND user_id = $2
         AND origin_location_id = $3 AND destination_location_id = $4`,
      [String(threadID), String(userID), info.origin.id, info.destination.id, now]
    );
    return { dispatched: true, success: true, revenue, safety, info };
  }

  await db.query(
    `UPDATE rpg_trade_routes
     SET last_dispatch_at = $5, disrupted_runs = disrupted_runs + 1
     WHERE thread_id = $1 AND user_id = $2
       AND origin_location_id = $3 AND destination_location_id = $4`,
    [String(threadID), String(userID), info.origin.id, info.destination.id, now]
  );
  return { dispatched: true, success: false, revenue: 0, safety, info };
}

async function listRoutes(threadID, userID) {
  await ensureSchema();
  const result = await db.query(
    `SELECT * FROM rpg_trade_routes
     WHERE thread_id = $1 AND user_id = $2
     ORDER BY established_at`,
    [String(threadID), String(userID)]
  );
  return result.rows;
}

module.exports = {
  ROUTE_COOLDOWN_MS,
  ROUTE_COST,
  establishRoute,
  dispatchRoute,
  inspectRoute,
  listRoutes,
  routeKey,
};
