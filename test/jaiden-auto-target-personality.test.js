"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  detectJaidenAutoTargetContext,
  getJaidenAutoTargetPools,
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
  const valid = new Set(getJaidenAutoTargetPools().laugh.map((line) =>
    renderJaidenAutoTargetLine(line, "Ana")
  ));
  const first = pickJaidenAutoTargetLine({ threadId: "gc-1", targetName: "Ana", context: "laugh" });
  const second = pickJaidenAutoTargetLine({ threadId: "gc-1", targetName: "Ana", context: "laugh" });
  assert.ok(valid.has(first));
  assert.ok(valid.has(second));
  assert.notEqual(first, second);
  resetJaidenAutoTargetHistory();
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
      assert.ok(!/\\{\\{\\s*(?:NAME|FIRST_NAME|UPPER_NAME)\\s*\\}\\}/i.test(rendered));
    }
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
