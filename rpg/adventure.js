const db = require("../db");
const { addBalance } = db;
const { addItem, addXp, ensurePlayer } = require("./player");
const { getItem } = require("./items");
const { formatNumber, randomInt } = require("./utils");
const { grantLoot, formatLoot } = require("./loot");
const { getSpecial, unlockSpecial } = require("./specials");

const DUNGEONS = {
  abyssal_crypt: { name: "Abyssal Crypt", emoji: "🏰", floors: 5, reward: 900, xp: 700, loot: "void_crystal" },
  moonlit_ruins: { name: "Moonlit Ruins", emoji: "🌙", floors: 3, reward: 450, xp: 350, loot: "moonleaf" },
};

// Hunt milestones extend the existing hunt progression instead of creating
// a second hunting/reward engine. Permanent rewards are intentionally earned.
const HUNT_MILESTONES = [
  { hunts: 5, special: "rending_storm", specialPoints: 2 },
  { hunts: 10, special: "crimson_requiem", specialPoints: 3 },
  { hunts: 20, special: "worldbreaker", specialPoints: 5 },
  { hunts: 35, special: "infinite_darkness", specialPoints: 7 },
  { hunts: 50, special: "heaven_piercing_ice_wall", specialPoints: 10 },
];

async function getQuest(threadID, userID) {
  await ensurePlayer(threadID, userID);
  const result = await db.query(`SELECT * FROM rpg_quests WHERE thread_id = $1 AND user_id = $2 AND quest_type = 'daily' AND status = 'active' ORDER BY id DESC LIMIT 1`, [String(threadID), String(userID)]);
  if (result.rows[0]) return result.rows[0];
  const now = Date.now();
  const created = await db.query(`INSERT INTO rpg_quests (thread_id, user_id, quest_type, quest_key, title, objective, progress, target, reward_gold, reward_xp, status, expires_at, updated_at) VALUES ($1, $2, 'daily', 'hunt_three', 'First Blood', 'Defeat creatures while exploring', 0, 3, 250, 180, 'active', $3, $3) RETURNING *`, [String(threadID), String(userID), now + 24 * 60 * 60 * 1000]);
  return created.rows[0];
}

async function getTotalHunts(threadID, userID) {
  const result = await db.query(`SELECT total_hunts FROM rpg_players WHERE thread_id = $1 AND user_id = $2 LIMIT 1`, [String(threadID), String(userID)]);
  return Number(result.rows[0]?.total_hunts || 0);
}

async function awardHuntMilestones(threadID, userID, totalHunts) {
  const rewards = [];
  for (const milestone of HUNT_MILESTONES) {
    if (Number(totalHunts) !== milestone.hunts) continue;

    if (milestone.special) {
      const special = getSpecial(milestone.special);
      if (special) {
        const result = await unlockSpecial(threadID, userID, special.id, {
          source: "hunt_milestone",
          bypassRequirements: true,
        });
        if (!result.alreadyUnlocked && result.ok !== false) {
          rewards.push({ type: "special", special });
        }
      }
    }

    if (milestone.specialPoints > 0) {
      await db.query(`UPDATE rpg_players SET special_points = COALESCE(special_points, 0) + $3, updated_at = $4 WHERE thread_id = $1 AND user_id = $2`, [String(threadID), String(userID), milestone.specialPoints, Date.now()]);
      rewards.push({ type: "special_points", amount: milestone.specialPoints });
    }
  }
  return rewards;
}

async function registerHuntProgress(threadID, userID) {
  const quest = await getQuest(threadID, userID);
  const next = Math.min(Number(quest.target), Number(quest.progress) + 1);
  if (next !== Number(quest.progress)) {
    await db.query(`UPDATE rpg_quests SET progress = $3, updated_at = $4 WHERE id = $1 AND thread_id = $2`, [quest.id, String(threadID), next, Date.now()]);
  }

  const totalHunts = await getTotalHunts(threadID, userID);
  const milestoneRewards = await awardHuntMilestones(threadID, userID, totalHunts);
  return { ...quest, progress: next, totalHunts, milestoneRewards };
}

async function claimQuest(threadID, userID) {
  const quest = await getQuest(threadID, userID);
  if (Number(quest.progress) < Number(quest.target)) throw new Error(`Progress: ${quest.progress}/${quest.target}. Hunt more creatures first.`);
  const claimed = await db.query(
    `UPDATE rpg_quests
     SET status = 'claimed', updated_at = $3
     WHERE id = $1
       AND thread_id = $2
       AND status = 'active'
       AND progress >= target`,
    [quest.id, String(threadID), Date.now()]
  );

  if (claimed.rowCount !== 1) {
    throw new Error("This quest has already been claimed.");
  }

  await addBalance(threadID, userID, quest.reward_gold);
  await addXp(threadID, userID, quest.reward_xp);
  return quest;
}

async function getDungeon(threadID, userID) {
  const result = await db.query(`SELECT * FROM rpg_dungeons WHERE thread_id = $1 AND user_id = $2 AND status = 'active' ORDER BY id DESC LIMIT 1`, [String(threadID), String(userID)]);
  return result.rows[0] || null;
}

async function enterDungeon(threadID, userID, dungeonKey = "abyssal_crypt") {
  const definition = DUNGEONS[dungeonKey];
  if (!definition) throw new Error(`Choose a dungeon: ${Object.keys(DUNGEONS).join(", ")}.`);
  if (await getDungeon(threadID, userID)) throw new Error("You are already inside a dungeon.");
  const created = await db.query(`INSERT INTO rpg_dungeons (thread_id, user_id, dungeon_key, stage, max_stage, status, updated_at) VALUES ($1, $2, $3, 1, $4, 'active', $5) RETURNING *`, [String(threadID), String(userID), dungeonKey, definition.floors, Date.now()]);
  return { definition, dungeon: created.rows[0] };
}

async function advanceDungeon(threadID, userID) {
  const dungeon = await getDungeon(threadID, userID);
  if (!dungeon) throw new Error("You are not in a dungeon. Try !rpg dungeon enter.");
  const definition = DUNGEONS[dungeon.dungeon_key];
  const success = randomInt(1, 100) > 18;
  if (!success) {
    await db.query(`UPDATE rpg_dungeons SET status = 'failed', updated_at = $3 WHERE id = $1 AND thread_id = $2`, [dungeon.id, String(threadID), Date.now()]);
    return { status: "failed", message: "The dungeon overwhelmed your party." };
  }
  if (Number(dungeon.stage) < Number(dungeon.max_stage)) {
    const nextStage = Number(dungeon.stage) + 1;
    await db.query(`UPDATE rpg_dungeons SET stage = $3, updated_at = $4 WHERE id = $1 AND thread_id = $2`, [dungeon.id, String(threadID), nextStage, Date.now()]);
    return { status: "active", message: `You cleared stage ${dungeon.stage}. The next room awaits.`, stage: nextStage };
  }
  const claimed = await db.query(
    `UPDATE rpg_dungeons
     SET status = 'cleared', updated_at = $3
     WHERE id = $1 AND thread_id = $2 AND status = 'active'`,
    [dungeon.id, String(threadID), Date.now()]
  );

  if (claimed.rowCount !== 1) {
    return {
      status: "already_resolved",
      message: "This dungeon run was already resolved.",
    };
  }

  await addBalance(threadID, userID, definition.reward);
  await addXp(threadID, userID, definition.xp);
  await addItem(threadID, userID, definition.loot, 1);
  const bonusLoot = await grantLoot(threadID, userID, { context: "dungeon", rolls: 1 });
  return { status: "cleared", message: `You cleared ${definition.name} and claimed the final chest.`, reward: definition, loot: bonusLoot, lootText: formatLoot(bonusLoot) };
}

function questSummary(quest) {
  return [
    `📜 ${quest.title}`,
    quest.objective,
    `Progress: ${quest.progress}/${quest.target}`,
    `💰 Reward: ${formatNumber(quest.reward_gold)} coins`,
    `✨ XP: ${formatNumber(quest.reward_xp)}`,
    Number(quest.progress) >= Number(quest.target) ? "Use !rpg quest claim to collect it." : "Use !rpg hunt to make progress.",
  ];
}

module.exports = { DUNGEONS, HUNT_MILESTONES, advanceDungeon, awardHuntMilestones, claimQuest, enterDungeon, getDungeon, getQuest, getTotalHunts, questSummary, registerHuntProgress };