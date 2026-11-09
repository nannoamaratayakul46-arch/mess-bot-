"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const personality = require("../jaiden-auto-target-personality");
const {
  CATEGORIES,
  normalizeSettings,
} = require("../jaidenTargetPersonalitySettings");

test("Jaiden Auto Target defaults expose six pools of 100 unique lines", () => {
  const defaults = personality.getDefaultJaidenAutoTargetPools();
  assert.deepEqual(Object.keys(defaults).sort(), CATEGORIES.slice().sort());
  for (const category of CATEGORIES) {
    assert.equal(defaults[category].length, 100);
    assert.equal(new Set(defaults[category]).size, 100);
  }
});

test("dashboard personality settings preserve category toggles and custom lines", () => {
  const defaults = personality.getDefaultJaidenAutoTargetPools();
  const lines = { ...defaults, general: ["Hello {{NAME}}"] };
  const enabledCategories = Object.fromEntries(CATEGORIES.map(category => [category, category !== "insult"]));
  const normalized = normalizeSettings({ lines, enabledCategories }, defaults);
  assert.deepEqual(normalized.lines.general, ["Hello {{NAME}}"]);
  assert.equal(normalized.enabledCategories.insult, false);
  assert.equal(normalized.enabledCategories.general, true);
});

test("dashboard personality settings reject empty, duplicate, and overlong lines", () => {
  const defaults = personality.getDefaultJaidenAutoTargetPools();
  assert.throws(
    () => normalizeSettings({ lines: { ...defaults, general: [] } }, defaults),
    /between 1 and 200 lines/
  );
  assert.throws(
    () => normalizeSettings({ lines: { ...defaults, general: ["same", "same"] } }, defaults),
    /duplicate lines/
  );
  assert.throws(
    () => normalizeSettings({ lines: { ...defaults, general: ["x".repeat(301)] } }, defaults),
    /300 characters or fewer/
  );
});

test("disabled context categories fall back to an enabled pool immediately", () => {
  const defaults = personality.getDefaultJaidenAutoTargetPools();
  const lines = { ...defaults, general: ["CUSTOM {{NAME}}"] };
  const enabledCategories = Object.fromEntries(CATEGORIES.map(category => [category, category === "general"]));
  try {
    personality.setJaidenAutoTargetConfiguration({ lines, enabledCategories });
    const reply = personality.pickJaidenAutoTargetLine({
      threadId: "dashboard-editor-test",
      targetName: "Ana Santos",
      context: "insult",
      useCustomPools: true,
    });
    assert.match(reply, /CUSTOM Ana Santos/);
  } finally {
    personality.setJaidenAutoTargetConfiguration({
      lines: defaults,
      enabledCategories: Object.fromEntries(CATEGORIES.map(category => [category, true])),
    });
    personality.resetJaidenAutoTargetHistory("dashboard-editor-test");
  }
});
