"use strict";

const db = require("../db");

/*
 * Companion system
 * ----------------
 * - Keeps all original companions.
 * - Expands every rarity to a five-companion pool.
 * - Training uses real cumulative XP thresholds instead of deriving
 *   levels from a fixed 250-XP bucket.
 * - Evolution is ten stages, with skills/passives unlocked at stages.
 * - The migration is safe for existing rpg_player_pets rows.
 */

const PETS = {
  // Existing companions — do not remove or rename these IDs.
  moonfox: {
    name: "Moonfox", emoji: "🦊", rarity: "Rare",
    passive: "Moonlit Step: +5% dodge at night.", ability: "Lunar Pounce",
    skills: ["Lunar Pounce", "Moonveil", "Silver Hunt", "Lunar Eclipse"],
  },
  frostfang: {
    name: "Frostfang", emoji: "🐺", rarity: "Epic",
    passive: "Frostbite: can slow enemies.", ability: "Winter Howl",
    skills: ["Winter Howl", "Ice Fang", "Glacial Guard", "Whiteout"],
  },
  emberdrake: {
    name: "Emberdrake", emoji: "🐉", rarity: "Legendary",
    passive: "Cinderblood: fire power rises.", ability: "Inferno Roar",
    skills: ["Inferno Roar", "Cinder Claw", "Dragonfire", "Cataclysm"],
  },
  starling: {
    name: "Starling", emoji: "🪽", rarity: "Celestial",
    passive: "Starlight: improves rare loot.", ability: "Starfall",
    skills: ["Starfall", "Astral Mend", "Comet Wing", "Heaven's Gleam"],
  },
  voidwyrm: {
    name: "Voidwyrm", emoji: "🐲", rarity: "Mythic",
    passive: "Voidborn: resists shadow.", ability: "Rift Maw",
    skills: ["Rift Maw", "Void Pulse", "Null Veil", "Event Horizon"],
  },

  // Common — 5
  mossbun: { name: "Mossbun", emoji: "🐇", rarity: "Common", passive: "Softstep: slightly improves exploration stamina.", ability: "Mossy Hop", skills: ["Mossy Hop", "Burrow", "Herbal Snack", "Meadow Rush"] },
  embermouse: { name: "Embermouse", emoji: "🐭", rarity: "Common", passive: "Warm Paws: small resistance to cold.", ability: "Spark Nip", skills: ["Spark Nip", "Warm Paws", "Kindle", "Tiny Inferno"] },
  pebbletoad: { name: "Pebbletoad", emoji: "🐸", rarity: "Common", passive: "Stone Skin: minor defense bonus.", ability: "Pebble Toss", skills: ["Pebble Toss", "Mud Guard", "Rock Hop", "Boulder Bounce"] },
  cloudchick: { name: "Cloudchick", emoji: "🐤", rarity: "Common", passive: "Featherlight: minor march-speed bonus.", ability: "Cloud Peck", skills: ["Cloud Peck", "Updraft", "Feather Shield", "Sky Sprint"] },
  duskbat: { name: "Duskbat", emoji: "🦇", rarity: "Common", passive: "Keen Echo: slightly improves scouting.", ability: "Echo Bite", skills: ["Echo Bite", "Screech", "Night Dive", "Sonic Veil"] },

  // Rare — 5 total including Moonfox
  thorncat: { name: "Thorncat", emoji: "🐈", rarity: "Rare", passive: "Briar Coat: attackers can be lightly wounded.", ability: "Thorn Swipe", skills: ["Thorn Swipe", "Briar Trap", "Wild Pounce", "Bramble Storm"] },
  tideotter: { name: "Tideotter", emoji: "🦦", rarity: "Rare", passive: "Riverborn: improves water-region travel.", ability: "Tidal Roll", skills: ["Tidal Roll", "Water Veil", "River Rush", "Flood Break"] },
  copperhawk: { name: "Copperhawk", emoji: "🦅", rarity: "Rare", passive: "Hunter's Eye: improves critical chance slightly.", ability: "Copper Dive", skills: ["Copper Dive", "Keen Sight", "Raptor Mark", "Sky Hunter"] },
  glimmerdeer: { name: "Glimmerdeer", emoji: "🦌", rarity: "Rare", passive: "Glimmertrail: improves rare-material discovery.", ability: "Glimmer Dash", skills: ["Glimmer Dash", "Antler Ward", "Forest Grace", "Radiant Charge"] },

  // Epic — 5 total including Frostfang
  runebear: { name: "Runebear", emoji: "🐻", rarity: "Epic", passive: "Runic Hide: strong defense while defending.", ability: "Rune Slam", skills: ["Rune Slam", "Bear Guard", "Runic Roar", "Ancient Crush"] },
  stormlynx: { name: "Stormlynx", emoji: "🐈‍⬛", rarity: "Epic", passive: "Static Fur: chance to shock attackers.", ability: "Thunder Pounce", skills: ["Thunder Pounce", "Static Field", "Storm Step", "Lightning Hunt"] },
  crystalserpent: { name: "Crystal Serpent", emoji: "🐍", rarity: "Epic", passive: "Prism Scale: resists elemental damage.", ability: "Prism Coil", skills: ["Prism Coil", "Crystal Fang", "Prismatic Wall", "Shatterbeam"] },
  ashowl: { name: "Ash Owl", emoji: "🦉", rarity: "Epic", passive: "Ashen Sight: improves night combat.", ability: "Ashen Gaze", skills: ["Ashen Gaze", "Cinder Wing", "Night Watch", "Ashfall"] },

  // Legendary — 5 total including Emberdrake
  ironstag: { name: "Ironstag", emoji: "🫎", rarity: "Legendary", passive: "Iron Antlers: major defense while charging.", ability: "Iron Charge", skills: ["Iron Charge", "Steel Hide", "War Stampede", "Ironwood Crown"] },
  sunphoenix: { name: "Sun Phoenix", emoji: "🔥", rarity: "Legendary", passive: "Solar Heart: improves healing and fire damage.", ability: "Solar Rebirth", skills: ["Solar Rebirth", "Sun Lance", "Phoenix Guard", "Daybreak"] },
  abyssalwyrm: { name: "Abyssal Wyrm", emoji: "🐍", rarity: "Legendary", passive: "Abyssal Scales: resists shadow and poison.", ability: "Abyss Bite", skills: ["Abyss Bite", "Black Tide", "Dread Coil", "Abyssal Maw"] },
  thunderroc: { name: "Thunder Roc", emoji: "🦅", rarity: "Legendary", passive: "Storm Crown: boosts lightning effects.", ability: "Roc Tempest", skills: ["Roc Tempest", "Thunder Talon", "Storm Dive", "Skybreaker"] },

  // Celestial — 5 total including Starling
  moonseraph: { name: "Moon Seraph", emoji: "😇", rarity: "Celestial", passive: "Lunar Grace: improves healing at night.", ability: "Moonlit Grace", skills: ["Moonlit Grace", "Seraphic Ray", "Lunar Ward", "Silver Benediction"] },
  aurorawyrm: { name: "Aurora Wyrm", emoji: "🐉", rarity: "Celestial", passive: "Aurora Scale: elemental effects gain a radiant bonus.", ability: "Aurora Breath", skills: ["Aurora Breath", "Prism Roar", "Aurora Guard", "Polar Crown"] },
  astralstag: { name: "Astral Stag", emoji: "🦌", rarity: "Celestial", passive: "Astral Path: improves travel and discovery.", ability: "Astral Charge", skills: ["Astral Charge", "Starstep", "Cosmic Antlers", "Celestial Rush"] },
  cometfox: { name: "Comet Fox", emoji: "🦊", rarity: "Celestial", passive: "Comet Trail: chance to grant bonus loot after combat.", ability: "Comet Dash", skills: ["Comet Dash", "Meteor Pounce", "Tailflare", "Comet Rain"] },

  // Mythic — 5 total including Voidwyrm
  worldserpent: { name: "World Serpent", emoji: "🐍", rarity: "Mythic", passive: "Worldcoil: massive resistance to control effects.", ability: "Worldbreaker", skills: ["Worldbreaker", "Coil of Ages", "Worldskin", "Final Coil"] },
  eclipsewolf: { name: "Eclipse Wolf", emoji: "🐺", rarity: "Mythic", passive: "Eclipsed Hunt: grows stronger against weakened enemies.", ability: "Eclipse Fang", skills: ["Eclipse Fang", "Shadow Hunt", "Lunar Rend", "Total Eclipse"] },
  chronodrake: { name: "Chronodrake", emoji: "🐉", rarity: "Mythic", passive: "Timebound: small chance to reduce cooldowns.", ability: "Chrono Breath", skills: ["Chrono Breath", "Time Fracture", "Second Wind", "Agebreaker"] },
  heavenlion: { name: "Heaven Lion", emoji: "🦁", rarity: "Mythic", passive: "Divine Roar: boosts allied damage.", ability: "Heaven's Roar", skills: ["Heaven's Roar", "Lionheart", "Divine Pounce", "King of Stars"] },
};

const RARITY_POOLS = Object.fromEntries(
  ["Common", "Rare", "Epic", "Legendary", "Celestial", "Mythic"].map((rarity) => [
    rarity,
    Object.keys(PETS).filter((id) => PETS[id].rarity === rarity),
  ])
);

const EGGS = {
  forest_egg: { name: "Forest Egg", pool: ["mossbun", "duskbat", "thorncat", "glimmerdeer", "moonfox"] },
  common_egg: { name: "Common Egg", pool: RARITY_POOLS.Common },
  rare_egg: { name: "Rare Egg", pool: RARITY_POOLS.Rare },
  frost_egg: { name: "Frost Egg", pool: ["frostfang", "moonfox", "runebear", "stormlynx", "ashowl"] },
  epic_egg: { name: "Epic Egg", pool: RARITY_POOLS.Epic },
  dragon_egg: { name: "Dragon Egg", pool: ["emberdrake", "ironstag", "sunphoenix", "abyssalwyrm", "thunderroc"] },
  legendary_egg: { name: "Legendary Egg", pool: RARITY_POOLS.Legendary },
  celestial_egg: { name: "Celestial Egg", pool: RARITY_POOLS.Celestial },
  mythic_egg: { name: "Mythic Egg", pool: RARITY_POOLS.Mythic },
  void_egg: { name: "Void Egg", pool: ["voidwyrm", "worldserpent", "eclipsewolf", "chronodrake", "heavenlion"] },
};

const MAX_LEVEL = 50;
const MAX_EVOLUTION = 10;
const XP_BASE = 250;

const EVOLUTION_STAGES = [
  { stage: 1, name: "Bonded", unlock: "Base passive" },
  { stage: 2, name: "Awakened", unlock: "Passive upgrade" },
  { stage: 3, name: "Trained", unlock: "Skill I" },
  { stage: 4, name: "Empowered", unlock: "Stat scaling" },
  { stage: 5, name: "Ascended", unlock: "Skill II" },
  { stage: 6, name: "Transcendent", unlock: "Combat modifier" },
  { stage: 7, name: "Exalted", unlock: "Skill III" },
  { stage: 8, name: "Mythic", unlock: "Major passive upgrade" },
  { stage: 9, name: "Divine", unlock: "Ultimate" },
  { stage: 10, name: "Eternal", unlock: "Ultimate enhancement" },
];

function norm(v) {
  return String(v || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function xpForLevel(level) {
  const target = Math.max(1, Math.min(MAX_LEVEL, Number(level) || 1));
  if (target <= 1) return 0;
  // Cumulative XP: 250 for level 2, then progressively larger thresholds.
  return Math.floor(XP_BASE * ((target - 1) * target) / 2);
}

function levelFromXp(xp) {
  const value = Math.max(0, Number(xp) || 0);
  let level = 1;
  while (level < MAX_LEVEL && value >= xpForLevel(level + 1)) level += 1;
  return level;
}

function evolutionRequirement(stage, pet) {
  const rarityIndex = ["Common", "Rare", "Epic", "Legendary", "Celestial", "Mythic"].indexOf(pet.rarity);
  const rarityFactor = Math.max(1, rarityIndex + 1);
  return {
    level: Math.min(MAX_LEVEL, 5 + stage * 3 + rarityIndex * 2),
    xp: 500 + stage * 350 + rarityIndex * 500,
    coins: 500 * stage * rarityFactor,
  };
}

async function ensureSchema() {
  // Safe for existing databases. Older installs only have the original columns.
  await db.query(`
    ALTER TABLE rpg_player_pets
      ADD COLUMN IF NOT EXISTS evolution_stage INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS evolution_xp INTEGER NOT NULL DEFAULT 0
  `);
}

async function list(t, u) {
  await ensureSchema();
  const r = await db.query(
    "SELECT * FROM rpg_player_pets WHERE thread_id=$1 AND user_id=$2 ORDER BY level DESC,pet_id",
    [String(t), String(u)]
  );
  return r.rows;
}

async function hatch(t, u, id) {
  await ensureSchema();
  id = norm(id);
  const e = EGGS[id];
  if (!e) throw new Error("Unknown egg.");
  if (!await db.getRpgItemQuantity(t, u, id)) throw new Error("You do not have that egg.");

  await db.consumeRpgItem(t, u, id, 1);
  const pet = e.pool[Math.floor(Math.random() * e.pool.length)];
  const now = Date.now();

  await db.query(
    `INSERT INTO rpg_player_pets
      (thread_id,user_id,pet_id,name,level,experience,active,obtained_from,obtained_at,updated_at,evolution_stage,evolution_xp)
     VALUES($1,$2,$3,$4,1,0,FALSE,$5,$6,$6,1,0)
     ON CONFLICT(thread_id,user_id,pet_id)
     DO UPDATE SET experience=rpg_player_pets.experience+100,
                   updated_at=EXCLUDED.updated_at`,
    [String(t), String(u), pet, PETS[pet].name, "hatch:" + id, now]
  );
  return PETS[pet];
}

async function activate(t, u, id) {
  await ensureSchema();
  id = norm(id);
  if (!PETS[id]) throw new Error("Unknown companion.");
  const r = await db.query(
    "SELECT id FROM rpg_player_pets WHERE thread_id=$1 AND user_id=$2 AND pet_id=$3",
    [String(t), String(u), id]
  );
  if (!r.rows[0]) throw new Error("You do not own that companion.");
  const now = Date.now();
  await db.query("UPDATE rpg_player_pets SET active=FALSE,updated_at=$1 WHERE thread_id=$2 AND user_id=$3", [now, String(t), String(u)]);
  await db.query("UPDATE rpg_player_pets SET active=TRUE,updated_at=$1 WHERE thread_id=$2 AND user_id=$3 AND pet_id=$4", [now, String(t), String(u), id]);
}

async function train(t, u, id, amount = 1) {
  await ensureSchema();
  id = norm(id);
  if (!PETS[id]) throw new Error("Unknown companion.");
  const count = Math.max(1, Math.min(20, Number(amount) || 1));
  const r = await db.query(
    "SELECT * FROM rpg_player_pets WHERE thread_id=$1 AND user_id=$2 AND pet_id=$3",
    [String(t), String(u), id]
  );
  if (!r.rows[0]) throw new Error("You do not own that companion.");

  const p = r.rows[0];
  const oldXp = Math.max(0, Number(p.experience) || 0);
  const oldLevel = Math.max(1, Number(p.level) || 1);
  const oldStage = Math.max(1, Number(p.evolution_stage) || 1);
  const gained = count * 100;
  const newXp = oldLevel >= MAX_LEVEL ? oldXp : oldXp + gained;
  const newLevel = levelFromXp(newXp);

  await db.query(
    "UPDATE rpg_player_pets SET experience=$1,level=$2,updated_at=$3 WHERE id=$4",
    [newXp, newLevel, Date.now(), p.id]
  );

  return {
    ...PETS[id],
    level: newLevel,
    previousLevel: oldLevel,
    experience: newXp,
    xpGained: oldLevel >= MAX_LEVEL ? 0 : gained,
    xpToNext: newLevel >= MAX_LEVEL ? 0 : Math.max(0, xpForLevel(newLevel + 1) - newXp),
    evolutionStage: oldStage,
    evolutionName: EVOLUTION_STAGES[oldStage - 1].name,
    trained: count,
  };
}

async function evolve(t, u, id) {
  await ensureSchema();
  id = norm(id);
  const pet = PETS[id];
  if (!pet) throw new Error("Unknown companion.");

  const r = await db.query(
    "SELECT * FROM rpg_player_pets WHERE thread_id=$1 AND user_id=$2 AND pet_id=$3",
    [String(t), String(u), id]
  );
  if (!r.rows[0]) throw new Error("You do not own that companion.");

  const row = r.rows[0];
  const current = Math.max(1, Number(row.evolution_stage) || 1);
  if (current >= MAX_EVOLUTION) throw new Error("This companion has reached Eternal Stage X.");

  const nextStage = current + 1;
  const req = evolutionRequirement(nextStage, pet);
  const level = Math.max(1, Number(row.level) || 1);
  const xp = Math.max(0, Number(row.experience) || 0);
  if (level < req.level) throw new Error(`Requires companion level ${req.level}. Current: ${level}.`);
  if (xp < req.xp) throw new Error(`Requires ${req.xp.toLocaleString()} total companion XP. Current: ${xp.toLocaleString()}.`);

  const cost = req.coins;
  if (typeof db.spendBalance === "function") {
    await db.spendBalance(t, u, cost, `Companion evolution: ${pet.name} Stage ${nextStage}`);
  } else {
    throw new Error("Economy integration is unavailable; evolution was not applied.");
  }

  const now = Date.now();
  await db.query(
    "UPDATE rpg_player_pets SET evolution_stage=$1,evolution_xp=$2,updated_at=$3 WHERE id=$4",
    [nextStage, xp, now, row.id]
  );

  return {
    ...pet,
    level,
    experience: xp,
    evolutionStage: nextStage,
    evolutionName: EVOLUTION_STAGES[nextStage - 1].name,
    unlocked: EVOLUTION_STAGES[nextStage - 1].unlock,
    cost,
    skill: pet.skills?.[Math.min(3, Math.floor((nextStage - 1) / 2))] || pet.ability,
  };
}

function format(rows) {
  if (!rows.length) return "🐾 No companions yet.\nFind an egg, then use !rpg companion hatch <egg>.";
  return rows.map((p) => {
    const d = PETS[p.pet_id] || {};
    const level = Math.max(1, Number(p.level) || 1);
    const xp = Math.max(0, Number(p.experience) || 0);
    const stage = Math.max(1, Math.min(MAX_EVOLUTION, Number(p.evolution_stage) || 1));
    const next = level >= MAX_LEVEL ? "MAX" : `${Math.max(0, xpForLevel(level + 1) - xp)} XP to next`;
    const skillIndex = Math.min(3, Math.floor((stage - 1) / 2));
    return (p.active ? "⭐ " : "") +
      (d.emoji || "🐾") + " " + (d.name || p.pet_id) +
      " · " + (d.rarity || "Common") +
      ` · Lv.${level} · Stage ${stage} ${EVOLUTION_STAGES[stage - 1].name}` +
      `\n   XP: ${xp.toLocaleString()} (${next})` +
      `\n   ${d.passive || ""}` +
      `\n   Skill: ${(d.skills || [d.ability || "Unknown"])[skillIndex] || d.ability || "Unknown"}`;
  }).join("\n\n");
}

function get(id) {
  return PETS[norm(id)] || null;
}

function getEvolutionStages() {
  return EVOLUTION_STAGES.slice();
}

function getEggs() {
  return EGGS;
}

module.exports = {
  PETS,
  EGGS,
  RARITY_POOLS,
  EVOLUTION_STAGES,
  MAX_LEVEL,
  MAX_EVOLUTION,
  xpForLevel,
  levelFromXp,
  get,
  getEggs,
  getEvolutionStages,
  list,
  hatch,
  activate,
  train,
  evolve,
  format,
};
