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

test("photo guard prefers getThreadInfo callback data over a null promise result", async () => {
  let uploads = 0;
  const db = {
    async query(sql) {
      if (sql.includes("SELECT thread_id, image_data")) {
        return { rows: [{
          thread_id: "test-thread-info-promise-race",
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
    getThreadInfo(_threadId, callback) {
      setImmediate(() => callback(null, { imageSrc: "https://cdn.example.com/saved-photo" }));
      return Promise.resolve(null);
    },
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

  assert.equal(uploads, 0, "matching callback data must not trigger a photo upload");
  assert.equal(
    warnings.some(message => message.includes("reason: thread-info-null")),
    false,
    "a null promise result must not mask the callback's thread-info object",
  );
});

test("profile guard avoids broken deprecated thread-info and uses thread-list fallback", async () => {
  let deprecatedCalls = 0;
  let uploads = 0;
  const db = {
    async query(sql) {
      if (sql.includes("SELECT thread_id, image_data")) {
        return { rows: [{
          thread_id: "test-thread-list-fallback",
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
    getThreadInfoDeprecated() {
      deprecatedCalls += 1;
      throw new TypeError("Cannot read properties of undefined (reading 'error')");
    },
    getThreadList(_limit, _cursor, _tags, callback) {
      callback(null, [{ threadID: "test-thread-list-fallback", imageSrc: "https://cdn.example.com/saved-photo" }]);
    },
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

  assert.equal(deprecatedCalls, 0, "the broken deprecated API must not be called");
  assert.equal(uploads, 0, "matching thread-list data must not trigger restoration");
  assert.equal(
    warnings.some(message => message.includes("legacy thread info failed")),
    false,
    "the deprecated API failure should no longer be logged",
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

test("photo guard requires a second mismatch observation even for a thread-image event", async () => {
  let uploads = 0;
  const threadId = "test-photo-event-confirmation";
  const db = {
    async query(sql) {
      if (sql.includes("SELECT thread_id, image_data")) {
        return { rows: [{
          thread_id: threadId,
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
    getThreadInfo(_id, callback) {
      callback(null, { imageSrc: "https://cdn.example.com/other-photo" });
    },
    changeGroupImage(_stream, _id, callback) {
      uploads += 1;
      if (callback) callback(null, true);
    },
  };
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await runGuardCheck({ db, getApi: () => api, immediateThreadId: threadId });
    assert.equal(uploads, 0, "the event's first mismatch must not immediately upload a photo");
    await runGuardCheck({ db, getApi: () => api, immediateThreadId: threadId });
    assert.equal(uploads, 1, "a second matching observation may trigger one restore");
  } finally {
    console.warn = originalWarn;
  }
});

