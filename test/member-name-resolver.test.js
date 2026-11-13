"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveGroupMembers } = require("../memberNameResolver");

test("member resolver retries generic Facebook User placeholders through profile-page lookup", async () => {
  const threadID = "member-name-profile-fallback-test";
  const userID = "123456789012";
  const api = {
    getCurrentUserID: () => "999999999999",
    getThreadInfo(_threadID, callback) {
      callback(null, {
        threadID,
        participantIDs: [userID],
        userInfo: [{ id: userID, name: "Facebook User", firstName: "Facebook" }],
      });
    },
    getUserInfo(ids, usePayload, callback) {
      if (typeof usePayload === "function") {
        callback = usePayload;
        usePayload = true;
      }
      const list = Array.isArray(ids) ? ids : [ids];
      const rows = list.map(id => usePayload === false
        ? { id, name: "Recovered Member Name", firstName: "Recovered", lastName: "Member" }
        : { id, name: "Facebook User", firstName: "Facebook" });
      callback(null, rows);
      return Promise.resolve(rows);
    },
  };

  const result = await resolveGroupMembers(api, threadID);
  assert.equal(result.members.length, 1);
  assert.equal(result.members[0].user_id, userID);
  assert.equal(result.members[0].name, "Recovered Member Name");
  assert.equal(result.members[0].resolved, true);
  assert.ok(result.diagnostics.profilePageCalls >= 1);
});
