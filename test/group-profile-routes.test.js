"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { decodeProfileImage } = require("../groupProfileRoutes");

test("accepts a JPEG data URL and identifies its extension", () => {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);
  const result = decodeProfileImage("data:image/jpeg;base64," + bytes.toString("base64"));
  assert.equal(result.extension, ".jpg");
  assert.deepEqual(result.buffer, bytes);
});

test("accepts a PNG data URL and identifies its extension", () => {
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
  const result = decodeProfileImage("data:image/png;base64," + bytes.toString("base64"));
  assert.equal(result.extension, ".png");
  assert.deepEqual(result.buffer, bytes);
});

test("rejects malformed or mismatched image data", () => {
  assert.throws(() => decodeProfileImage("not an image"), /JPEG or PNG/);
  assert.throws(() => decodeProfileImage("data:image/png;base64," + Buffer.from([0xff, 0xd8, 0xff]).toString("base64")), /does not match/);
});

test("rejects images over the one-megabyte limit", () => {
  const bytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(1024 * 1024)]);
  assert.throws(() => decodeProfileImage("data:image/jpeg;base64," + bytes.toString("base64")), /too large/);
});
