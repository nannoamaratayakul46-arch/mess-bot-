"use strict";

const crypto = require("crypto");
const { normalizeKey } = require("./utils");

// Kingdom identity lives here; the existing kingdoms.js remains the source
// for kingdom ownership, diplomacy and territory. This module only defines
// military doctrine and the unique troops those kingdoms field.
const KINGDOM_ARMIES = {
  ashen_dominion: {
    factionId: "ashen_legions",
    title: "Ashen Legions",
    doctrine: "phalanx",
    signature: { id: "ashen_hoplite", name: "Ashen Hoplite", emoji: "🛡️", attack: 2.15, defense: 2.5, cost: 42 },
    elite: { id: "red_crest", name: "Red-Crest Legionnaire", attack: 2.6, defense: 2.2 },
    enemies: ["ironspine_hold", "hollow_covenant"],
  },
  silver_conclave: {
    factionId: "astral_host",
    title: "Astral Host",
    doctrine: "arcane",
    signature: { id: "starwarden", name: "Starwarden", emoji: "✨", attack: 2.7, defense: 1.7, cost: 48 },
    elite: { id: "aether_lancer", name: "Aether Lancer", attack: 3.0, defense: 1.5 },
    enemies: ["hollow_covenant"],
  },
  ironspine_hold: {
    factionId: "forge_host",
    title: "Forge Host",
    doctrine: "heavy_infantry",
    signature: { id: "forgeguard", name: "Forgeguard", emoji: "⛏️", attack: 2.3, defense: 2.9, cost: 45 },
    elite: { id: "stonebreaker", name: "Stonebreaker", attack: 3.0, defense: 2.8 },
    enemies: ["ashen_dominion"],
  },
  hollow_covenant: {
    factionId: "grave_legions",
    title: "Grave Legions",
    doctrine: "attrition",
    signature: { id: "gravebound", name: "Gravebound", emoji: "💀", attack: 2.5, defense: 2.0, cost: 38 },
    elite: { id: "dread_knight", name: "Dread Knight", attack: 3.2, defense: 2.4 },
    enemies: ["ashen_dominion", "silver_conclave", "ironspine_hold"],
  },
};

const CLASS_REGIMENTS = {
  knight: { prefix: "Oathbound", suffix: "Hoplite", bonus: "defense" },
  bloodreaver: { prefix: "Crimson", suffix: "Reaver", bonus: "attack" },
  arcanist: { prefix: "Arcane", suffix: "Warcaster", bonus: "attack" },
  wraith: { prefix: "Veil", suffix: "Stalker", bonus: "agility" },
  paladin: { prefix: "Dawn", suffix: "Templar", bonus: "defense" },
};

const EPITHETS = [
  "of the First Banner",
  "of Black Iron",
  "of the Last Stand",
  "of the Red Moon",
  "of the Silent March",
  "of the Broken Crown",
  "of the Starless Night",
  "of the Iron Oath",
];

function getKingdomArmy(kingdomId) {
  return KINGDOM_ARMIES[normalizeKey(kingdomId)] || null;
}

function hashIndex(value, length) {
  const digest = crypto.createHash("sha256").update(String(value)).digest();
  return digest.readUInt32BE(0) % length;
}

function getPersonalRegiment(userId, characterClass, kingdomId) {
  const faction = getKingdomArmy(kingdomId) || KINGDOM_ARMIES.ashen_dominion;
  const cls = CLASS_REGIMENTS[normalizeKey(characterClass)] || CLASS_REGIMENTS.knight;
  const epithet = EPITHETS[hashIndex(`${userId}:${kingdomId}:${characterClass}`, EPITHETS.length)];
  const number = 101 + hashIndex(`${userId}:${kingdomId}`, 899);

  return {
    id: `personal_${normalizeKey(characterClass)}_${hashIndex(`${userId}:${kingdomId}`, 999999)}`,
    name: `${cls.prefix} ${faction.signature.name} ${cls.suffix} ${epithet}`,
    shortName: `${cls.prefix} ${cls.suffix}`,
    bannerNumber: number,
    kingdomUnit: faction.signature.id,
    doctrine: faction.doctrine,
    bonus: cls.bonus,
    attack: faction.signature.attack + (cls.bonus === "attack" ? 0.45 : 0),
    defense: faction.signature.defense + (cls.bonus === "defense" ? 0.45 : 0),
  };
}

function listKingdomArmies() {
  return Object.entries(KINGDOM_ARMIES).map(([kingdomId, army]) => ({
    kingdomId,
    ...army,
  }));
}

function isEnemy(kingdomA, kingdomB) {
  const a = getKingdomArmy(kingdomA);
  const b = normalizeKey(kingdomB);
  return Boolean(a?.enemies?.includes(b));
}

module.exports = {
  CLASS_REGIMENTS,
  KINGDOM_ARMIES,
  getKingdomArmy,
  getPersonalRegiment,
  isEnemy,
  listKingdomArmies,
};
