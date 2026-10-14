"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { FIVE_DAYS_MS, KICK_LIMIT, policyFor, allowTemporaryKick } = require("../temporaryGroupAdmins");

test("temporary grant lasts exactly five days", () => {
  assert.equal(FIVE_DAYS_MS, 432000000);
});

test("active temporary admin has only limited delegated capabilities", () => {
  const expires = new Date(Date.now() + FIVE_DAYS_MS).toISOString();
  const policy = policyFor("temporary", expires);
  assert.equal(policy.canBan, false);
  assert.equal(policy.canKick, true);
  assert.equal(policy.canWarn, true);
  assert.equal(policy.canReportSpam, true);
  assert.equal(policy.canMassAction, false);
  assert.equal(policy.canChangeRoles, false);
});

test("expired, revoked, and unknown roles fail closed", () => {
  const expired = new Date(Date.now() - 1).toISOString();
  assert.equal(policyFor("temporary", expired).active, false);
  assert.equal(policyFor("revoked", new Date(Date.now() + FIVE_DAYS_MS).toISOString()).active, false);
  assert.equal(policyFor("owner", new Date(Date.now() + FIVE_DAYS_MS).toISOString()).canKick, false);
});

test("temporary kick limiter permits three actions per minute then blocks", () => {
  const now = 1800000000000;
  assert.equal(KICK_LIMIT, 3);
  assert.equal(allowTemporaryKick("group-123456", "member-123456", now), true);
  assert.equal(allowTemporaryKick("group-123456", "member-123456", now + 1), true);
  assert.equal(allowTemporaryKick("group-123456", "member-123456", now + 2), true);
  assert.equal(allowTemporaryKick("group-123456", "member-123456", now + 3), false);
  assert.equal(allowTemporaryKick("group-123456", "member-123456", now + 60001), true);
});
