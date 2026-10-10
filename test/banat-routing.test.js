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
  assert.match(body, /groups\.find\(\(group\) => group\.name === "jaiden"\)/);
  assert.match(body, /getNextReply\(jaidenGroup\)/);
  assert.match(body, /reply\.replace\(\/\\bjaiden\\b\/gi, targetName\)/);
});

test("dashboard Jaiden reply does not hang when target-name lookup stalls", () => {
  const source = read("index.js");
  const start = source.indexOf("async function handleAutomaticBanatMessage");
  const end = source.indexOf("// ============================================================\n// HUMAN / BANAT WIRING", start);
  const body = source.slice(start, end);
  assert.match(body, /getUserInfo timed out after 2500ms/);
  assert.match(body, /clearTimeout\(timeout\)/);
  assert.match(body, /Could not resolve dashboard target name/);
});

test("dashboard target API validates group membership and persists the target", () => {
  const source = read("index.js");
  const start = source.indexOf('app.put(\n  "/api/dashboard/groups/:thread_id/target"');
  const end = source.indexOf('app.delete(\n  "/api/dashboard/groups/:thread_id/target"', start);
  const body = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(body, /dashboardKnownGroups\.has\(threadID\)/);
  assert.match(body, /dashboardGetThreadInfo\(activeMessengerApi, threadID\)/);
  assert.match(body, /ids\.includes\(targetID\)/);
  assert.match(body, /db\.setBanatThreadTarget\(threadID, targetID, "dashboard-admin"\)/);
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
  const targetRoute = source.slice(source.indexOf("if (senderIsDashboardTarget)"), source.indexOf("// Ordinary Banat replies require", source.indexOf("if (senderIsDashboardTarget)")));
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
