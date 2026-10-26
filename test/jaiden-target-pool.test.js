"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pool = require("../banat-jaiden");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

test("Banat Jaiden pool has 400 non-empty replies and renders optional placeholders", () => {
  assert.equal(pool.TEMPLATES.length, 400);
  for (const template of pool.TEMPLATES) {
    assert.equal(typeof template, "string");
    assert.ok(template.trim().length > 0);
    assert.doesNotMatch(template, /\bjaiden\b/i);
    const rendered = pool.renderBanatJaidenTemplate(template, "Selected Member");
    assert.doesNotMatch(rendered, /\{\{target\}\}/);
    if (/\{\{target\}\}/.test(template)) assert.match(rendered, /Selected Member/);
  }
  assert.equal(pool.renderBanatJaidenTemplate("Uy {{target}}, ano na?", "Selected Member"), "Uy Selected Member, ano na?");
});

test("Banat Jaiden pool avoids repeats within a full cycle per group", () => {
  const threadID = "banat-jaiden-test";
  pool.clearBanatJaidenPool(threadID);
  const replies = [];
  for (let i = 0; i < pool.TEMPLATES.length; i++) {
    replies.push(pool.pickBanatJaidenReply(threadID, "Selected Member", { random: () => 0.37 }));
  }
  assert.equal(new Set(replies).size, pool.TEMPLATES.length);
  pool.clearBanatJaidenPool(threadID);
});

test("Jaiden rotation survives a process-module reload", () => {
  const modulePath = require.resolve("../banat-jaiden");
  const threadID = "jaiden-reload-test-" + process.pid;
  let currentPool = require(modulePath);
  currentPool.clearBanatJaidenPool(threadID);
  const first = currentPool.pickBanatJaidenReply(threadID, "Reload Target");
  delete require.cache[modulePath];
  currentPool = require(modulePath);
  const second = currentPool.pickBanatJaidenReply(threadID, "Reload Target");
  assert.notEqual(first, second);
  const renderedTemplates = currentPool.TEMPLATES.map((template) =>
    currentPool.renderBanatJaidenTemplate(template, "Reload Target")
  );
  assert.ok(renderedTemplates.includes(first));
  assert.ok(renderedTemplates.includes(second));
  currentPool.clearBanatJaidenPool(threadID);
  delete require.cache[modulePath];
});

test("forced Jaiden routing is connected to the Banat Jaiden pool", () => {
  const source = read("triggers.js");
  assert.match(source, /require\("\.\/banat-jaiden"\)/);
  assert.match(source, /if \(options\?\.forceJaidenTarget === true\)/);
  assert.match(source, /pickBanatJaidenReply\(\s*threadId/);
  const index = read("index.js");
  assert.match(index, /resolveTargetName\(api, threadID, dashboardTargetId/);
  assert.match(index, /savedName: savedBanatTarget\?\.target_name/);
  assert.match(index, /Jaiden target resolved:/);
  assert.match(index, /forceJaidenTarget:\s*true/);
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
