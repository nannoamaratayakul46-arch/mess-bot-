"use strict";

const db = require("./db");

let tableReady = false;
let tablePromise = null;

async function ensureNicknameGuardTable() {
  if (tableReady) return;
  if (tablePromise) return tablePromise;

  tablePromise = (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS eclipse_nickname_guards (
        thread_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at BIGINT NOT NULL
      );
    `);

    tableReady = true;
  })();

  try {
    await tablePromise;
  } finally {
    tablePromise = null;
  }
}

async function setNicknameGuard(threadID, userID, enabled = true) {
  await ensureNicknameGuardTable();

  const threadId = String(threadID || "").trim();
  const userId = String(userID || "").trim();

  if (!threadId || !userId) {
    throw new Error("threadID and userID are required.");
  }

  const { rows } = await db.query(
    `
      INSERT INTO eclipse_nickname_guards(
        thread_id,
        user_id,
        enabled,
        updated_at
      )
      VALUES($1, $2, $3, $4)
      ON CONFLICT(thread_id)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        enabled = EXCLUDED.enabled,
        updated_at = EXCLUDED.updated_at
      RETURNING thread_id, user_id, enabled, updated_at
    `,
    [threadId, userId, Boolean(enabled), Date.now()]
  );

  return rows[0] || null;
}

async function getNicknameGuard(threadID) {
  await ensureNicknameGuardTable();

  const threadId = String(threadID || "").trim();
  if (!threadId) return null;

  const { rows } = await db.query(
    `
      SELECT thread_id, user_id, enabled, updated_at
      FROM eclipse_nickname_guards
      WHERE thread_id = $1
      LIMIT 1
    `,
    [threadId]
  );

  return rows[0] || null;
}

async function clearNicknameGuard(threadID) {
  await ensureNicknameGuardTable();

  const threadId = String(threadID || "").trim();
  if (!threadId) return false;

  const result = await db.query(
    `
      DELETE FROM eclipse_nickname_guards
      WHERE thread_id = $1
    `,
    [threadId]
  );

  return result.rowCount > 0;
}

function changeNicknameAsync(api, nickname, threadID, participantID) {
  return new Promise((resolve, reject) => {
    if (!api || typeof api.changeNickname !== "function") {
      reject(new Error("This ws3-fca build does not expose api.changeNickname()."));
      return;
    }

    let settled = false;

    const done = (error) => {
      if (settled) return;
      settled = true;

      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    try {
      const result = api.changeNickname(
        nickname,
        String(threadID),
        String(participantID),
        done
      );

      if (result && typeof result.then === "function") {
        result.then(() => done()).catch(done);
      }
    } catch (error) {
      done(error);
    }
  });
}

async function handleNicknameGuardEvent(api, event) {
  if (
    !event ||
    event.type !== "event" ||
    String(event.logMessageType || "") !== "log:user-nickname"
  ) {
    return false;
  }

  const threadID = String(event.threadID || "").trim();
  const data = event.logMessageData || {};
  const participantID = String(
    data.participant_id ||
    data.participantID ||
    data.user_id ||
    ""
  ).trim();

  if (!threadID || !participantID) {
    return false;
  }

  let guard;

  try {
    guard = await getNicknameGuard(threadID);
  } catch (error) {
    console.error("[NICK GUARD] Failed to read guard:", error);
    return false;
  }

  if (
    !guard ||
    guard.enabled !== true ||
    String(guard.user_id) !== participantID
  ) {
    return false;
  }

  const nickname = String(data.nickname || "").trim();

  // Empty nickname means the nickname has already been cleared.
  if (!nickname) {
    return false;
  }

  try {
    await changeNicknameAsync(
      api,
      "",
      threadID,
      participantID
    );

    console.log(
      "[NICK GUARD] Cleared protected nickname in thread " +
        threadID +
        " for user " +
        participantID
    );

    return true;
  } catch (error) {
    console.error(
      "[NICK GUARD] Failed to clear nickname in thread " +
        threadID +
        ":",
      error
    );

    return false;
  }
}

module.exports = {
  ensureNicknameGuardTable,
  setNicknameGuard,
  getNicknameGuard,
  clearNicknameGuard,
  handleNicknameGuardEvent,
};
