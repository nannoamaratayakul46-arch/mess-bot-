"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ROTATION_INTERVAL_MS,
  trackBanatRotation,
  markBanatRotationReply,
  clearBanatRotation,
} = require("../banat-rotation");

test("one sender owns the first rotation window and other speakers are ignored", () => {
  const thread = "rotation-first-" + process.pid;
  clearBanatRotation(thread);

  assert.deepEqual(
    trackBanatRotation(thread, "A", { now: 1000, random: () => 0 }),
    { targetId: "A", isTarget: true, rotated: false, speakerCount: 1, intervalMs: ROTATION_INTERVAL_MS }
  );
  const b = trackBanatRotation(thread, "B", {
    now: 1000 + Math.floor(ROTATION_INTERVAL_MS / 4),
    random: () => 0,
  });
  const c = trackBanatRotation(thread, "C", {
    now: 1000 + Math.floor(ROTATION_INTERVAL_MS / 2),
    random: () => 0,
  });
  assert.equal(b.targetId, "A");
  assert.equal(b.isTarget, false);
  assert.equal(c.targetId, "A");
  assert.equal(c.isTarget, false);
  clearBanatRotation(thread);
});

test("target rotates after five seconds to another known speaker and excludes the previous target", () => {
  const thread = "rotation-next-" + process.pid;
  clearBanatRotation(thread);

  const startedAt = 1000;
  const secondAt = startedAt + Math.floor(ROTATION_INTERVAL_MS / 4);
  const thirdAt = startedAt + Math.floor(ROTATION_INTERVAL_MS / 2);
  trackBanatRotation(thread, "A", { now: startedAt, random: () => 0 });
  trackBanatRotation(thread, "B", { now: secondAt, random: () => 0 });
  trackBanatRotation(thread, "C", { now: thirdAt, random: () => 0 });

  const rotation = trackBanatRotation(thread, "A", {
    now: startedAt + ROTATION_INTERVAL_MS,
    random: () => 0,
  });
  assert.equal(rotation.targetId, "B");
  assert.equal(rotation.isTarget, false);
  assert.equal(rotation.rotated, true);

  const b = trackBanatRotation(thread, "B", {
    now: startedAt + ROTATION_INTERVAL_MS + 100,
    random: () => 0,
  });
  assert.equal(b.targetId, "B");
  assert.equal(b.isTarget, true);
  assert.equal(markBanatRotationReply(thread, "B", startedAt + ROTATION_INTERVAL_MS + 100), true);

  const next = trackBanatRotation(thread, "B", {
    now: startedAt + ROTATION_INTERVAL_MS + 100 + ROTATION_INTERVAL_MS,
    random: () => 0.99,
  });
  assert.equal(next.targetId, "C");
  assert.equal(next.isTarget, false);
  clearBanatRotation(thread);
});

test("rotation state is isolated by group and can be reset", () => {
  const first = "rotation-group-one-" + process.pid;
  const second = "rotation-group-two-" + process.pid;
  clearBanatRotation(first);
  clearBanatRotation(second);

  trackBanatRotation(first, "A", { now: 1000 });
  trackBanatRotation(second, "B", { now: 1000 });
  assert.equal(trackBanatRotation(first, "A", { now: 1500 }).targetId, "A");
  assert.equal(trackBanatRotation(second, "B", { now: 1500 }).targetId, "B");

  clearBanatRotation(first);
  clearBanatRotation(second);
});
