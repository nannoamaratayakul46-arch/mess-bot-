"use strict";
const db=require("../db");
const { grantLoot } = require("./loot");
const GUILD_COST=5000, MAX_LEVEL=20;
const UPGRADE_COSTS={armory:2500,stable:3500,blacksmith:5000,vault:3000,quest_board:4500};
function norm(v){return String(v||"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");}
function levelForXp(x){let l=1,n=1000;while(l<MAX_LEVEL&&x>=n){l++;n+=l*1000;}return l;}
async function getGuild(t,u){const r=await db.query("SELECT g.*,gm.role member_role FROM rpg_guild_members gm JOIN rpg_guilds g ON g.id=gm.guild_id WHERE gm.thread_id=$1 AND gm.user_id=$2 LIMIT 1",[String(t),String(u)]);return r.rows[0]||null;}
async function createGuild(t,u,name){
  const thread=String(t),user=String(u);
  if(await getGuild(thread,user))throw new Error("You are already in a guild.");
  name=String(name||"").trim();
  if(name.length<2||name.length>32)throw new Error("Guild names must be 2–32 characters.");
  const id=norm(name);
  const q=await db.query("SELECT 1 FROM rpg_guilds WHERE thread_id=$1 AND guild_id=$2",[thread,id]);
  if(q.rows[0])throw new Error("That guild already exists.");
  return db.withTransaction(async(client)=>{
    const wallet=await client.query("SELECT balance FROM users WHERE thread_id=$1 AND user_id=$2 FOR UPDATE",[thread,user]);
    if(!wallet.rows[0])throw new Error("User not found.");
    if(Number(wallet.rows[0].balance)<GUILD_COST)throw new Error("Not enough wallet coins.");
    await client.query("UPDATE users SET balance=balance-$3 WHERE thread_id=$1 AND user_id=$2",[thread,user,GUILD_COST]);
    await client.query("INSERT INTO economy_transactions(thread_id,user_id,type,amount,description,created_at) VALUES($1,$2,'rpg_spend',$3,$4,$5)",[thread,user,GUILD_COST,"RPG guild creation",Date.now()]);
    const now=Date.now();
    const r=await client.query("INSERT INTO rpg_guilds(thread_id,guild_id,name,founder_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$5) RETURNING *",[thread,id,name,user,now]);
    await client.query("INSERT INTO rpg_guild_members(guild_id,thread_id,user_id,role,joined_at) VALUES($1,$2,$3,'master',$4)",[r.rows[0].id,thread,user,now]);
    return r.rows[0];
  });
}
async function invite(t,u,target){const g=await getGuild(t,u);if(!g||!["master","officer"].includes(g.member_role))throw new Error("Only Guild Masters and Officers can invite.");if(await getGuild(t,target))throw new Error("That player is already in a guild.");await db.query("INSERT INTO rpg_guild_invites(guild_id,thread_id,user_id,invited_by,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(guild_id,user_id) DO UPDATE SET invited_by=EXCLUDED.invited_by,created_at=EXCLUDED.created_at",[g.id,String(t),String(target),String(u),Date.now()]);}
async function join(t,u){if(await getGuild(t,u))throw new Error("You are already in a guild.");const r=await db.query("SELECT i.*,g.name,g.guild_id FROM rpg_guild_invites i JOIN rpg_guilds g ON g.id=i.guild_id WHERE i.thread_id=$1 AND i.user_id=$2 ORDER BY i.created_at DESC LIMIT 1",[String(t),String(u)]);if(!r.rows[0])throw new Error("You have no pending guild invite.");const x=r.rows[0],g=await db.query("SELECT id FROM rpg_guilds WHERE thread_id=$1 AND guild_id=$2",[String(t),x.guild_id]);if(!g.rows[0])throw new Error("That guild no longer exists.");await db.query("INSERT INTO rpg_guild_members(guild_id,thread_id,user_id,role,joined_at) VALUES($1,$2,$3,'recruit',$4)",[g.rows[0].id,String(t),String(u),Date.now()]);await db.query("DELETE FROM rpg_guild_invites WHERE guild_id=$1 AND user_id=$2",[g.rows[0].id,String(u)]);return x;}
async function leave(t,u){const g=await getGuild(t,u);if(!g)throw new Error("You are not in a guild.");if(g.member_role==="master"){const r=await db.query("SELECT user_id FROM rpg_guild_members WHERE guild_id=$1 AND user_id<>$2 ORDER BY joined_at LIMIT 1",[g.id,String(u)]);if(r.rows[0])await db.query("UPDATE rpg_guild_members SET role='master' WHERE guild_id=$1 AND user_id=$2",[g.id,r.rows[0].user_id]);else{await db.query("DELETE FROM rpg_guilds WHERE id=$1",[g.id]);return;}}await db.query("DELETE FROM rpg_guild_members WHERE guild_id=$1 AND user_id=$2",[g.id,String(u)]);}
async function members(t,u){const g=await getGuild(t,u);if(!g)return [];const r=await db.query("SELECT gm.user_id,gm.role,u.display_name FROM rpg_guild_members gm LEFT JOIN users u ON u.thread_id=gm.thread_id AND u.user_id=gm.user_id WHERE gm.guild_id=$1 ORDER BY gm.joined_at",[g.id]);return r.rows;}
async function donate(t,u,n){
  n=Math.floor(Number(n));
  if(!Number.isFinite(n)||n<=0)throw new Error("Enter a valid donation.");
  const thread=String(t),user=String(u),g=await getGuild(thread,user);
  if(!g)throw new Error("You are not in a guild.");
  const xp=Math.floor(n/10),lvl=levelForXp(Number(g.experience)+xp),now=Date.now();
  await db.withTransaction(async(client)=>{
    const wallet=await client.query("SELECT balance FROM users WHERE thread_id=$1 AND user_id=$2 FOR UPDATE",[thread,user]);
    if(!wallet.rows[0])throw new Error("User not found.");
    if(Number(wallet.rows[0].balance)<n)throw new Error("Not enough wallet coins.");
    await client.query("UPDATE users SET balance=balance-$3 WHERE thread_id=$1 AND user_id=$2",[thread,user,n]);
    await client.query("INSERT INTO economy_transactions(thread_id,user_id,type,amount,description,created_at) VALUES($1,$2,'rpg_spend',$3,$4,$5)",[thread,user,n,"RPG guild treasury donation",now]);
    const updated=await client.query("UPDATE rpg_guilds SET treasury=treasury+$1,experience=experience+$2,level=$3,updated_at=$4 WHERE id=$5",[n,xp,lvl,now,g.id]);
    if(!updated.rowCount)throw new Error("Guild no longer exists.");
  });
}
async function upgrade(t,u,key){
  key=norm(key);
  const cost=UPGRADE_COSTS[key];
  if(!cost)throw new Error("Unknown guild upgrade.");
  const thread=String(t),user=String(u),g=await getGuild(thread,user);
  if(!g||!["master","officer"].includes(g.member_role))throw new Error("Only guild leadership can upgrade.");
  const now=Date.now();
  await db.withTransaction(async(client)=>{
    const locked=await client.query("SELECT treasury FROM rpg_guilds WHERE id=$1 FOR UPDATE",[g.id]);
    if(!locked.rows[0])throw new Error("Guild no longer exists.");
    if(Number(locked.rows[0].treasury)<cost)throw new Error("Not enough guild treasury.");
    await client.query("UPDATE rpg_guilds SET treasury=treasury-$1,updated_at=$2 WHERE id=$3",[cost,now,g.id]);
    await client.query("INSERT INTO rpg_guild_upgrades(guild_id,upgrade_key,level,updated_at) VALUES($1,$2,1,$3) ON CONFLICT(guild_id,upgrade_key) DO UPDATE SET level=rpg_guild_upgrades.level+1,updated_at=EXCLUDED.updated_at",[g.id,key,now]);
  });
}
async function format(t,u){const g=await getGuild(t,u);if(!g)return "🏰 You are not in a guild.\nUse !rpg guild create <name>.";const m=await members(t,u),q=await db.query("SELECT upgrade_key,level FROM rpg_guild_upgrades WHERE guild_id=$1 ORDER BY upgrade_key",[g.id]);return ["🏰 "+g.name,"Level "+g.level+" · XP "+g.experience,"💰 Treasury: "+Number(g.treasury).toLocaleString(),"👥 Members: "+m.length,"","🏛️ Upgrades:",...(q.rows.length?q.rows.map(x=>"• "+x.upgrade_key+" Lv."+x.level):["• None"]),"","!rpg guild members","!rpg guild donate <amount>","!rpg guild upgrade <upgrade>"].join("\n");}
async function hall(t,u){const g=await getGuild(t,u);if(!g)return null;const q=await db.query("SELECT upgrade_key,level FROM rpg_guild_upgrades WHERE guild_id=$1 ORDER BY upgrade_key",[g.id]);return {guild:g,upgrades:q.rows};}
async function armory(t,u){const g=await getGuild(t,u);if(!g)throw new Error("You are not in a guild.");const r=await db.query("SELECT a.equipment_id,a.deposited_by,a.deposited_at,e.item_id,e.rarity,e.enhancement,e.stats FROM rpg_guild_armory a JOIN rpg_crafted_equipment e ON e.id=a.equipment_id WHERE a.guild_id=$1 ORDER BY a.deposited_at DESC",[g.id]);return r.rows;}
async function depositArmory(t,u,equipmentID){const g=await getGuild(t,u);if(!g)throw new Error("You are not in a guild.");const r=await db.query("SELECT id FROM rpg_crafted_equipment WHERE id=$1 AND thread_id=$2 AND user_id=$3",[Number(equipmentID),String(t),String(u)]);if(!r.rows[0])throw new Error("That crafted item is not yours.");await db.query("INSERT INTO rpg_guild_armory(guild_id,equipment_id,deposited_by,deposited_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",[g.id,Number(equipmentID),String(u),Date.now()]);}
async function withdrawArmory(t,u,equipmentID){const g=await getGuild(t,u);if(!g||!["master","officer"].includes(g.member_role))throw new Error("Only guild leadership can withdraw armory items.");const r=await db.query("DELETE FROM rpg_guild_armory WHERE guild_id=$1 AND equipment_id=$2 RETURNING equipment_id",[g.id,Number(equipmentID)]);if(!r.rows[0])throw new Error("That item is not in the guild armory.");}
const RELICS={war:{name:"Relic of War",emoji:"⚔️",bonus:"Guild raid damage"},wild:{name:"Relic of the Wild",emoji:"🌲",bonus:"Companion training"},inferno:{name:"Relic of the Inferno",emoji:"🔥",bonus:"Fire forging"},frost:{name:"Relic of Frost",emoji:"❄️",bonus:"Defense"},stars:{name:"Relic of the Stars",emoji:"🌌",bonus:"Rare loot"}};
const RAIDS={ruins:{name:"Ancient Ruins",hp:750000,reward:15000},dragon_nest:{name:"Dragon Nest",hp:1500000,reward:30000},infernal_gate:{name:"Infernal Gate",hp:3000000,reward:60000},abyssal_citadel:{name:"Abyssal Citadel",hp:5000000,reward:100000}};
async function setRelic(t,u,id){const g=await getGuild(t,u);if(!g||g.member_role!=="master")throw new Error("Only the Guild Master can choose a relic.");id=String(id||"").toLowerCase();if(!RELICS[id])throw new Error("Unknown relic.");await db.query("INSERT INTO rpg_guild_relics(guild_id,relic_id,awakened,level,updated_at) VALUES($1,$2,FALSE,1,$3) ON CONFLICT(guild_id) DO UPDATE SET relic_id=EXCLUDED.relic_id,updated_at=EXCLUDED.updated_at",[g.id,id,Date.now()]);return RELICS[id];}
async function getRelic(t,u){const g=await getGuild(t,u);if(!g)return null;const r=await db.query("SELECT * FROM rpg_guild_relics WHERE guild_id=$1",[g.id]);return r.rows[0]||null;}
async function startRaid(t,u,id){const g=await getGuild(t,u);if(!g||!["master","officer"].includes(g.member_role))throw new Error("Only guild leadership can start a raid.");id=String(id||"ruins").toLowerCase();const raid=RAIDS[id];if(!raid)throw new Error("Unknown guild raid.");const active=await db.query("SELECT id FROM rpg_guild_raids WHERE guild_id=$1 AND status='active'",[g.id]);if(active.rows[0])throw new Error("Your guild already has an active raid.");const now=Date.now(),r=await db.query("INSERT INTO rpg_guild_raids(guild_id,thread_id,raid_id,hp,max_hp,created_at,updated_at) VALUES($1,$2,$3,$4,$4,$5,$5) RETURNING *",[g.id,String(t),id,raid.hp,now]);return r.rows[0];}
async function raidAttack(t,u){const g=await getGuild(t,u);if(!g)throw new Error("You are not in a guild.");const s=(await db.query("SELECT * FROM rpg_guild_raids WHERE guild_id=$1 AND status='active'",[g.id])).rows[0];if(!s)throw new Error("Your guild has no active raid.");const dmg=Math.floor(50+Math.random()*120+Number((await db.query("SELECT strength,agility FROM rpg_players WHERE thread_id=$1 AND user_id=$2",[String(t),String(u)])).rows[0]?.strength||10)*7);const hp=Math.max(0,Number(s.hp)-dmg),phase=hp<=Number(s.max_hp)*.35?3:hp<=Number(s.max_hp)*.7?2:1;await db.query("INSERT INTO rpg_guild_raid_participants(raid_id,user_id,damage_dealt,attacks) VALUES($1,$2,$3,1) ON CONFLICT(raid_id,user_id) DO UPDATE SET damage_dealt=rpg_guild_raid_participants.damage_dealt+$3,attacks=rpg_guild_raid_participants.attacks+1",[s.id,String(u),dmg]);await db.query("UPDATE rpg_guild_raids SET hp=$1,phase=$2,status=CASE WHEN $1<=0 THEN 'defeated' ELSE status END,updated_at=$3 WHERE id=$4",[hp,phase,Date.now(),s.id]);if(hp<=0)await db.query("UPDATE rpg_guilds SET treasury=treasury+$1,experience=experience+$2,level=$3,updated_at=$4 WHERE id=$5",[RAIDS[s.raid_id].reward,Math.floor(RAIDS[s.raid_id].reward/10),levelForXp(Number(g.experience)+Math.floor(RAIDS[s.raid_id].reward/10)),Date.now(),g.id]);;const participants=(await db.query("SELECT user_id FROM rpg_guild_raid_participants WHERE raid_id=$1",[s.id])).rows;for(const participant of participants){await grantLoot(t,participant.user_id,{context:"guild_raid",rolls:1});}return {raid:RAIDS[s.raid_id],damage:dmg,hp,phase,defeated:hp<=0};}
async function raidStatus(t,u){const g=await getGuild(t,u);if(!g)return null;const s=(await db.query("SELECT * FROM rpg_guild_raids WHERE guild_id=$1 AND status='active'",[g.id])).rows[0];if(!s)return null;return {state:s,raid:RAIDS[s.raid_id],leaders:(await db.query("SELECT * FROM rpg_guild_raid_participants WHERE raid_id=$1 ORDER BY damage_dealt DESC LIMIT 10",[s.id])).rows};}
module.exports={GUILD_COST,UPGRADE_COSTS,getGuild,createGuild,invite,join,leave,members,donate,upgrade,format,hall,armory,depositArmory,withdrawArmory,RELICS,RAIDS,setRelic,getRelic,startRaid,raidAttack,raidStatus};