"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getThreadList, getThreadFromList } = require("../messengerThreadList");

test("thread-list lookup finds a matching Messenger group", async () => {
  let calls = 0;
  const expected = { threadID: "123456789012345", threadName: "Example GC", participantIDs: ["123456789012345"] };
  const api = {
    getThreadList(_limit, _timestamp, _tags, callback) {
      calls++;
      callback(null, [expected]);
    }
  };

  const result = await getThreadFromList(api, expected.threadID);
  assert.equal(result, expected);
  assert.equal(calls, 1);
});

test("thread-list lookup reuses the shared session cache", async () => {
  let calls = 0;
  const api = {
    getThreadList(_limit, _timestamp, _tags, callback) {
      calls++;
      callback(null, [
        { threadID: "123456789012345", threadName: "First GC" },
        { threadID: "223456789012345", threadName: "Second GC" }
      ]);
    }
  };

  const first = await getThreadFromList(api, "123456789012345");
  const second = await getThreadFromList(api, "223456789012345");
  assert.equal(first.threadName, "First GC");
  assert.equal(second.threadName, "Second GC");
  assert.equal(calls, 1);
});

test("thread-list lookup rejects invalid IDs without making Messenger requests", async () => {
  let calls = 0;
  const api = { getThreadList() { calls++; } };
  assert.equal(await getThreadFromList(api, "not-a-thread-id"), null);
  assert.equal(calls, 0);
});

test("thread-list lookup accepts promise-returning API wrappers", async () => {
  const expected = { threadID: "323456789012345", threadName: "Promise GC" };
  const api = {
    getThreadList() {
      return Promise.resolve([expected]);
    }
  };
  assert.equal(await getThreadFromList(api, expected.threadID), expected);
});

test("thread-list lookup returns null when the requested group is absent", async () => {
  const api = {
    getThreadList(_limit, _timestamp, _tags, callback) {
      callback(null, [{ threadID: "423456789012345", threadName: "Other GC" }]);
    }
  };
  assert.equal(await getThreadFromList(api, "523456789012345"), null);
});
