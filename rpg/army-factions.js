"use strict";

const crypto = require("crypto");
const db = require("../db");
const { normalizeKey } = require("./utils");

const KINGDOM_ARMIES = {
  ashen_dominion: { factionId: "ashen_legions", title: "Ashen Legions", doctrine: "phalanx", signature: { id: "ashen_hoplite", name: "Ashen Hoplite", emoji: "🛡️", attack: 2.15, defense: 2.5, cost: 42 }, elite: { id: "red_crest", name: "Red-Crest Legionnaire", attack: 2.6, defense: 2.2 }, enemies: ["ironspine_hold", "hollow_covenant"] },
  silver_conclave: { factionId: "astral_host", title: "Astral Host", doctrine: "arcane", signature: { id: "starwarden", name: "Starwarden", emoji: "✨", attack: 2.7, defense: 1.7, cost: 48 }, elite: { id: "aether_lancer", name: "Aether Lancer", attack: 3.0, defense: 1.5 }, enemies: ["hollow_covenant"] },
  ironspine_hold: { factionId: "forge_host", title: "Forge Host", doctrine: "heavy_infantry", signature: { id: "forgeguard", name: "Forgeguard", emoji: "⛏️", attack: 2.3, defense: 2.9, cost: 45 }, elite: { id: "stonebreaker", name: "Stonebreaker", attack: 3.0, defense: 2.8 }, enemies: ["ashen_dominion"] },
  hollow_covenant: { factionId: "grave_legions", title: "Grave Legions", doctrine: "attrition", signature: { id: "gravebound", name: "Gravebound", emoji: "💀", attack: 2.5, defense: 2.0, cost: 38 }, elite: { id: "dread_knight", name: "Dread Knight", attack: 3.2, defense: 2.4 }, enemies: ["ashen_dominion", "silver_conclave", "ironspine_hold"] },
};
const CLASS_REGIMENTS = {
  knight: { prefix: "Oathbound", suffix: "Hoplite", bonus: "defense" },
  bloodreaver: { prefix: "Crimson", suffix: "Reaver", bonus: "attack" },
  arcanist: { prefix: "Arcane", suffix: "Warcaster", bonus: "attack" },
  wraith: { prefix: "Veil", suffix: "Stalker", bonus: "agility" },
  paladin: { prefix: "Dawn", suffix: "Templar", bonus: "defense" },
};
const EPITHETS = ["of the First Banner", "of Black Iron", "of the Last Stand", "of the Red Moon", "of the Silent March", "of the Broken Crown", "of the Starless Night", "of the Iron Oath"];
function getKingdomArmy(kingdomId) { return KINGDOM_ARMIES[normalizeKey(kingdomId)] || null; }
function hashIndex(value, length) { return crypto.createHash("sha256").update(String(value)).digest().readUInt32BE(0) % length; }
function getPersonalRegiment(userId, characterClass, kingdomId) {
  const faction = getKingdomArmy(kingdomId) || KINGDOM_ARMIES.ashen_dominion;
  const cls = CLASS_REGIMENTS[normalizeKey(characterClass)] || CLASS_REGIMENTS.knight;
  const epithet = EPITHETS[hashIndex(`${userId}:${kingdomId}:${characterClass}`, EPITHETS.length)];
  return { id: `personal_${normalizeKey(characterClass)}_${hashIndex(`${userId}:${kingdomId}`, 999999)}`, name: `${cls.prefix} ${faction.signature.name} ${cls.suffix} ${epithet}`, shortName: `${cls.prefix} ${cls.suffix}`, bannerNumber: 101 + hashIndex(`${userId}:${kingdomId}`, 899), kingdomUnit: faction.signature.id, doctrine: faction.doctrine, bonus: cls.bonus, attack: faction.signature.attack + (cls.bonus === "attack" ? 0.45 : 0), defense: faction.signature.defense + (cls.bonus === "defense" ? 0.45 : 0) };
}
async function ensureMilitarySchema() {
  await db.query(`ALTER TABLE rpg_armies ADD COLUMN IF NOT EXISTS faction_id TEXT, ADD COLUMN IF NOT EXISTS signature_unit_id TEXT, ADD COLUMN IF NOT EXISTS signature_name TEXT, ADD COLUMN IF NOT EXISTS signature_count INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS doctrine TEXT NOT NULL DEFAULT 'balanced', ADD COLUMN IF NOT EXISTS veterancy INTEGER NOT NULL DEFAULT 0;`);
}
async function ensureMilitaryIdentity(threadID, userID) {
  await ensureMilitarySchema();
  const result = await db.query(`SELECT a.*, p.character_class, p.kingdom_id FROM rpg_armies a LEFT JOIN rpg_players p ON p.thread_id = a.thread_id AND p.user_id = a.user_id WHERE a.thread_id = $1 AND a.user_id = $2 LIMIT 1`, [String(threadID), String(userID)]);
  const army = result.rows[0];
  if (!army) return null;
  const kingdomId = normalizeKey(army.kingdom_id || "ashen_dominion");
  const faction = getKingdomArmy(kingdomId) || KINGDOM_ARMIES.ashen_dominion;
  const personal = getPersonalRegiment(userID, army.character_class || "knight", kingdomId);
  if (army.faction_id !== faction.factionId || army.signature_unit_id !== personal.id || !army.signature_name) {
    const startingSignature = Math.max(3, Math.min(25, 5 + Math.floor(Number(army.infantry || 0) / 5)));
    await db.query(`UPDATE rpg_armies SET faction_id=$3, signature_unit_id=$4, signature_name=$5, signature_count=GREATEST(signature_count,$6), doctrine=$7, updated_at=$8 WHERE thread_id=$1 AND user_id=$2`, [String(threadID), String(userID), faction.factionId, personal.id, personal.name, startingSignature, faction.doctrine, Date.now()]);
    return { ...army, faction_id: faction.factionId, signature_unit_id: personal.id, signature_name: personal.name, signature_count: Math.max(Number(army.signature_count || 0), startingSignature), doctrine: faction.doctrine, faction, personal };
  }
  return { ...army, faction, personal };
}
function listKingdomArmies() { return Object.entries(KINGDOM_ARMIES).map(([kingdomId, army]) => ({ kingdomId, ...army })); }
function isEnemy(kingdomA, kingdomB) { return Boolean(getKingdomArmy(kingdomA)?.enemies?.includes(normalizeKey(kingdomB))); }
module.exports = { CLASS_REGIMENTS, KINGDOM_ARMIES, ensureMilitaryIdentity, ensureMilitarySchema, getKingdomArmy, getPersonalRegiment, isEnemy, listKingdomArmies };
