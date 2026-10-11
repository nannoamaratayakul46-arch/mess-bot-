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

test("dedicated Jaiden target pool substitutes the selected name in every template", () => {
  assert.ok(pool.TEMPLATES.length >= 30);
  for (const template of pool.TEMPLATES) {
    assert.match(template, /\{\{target\}\}/);
    assert.doesNotMatch(template, /\bjaiden\b/i);
    const rendered = pool.renderTargetTemplate(template, "Selected Member");
    assert.match(rendered, /Selected Member/);
    assert.doesNotMatch(rendered, /\{\{target\}\}/);
  }
});

test("Jaiden target pool avoids repeats within a full cycle per group", () => {
  const threadID = "jaiden-target-pool-test";
  pool.clearJaidenTargetPool(threadID);
  const replies = [];
  for (let i = 0; i < pool.TEMPLATES.length; i++) {
    replies.push(pool.pickJaidenTargetReply(threadID, "Selected Member", { random: () => 0.37 }));
  }
  assert.equal(new Set(replies).size, pool.TEMPLATES.length);
  assert.ok(replies.every((reply) => reply.includes("Selected Member")));
  pool.clearJaidenTargetPool(threadID);
});

test("forced Jaiden routing is connected to the dedicated target pool", () => {
  const source = read("triggers.js");
  assert.match(source, /require\("\.\/jaiden-target-pool"\)/);
  assert.match(source, /if \(options\?\.forceJaidenTarget === true\)/);
  assert.match(source, /pickJaidenTargetReply\(\s*threadId/);
  const index = read("index.js");
  assert.match(index, /forceJaidenTarget:\s*true/);
  assert.match(index, /resolveTargetName\(api, threadID, dashboardTargetId/);
  assert.match(index, /Jaiden target resolved:/);
  assert.match(index, /forceJaidenTarget:\s*true/);
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
