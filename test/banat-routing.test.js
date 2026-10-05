"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

test("slash Banat toggle is evaluated before automatic Banat", () => {
  const source = read("index.js");
  const toggle = source.indexOf("const banatControlMatch");
  const automatic = source.indexOf("const banatHandled = await handleAutomaticBanatMessage");

  assert.ok(toggle >= 0, "slash toggle must exist");
  assert.ok(automatic >= 0, "automatic Banat must exist");
  assert.ok(toggle < automatic, "slash toggle must run first");
});

test("slash Banat toggle exits before automatic Banat can process slash", () => {
  const source = read("index.js");
  const toggle = source.indexOf("const banatControlMatch");
  const automatic = source.indexOf("const banatHandled = await handleAutomaticBanatMessage");
  const toggleBlock = source.slice(toggle, automatic);

  assert.match(toggleBlock, /setBanatConversationMode\(threadId, enabled, senderId\)/);
  assert.match(toggleBlock, /await db\.setRoastEnabled\(threadId, enabled\)/);
  assert.match(toggleBlock, /if \(!enabled\)/);
  assert.match(toggleBlock, /\n    return;\n  }\n\n  \/\/);
});

test("automatic Banat passes sender identity into the roast selector", () => {
  const source = read("index.js");
  assert.match(
    source,
    /getRandomRoastReply\(threadID, body, senderId\)/
  );
});

test("automatic Banat restores persistent mode before targeting", () => {
  const source = read("index.js");
  const start = source.indexOf("async function handleAutomaticBanatMessage");
  const body = source.slice(start, start + 5000);

  assert.match(body, /await db\.isRoastEnabled\(threadId\)/);
  assert.match(body, /setBanatConversationMode\(threadId, false\)/);
  assert.match(body, /setBanatConversationMode\(threadId, true\)/);
  assert.ok(
    body.indexOf("setBanatConversationMode(threadId, true)") <
      body.indexOf("classifyBanatTarget")
  );
});

test("runtime hotfix files are no longer part of the source tree", () => {
  for (const file of [
    "repo-hotfix.js",
    "broadcast-runtime-fix.js",
    "rpg-help-preload.js",
    "banat-runtime-fix.js",
  ]) {
    assert.equal(
      fs.existsSync(path.join(root, file)),
      false,
      file + " should not exist"
    );
  }
});

test("unauthorized slash uses the Banat roast replies instead of the admin-only panel", () => {
  const source = read("index.js");
  const toggle = source.indexOf("const banatControlMatch");
  const automatic = source.indexOf("const banatHandled = await handleAutomaticBanatMessage");
  const toggleBlock = source.slice(toggle, automatic);

  assert.match(toggleBlock, /pota bawal panget gumamit command hoy/);
  assert.match(toggleBlock, /sabi ko ayoko kalbo/);
  assert.match(toggleBlock, /aaaaaa bingi ka\? sabi bawal moka paa gumamit command/);
  assert.doesNotMatch(toggleBlock, /🔒 ADMIN ONLY/);
});

test("Banat burst replies are spaced 5 seconds apart and randomize one eligible sender", () => {
  const source = read("index.js");
  assert.match(
    source,
    /ECLIPSE_BANAT_MIN_INTER_REPLY_GAP_MS \|\| 5_000/
  );
  assert.match(
    source,
    /state\.queue\.findIndex\(\s*\(candidate\) =>\s*String\(candidate\.senderId \|\| ""\)\.trim\(\) === senderKey/
  );
  assert.match(
    source,
    /Math\.floor\(Math\.random\(\) \* pool\.length\)/
  );
});

test("Banat keeps burst state alive during the 5-second cooldown", () => {
  const source = read("index.js");
  assert.match(source, /cleanupTimer/);
  assert.match(
    source,
    /state\.cleanupTimer = setTimeout\(\(\) => \{/
  );
  assert.match(
    source,
    /}, BANAT_MIN_INTER_REPLY_GAP_MS\);/
  );
});


test("Banat is owner-only while ECLIPSE normal reactions remain separate", () => {
  const source = read("index.js");
  const start = source.indexOf("async function handleAutomaticBanatMessage");
  const end = source.indexOf("// ============================================================\n// HUMAN / BANAT WIRING", start);
  const body = source.slice(start, end);

  assert.match(
    body,
    /if \(!isPrimaryUser\(senderId\)\)\s*\{\s*return false;/
  );
  assert.match(
    body,
    /const triggerReply = null;/
  );
  assert.match(
    body,
    /getRandomRoastReply\(threadID, body, senderId\)/
  );
});

test("Banat reactions use the compatible setMessageReaction callback signature", () => {
  const index = read("index.js");
  const human = read("banat-human.js");

  assert.match(
    index,
    /api\.setMessageReaction\(\s*"😆",\s*messageID,\s*reactionCallback,\s*true\s*\)/
  );
  assert.match(
    human,
    /api\.setMessageReaction\(\s*"😆",\s*String\(sentMessageID\),\s*reactionCallback,\s*true\s*\)/
  );
  assert.doesNotMatch(
    index,
    /setMessageReactionMqtt\(\s*"😆",\s*messageID,\s*threadId,\s*reactionCallback/
  );
  assert.doesNotMatch(
    human,
    /setMessageReactionMqtt\(\s*"😆",\s*String\(sentMessageID\),\s*String\(threadID\),\s*reactionCallback/
  );
});

test("all Banat-selected text reaches the Banat human send layer", () => {
  const source = read("index.js");
  const start = source.indexOf("async function handleAutomaticBanatMessage");
  const end = source.indexOf("// ============================================================\n// HUMAN / BANAT WIRING", start);
  const body = source.slice(start, end);

  assert.match(body, /message:\s*triggerReply/);
  assert.match(body, /message:\s*randomRoastReply/);
  assert.match(source, /const prepared = prepareBanatReply\(/);
  assert.match(source, /humanize\(message/);
});

test("slash Banat replies use the humanizer instead of generic reply transport", () => {
  const source = read("index.js");
  const toggle = source.indexOf("const banatControlMatch");
  const automatic = source.indexOf("const banatHandled = await handleAutomaticBanatMessage");
  const block = source.slice(toggle, automatic);

  assert.match(block, /sendBanatReplyWithTyping\(/);
  assert.match(block, /require\("\.\/slash-banats"\)/);
  assert.match(block, /andito na boss mo tanga, supaen mo ttko/);
  assert.match(block, /bounce na ako, di kaya kakunatan ko/);
  assert.match(block, /bawal bobo/);
});

test("Banat admin safety uses the centralized admin registry", () => {
  const source = read("triggers.js");
  assert.match(source, /const \{ isAdmin \} = require\("\.\/permissions"\)/);
  assert.match(source, /const adminSender = isAdmin\(senderId\)/);
});


test("slash Banat pools are separated from the natural pool", () => {
  const source = read("slash-banats.js");
  assert.match(source, /andito na boss mo tanga, supaen mo ttko/);
  assert.match(source, /bounce na ako, di kaya kakunatan ko/);
  assert.match(source, /bawal bobo/);
  assert.match(source, /function pickSlashBanat\\(mode = "on"\\)/);
  assert.match(source, /pickUnauthorizedSlashBanat/);
});

test("slash Banat sends selected words through the Banat human layer", () => {
  const source = read("index.js");
  const toggle = source.indexOf("const banatControlMatch");
  const automatic = source.indexOf("const banatHandled = await handleAutomaticBanatMessage");
  const block = source.slice(toggle, automatic);

  assert.match(block, /require\\("\\.\\/slash-banats"\\)\\(enabled \\? "on" : "off"\\)/);
  assert.match(block, /require\\("\\.\\/slash-banats"\\)\\.pickUnauthorizedSlashBanat\\(\\)/);
  assert.match(block, /sendBanatReplyWithTyping\\(/);
});


test("Banat randomizer selects randomly from eligible unused items", () => {
  const source = read("banat-randomizer.js");
  assert.match(source, /const selectedCandidate = weightedPick\(/);
  assert.match(source, /typeof options\.weight === "function"/);
  assert.match(source, /freshCandidates\.length \? freshCandidates : candidates/);
});

test("Banat natural selection uses incoming behavior and recent reply families", () => {
  const source = read("triggers.js");
  assert.match(source, /const \{ chooseSocialResponse \} = require\("\.\/banat-social"\)/);
  assert.match(source, /function banatContextWeight\(reply, incomingText, recentFamilies = \[\]\)/);
  assert.match(source, /weight: \(reply\) => banatContextWeight\(reply, incomingText, recentFamilies\)/);
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
