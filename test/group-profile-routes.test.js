"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { decodeProfileImage, runGuardCheck } = require("../groupProfileRoutes");

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


test("photo guard skips restoration when Messenger does not return a current photo URL", async () => {
  let uploads = 0;
  const db = {
    async query(sql) {
      if (sql.includes("SELECT thread_id, image_data")) {
        return { rows: [{
          thread_id: "test-null-photo-url",
          image_data: Buffer.from([0xff, 0xd8, 0xff]),
          image_mime: "image/jpeg",
          expected_image_url: "cdn.example.com/saved-photo",
          last_restore_at: null,
        }] };
      }
      return { rows: [] };
    },
  };
  const api = {
    getThreadInfo(_threadId, callback) { callback(null, {}); },
    changeGroupImage() { uploads += 1; },
  };

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    await runGuardCheck({ db, getApi: () => api });
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(uploads, 0, "an unavailable URL must not trigger a photo upload");
  assert.ok(
    warnings.some(message => message.includes("reason: photo-url-fields-absent")),
    "diagnostics should identify a response object with no recognized photo URL fields",
  );
});

test("photo guard diagnostics distinguish a null thread-info response", async () => {
  let uploads = 0;
  const db = {
    async query(sql) {
      if (sql.includes("SELECT thread_id, image_data")) {
        return { rows: [{
          thread_id: "test-null-thread-info",
          image_data: Buffer.from([0xff, 0xd8, 0xff]),
          image_mime: "image/jpeg",
          expected_image_url: "cdn.example.com/saved-photo",
          last_restore_at: null,
        }] };
      }
      return { rows: [] };
    },
  };
  const api = {
    getThreadInfo(_threadId, callback) { callback(null, null); },
    changeGroupImage() { uploads += 1; },
  };

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    await runGuardCheck({ db, getApi: () => api });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(uploads, 0, "a null thread-info response must not trigger a photo upload");
  assert.ok(
    warnings.some(message => message.includes("reason: thread-info-null")),
    "diagnostics should distinguish a null thread-info response",
  );
});
