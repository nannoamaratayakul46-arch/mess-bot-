"use strict";

const db = require("../db");

const PETS = {
  moonfox:{name:"Moonfox",emoji:"🦊",rarity:"Rare",passive:"Moonlit Step: +5% dodge at night.",ability:"Lunar Pounce",skills:["Lunar Pounce","Moonveil","Silver Hunt","Lunar Eclipse"]},
  frostfang:{name:"Frostfang",emoji:"🐺",rarity:"Epic",passive:"Frostbite: can slow enemies.",ability:"Winter Howl",skills:["Winter Howl","Ice Fang","Glacial Guard","Whiteout"]},
  emberdrake:{name:"Emberdrake",emoji:"🐉",rarity:"Legendary",passive:"Cinderblood: fire power rises.",ability:"Inferno Roar",skills:["Inferno Roar","Cinder Claw","Dragonfire","Cataclysm"]},
  starling:{name:"Starling",emoji:"🪽",rarity:"Celestial",passive:"Starlight: improves rare loot.",ability:"Starfall",skills:["Starfall","Astral Mend","Comet Wing","Heaven's Gleam"]},
  voidwyrm:{name:"Voidwyrm",emoji:"🐲",rarity:"Mythic",passive:"Voidborn: resists shadow.",ability:"Rift Maw",skills:["Rift Maw","Void Pulse","Null Veil","Event Horizon"]},

  mossbun:{name:"Mossbun",emoji:"🐇",rarity:"Common",passive:"Softstep: improves exploration stamina.",ability:"Mossy Hop",skills:["Mossy Hop","Burrow","Herbal Snack","Meadow Rush"]},
  embermouse:{name:"Embermouse",emoji:"🐭",rarity:"Common",passive:"Warm Paws: small resistance to cold.",ability:"Spark Nip",skills:["Spark Nip","Warm Paws","Kindle","Tiny Inferno"]},
  pebbletoad:{name:"Pebbletoad",emoji:"🐸",rarity:"Common",passive:"Stone Skin: minor defense bonus.",ability:"Pebble Toss",skills:["Pebble Toss","Mud Guard","Rock Hop","Boulder Bounce"]},
  cloudchick:{name:"Cloudchick",emoji:"🐤",rarity:"Common",passive:"Featherlight: minor march-speed bonus.",ability:"Cloud Peck",skills:["Cloud Peck","Updraft","Feather Shield","Sky Sprint"]},
  duskbat:{name:"Duskbat",emoji:"🦇",rarity:"Common",passive:"Keen Echo: improves scouting.",ability:"Echo Bite",skills:["Echo Bite","Screech","Night Dive","Sonic Veil"]},

  thorncat:{name:"Thorncat",emoji:"🐈",rarity:"Rare",passive:"Briar Coat: attackers can be lightly wounded.",ability:"Thorn Swipe",skills:["Thorn Swipe","Briar Trap","Wild Pounce","Bramble Storm"]},
  tideotter:{name:"Tideotter",emoji:"🦦",rarity:"Rare",passive:"Riverborn: improves water-region travel.",ability:"Tidal Roll",skills:["Tidal Roll","Water Veil","River Rush","Flood Break"]},
  copperhawk:{name:"Copperhawk",emoji:"🦅",rarity:"Rare",passive:"Hunter's Eye: improves critical chance.",ability:"Copper Dive",skills:["Copper Dive","Keen Sight","Raptor Mark","Sky Hunter"]},
  glimmerdeer:{name:"Glimmerdeer",emoji:"🦌",rarity:"Rare",passive:"Glimmertrail: improves rare-material discovery.",ability:"Glimmer Dash",skills:["Glimmer Dash","Antler Ward","Forest Grace","Radiant Charge"]},

  runebear:{name:"Runebear",emoji:"🐻",rarity:"Epic",passive:"Runic Hide: stronger defense while defending.",ability:"Rune Slam",skills:["Rune Slam","Bear Guard","Runic Roar","Ancient Crush"]},
  stormlynx:{name:"Stormlynx",emoji:"🐈‍⬛",rarity:"Epic",passive:"Static Fur: chance to shock attackers.",ability:"Thunder Pounce",skills:["Thunder Pounce","Static Field","Storm Step","Lightning Hunt"]},
  crystalserpent:{name:"Crystal Serpent",emoji:"🐍",rarity:"Epic",passive:"Prism Scale: resists elemental damage.",ability:"Prism Coil",skills:["Prism Coil","Crystal Fang","Prismatic Wall","Shatterbeam"]},
  ashowl:{name:"Ash Owl",emoji:"🦉",rarity:"Epic",passive:"Ashen Sight: improves night combat.",ability:"Ashen Gaze",skills:["Ashen Gaze","Cinder Wing","Night Watch","Ashfall"]},

  ironstag:{name:"Ironstag",emoji:"🫎",rarity:"Legendary",passive:"Iron Antlers: major defense while charging.",ability:"Iron Charge",skills:["Iron Charge","Steel Hide","War Stampede","Ironwood Crown"]},
  sunphoenix:{name:"Sun Phoenix",emoji:"🔥",rarity:"Legendary",passive:"Solar Heart: improves healing and fire damage.",ability:"Solar Rebirth",skills:["Solar Rebirth","Sun Lance","Phoenix Guard","Daybreak"]},
  abyssalwyrm:{name:"Abyssal Wyrm",emoji:"🐍",rarity:"Legendary",passive:"Abyssal Scales: resists shadow and poison.",ability:"Abyss Bite",skills:["Abyss Bite","Black Tide","Dread Coil","Abyssal Maw"]},
  thunderroc:{name:"Thunder Roc",emoji:"🦅",rarity:"Legendary",passive:"Storm Crown: boosts lightning effects.",ability:"Roc Tempest",skills:["Roc Tempest","Thunder Talon","Storm Dive","Skybreaker"]},

  moonseraph:{name:"Moon Seraph",emoji:"😇",rarity:"Celestial",passive:"Lunar Grace: improves healing at night.",ability:"Moonlit Grace",skills:["Moonlit Grace","Seraphic Ray","Lunar Ward","Silver Benediction"]},
  aurorawyrm:{name:"Aurora Wyrm",emoji:"🐉",rarity:"Celestial",passive:"Aurora Scale: elemental effects gain a radiant bonus.",ability:"Aurora Breath",skills:["Aurora Breath","Prism Roar","Aurora Guard","Polar Crown"]},
  astralstag:{name:"Astral Stag",emoji:"🦌",rarity:"Celestial",passive:"Astral Path: improves travel and discovery.",ability:"Astral Charge",skills:["Astral Charge","Starstep","Cosmic Antlers","Celestial Rush"]},
  cometfox:{name:"Comet Fox",emoji:"🦊",rarity:"Celestial",passive:"Comet Trail: chance to grant bonus loot after combat.",ability:"Comet Dash",skills:["Comet Dash","Meteor Pounce","Tailflare","Comet Rain"]},

  worldserpent:{name:"World Serpent",emoji:"🐍",rarity:"Mythic",passive:"Worldcoil: massive resistance to control effects.",ability:"Worldbreaker",skills:["Worldbreaker","Coil of Ages","Worldskin","Final Coil"]},
  eclipsewolf:{name:"Eclipse Wolf",emoji:"🐺",rarity:"Mythic",passive:"Eclipsed Hunt: grows stronger against weakened enemies.",ability:"Eclipse Fang",skills:["Eclipse Fang","Shadow Hunt","Lunar Rend","Total Eclipse"]},
  chronodrake:{name:"Chronodrake",emoji:"🐉",rarity:"Mythic",passive:"Timebound: small chance to reduce cooldowns.",ability:"Chrono Breath",skills:["Chrono Breath","Time Fracture","Second Wind","Agebreaker"]},
  heavenlion:{name:"Heaven Lion",emoji:"🦁",rarity:"Mythic",passive:"Divine Roar: boosts allied damage.",ability:"Heaven's Roar",skills:["Heaven's Roar","Lionheart","Divine Pounce","King of Stars"]},
};

const RARITIES=["Common","Rare","Epic","Legendary","Celestial","Mythic"];
const RARITY_POOLS=Object.fromEntries(RARITIES.map(r=>[r,Object.keys(PETS).filter(id=>PETS[id].rarity===r)]));
const EGGS={
  forest_egg:{name:"Forest Egg",pool:["mossbun","duskbat","thorncat","glimmerdeer","moonfox"]},
  common_egg:{name:"Common Egg",pool:RARITY_POOLS.Common},
  rare_egg:{name:"Rare Egg",pool:RARITY_POOLS.Rare},
  frost_egg:{name:"Frost Egg",pool:["frostfang","moonfox","runebear","stormlynx","ashowl"]},
  epic_egg:{name:"Epic Egg",pool:RARITY_POOLS.Epic},
  dragon_egg:{name:"Dragon Egg",pool:["emberdrake","ironstag","sunphoenix","abyssalwyrm","thunderroc"]},
  legendary_egg:{name:"Legendary Egg",pool:RARITY_POOLS.Legendary},
  celestial_egg:{name:"Celestial Egg",pool:RARITY_POOLS.Celestial},
  mythic_egg:{name:"Mythic Egg",pool:RARITY_POOLS.Mythic},
  void_egg:{name:"Void Egg",pool:["voidwyrm","worldserpent","eclipsewolf","chronodrake","heavenlion"]},
};

const MAX_LEVEL=50;
const MAX_EVOLUTION=10;
const XP_PER_TRAIN=100;
const XP_BASE=250;
const EVOLUTION_STAGES=[
  {stage:1,name:"Bonded",unlock:"Base passive"},
  {stage:2,name:"Awakened",unlock:"Passive upgrade"},
  {stage:3,name:"Trained",unlock:"Skill I"},
  {stage:4,name:"Empowered",unlock:"Stat scaling"},
  {stage:5,name:"Ascended",unlock:"Skill II"},
  {stage:6,name:"Transcendent",unlock:"Combat modifier"},
  {stage:7,name:"Exalted",unlock:"Skill III"},
  {stage:8,name:"Mythic",unlock:"Major passive upgrade"},
  {stage:9,name:"Divine",unlock:"Ultimate"},
  {stage:10,name:"Eternal",unlock:"Ultimate enhancement"},
];

function norm(v){return String(v||"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"_");}
function xpForLevel(level){const l=Math.max(1,Math.min(MAX_LEVEL,Number(level)||1));return l<=1?0:Math.floor(XP_BASE*((l-1)*l)/2);}
function levelFromXp(xp){let l=1;const value=Math.max(0,Number(xp)||0);while(l<MAX_LEVEL&&value>=xpForLevel(l+1))l++;return l;}

async function ensureSchema(){
  await db.query(`ALTER TABLE rpg_player_pets
    ADD COLUMN IF NOT EXISTS evolution_stage INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS evolution_xp INTEGER NOT NULL DEFAULT 0`);
}

async function list(t,u){
  await ensureSchema();
  const r=await db.query("SELECT * FROM rpg_player_pets WHERE thread_id=$1 AND user_id=$2 ORDER BY level DESC,pet_id",[String(t),String(u)]);
  return r.rows;
}

async function hatch(t,u,id){
  await ensureSchema();
  id=norm(id);const e=EGGS[id];if(!e)throw new Error("Unknown egg.");
  if(await db.getRpgItemQuantity(t,u,id)<1)throw new Error("You do not have that egg.");
  await db.consumeRpgItem(t,u,id,1);
  const pet=e.pool[Math.floor(Math.random()*e.pool.length)],now=Date.now();

  try {
    await db.query(`INSERT INTO rpg_player_pets(thread_id,user_id,pet_id,name,level,experience,active,obtained_from,obtained_at,updated_at,evolution_stage,evolution_xp)
      VALUES($1,$2,$3,$4,1,0,FALSE,$5,$6,$6,1,0)
      ON CONFLICT(thread_id,user_id,pet_id) DO UPDATE SET experience=rpg_player_pets.experience+100,level=LEAST(${MAX_LEVEL},rpg_player_pets.level+CASE WHEN rpg_player_pets.experience+100>=${XP_BASE}*rpg_player_pets.level*(rpg_player_pets.level+1)/2 THEN 1 ELSE 0 END),updated_at=EXCLUDED.updated_at`,[String(t),String(u),pet,PETS[pet].name,"hatch:"+id,now]);
  } catch (error) {
    // Never burn an egg when pet creation fails.
    await db.addRpgItem(t,u,id,1);
    throw error;
  }

  return PETS[pet];
}

async function activate(t,u,id){
  await ensureSchema();id=norm(id);if(!PETS[id])throw new Error("Unknown companion.");
  const r=await db.query("SELECT id FROM rpg_player_pets WHERE thread_id=$1 AND user_id=$2 AND pet_id=$3",[String(t),String(u),id]);
  if(!r.rows[0])throw new Error("You do not own that companion.");
  const now=Date.now();
  await db.query("UPDATE rpg_player_pets SET active=FALSE,updated_at=$1 WHERE thread_id=$2 AND user_id=$3",[now,String(t),String(u)]);
  await db.query("UPDATE rpg_player_pets SET active=TRUE,updated_at=$1 WHERE thread_id=$2 AND user_id=$3 AND pet_id=$4",[now,String(t),String(u),id]);
}

async function train(t,u,id,amount=1){
  await ensureSchema();id=norm(id);if(!PETS[id])throw new Error("Unknown companion.");
  const count=Math.max(1,Math.min(20,Number(amount)||1));
  const r=await db.query("SELECT * FROM rpg_player_pets WHERE thread_id=$1 AND user_id=$2 AND pet_id=$3",[String(t),String(u),id]);
  if(!r.rows[0])throw new Error("You do not own that companion.");
  const p=r.rows[0],oldXp=Math.max(0,Number(p.experience)||0),oldLevel=Math.max(1,Number(p.level)||1),stage=Math.max(1,Math.min(MAX_EVOLUTION,Number(p.evolution_stage)||1));
  const gained=oldLevel>=MAX_LEVEL?0:count*XP_PER_TRAIN;
  const newXp=oldXp+gained,newLevel=levelFromXp(newXp);
  await db.query("UPDATE rpg_player_pets SET experience=$1,level=$2,updated_at=$3 WHERE id=$4",[newXp,newLevel,Date.now(),p.id]);
  return {...PETS[id],level:newLevel,previousLevel:oldLevel,experience:newXp,xpGained:gained,xpToNext:newLevel>=MAX_LEVEL?0:Math.max(0,xpForLevel(newLevel+1)-newXp),evolutionStage:stage,evolutionName:EVOLUTION_STAGES[stage-1].name,trained:count,leveledUp:newLevel>oldLevel};
}

function evolutionRequirement(stage,pet){const ri=Math.max(0,RARITIES.indexOf(pet.rarity));return{level:Math.min(MAX_LEVEL,5+stage*3+ri*2),xp:500+stage*350+ri*500,coins:500*stage*(ri+1)};}

async function evolve(t,u,id){
  await ensureSchema();id=norm(id);const pet=PETS[id];if(!pet)throw new Error("Unknown companion.");
  const r=await db.query("SELECT * FROM rpg_player_pets WHERE thread_id=$1 AND user_id=$2 AND pet_id=$3",[String(t),String(u),id]);
  if(!r.rows[0])throw new Error("You do not own that companion.");
  const row=r.rows[0],current=Math.max(1,Math.min(MAX_EVOLUTION,Number(row.evolution_stage)||1));
  if(current>=MAX_EVOLUTION)throw new Error("This companion has reached Eternal Stage X.");
  const next=current+1,req=evolutionRequirement(next,pet),level=Math.max(1,Number(row.level)||1),xp=Math.max(0,Number(row.experience)||0);
  if(level<req.level)throw new Error(`Requires companion level ${req.level}. Current: ${level}.`);
  if(xp<req.xp)throw new Error(`Requires ${req.xp.toLocaleString()} total companion XP. Current: ${xp.toLocaleString()}.`);
  await db.spendBalance(t,u,req.coins,`Companion evolution: ${pet.name} Stage ${next}`);

  const updated = await db.query(
    "UPDATE rpg_player_pets SET evolution_stage=$1,evolution_xp=$2,updated_at=$3 WHERE id=$4 AND evolution_stage=$5",
    [next,xp,Date.now(),row.id,current]
  );

  if (updated.rowCount !== 1) {
    await db.addBalance(t,u,req.coins,`Refund: concurrent companion evolution ${pet.name} Stage ${next}`);
    throw new Error("Companion evolution was already completed by another request. Your coins were refunded.");
  }

  return {...pet,level,experience:xp,evolutionStage:next,evolutionName:EVOLUTION_STAGES[next-1].name,unlocked:EVOLUTION_STAGES[next-1].unlock,cost:req.coins,skill:pet.skills?.[Math.min(3,Math.floor((next-1)/2))]||pet.ability};
}

function format(rows){
  if(!rows.length)return "🐾 No companions yet.\nFind an egg, then use !rpg companion hatch <egg>.";
  return rows.map(p=>{const d=PETS[p.pet_id]||{},level=Math.max(1,Number(p.level)||1),xp=Math.max(0,Number(p.experience)||0),stage=Math.max(1,Math.min(MAX_EVOLUTION,Number(p.evolution_stage)||1)),next=level>=MAX_LEVEL?"MAX":`${Math.max(0,xpForLevel(level+1)-xp)} XP to next`,skillIndex=Math.min(3,Math.floor((stage-1)/2));return(p.active?"⭐ ":"")+(d.emoji||"🐾")+" "+(d.name||p.pet_id)+" · "+(d.rarity||"Common")+` · Lv.${level} · Stage ${stage} ${EVOLUTION_STAGES[stage-1].name}`+`\n   XP: ${xp.toLocaleString()} (${next})`+`\n   ${d.passive||""}`+`\n   Skill: ${(d.skills||[d.ability||"Unknown"])[skillIndex]||d.ability||"Unknown"}`;}).join("\n\n");
}

function get(id){return PETS[norm(id)]||null;}
function getEvolutionStages(){return EVOLUTION_STAGES.slice();}
function getEggs(){return EGGS;}

module.exports={PETS,EGGS,RARITY_POOLS,EVOLUTION_STAGES,MAX_LEVEL,MAX_EVOLUTION,xpForLevel,levelFromXp,get,getEggs,getEvolutionStages,list,hatch,activate,train,evolve,format};
