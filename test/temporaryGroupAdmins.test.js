"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { FIVE_DAYS_MS, policyFor } = require("../temporaryGroupAdmins");

test("temporary grant lasts exactly five days", () => {
  assert.equal(FIVE_DAYS_MS, 432000000);
});

test("active temporary admin has only limited delegated capabilities", () => {
  const expires = new Date(Date.now() + FIVE_DAYS_MS).toISOString();
  assert.deepEqual(policyFor("temporary", expires).canBan, false);
  assert.equal(policyFor("temporary", expires).canKick, true);
  assert.equal(policyFor("temporary", expires).canWarn, true);
  assert.equal(policyFor("temporary", expires).canReportSpam, true);
  assert.equal(policyFor("temporary", expires).canMassAction, false);
  assert.equal(policyFor("temporary", expires).canChangeRoles, false);
});

test("expired, revoked, and unknown roles fail closed", () => {
  const expired = new Date(Date.now() - 1).toISOString();
  assert.equal(policyFor("temporary", expired).active, false);
  assert.equal(policyFor("revoked", new Date(Date.now() + FIVE_DAYS_MS).toISOString()).active, false);
  assert.equal(policyFor("owner", new Date(Date.now() + FIVE_DAYS_MS).toISOString()).canKick, false);
});
