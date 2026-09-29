const db = require("../db");
const { normalizeKey, totalUnits } = require("./utils");
const { applyResourceProduction } = require("./properties");
const { ensureMilitaryIdentity, KINGDOM_ARMIES } = require("./army-factions");

const UNITS = {
  infantry: { name: "Infantry", emoji: "⚔️", column: "infantry", cost: 10, attack: 1, defense: 1 },
  archers: { name: "Archers", emoji: "🏹", column: "archers", cost: 16, attack: 1.3, defense: 0.7 },
  spearmen: { name: "Spearmen", emoji: "🔱", column: "spearmen", cost: 13, attack: 1.1, defense: 1.3 },
  cavalry: { name: "Cavalry", emoji: "🐎", column: "cavalry", cost: 25, attack: 1.6, defense: 0.9 },
  heavy_swordsmen: { name: "Heavy Swordsmen", emoji: "🛡️", column: "heavy_swordsmen", cost: 30, attack: 1.5, defense: 1.7 },
  shielders: { name: "Shielders", emoji: "🛡️", column: "shielders", cost: 22, attack: 0.8, defense: 1.9 },
  mages: { name: "Mages", emoji: "🧙", column: "mages", cost: 40, attack: 2, defense: 0.5 },
  assassins: { name: "Assassins", emoji: "🗡️", column: "assassins", cost: 50, attack: 2.2, defense: 0.4 },
};
const FORMATIONS = {
  balanced: { name: "Balanced", emoji: "⚔️", attack: 1, defense: 1, speed: 1 },
  shield_wall: { name: "Shield Wall", emoji: "🛡️", attack: 0.85, defense: 1.35, speed: 0.85 },
  cavalry_charge: { name: "Cavalry Charge", emoji: "🐎", attack: 1.3, defense: 0.85, speed: 1.25 },
  archer_line: { name: "Archer Line", emoji: "🏹", attack: 1.2, defense: 0.9, speed: 0.95 },
  mage_formation: { name: "Mage Formation", emoji: "🔷", attack: 1.35, defense: 0.8, speed: 0.9 },
  assault: { name: "Assault", emoji: "🔥", attack: 1.45, defense: 0.7, speed: 1 },
  defensive: { name: "Defensive", emoji: "🏰", attack: 0.75, defense: 1.5, speed: 0.8 },
  ambush: { name: "Ambush", emoji: "🌑", attack: 1.25, defense: 0.75, speed: 1.1 },
};
const REAL_MS_PER_GAME_HOUR = 15_000;
const SUPPLY_LOSS_PER_SHORTAGE_HOUR = 3;
const DESERTION_RATE_AT_ZERO_SUPPLY = 0.01;
let logisticsSchemaReady;
async function ensureLogisticsSchema() {
  if (!logisticsSchemaReady) logisticsSchemaReady = db.query(`CREATE TABLE IF NOT EXISTS rpg_army_logistics (thread_id TEXT NOT NULL, user_id TEXT NOT NULL, last_tick_at BIGINT NOT NULL, PRIMARY KEY(thread_id,user_id));`);
  await logisticsSchemaReady;
}

async function tickArmyLogistics(threadID, userID) {
  await ensureLogisticsSchema();
  await applyResourceProduction(threadID, userID);
  const army = await ensureMilitaryIdentity(threadID, userID);
  if (!army) return { hoursProcessed: 0, foodConsumed: 0, shortage: false, deserted: 0 };
  const now = Date.now();
  const state = await db.query(`SELECT last_tick_at FROM rpg_army_logistics WHERE thread_id=$1 AND user_id=$2 LIMIT 1`, [String(threadID), String(userID)]);
  let lastTick = Number(state.rows[0]?.last_tick_at || now);
  if (!state.rows[0]) await db.query(`INSERT INTO rpg_army_logistics(thread_id,user_id,last_tick_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, [String(threadID), String(userID), now]);
  const hours = Math.floor(Math.max(0, now - lastTick) / REAL_MS_PER_GAME_HOUR);
  if (hours <= 0) return { hoursProcessed: 0, foodConsumed: 0, shortage: false, deserted: 0, signatureName: army.signature_name, faction: army.faction };
  const fr = await db.query(`SELECT food FROM rpg_domain_resources WHERE thread_id=$1 AND user_id=$2 LIMIT 1`, [String(threadID), String(userID)]);
  let food = Math.max(0, Number(fr.rows[0]?.food || 0));
  let supplies = Math.max(0, Math.min(100, Number(army.supplies || 0)));
  let units = totalUnits(army);
  let foodConsumed = 0, deserted = 0, shortage = false;
  for (let hour = 0; hour < hours && units > 0; hour += 1) {
    const need = Math.max(1, Math.ceil(units / 10));
    if (food >= need) { food -= need; foodConsumed += need; supplies = Math.min(100, supplies + 1); }
    else {
      shortage = true; supplies = Math.max(0, supplies - SUPPLY_LOSS_PER_SHORTAGE_HOUR);
      if (supplies <= 0) {
        let loss = Math.max(1, Math.floor(units * DESERTION_RATE_AT_ZERO_SUPPLY));
        for (const unit of Object.values(UNITS)) {
          if (loss <= 0) break;
          const count = Math.max(0, Number(army[unit.column] || 0));
          const taken = Math.min(count, loss);
          army[unit.column] = count - taken; loss -= taken; deserted += taken; units -= taken;
        }
        if (loss > 0 && Number(army.signature_count || 0) > 0) {
          const taken = Math.min(Number(army.signature_count), loss);
          army.signature_count -= taken; deserted += taken; units -= taken;
        }
      }
    }
  }
  lastTick += hours * REAL_MS_PER_GAME_HOUR;
  await db.query(`UPDATE rpg_domain_resources SET food=$3,updated_at=$4 WHERE thread_id=$1 AND user_id=$2`, [String(threadID), String(userID), Math.max(0, Math.floor(food)), now]);
  const cols = Object.values(UNITS).map(u => u.column);
  const vals = [String(threadID), String(userID), supplies, now, ...cols.map(c => Math.max(0, Math.floor(Number(army[c] || 0)))), Math.max(0, Math.floor(Number(army.signature_count || 0)))];
  const assignments = cols.map((c, i) => `${c}=$${i + 5}`).join(",");
  await db.query(`UPDATE rpg_armies SET supplies=$3,updated_at=$4,${assignments},signature_count=$${cols.length + 5} WHERE thread_id=$1 AND user_id=$2`, vals);
  await db.query(`UPDATE rpg_army_logistics SET last_tick_at=$3 WHERE thread_id=$1 AND user_id=$2`, [String(threadID), String(userID), lastTick]);
  return { hoursProcessed: hours, foodConsumed, foodRemaining: Math.floor(food), shortage, supplies, deserted, signatureName: army.signature_name, faction: army.faction };
}

async function getArmy(threadID, userID) {
  await tickArmyLogistics(threadID, userID);
  return (await db.query(`SELECT a.*, p.kingdom_id, p.character_class FROM rpg_armies a LEFT JOIN rpg_players p ON p.thread_id=a.thread_id AND p.user_id=a.user_id WHERE a.thread_id=$1 AND a.user_id=$2`, [String(threadID), String(userID)])).rows[0] || null;
}
async function train(threadID, userID, unitName, amount) {
  const key = normalizeKey(unitName), unit = UNITS[key], count = Math.floor(Number(amount));
  if (!unit || !Number.isInteger(count) || count <= 0 || count > 10_000) throw new Error(`Usage: !rpg train <${Object.keys(UNITS).join("|")}> <amount>`);
  const identity = await ensureMilitaryIdentity(threadID, userID);
  await tickArmyLogistics(threadID, userID);
  const cost = unit.cost * count;
  await db.spendBalance(threadID, userID, cost, `RPG training: ${unit.name} x${count}`);
  await db.query(`UPDATE rpg_armies SET ${unit.column}=${unit.column}+$3,supplies=LEAST(100,supplies+$4),veterancy=LEAST(100,veterancy+$5),updated_at=$6 WHERE thread_id=$1 AND user_id=$2`, [String(threadID), String(userID), count, Math.ceil(count / 10), Math.min(2, Math.floor(count / 25)), Date.now()]);
  return { unit, count, cost, identity };
}
async function trainSignature(threadID, userID, amount) {
  const identity = await ensureMilitaryIdentity(threadID, userID);
  const count = Math.floor(Number(amount));
  if (!identity || !Number.isInteger(count) || count <= 0 || count > 500) throw new Error("Usage: !rpg train signature <amount>");
  const faction = identity.faction;
  const cost = faction.signature.cost * count;
  await db.spendBalance(threadID, userID, cost, `RPG signature regiment: ${identity.signature_name} x${count}`);
  await db.query(`UPDATE rpg_armies SET signature_count=signature_count+$3,veterancy=LEAST(100,veterancy+$4),updated_at=$5 WHERE thread_id=$1 AND user_id=$2`, [String(threadID), String(userID), count, Math.min(3, Math.floor(count / 10)), Date.now()]);
  return { name: identity.signature_name, count, cost, faction: faction.title };
}
async function setFormation(threadID, userID, formationName) {
  const key = normalizeKey(formationName), formation = FORMATIONS[key];
  if (!formation) throw new Error(`Choose a formation: ${Object.keys(FORMATIONS).join(", ")}.`);
  await db.query(`UPDATE rpg_armies SET formation=$3,updated_at=$4 WHERE thread_id=$1 AND user_id=$2`, [String(threadID), String(userID), key, Date.now()]);
  return { key, ...formation };
}
async function createRegiment(threadID, userID, name, unitType, amount) {
  const unit = UNITS[normalizeKey(unitType)], count = Math.floor(Number(amount));
  if (!unit || !name || !Number.isInteger(count) || count <= 0) throw new Error("Usage: !rpg regiment create <name> <unit> <amount>");
  return (await db.query(`INSERT INTO rpg_regiments(thread_id,user_id,name,unit_type,count,experience_tier,updated_at) VALUES($1,$2,$3,$4,$5,'recruit',$6) RETURNING *`, [String(threadID), String(userID), String(name).slice(0,48), unit.column, count, Date.now()])).rows[0];
}
async function getRegiments(threadID, userID) { return (await db.query(`SELECT * FROM rpg_regiments WHERE thread_id=$1 AND user_id=$2 ORDER BY id`, [String(threadID), String(userID)])).rows; }
function armyPower(army, formationName = "balanced") {
  const formation = FORMATIONS[formationName] || FORMATIONS.balanced;
  let attack = 0, defense = 0;
  for (const unit of Object.values(UNITS)) { const count = Number(army?.[unit.column] || 0); attack += count * unit.attack; defense += count * unit.defense; }
  if (Number(army?.signature_count || 0) > 0) {
    const faction = KINGDOM_ARMIES[normalizeKey(army?.kingdom_id)] || KINGDOM_ARMIES.ashen_dominion;
    attack += Number(army.signature_count) * faction.signature.attack;
    defense += Number(army.signature_count) * faction.signature.defense;
  }
  const veterancy = 1 + Math.min(0.25, Number(army?.veterancy || 0) / 400);
  return { attack: Math.round(attack * formation.attack * veterancy), defense: Math.round(defense * formation.defense * veterancy), strength: Math.round((attack + defense) * formation.attack * veterancy), formation };
}
module.exports = { FORMATIONS, UNITS, armyPower, createRegiment, getArmy, getRegiments, setFormation, tickArmyLogistics, totalUnits, train, trainSignature };
