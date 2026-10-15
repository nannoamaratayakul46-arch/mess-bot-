"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

test("slash controls return before automatic Banat routing", () => {
  const source = read("index.js");
  const toggle = source.indexOf("const banatControlMatch");
  const automatic = source.indexOf("const banatHandled = await handleAutomaticBanatMessage");
  assert.ok(toggle >= 0 && automatic > toggle);
  assert.match(source.slice(toggle, automatic), /return;/);
});

test("saved dashboard target enables Banat without slash or backslash pools", () => {
  const source = read("index.js");
  const start = source.indexOf("async function handleAutomaticBanatMessage");
  const body = source.slice(start, start + 7000);
  assert.match(body, /await db\.getThreadSettings\(threadId\)/);
  assert.match(body, /await db\.getBanatThreadTarget\(threadId\)/);
  assert.match(body, /!roastEnabled && !slashPoolEnabled && !savedBanatTarget\?\.target_user_id/);
  assert.match(body, /setBanatDirectedTarget\(/);
});

test("dashboard target sender overrides normal conversation scoring", () => {
  const source = read("index.js");
  const start = source.indexOf("async function handleAutomaticBanatMessage");
  const end = source.indexOf("// ============================================================\n// HUMAN / BANAT WIRING", start);
  const body = source.slice(start, end);
  assert.match(body, /senderIsDashboardTarget/);
  assert.match(body, /forceJaidenTarget:\s*true/);
  assert.match(body, /targetName:\s*dashboardTargetName/);
  assert.match(body, /target\.reason = "dashboard-target"/);
  assert.match(body, /target\.reason = "dashboard-target-wait"/);
});

test("forced dashboard mode chooses Jaiden replies and substitutes target name", () => {
  const source = read("triggers.js");
  const force = source.indexOf("if (options?.forceJaidenTarget === true)");
  const normalTriggers = source.indexOf("// EXPLICIT WORD / PHRASE TRIGGERS", force);
  assert.ok(force >= 0 && normalTriggers > force);
  const body = source.slice(force, normalTriggers);
  assert.match(body, /pickJaidenTargetReply\(/);
  assert.match(body, /threadId/);
  assert.match(body, /targetName/);
});

test("dashboard Jaiden reply does not hang when target-name lookup stalls", () => {
  const source = read("index.js");
  const start = source.indexOf("async function handleAutomaticBanatMessage");
  const end = source.indexOf("// ============================================================\n// HUMAN / BANAT WIRING", start);
  const body = source.slice(start, end);
  assert.match(body, /resolveTargetName\(api, threadID, dashboardTargetId/);
  assert.match(body, /savedName: savedBanatTarget\?\.target_name/);
  assert.match(body, /Jaiden target resolved:/);
  assert.match(body, /Name lookup failed for target/);
});

test("Banat turn timeout is cleared when the send settles first", () => {
  const source = read("index.js");
  const start = source.indexOf("function runBanatBurstQueue(");
  const end = source.indexOf("async function handleAutomaticBanatMessage", start);
  const body = source.slice(start, end);
  assert.match(body, /let turnTimeout = null/);
  assert.match(body, /turnTimeout = setTimeout\(/);
  assert.match(body, /finally \{\s*if \(turnTimeout\) clearTimeout\(turnTimeout\)/);
});

test("SetNN defers members who have not spoken in the group and preserves them for retry", () => {
  const source = read("index.js");
  assert.match(source, /requiresPriorThreadMessage/);
  assert.match(source, /at least one message in the thread/i);
  assert.match(source, /deferredTargets\.push\(participantID\)/);
  assert.match(source, /!deferredTargets\.length/);
  assert.match(source, /deferredTargets,\s*0,\s*null/);
  assert.match(source, /must send a message in this GC first/);
});

test("dashboard target cleanup helper is imported before target-save route uses it", () => {
  const source = read("index.js");
  const triggerImportsStart = source.indexOf("// TRIGGERS");
  const triggerImportsEnd = source.indexOf('} = require("./triggers")', triggerImportsStart);
  assert.ok(triggerImportsStart >= 0 && triggerImportsEnd > triggerImportsStart);
  assert.match(source.slice(triggerImportsStart, triggerImportsEnd), /clearBanatConversationTarget/);
  assert.match(read("triggers.js"), /clearBanatConversationTarget,/);
});

test("dashboard target API validates group membership and persists the target", () => {
  const source = read("index.js");
  const start = source.indexOf('app.put(\n  "/api/dashboard/groups/:thread_id/target"');
  const end = source.indexOf('app.delete(\n  "/api/dashboard/groups/:thread_id/target"', start);
  const body = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(body, /dashboardKnownGroups\.has\(threadID\)/);
  assert.match(body, /dashboardGetThreadInfo\(activeMessengerApi, threadID\)/);
  assert.match(body, /ids\.(?:includes\(targetID\)|has\(targetID\))/);
  assert.match(source, /async function dashboardGetParticipantIds\(api, threadID, knownInfo = null\)/);
  assert.match(source, /info\?\.participantIDs,[\s\S]*info\?\.participantList,[\s\S]*info\?\.participant_list/);
  assert.match(body, /db\.setBanatThreadTarget\(\s*threadID,\s*targetID,\s*"dashboard-admin",\s*requestedBangEnabled,\s*targetName,\s*jaidenSettings\s*\)/);
  assert.match(body, /setBanatDirectedTarget\(threadID, targetID/);
});

test("clearing dashboard target removes persistent and in-memory target state", () => {
  const source = read("index.js");
  const start = source.indexOf('app.delete(\n  "/api/dashboard/groups/:thread_id/target"');
  const end = source.indexOf("function dashboardGetThreadList", start);
  const body = source.slice(start, end);
  assert.match(body, /db\.clearBanatThreadTarget\(threadID\)/);
  assert.match(body, /clearBanatDirectedTarget\(threadID\)/);
  assert.match(body, /clearBanatConversationTarget\(threadID\)/);
});

test("target persistence has a database table and upsert", () => {
  const db = read("db.js");
  assert.match(db, /CREATE TABLE IF NOT EXISTS banat_thread_targets/);
  assert.match(db, /target_name TEXT/);
  assert.match(db, /target_name = CASE WHEN EXCLUDED\.target_user_id/);
  assert.match(db, /ON CONFLICT\(thread_id\) DO UPDATE SET/);
  assert.match(db, /async function getBanatThreadTarget\(threadId\)/);
  assert.match(db, /async function clearBanatThreadTarget\(threadId\)/);
});

test("dashboard-selected target can take priority over a running queue turn", () => {
  const source = read("index.js");
  const queueStart = source.indexOf("function acceptBanatBurstMessage");
  const queueEnd = source.indexOf("function clearBanatBurstState", queueStart);
  const queue = source.slice(queueStart, queueEnd);
  assert.match(queue, /if \(state\.running\)/);
  assert.match(queue, /job\.canSwitchTarget && incomingSenderId/);
  assert.match(queue, /state\.queue\.push\(\{[\s\S]*?queuedAt: now/);
  const targetRouteStart = source.indexOf("const bangJaidenCommand =");
  const targetRoute = source.slice(targetRouteStart, source.indexOf("// Ordinary Banat replies require", targetRouteStart));
  assert.match(targetRoute, /canSwitchTarget: true/);
  assert.match(source, /clearBanatBurstState\(threadID\)/);
});

test("all selected target replies go through the shared Banat queue and human sender", () => {
  const source = read("index.js");
  const start = source.indexOf("async function handleAutomaticBanatMessage");
  const end = source.indexOf("// ============================================================\n// HUMAN / BANAT WIRING", start);
  const body = source.slice(start, end);
  assert.match(body, /acceptBanatBurstMessage\(/);
  assert.match(body, /message:\s*triggerReply/);
  assert.match(source, /function sendBanatReplyWithTyping\(/);
  assert.match(source, /sendBanatReplyWithTypingModule\(/);
});

test("ordinary slash pools remain separate from the natural Banat pool", () => {
  const slash = read("slash-banats.js");
  const pool = read("banat-slash-pool.js");
  const triggers = read("triggers.js");
  assert.match(slash, /pickUnauthorizedSlashBanat/);
  assert.match(pool, /pickSlashPoolInsult/);
  assert.match(triggers, /name:\s*"banat-natural"/);
});

test("Banat randomizer exports and enforces no-repeat bag selection", () => {
  const randomizer = require("../banat-randomizer");
  assert.equal(typeof randomizer.pickFromBag, "function");
  assert.equal(typeof randomizer.pickUnusedWeighted, "function");
  const pool = ["one", "two", "three", "four"];
  randomizer.clear("ci-no-repeat");
  const values = pool.map(() => randomizer.pickFromBag("ci-no-repeat", "pool", pool, { random: () => 0.37 }));
  assert.equal(new Set(values).size, pool.length);
  randomizer.clear("ci-no-repeat");
});

test("runtime hotfix files are not part of the source tree", () => {
  for (const file of ["repo-hotfix.js", "broadcast-runtime-fix.js", "rpg-help-preload.js", "banat-runtime-fix.js"]) {
    assert.equal(fs.existsSync(path.join(root, file)), false, file + " should not exist");
  }
});

test("Banat admin safety uses the centralized admin registry", () => {
  const source = read("triggers.js");
  assert.match(source, /const \{ isAdmin \} = require\("\.\/permissions"\)/);
  assert.match(source, /const adminSender = isAdmin\(senderId\)/);
});

test("Banat natural selection uses incoming behavior and recent reply families", () => {
  const source = read("triggers.js");
  assert.match(source, /const \{ chooseSocialResponse \} = require\("\.\/banat-social"\)/);
  assert.match(source, /function banatContextWeight\(reply, incomingText, recentFamilies = \[\]\)/);
  assert.match(source, /recentFamilies/);
});

test("Banat shorthand dictionary covers global chat and Filipino shorthand", () => {
  const source = read("banat-abbreviations.js");
  assert.match(source, /"what do you mean": \["wdym"\]/);
  assert.match(source, /"not gonna lie": \["ngl"\]/);
  assert.match(source, /"hindi": \["di"\]/);
  assert.match(source, /"ngayon": \["ngyn"\]/);
  assert.match(source, /"for real": \["fr", "frfr"\]/);
});

test("Banat human layer varies behavior by incoming energy and social type", () => {
  const source = read("banat-human.js");
  assert.match(source, /function incomingEnergy\(text\)/);
  assert.match(source, /chooseSocialResponse\(incomingText, String\(message \|\| ""\), context\)/);
  assert.match(source, /socialTimingMultiplier\(social\)/);
  assert.match(source, /BANAT_HESITATION_RATE/);
});


test("dashboard ! mode routes bang-prefixed messages to the selected Jaiden target", () => {
  const source = read("index.js");
  const db = read("db.js");
  assert.match(db, /ADD COLUMN IF NOT EXISTS bang_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(db, /bang_enabled = COALESCE\(\$5::boolean, banat_thread_targets\.bang_enabled\)/);
  assert.match(source, /dashboardBangJaidenEnabled = target\?\.bang_enabled === true/);
  assert.match(source, /const bangJaidenCommand =/);
  assert.match(source, /bangJaidenCommand \|\| \(senderIsDashboardTarget && savedBanatTarget\?\.bang_enabled !== true\)/);
  assert.match(source, /bang_enabled: saved\.bang_enabled === true/);
});

test("Jaiden mode does not intercept recognized bot commands", () => {
  const source = read("index.js");
  assert.ok(source.includes("function isRecognizedBangCommand(body)"));
  assert.ok(source.includes("if (isRecognizedBangCommand(body)) return false;"));
  assert.match(source, /!help/);
  assert.match(source, /!trivia/);
  assert.match(source, /!rpg/);
});

test("dashboard archive and leave endpoints persist ignored groups", () => {
  const source = read("index.js");
  assert.match(source, /eclipse_dashboard_archived_groups/);
  assert.match(source, /app\.post\(\s*"\/api\/dashboard\/groups\/:thread_id\/archive"/);
  assert.match(source, /app\.post\(\s*"\/api\/dashboard\/groups\/:thread_id\/leave"/);
  assert.match(source, /removeUserFromGroup\(currentUserID, threadID, done\)/);
  assert.match(source, /if \(await isDashboardGroupArchived\(threadId\)\) return/);
  assert.match(source, /archivedDashboardGroups\.add\(threadID\)/);
  assert.match(source, /archivedDashboardGroups\.delete\(threadID\)/);
});


test("normal slash Banat can respond to a different member despite stale conversation ownership", () => {
  const triggers = require("../triggers");
  const threadId = "test-normal-open-speaker-" + process.pid;
  triggers.setBanatConversationTarget(threadId, "previous-speaker", {
    reason: "conversation",
    confidence: 0.9,
    text: "previous turn",
  });

  const withoutOpenMode = triggers.scoreBanatAddressContext({
    rawText: "hello there",
    senderId: "another-member",
    threadId,
    event: {},
    botId: "bot-id",
  });
  assert.equal(withoutOpenMode.shouldRespond, false);

  const withNormalSlashMode = triggers.scoreBanatAddressContext({
    rawText: "hello there",
    senderId: "another-member",
    threadId,
    event: {},
    botId: "bot-id",
    allowAnySpeaker: true,
  });
  assert.equal(withNormalSlashMode.shouldRespond, true);

  triggers.clearBanatConversationTarget(threadId);
});

test("normal slash open-speaker routing is enabled only by the normal pool without a saved target", () => {
  const source = read("index.js");
  const start = source.indexOf("async function handleAutomaticBanatMessage");
  const end = source.indexOf("HUMAN / BANAT WIRING", start);
  const body = source.slice(start, end);
  assert.match(body, /allowAnySpeaker:\s*roastEnabled && !savedBanatTarget\?\.target_user_id/);
  assert.match(read("triggers.js"), /allowAnySpeaker === true/);
});


test("Jaiden preferences persist per group and validate interval/modes", () => {
  const db = read("db.js");
  const source = read("index.js");
  assert.match(db, /jaiden_interval_seconds INTEGER NOT NULL DEFAULT 3/);
  assert.match(db, /jaiden_cooldown_mode TEXT NOT NULL DEFAULT 'extend'/);
  assert.match(db, /jaiden_reply_mode TEXT NOT NULL DEFAULT 'always'/);
  assert.match(db, /jaiden_typing_enabled BOOLEAN NOT NULL DEFAULT TRUE/);
  assert.match(source, /interval < 3 \|\| interval > 120/);
  assert.match(source, /\["extend", "queue", "ignore"\]/);
  assert.match(source, /\["always", "random"\]/);
});

test("Jaiden extend cooldown defaults to a 3-second quiet period and scopes pending work to group and target", () => {
  const source = read("index.js");
  const start = source.indexOf("function scheduleJaidenReply");
  const end = source.indexOf("function clearJaidenCooldownState", start);
  const body = source.slice(start, end);
  assert.match(body, /threadKey \+ ":" \+ targetKey/);
  assert.match(body, /Math\.max\(3, Math\.min\(120/);
  assert.match(body, /Number\(settings\.interval_seconds\) \|\| 3/);
  assert.match(body, /if \(state\.timer\) clearTimeout\(state\.timer\)/);
  assert.match(body, /state\.latest = job/);
  assert.match(source, /skipTyping: job\.typingEnabled === false/);
  const ordinaryStart = source.indexOf("// Ordinary Banat replies require");
  const ordinaryEnd = source.indexOf("// HUMAN / BANAT WIRING", ordinaryStart);
  const ordinary = source.slice(ordinaryStart, ordinaryEnd);
  assert.match(ordinary, /acceptBanatBurstMessage\(/);
});


test("selected dashboard target always enters Jaiden reply path even when ! mode is enabled", () => {
  const source = read("index.js");
  const start = source.indexOf("async function handleAutomaticBanatMessage");
  const end = source.indexOf("// ============================================================\\n// HUMAN / BANAT WIRING", start);
  const body = source.slice(start, end);
  assert.match(body, /if \\(bangJaidenCommand \\|\\| senderIsDashboardTarget\\) \\{/);
  assert.match(body, /jaiden_reply_mode === "random"/);
  assert.match(body, /jaidenModeActive = savedBanatTarget\\?\\.bang_enabled === true/);
});
