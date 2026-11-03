"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
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
