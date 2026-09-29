"use strict";

const db = require("../db");
const { grantLoot } = require("./loot");

const BOSSES = {
  ashen_dragon: { name: "Ashen Dragon", emoji: "🐉", hp: 2500000, material: "dragon_heart", reward: 25000, eventIds: [] },
  eclipse_wraith: { name: "Eclipse Wraith", emoji: "🌑", hp: 2800000, material: "eclipse_shard", reward: 32000, eventIds: ["eclipse"] },
  lord_of_the_hollow: { name: "Lord of the Hollow", emoji: "👑", hp: 3600000, material: "hollow_core", reward: 45000, eventIds: ["eclipse"] },
  meteor_titan: { name: "Meteor Titan", emoji: "☄️", hp: 4200000, material: "meteor_core", reward: 52000, eventIds: ["meteor_shower"] },
  starforged_drake: { name: "Starforged Drake", emoji: "🐲", hp: 3300000, material: "starforged_scale", reward: 42000, eventIds: ["meteor_shower"] },
  infernal_colossus: { name: "Infernal Colossus", emoji: "🌋", hp: 5000000, material: "infernal_core", reward: 60000, eventIds: ["volcanic_eruption"] },
  elder_ash_drake: { name: "Elder Ash Drake", emoji: "🔥", hp: 4400000, material: "ash_dragon_heart", reward: 54000, eventIds: ["volcanic_eruption"] },
  frost_queen: { name: "Frost Queen", emoji: "❄️", hp: 3800000, material: "frost_crown", reward: 48000, eventIds: ["eternal_winter"] },
  eternal_wyrm: { name: "Eternal Wyrm", emoji: "🐉", hp: 4700000, material: "eternal_ice_core", reward: 58000, eventIds: ["eternal_winter"] },
  worldroot_guardian: { name: "Worldroot Guardian", emoji: "🌳", hp: 4000000, material: "worldroot_heart", reward: 50000, eventIds: ["world_bloom"] },
  elder_treant: { name: "Elder Treant", emoji: "🌲", hp: 3400000, material: "ancient_bark", reward: 40000, eventIds: ["world_bloom"] },
  solar_seraph: { name: "Solar Seraph", emoji: "☀️", hp: 2000000, material: "celestial_core", reward: 30000, eventIds: ["solar_blessing"] },
  fallen_sunlord: { name: "Fallen Sunlord", emoji: "🌞", hp: 3600000, material: "sunshard", reward: 45000, eventIds: ["solar_blessing"] },
  abyssal_lord: { name: "Abyssal Lord", emoji: "👁️", hp: 3500000, material: "void_crystal", reward: 40000, eventIds: ["abyssal_rift"] },
  void_reaper: { name: "Void Reaper", emoji: "🗡️", hp: 3000000, material: "celestial_shard", reward: 35000, eventIds: ["abyssal_rift"] },
};

function normalizeBossId(id) {
  return String(id || "").trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
}

function getBoss(id) { return BOSSES[normalizeBossId(id)] || null; }
function getAllBosses() { return Object.entries(BOSSES).map(([id, boss]) => ({ id, ...boss })); }

async function active(t) {
  const r = await db.query("SELECT * FROM rpg_world_bosses WHERE thread_id=$1 AND status='active' AND expires_at>$2 ORDER BY created_at DESC LIMIT 1", [String(t), Date.now()]);
  return r.rows[0] || null;
}

async function summon(t, id, admin) {
  const bossId = normalizeBossId(id);
  const boss = getBoss(bossId);
  if (!boss) throw new Error("Unknown world boss. Use !rpg special bosses to list valid IDs.");
  if (await active(t)) throw new Error("A world boss is already active.");
  const now = Date.now();
  const r = await db.query(`INSERT INTO rpg_world_bosses(thread_id,boss_id,hp,max_hp,phase,status,created_at,expires_at,summoned_by) VALUES($1,$2,$3,$3,1,'active',$4,$5,$6) RETURNING *`, [String(t), bossId, boss.hp, now, now + 30 * 60 * 1000, String(admin)]);
  return { ...r.rows[0], boss: { id: bossId, ...boss } };
}

async function attack(t, u) {
  const s = await active(t);
  if (!s) throw new Error("No world boss is active.");
  const boss = getBoss(s.boss_id);
  if (!boss) throw new Error("The active world boss is no longer registered.");
  const p = (await db.query("SELECT * FROM rpg_players WHERE thread_id=$1 AND user_id=$2", [String(t), String(u)])).rows[0];
  if (!p) throw new Error("Start your RPG profile first.");
  const prior = (await db.query("SELECT last_attack_at FROM rpg_world_boss_participants WHERE boss_id=$1 AND user_id=$2", [s.id, String(u)])).rows[0];
  if (prior && prior.last_attack_at && Date.now() - Number(prior.last_attack_at) < 10000) throw new Error("Your world-boss attack is on cooldown. Wait 10 seconds.");
  const damage = Math.floor(Math.max(50, Number(p.strength)*8 + Number(p.agility)*3 + Math.random()*120) * (1 + Number(s.phase)*0.18));
  const hp = Math.max(0, Number(s.hp) - damage);
  const phase = hp <= Number(s.max_hp)*0.35 ? 3 : hp <= Number(s.max_hp)*0.70 ? 2 : 1;
  await db.query(`INSERT INTO rpg_world_boss_participants(boss_id,thread_id,user_id,damage_dealt,attacks,last_attack_at) VALUES($1,$2,$3,$4,1,$5) ON CONFLICT(boss_id,user_id) DO UPDATE SET damage_dealt=rpg_world_boss_participants.damage_dealt+$4,attacks=rpg_world_boss_participants.attacks+1,last_attack_at=$5`, [s.id,String(t),String(u),damage,Date.now()]);
  await db.query(`UPDATE rpg_world_bosses SET hp=$1,phase=$2,status=CASE WHEN $1<=0 THEN 'defeated' ELSE status END,updated_at=$3 WHERE id=$4`, [hp,phase,Date.now(),s.id]);
  if (hp <= 0) {
    const rows = await db.query("SELECT * FROM rpg_world_boss_participants WHERE boss_id=$1", [s.id]);
    for (const participant of rows.rows) {
      const reward = Math.max(100, Math.floor(Number(boss.reward) * Number(participant.damage_dealt) / Number(s.max_hp)));
      await db.addBalance(t, participant.user_id, reward, "RPG world boss reward");
      await db.addRpgItem(t, participant.user_id, boss.material, 1);
      await grantLoot(t, participant.user_id, { context: "world_boss", rolls: 1 });
    }
  }
  return { boss: { id: s.boss_id, ...boss }, damage, hp, phase, defeated: hp <= 0 };
}

async function status(t) {
  const s = await active(t);
  if (!s) return null;
  const boss = getBoss(s.boss_id);
  const rows = await db.query("SELECT user_id,damage_dealt,attacks FROM rpg_world_boss_participants WHERE boss_id=$1 ORDER BY damage_dealt DESC LIMIT 10", [s.id]);
  return { state: s, boss, leaders: rows.rows };
}

module.exports = { BOSSES, normalizeBossId, getBoss, getAllBosses, active, summon, attack, status };