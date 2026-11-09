"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  detectJaidenAutoTargetContext,
  getDefaultJaidenAutoTargetPools,
  getJaidenAutoTargetPools,
  setJaidenAutoTargetConfiguration,
  pickJaidenAutoTargetLine,
  renderJaidenAutoTargetLine,
  resetJaidenAutoTargetHistory,
} = require("../jaiden-auto-target-personality");

test("renders target name placeholders safely", () => {
  assert.equal(
    renderJaidenAutoTargetLine("{{NAME}} / {{FIRST_NAME}} / {{UPPER_NAME}}", "Ana Santos"),
    "Ana Santos / Ana / ANA SANTOS"
  );
});

test("uses a safe fallback when target name is missing or is an ID", () => {
  assert.equal(renderJaidenAutoTargetLine("{{NAME}}", "123456789"), "target");
  assert.equal(renderJaidenAutoTargetLine("{{NAME}}", ""), "target");
});

test("keeps the supplied Jaiden phrases in its own line pool", () => {
  const pools = getJaidenAutoTargetPools();
  assert.ok(pools.general.includes("{{NAME}} moka tanga😂😂☄️☄️"));
  assert.ok(pools.general.includes("HEV ABI OWNS {{UPPER_NAME}}🥷🩸🩸"));
  assert.ok(pools.general.some((line) => line.includes("bumagal ata si {{NAME}}")));
});

test("selects from a requested context pool and avoids immediate repeats", () => {
  resetJaidenAutoTargetHistory();
  const stripTrailingEmoji = (line) => line
    .replace(/(?:\s*[\p{Extended_Pictographic}\uFE0F\u200D]+)+\s*$/u, "")
    .trimEnd();
  const valid = new Set(getJaidenAutoTargetPools().laugh.map((line) =>
    stripTrailingEmoji(renderJaidenAutoTargetLine(line, "Ana"))
  ));
  const first = pickJaidenAutoTargetLine({ threadId: "gc-1", targetName: "Ana", context: "laugh" });
  const second = pickJaidenAutoTargetLine({ threadId: "gc-1", targetName: "Ana", context: "laugh" });
  assert.ok(valid.has(stripTrailingEmoji(first)));
  assert.ok(valid.has(stripTrailingEmoji(second)));
  assert.notEqual(first, second);
  resetJaidenAutoTargetHistory();
});

test("New Banat selection uses editable pools while original mode keeps built-in pools", () => {
  const defaults = getDefaultJaidenAutoTargetPools();
  const customLines = {
    general: ["CUSTOM NEW BANAT {{NAME}}"],
    insult: ["CUSTOM INSULT {{NAME}}"],
    laugh: ["CUSTOM LAUGH {{NAME}}"],
    command: ["CUSTOM COMMAND {{NAME}}"],
    boast: ["CUSTOM BOAST {{NAME}}"],
    slow: ["CUSTOM SLOW {{NAME}}"],
  };
  const enabledCategories = {
    general: true, insult: false, laugh: false,
    command: false, boast: false, slow: false,
  };
  try {
    setJaidenAutoTargetConfiguration({ lines: customLines, enabledCategories });
    const custom = pickJaidenAutoTargetLine({
      threadId: "new-banat-source-test",
      targetName: "Ana",
      context: "insult",
      useCustomPools: true,
    });
    const original = pickJaidenAutoTargetLine({
      threadId: "original-banat-source-test",
      targetName: "Ana",
      context: "general",
    });
    assert.match(custom, /CUSTOM NEW BANAT Ana/);
    assert.doesNotMatch(original, /CUSTOM NEW BANAT/);
  } finally {
    setJaidenAutoTargetConfiguration({
      lines: defaults,
      enabledCategories: Object.fromEntries(Object.keys(defaults).map(name => [name, true])),
    });
    resetJaidenAutoTargetHistory();
  }
});

test("provides exactly 100 unique lines in every Jaiden context pool", () => {
  const pools = getJaidenAutoTargetPools();
  assert.deepEqual(Object.keys(pools).sort(), ["boast", "command", "general", "insult", "laugh", "slow"]);
  for (const [name, lines] of Object.entries(pools)) {
    assert.equal(lines.length, 100, `${name} pool should contain 100 lines`);
    assert.equal(new Set(lines).size, 100, `${name} pool should not contain duplicates`);
    assert.ok(lines.every((line) => typeof line === "string" && line.trim().length > 0));
  }
});

test("expanded pools preserve target placeholders and render them", () => {
  const pools = getJaidenAutoTargetPools();
  for (const lines of Object.values(pools)) {
    for (const line of lines) {
      const rendered = renderJaidenAutoTargetLine(line, "Ana Santos");
      assert.ok(!/\{\{\s*(?:NAME|FIRST_NAME|UPPER_NAME)\s*\}\}/i.test(rendered));
    }
  }
});


test("varies the trailing emoji by context and avoids consecutive repeats", () => {
  resetJaidenAutoTargetHistory();
  const endings = [];
  for (let i = 0; i < 12; i += 1) {
    const line = pickJaidenAutoTargetLine({
      threadId: "emoji-gc",
      targetName: "Ana",
      context: "laugh",
    });
    const match = line.match(/(?:\p{Extended_Pictographic}\uFE0F?|\u2764\uFE0F)$/u);
    assert.ok(match, "every rendered taunt should end with an emoji");
    endings.push(match[0]);
  }
  for (let i = 1; i < endings.length; i += 1) {
    assert.notEqual(endings[i], endings[i - 1], "consecutive taunts should not reuse the same ending emoji");
  }
  resetJaidenAutoTargetHistory();
});

test("all 600 lines pass basic copy-quality checks", () => {
  const pools = getJaidenAutoTargetPools();
  const allowedPlaceholders = new Set(["NAME", "FIRST_NAME", "UPPER_NAME"]);
  for (const [poolName, lines] of Object.entries(pools)) {
    for (const line of lines) {
      assert.equal(line, line.trim(), `${poolName} line should not have outer whitespace`);
      assert.ok(!/\s{2,}/.test(line), `${poolName} line should not contain repeated spaces`);
      assert.ok(!/[,;:]$/.test(line), `${poolName} line should not end with a dangling separator`);
      const placeholders = [...line.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)];
      for (const placeholder of placeholders) {
        assert.ok(allowedPlaceholders.has(placeholder[1]), `unknown placeholder: ${placeholder[1]}`);
      }
      assert.ok(!/\{\{[^{}]*$|^[^{}]*\}\}/.test(line), `${poolName} line should not contain a broken placeholder`);
    }
    const composed = lines.filter((line) => line.includes(" — "));
    assert.ok(composed.length >= 80, `${poolName} pool should contain naturally joined Taglish lines`);
    assert.ok(composed.every((line) => / — \S+(?:\s+\S+){2,}/.test(line)), `${poolName} composed lines should have a complete follow-up phrase`);
  }
});

test("detects the target message context without changing unknown messages", () => {
  assert.equal(detectJaidenAutoTargetContext("HAHAHAHA 😂😂"), "laugh");
  assert.equal(detectJaidenAutoTargetContext("utos ka nang utos, sumunod ka"), "command");
  assert.equal(detectJaidenAutoTargetContext("ako ang champion, undefeated ako"), "boast");
  assert.equal(detectJaidenAutoTargetContext("bobo at tanga ka"), "insult");
  assert.equal(detectJaidenAutoTargetContext("ang tagal mo mag-reply, loading"), "slow");
  assert.equal(detectJaidenAutoTargetContext("kumusta na kayo?"), "general");
  assert.equal(detectJaidenAutoTargetContext(""), "general");
});
