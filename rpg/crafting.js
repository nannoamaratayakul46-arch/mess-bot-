"use strict";
const db=require("../db"),{getGuild}=require("./guilds");
const RECIPES={starforged_blade:{name:"Starforged Blade",emoji:"⚔️",rarity:"Legendary",guildLevel:5,blacksmithLevel:1,cost:100000,materials:{ancient_iron:10,void_crystal:3,celestial_core:1},stats:{strength:35,luck:8}},dragonheart_spear:{name:"Dragonheart Spear",emoji:"🗡️",rarity:"Mythic",guildLevel:8,blacksmithLevel:3,cost:250000,materials:{dragonsteel:12,dragon_heart:1,void_crystal:5},stats:{strength:55,agility:12}},astral_crown:{name:"Astral Crown",emoji:"👑",rarity:"Celestial",guildLevel:12,blacksmithLevel:5,cost:500000,materials:{celestial_shard:8,celestial_core:2,void_crystal:8},stats:{intelligence:60,maxMp:80}}};
async function forge(t,u,id){
  id=String(id||"").toLowerCase();
  const r=RECIPES[id];
  if(!r)throw new Error("Unknown forge recipe.");

  const thread=String(t),user=String(u);
  const g=await getGuild(thread,user);
  if(!g)throw new Error("You need a guild.");
  if(Number(g.level)<r.guildLevel)throw new Error("Your guild is not high enough.");

  const up=await db.query(
    "SELECT level FROM rpg_guild_upgrades WHERE guild_id=$1 AND upgrade_key='blacksmith'",
    [g.id]
  );
  if(!up.rows[0]||Number(up.rows[0].level)<r.blacksmithLevel){
    throw new Error("Upgrade the Guild Blacksmith first.");
  }

  for(const k of Object.keys(r.materials)){
    if(await db.getRpgItemQuantity(thread,user,k)<r.materials[k]){
      throw new Error("Missing crafting material: "+k.replace(/_/g," "));
    }
  }

  return db.withTransaction(async(client)=>{
    const wallet=await client.query(
      "SELECT balance FROM users WHERE thread_id=$1 AND user_id=$2 FOR UPDATE",
      [thread,user]
    );
    if(!wallet.rows[0])throw new Error("User not found.");
    if(Number(wallet.rows[0].balance)<r.cost)throw new Error("Not enough wallet coins.");

    for(const k of Object.keys(r.materials)){
      const amount=r.materials[k];
      const consumed=await client.query(
        `UPDATE rpg_inventory_items
         SET quantity=quantity-$4,updated_at=$5
         WHERE thread_id=$1 AND user_id=$2 AND item_id=$3 AND quantity >= $4
         RETURNING quantity`,
        [thread,user,k,amount,Date.now()]
      );
      if(!consumed.rows[0]){
        throw new Error("Missing crafting material: "+k.replace(/_/g," "));
      }
    }

    await client.query(
      "UPDATE users SET balance=balance-$3 WHERE thread_id=$1 AND user_id=$2",
      [thread,user,r.cost]
    );
    await client.query(
      `INSERT INTO economy_transactions(thread_id,user_id,type,amount,description,created_at)
       VALUES($1,$2,'rpg_spend',$3,$4,$5)`,
      [thread,user,r.cost,"RPG forging",Date.now()]
    );

    const created=await client.query(
      "INSERT INTO rpg_crafted_equipment(thread_id,user_id,item_id,rarity,enhancement,stats,created_at) VALUES($1,$2,$3,$4,0,$5,$6) RETURNING *",
      [thread,user,id,r.rarity,JSON.stringify(r.stats),Date.now()]
    );

    const slot=id==="astral_crown"?"head":"weapon";
    await client.query(
      `INSERT INTO rpg_equipment(thread_id,user_id,slot,item_id,updated_at)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(thread_id,user_id,slot)
       DO UPDATE SET item_id=EXCLUDED.item_id,updated_at=EXCLUDED.updated_at`,
      [thread,user,slot,id,Date.now()]
    );

    return {
      ...r,
      row:created.rows[0],
      slot,
      balance:Number(wallet.rows[0].balance)-r.cost
    };
  });
}
module.exports={RECIPES,forge};