"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAntiSpam } = require("../antiSpam");

test("Raid Shield accepts numeric group/member IDs from confirmed join events", async () => {
  const queries = [];
  const db = {
    query: async (sql, params = []) => {
      queries.push({ sql: String(sql), params });
      return { rows: [], rowCount: 0 };
    },
  };
  const shield = createAntiSpam({
    db,
    getApi: () => api,
    getSettings: async () => ({ enabled: true }),
    setEnabled: async () => ({ enabled: true }),
    isKnownGroup: () => true,
    log: () => {},
  });
  const api = { getCurrentUserID: () => "999999" };
  await shield.onGroupEvent(api, {
    type: "event",
    logMessageType: "log:subscribe",
    threadID: "123456789",
    messageID: "join-event-1",
    logMessageData: {
      addedParticipants: [
        { userFbId: "111111" },
        { userFbId: "222222" },
        { userFbId: "333333" },
        { userFbId: "444444" },
        { userFbId: "555555" },
      ],
    },
  });

  const incidents = queries.filter(({ sql }) => sql.includes("INSERT INTO raid_shield_incidents"));
  assert.equal(incidents.length, 1, "five valid joins should emit one join-burst incident");
  assert.match(incidents[0].sql, /INSERT INTO raid_shield_incidents/);
  assert.equal(incidents[0].params[1], "123456789");
});
