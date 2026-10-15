"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pool = require("../jaiden-target-pool");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

test("dedicated Jaiden pool has 200 non-empty replies and renders optional placeholders", () => {
  assert.equal(pool.TEMPLATES.length, 200);
  for (const template of pool.TEMPLATES) {
    assert.equal(typeof template, "string");
    assert.ok(template.trim().length > 0);
    assert.doesNotMatch(template, /\bjaiden\b/i);
    const rendered = pool.renderTargetTemplate(template, "Selected Member");
    assert.doesNotMatch(rendered, /\{\{target\}\}/);
    if (/\{\{target\}\}/.test(template)) assert.match(rendered, /Selected Member/);
  }
  assert.equal(pool.renderTargetTemplate("Uy {{target}}, ano na?", "Selected Member"), "Uy Selected Member, ano na?");
});

test("Jaiden target pool avoids repeats within a full cycle per group", () => {
  const threadID = "jaiden-target-pool-test";
  pool.clearJaidenTargetPool(threadID);
  const replies = [];
  for (let i = 0; i < pool.TEMPLATES.length; i++) {
    replies.push(pool.pickJaidenTargetReply(threadID, "Selected Member", { random: () => 0.37 }));
  }
  assert.equal(new Set(replies).size, pool.TEMPLATES.length);
  pool.clearJaidenTargetPool(threadID);
});

test("forced Jaiden routing is connected to the dedicated separate pool", () => {
  const source = read("triggers.js");
  assert.match(source, /require\("\.\/jaiden-separate-pool"\)/);
  assert.match(source, /if \(options\?\.forceJaidenTarget === true\)/);
  assert.match(source, /pickJaidenSeparateReply\(\s*threadId/);
  const index = read("index.js");
  assert.match(index, /resolveTargetName\(api, threadID, dashboardTargetId/);
  assert.match(index, /savedName: savedBanatTarget\?\.target_name/);
  assert.match(index, /Jaiden target resolved:/);
  assert.match(index, /forceJaidenTarget:\s*true/);
});

test("Jaiden rotation survives a process-module reload", () => {
  const modulePath = require.resolve("../jaiden-target-pool");
  const threadID = "jaiden-reload-test-" + process.pid;
  let currentPool = require(modulePath);
  currentPool.clearJaidenTargetPool(threadID);
  const first = currentPool.pickJaidenTargetReply(threadID, "Reload Target", { random: () => 0.37 });
  delete require.cache[modulePath];
  currentPool = require(modulePath);
  const second = currentPool.pickJaidenTargetReply(threadID, "Reload Target", { random: () => 0.37 });
  assert.notEqual(first, second);
  assert.ok(currentPool.TEMPLATES.includes(first));
  assert.ok(currentPool.TEMPLATES.includes(second));
  currentPool.clearJaidenTargetPool(threadID);
  delete require.cache[modulePath];
});

test("Jaiden trigger mode preserves recognized bot commands", () => {
  const source = read("index.js");
  assert.ok(source.includes("function isRecognizedBangCommand(body)"));
  assert.ok(source.includes("if (isRecognizedBangCommand(body)) return false;"));
  assert.match(source, /!help/);
  assert.match(source, /!trivia/);
  assert.match(source, /!rpg/);
});

test("single-member SetNN validates group membership and only updates one protected nickname", () => {
  const source = read("index.js");
  const start = source.indexOf("const setSingleNicknameMatch");
  const end = source.indexOf("const setNicknameMatch", start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start, end);
  assert.match(body, /event\?\.messageReply\?\.senderID/);
  assert.match(body, /Object\.keys\(event\.mentions\)/);
  assert.match(body, /participantIDs\.includes\(participantID\)/);
  assert.match(body, /changeNicknameAsync\(api, requestedSingleNickname, threadID, participantID\)/);
  assert.match(body, /protectedNicknames\[participantID\] = requestedSingleNickname/);
  assert.match(body, /setProtectedNicknames\(threadID, senderId, protectedNicknames\)/);
  assert.doesNotMatch(body, /setMassNicknameRun\(/);
});
