"use strict";
const db=require("../db");
const SCOPES=new Set(["all","guild","companions","forge","world","boss","gm"]);
async function getAccess(t,u){const r=await db.query("SELECT * FROM rpg_special_access WHERE thread_id=$1 AND user_id=$2 AND (expires_at IS NULL OR expires_at>$3)",[String(t),String(u),Date.now()]);return r.rows;}
async function hasAccess(t,u,s){return (await getAccess(t,u)).some(x=>x.scope==="all"||x.scope===s);}
async function grant(t,u,by,s){s=String(s||"all").toLowerCase();if(!SCOPES.has(s))throw new Error("Unknown scope: "+s);await db.query("INSERT INTO rpg_special_access(thread_id,user_id,scope,granted_by,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(thread_id,user_id,scope) DO UPDATE SET granted_by=EXCLUDED.granted_by,created_at=EXCLUDED.created_at,expires_at=NULL",[String(t),String(u),s,String(by),Date.now()]);}
async function revoke(t,u,s){if(s)await db.query("DELETE FROM rpg_special_access WHERE thread_id=$1 AND user_id=$2 AND scope=$3",[String(t),String(u),String(s).toLowerCase()]);else await db.query("DELETE FROM rpg_special_access WHERE thread_id=$1 AND user_id=$2",[String(t),String(u)]);}
module.exports={SCOPES,getAccess,hasAccess,grant,revoke};