"use strict";

const db = require("./db");
const { isAdmin } = require("./permissions");

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
        updated_at BIGINT NOT NULL,
        protected_title TEXT,
        title_guard_enabled BOOLEAN NOT NULL DEFAULT FALSE
      );

      ALTER TABLE eclipse_nickname_guards
        ADD COLUMN IF NOT EXISTS protected_title TEXT;

      ALTER TABLE eclipse_nickname_guards
        ADD COLUMN IF NOT EXISTS title_guard_enabled BOOLEAN NOT NULL DEFAULT FALSE;
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
      RETURNING thread_id, user_id, enabled, updated_at,
                protected_title, title_guard_enabled
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
      SELECT
        thread_id,
        user_id,
        enabled,
        updated_at,
        protected_title,
        title_guard_enabled
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

function setTitleAsync(api, title, threadID) {
  return new Promise((resolve, reject) => {
    if (!api || typeof api.setTitle !== "function") {
      reject(new Error("This ws3-fca build does not expose api.setTitle()."));
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
      const result = api.setTitle(
        String(title),
        String(threadID),
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

async function rememberProtectedTitle(threadID, title) {
  await ensureNicknameGuardTable();

  const threadId = String(threadID || "").trim();
  const protectedTitle = String(title || "").trim();

  if (!threadId || !protectedTitle) {
    return null;
  }

  const { rows } = await db.query(
    `
      INSERT INTO eclipse_nickname_guards(
        thread_id,
        user_id,
        enabled,
        updated_at,
        protected_title,
        title_guard_enabled
      )
      VALUES($1, '', TRUE, $2, $3, TRUE)
      ON CONFLICT(thread_id)
      DO UPDATE SET
        protected_title = EXCLUDED.protected_title,
        title_guard_enabled = TRUE,
        updated_at = EXCLUDED.updated_at
      RETURNING thread_id, protected_title, title_guard_enabled
    `,
    [threadId, Date.now(), protectedTitle]
  );

  return rows[0] || null;
}

async function clearProtectedTitle(threadID) {
  await ensureNicknameGuardTable();

  const threadId = String(threadID || "").trim();
  if (!threadId) return false;

  const result = await db.query(
    `
      UPDATE eclipse_nickname_guards
      SET
        protected_title = NULL,
        title_guard_enabled = FALSE,
        updated_at = $2
      WHERE thread_id = $1
    `,
    [threadId, Date.now()]
  );

  return result.rowCount > 0;
}

async function handleTitleGuardEvent(api, event) {
  if (
    !event ||
    event.type !== "event" ||
    String(event.logMessageType || "") !== "log:thread-name"
  ) {
    return false;
  }

  const threadID = String(event.threadID || "").trim();
  const newTitle = String(
    event.logMessageData?.name || ""
  ).trim();
  const authorID = String(
    event.author ||
    event.authorID ||
    event.senderID ||
    ""
  ).trim();

  if (!threadID || !newTitle || !authorID) {
    return false;
  }

  let guard;

  try {
    guard = await getNicknameGuard(threadID);
  } catch (error) {
    console.error("[GC NAME GUARD] Failed to read guard:", error);
    return false;
  }

  const botID = String(
    typeof api?.getCurrentUserID === "function"
      ? api.getCurrentUserID()
      : ""
  ).trim();

  // The bot's own restoration event must never overwrite the protected title.
  if (botID && authorID === botID) {
    return true;
  }

  // An administrator is allowed to rename the GC. Their newest title becomes
  // the new protected title automatically — no duplicate command/file needed.
  if (isAdmin(authorID)) {
    try {
      await rememberProtectedTitle(threadID, newTitle);

      console.log(
        `[GC NAME GUARD] Protected title updated in ${threadID}: ${JSON.stringify(newTitle)}`
      );
    } catch (error) {
      console.error(
        "[GC NAME GUARD] Failed to remember administrator title:",
        error
      );
    }

    return true;
  }

  const protectedTitle = String(
    guard?.protected_title || ""
  ).trim();

  if (
    !guard ||
    guard.title_guard_enabled !== true ||
    !protectedTitle ||
    newTitle === protectedTitle
  ) {
    return false;
  }

  try {
    await setTitleAsync(
      api,
      protectedTitle,
      threadID
    );

    console.log(
      `[GC NAME GUARD] Reverted unauthorized title change in ${threadID}: ${JSON.stringify(newTitle)} -> ${JSON.stringify(protectedTitle)}`
    );

    return true;
  } catch (error) {
    console.error(
      `[GC NAME GUARD] Failed to restore protected title in ${threadID}:`,
      error
    );

    return false;
  }
}

async function handleNicknameGuardEvent(api, event) {
  if (
    await handleTitleGuardEvent(api, event)
  ) {
    return true;
  }

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
  rememberProtectedTitle,
  clearProtectedTitle,
  handleTitleGuardEvent,
  handleNicknameGuardEvent,
};
