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
        title_guard_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        protected_image BYTEA,
        image_guard_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        protected_nicknames JSONB NOT NULL DEFAULT '{}'::jsonb
      );

      ALTER TABLE eclipse_nickname_guards
        ADD COLUMN IF NOT EXISTS protected_title TEXT;

      ALTER TABLE eclipse_nickname_guards
        ADD COLUMN IF NOT EXISTS title_guard_enabled BOOLEAN NOT NULL DEFAULT FALSE;

      ALTER TABLE eclipse_nickname_guards
        ADD COLUMN IF NOT EXISTS protected_image BYTEA;

      ALTER TABLE eclipse_nickname_guards
        ADD COLUMN IF NOT EXISTS image_guard_enabled BOOLEAN NOT NULL DEFAULT FALSE;

      ALTER TABLE eclipse_nickname_guards
        ADD COLUMN IF NOT EXISTS protected_nicknames JSONB NOT NULL DEFAULT '{}'::jsonb;
      ALTER TABLE eclipse_nickname_guards
        ADD COLUMN IF NOT EXISTS setnn_nickname TEXT;

      ALTER TABLE eclipse_nickname_guards
        ADD COLUMN IF NOT EXISTS setnn_targets JSONB NOT NULL DEFAULT '[]'::jsonb;

      ALTER TABLE eclipse_nickname_guards
        ADD COLUMN IF NOT EXISTS setnn_next_index INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE eclipse_nickname_guards
        ADD COLUMN IF NOT EXISTS setnn_blocked_until BIGINT;
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


async function setProtectedNicknames(threadID, userID, nicknameMap) {
  await ensureNicknameGuardTable();

  const threadId = String(threadID || "").trim();
  const adminId = String(userID || "").trim();

  if (!threadId || !adminId || !nicknameMap || typeof nicknameMap !== "object") {
    throw new Error("threadID, userID and nicknameMap are required.");
  }

  const normalized = {};
  for (const [participantID, nickname] of Object.entries(nicknameMap)) {
    const id = String(participantID || "").trim();
    const value = String(nickname || "").trim();
    if (id && value) {
      normalized[id] = value;
    }
  }

  const { rows } = await db.query(
    `
      INSERT INTO eclipse_nickname_guards(
        thread_id,
        user_id,
        enabled,
        updated_at,
        protected_nicknames
      )
      VALUES($1, $2, TRUE, $3, $4::jsonb)
      ON CONFLICT(thread_id)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        enabled = TRUE,
        updated_at = EXCLUDED.updated_at,
        protected_nicknames = EXCLUDED.protected_nicknames
      RETURNING thread_id, user_id, enabled, updated_at, protected_nicknames
    `,
    [threadId, adminId, Date.now(), JSON.stringify(normalized)]
  );

  return rows[0] || null;
}

async function getProtectedNicknames(threadID) {
  await ensureNicknameGuardTable();

  const threadId = String(threadID || "").trim();
  if (!threadId) return {};

  const { rows } = await db.query(
    `
      SELECT protected_nicknames
      FROM eclipse_nickname_guards
      WHERE thread_id = $1
      LIMIT 1
    `,
    [threadId]
  );

  const value = rows[0]?.protected_nicknames;
  return value && typeof value === "object" ? value : {};
}

async function getMassNicknameRun(threadID) {
  await ensureNicknameGuardTable();

  const threadId = String(threadID || "").trim();
  if (!threadId) return null;

  const { rows } = await db.query(
    `
      SELECT
        thread_id,
        user_id,
        setnn_nickname,
        setnn_targets,
        setnn_next_index,
        setnn_blocked_until
      FROM eclipse_nickname_guards
      WHERE thread_id = $1
      LIMIT 1
    `,
    [threadId]
  );

  const row = rows[0];
  if (!row || !row.setnn_nickname) return null;

  let targets = [];
  try {
    targets = Array.isArray(row.setnn_targets)
      ? row.setnn_targets
      : [];
  } catch (_) {
    targets = [];
  }

  return {
    thread_id: row.thread_id,
    user_id: row.user_id,
    nickname: String(row.setnn_nickname || "").trim(),
    targets: targets
      .map((id) => String(id || "").trim())
      .filter(Boolean),
    next_index: Math.max(
      0,
      Number(row.setnn_next_index || 0)
    ),
    blocked_until:
      Number(row.setnn_blocked_until || 0)
  };
}

async function setMassNicknameRun(
  threadID,
  userID,
  nickname,
  targets,
  nextIndex,
  blockedUntil = null
) {
  await ensureNicknameGuardTable();

  const threadId = String(threadID || "").trim();
  const adminId = String(userID || "").trim();
  const value = String(nickname || "").trim();

  if (!threadId || !adminId || !value) {
    throw new Error(
      "threadID, userID and nickname are required."
    );
  }

  const normalizedTargets = Array.isArray(targets)
    ? targets
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    : [];

  const safeNextIndex = Math.max(
    0,
    Math.min(
      Number(nextIndex || 0),
      normalizedTargets.length
    )
  );

  const safeBlockedUntil =
    blockedUntil == null
      ? null
      : Math.max(
          0,
          Number(blockedUntil)
        );

  const { rows } = await db.query(
    `
      INSERT INTO eclipse_nickname_guards(
        thread_id,
        user_id,
        enabled,
        updated_at,
        setnn_nickname,
        setnn_targets,
        setnn_next_index,
        setnn_blocked_until
      )
      VALUES(
        $1,
        $2,
        TRUE,
        $3,
        $4,
        $5::jsonb,
        $6,
        $7
      )
      ON CONFLICT(thread_id)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        enabled = TRUE,
        updated_at = EXCLUDED.updated_at,
        setnn_nickname = EXCLUDED.setnn_nickname,
        setnn_targets = EXCLUDED.setnn_targets,
        setnn_next_index = EXCLUDED.setnn_next_index,
        setnn_blocked_until = EXCLUDED.setnn_blocked_until
      RETURNING
        thread_id,
        setnn_nickname,
        setnn_targets,
        setnn_next_index,
        setnn_blocked_until
    `,
    [
      threadId,
      adminId,
      Date.now(),
      value,
      JSON.stringify(normalizedTargets),
      safeNextIndex,
      safeBlockedUntil
    ]
  );

  return rows[0] || null;
}

async function clearMassNicknameRun(threadID) {
  await ensureNicknameGuardTable();

  const threadId = String(threadID || "").trim();
  if (!threadId) return false;

  const result = await db.query(
    `
      UPDATE eclipse_nickname_guards
      SET
        setnn_nickname = NULL,
        setnn_targets = '[]'::jsonb,
        setnn_next_index = 0,
        setnn_blocked_until = NULL,
        updated_at = $2
      WHERE thread_id = $1
    `,
    [threadId, Date.now()]
  );

  return result.rowCount > 0;
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

const nicknameWriteStateByThread = new Map();

function getNicknameWriteState(threadID) {
  const key = String(threadID || "").trim();
  if (!key) {
    throw new Error("threadID is required.");
  }

  let state = nicknameWriteStateByThread.get(key);

  if (!state) {
    state = {
      tail: Promise.resolve(),
      blockedUntil: 0,
    };
    nicknameWriteStateByThread.set(key, state);
  }

  return state;
}

function isNicknameMutationBlock(error) {
  const errorCode = Number(
    error?.error ??
      error?.code ??
      error?.errorCode ??
      error?.response?.error ??
      0
  );

  const errorText = [
    error?.errorSummary,
    error?.errorDescription?.__html,
    error?.errorDescription,
    error?.message,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    errorCode === 3252001 ||
    /temporarily blocked|going too fast|rate.?limit/i.test(errorText)
  );
}

function createNicknameMutationBlockedError(threadID, blockedUntil) {
  const error = new Error(
    "Nickname mutations are temporarily blocked for this thread."
  );

  error.nicknameMutationBlocked = true;
  error.threadID = String(threadID);
  error.blockedUntil = Number(blockedUntil || 0);
  error.errorCode = 3252001;

  return error;
}

function getNicknameMutationBlockedUntil(threadID) {
  const state = getNicknameWriteState(threadID);
  return Number(state.blockedUntil || 0);
}

function markNicknameMutationBlocked(threadID) {
  const state = getNicknameWriteState(threadID);
  const cooldownMs = Math.max(
    60_000,
    Number(
      process.env.ECLIPSE_NICKNAME_WRITE_COOLDOWN_MS ||
        15 * 60 * 1000
    )
  );

  state.blockedUntil = Math.max(
    Number(state.blockedUntil || 0),
    Date.now() + cooldownMs
  );

  return state.blockedUntil;
}

async function withNicknameWriteLock(threadID, operation) {
  const state = getNicknameWriteState(threadID);
  const previous = state.tail.catch(() => {});

  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });

  state.tail = previous.then(() => current);

  await previous;

  try {
    return await operation();
  } finally {
    release();
  }
}

function changeNicknameAsync(api, nickname, threadID, participantID) {
  const threadId = String(threadID || "").trim();
  const participantId = String(participantID || "").trim();

  return withNicknameWriteLock(threadId, async () => {
    const blockedUntil = getNicknameMutationBlockedUntil(threadId);

    if (blockedUntil > Date.now()) {
      throw createNicknameMutationBlockedError(
        threadId,
        blockedUntil
      );
    }

    return new Promise((resolve, reject) => {
      if (!api || typeof api.changeNickname !== "function") {
        reject(
          new Error(
            "This ws3-fca build does not expose api.changeNickname()."
          )
        );
        return;
      }

      let settled = false;

      const done = (error) => {
        if (settled) return;
        settled = true;

        if (error) {
          if (isNicknameMutationBlock(error)) {
            const nextBlockedUntil =
              markNicknameMutationBlocked(threadId);

            const wrapped = createNicknameMutationBlockedError(
              threadId,
              nextBlockedUntil
            );

            wrapped.cause = error;
            reject(wrapped);
            return;
          }

          reject(error);
        } else {
          resolve();
        }
      };

      try {
        const result = api.changeNickname(
          nickname,
          threadId,
          participantId,
          done
        );

        if (result && typeof result.then === "function") {
          result.then(() => done()).catch(done);
        }
      } catch (error) {
        done(error);
      }
    });
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

async function rememberProtectedImage(threadID, imageBuffer) {
  await ensureNicknameGuardTable();

  const threadId = String(threadID || "").trim();

  if (!threadId || !Buffer.isBuffer(imageBuffer) || !imageBuffer.length) {
    return null;
  }

  const maxBytes = Math.max(
    64 * 1024,
    Number(process.env.ECLIPSE_MAX_GC_IMAGE_BYTES || 2 * 1024 * 1024)
  );

  if (imageBuffer.length > maxBytes) {
    throw new Error(
      "GC image exceeds the protected image size limit."
    );
  }

  const { rows } = await db.query(
    `
      INSERT INTO eclipse_nickname_guards(
        thread_id,
        user_id,
        enabled,
        updated_at,
        protected_image,
        image_guard_enabled
      )
      VALUES($1, '', TRUE, $2, $3, TRUE)
      ON CONFLICT(thread_id)
      DO UPDATE SET
        protected_image = EXCLUDED.protected_image,
        image_guard_enabled = TRUE,
        updated_at = EXCLUDED.updated_at
      RETURNING thread_id, image_guard_enabled
    `,
    [threadId, Date.now(), imageBuffer]
  );

  return rows[0] || null;
}

async function getProtectedImage(threadID) {
  await ensureNicknameGuardTable();

  const threadId = String(threadID || "").trim();
  if (!threadId) return null;

  const { rows } = await db.query(
    `
      SELECT protected_image, image_guard_enabled
      FROM eclipse_nickname_guards
      WHERE thread_id = $1
      LIMIT 1
    `,
    [threadId]
  );

  if (!rows[0] || rows[0].image_guard_enabled !== true) {
    return null;
  }

  return rows[0].protected_image
    ? Buffer.from(rows[0].protected_image)
    : null;
}

async function clearProtectedImage(threadID) {
  await ensureNicknameGuardTable();

  const threadId = String(threadID || "").trim();
  if (!threadId) return false;

  const result = await db.query(
    `
      UPDATE eclipse_nickname_guards
      SET
        protected_image = NULL,
        image_guard_enabled = FALSE,
        updated_at = $2
      WHERE thread_id = $1
    `,
    [threadId, Date.now()]
  );

  return result.rowCount > 0;
}

function changeGroupImageAsync(api, imageBuffer, threadID) {
  return new Promise((resolve, reject) => {
    if (!api || typeof api.changeGroupImage !== "function") {
      reject(
        new Error(
          "This ws3-fca build does not expose api.changeGroupImage()."
        )
      );
      return;
    }

    let settled = false;

    const done = (error) => {
      if (settled) return;
      settled = true;

      if (error) reject(error);
      else resolve();
    };

    try {
      const result = api.changeGroupImage(
        require("stream").Readable.from(imageBuffer),
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

async function fetchImageBuffer(url) {
  const imageUrl = String(url || "").trim();
  if (!/^https?:\/\//i.test(imageUrl)) {
    return null;
  }

  const maxBytes = Math.max(
    64 * 1024,
    Number(process.env.ECLIPSE_MAX_GC_IMAGE_BYTES || 2 * 1024 * 1024)
  );

  const response = await fetch(imageUrl, {
    signal: AbortSignal.timeout(
      Math.max(
        5_000,
        Number(process.env.ECLIPSE_GC_IMAGE_FETCH_TIMEOUT_MS || 20_000)
      )
    )
  });

  if (!response.ok) {
    throw new Error(
      `GC image download failed with HTTP ${response.status}.`
    );
  }

  const length = Number(response.headers.get("content-length") || 0);

  if (length > maxBytes) {
    throw new Error("GC image exceeds the protected image size limit.");
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length > maxBytes) {
    throw new Error("GC image exceeds the protected image size limit.");
  }

  return buffer;
}

async function handleImageGuardEvent(api, event) {
  if (
    !event ||
    event.type !== "event" ||
    String(event.logMessageType || "") !== "log:thread-image"
  ) {
    return false;
  }

  const threadID = String(event.threadID || "").trim();
  const authorID = String(
    event.author ||
    event.authorID ||
    event.senderID ||
    ""
  ).trim();

  if (!threadID || !authorID) {
    return false;
  }

  const botID = String(
    typeof api?.getCurrentUserID === "function"
      ? api.getCurrentUserID()
      : ""
  ).trim();

  if (botID && authorID === botID) {
    return true;
  }

  // Dashboard photo protection is the authoritative guard for groups with
  // a saved dashboard backup. Do not let this legacy event guard restore its
  // separate (potentially stale) eclipse_nickname_guards backup over it.
  // If the database check fails, fail closed and skip this legacy restore.
  try {
    const dashboardGuard = await db.query(
      `SELECT enabled, image_data IS NOT NULL AS has_backup
       FROM group_photo_guard
       WHERE thread_id = $1
       LIMIT 1`,
      [threadID]
    );
    const dashboardRow = dashboardGuard.rows?.[0];
    if (dashboardRow?.enabled === true && dashboardRow?.has_backup === true) {
      return true;
    }
  } catch (error) {
    console.error(
      `[GC PIC GUARD] Could not verify dashboard guard for ${threadID}; skipping legacy image restore:`,
      error?.message || error
    );
    return true;
  }

  const imageData = event.logMessageData?.image || {};
  const imageUrl = String(
    imageData.src ||
    imageData.url ||
    imageData.image_url ||
    event.logMessageData?.src ||
    event.logMessageData?.url ||
    ""
  ).trim();

  if (isAdmin(authorID)) {
    if (!imageUrl) {
      console.warn(
        "[GC PIC GUARD] Admin changed the GC picture, but Messenger did not provide an image URL to persist."
      );
      return true;
    }

    try {
      const imageBuffer = await fetchImageBuffer(imageUrl);
      if (imageBuffer) {
        await rememberProtectedImage(threadID, imageBuffer);
        console.log(
          `[GC PIC GUARD] Protected admin-set picture for ${threadID} (${imageBuffer.length} bytes).`
        );
      }
    } catch (error) {
      console.error(
        "[GC PIC GUARD] Failed to persist administrator picture:",
        error
      );
    }

    return true;
  }

  try {
    const protectedImage = await getProtectedImage(threadID);

    if (!protectedImage) {
      return false;
    }

    await changeGroupImageAsync(
      api,
      protectedImage,
      threadID
    );

    console.log(
      `[GC PIC GUARD] Reverted unauthorized picture change in ${threadID}.`
    );

    return true;
  } catch (error) {
    console.error(
      `[GC PIC GUARD] Failed to restore protected picture in ${threadID}:`,
      error
    );

    return false;
  }
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
    await handleImageGuardEvent(api, event)
  ) {
    return true;
  }

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

  if (!guard || guard.enabled !== true) {
    return false;
  }

  let protectedNicknames = {};

  try {
    protectedNicknames = await getProtectedNicknames(threadID);
  } catch (error) {
    console.error("[NICK GUARD] Failed to read protected nicknames:", error);
    return false;
  }

  const desiredNickname = String(
    protectedNicknames?.[participantID] || ""
  ).trim();

  if (!desiredNickname) {
    return false;
  }

  const nickname = String(data.nickname || "").trim();

  // Messenger emits the event after the nickname changed. If it is already
  // correct, do nothing. Otherwise immediately restore the protected value.
  if (nickname === desiredNickname) {
    return true;
  }

  try {
    await changeNicknameAsync(
      api,
      desiredNickname,
      threadID,
      participantID
    );

    console.log(
      "[NICK GUARD] Restored protected nickname in thread " +
        threadID +
        " for user " +
        participantID +
        " -> " +
        JSON.stringify(desiredNickname)
    );

    return true;
  } catch (error) {
    console.error(
      "[NICK GUARD] Failed to restore nickname in thread " +
        threadID +
        " for user " +
        participantID +
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
  setProtectedNicknames,
  getProtectedNicknames,
  getMassNicknameRun,
  setMassNicknameRun,
  clearMassNicknameRun,
  changeNicknameAsync,
  rememberProtectedTitle,
  clearProtectedTitle,
  handleTitleGuardEvent,
  handleImageGuardEvent,
  rememberProtectedImage,
  getProtectedImage,
  clearProtectedImage,
  handleNicknameGuardEvent,
};
