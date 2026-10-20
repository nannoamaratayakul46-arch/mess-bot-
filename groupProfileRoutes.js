"use strict";

const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const express = require("express");

const COOLDOWN_MS = 10 * 60 * 1000;
const MAX_IMAGE_BYTES = 1024 * 1024;
const API_TIMEOUT_MS = 25_000;
const GUARD_INTERVAL_MS = Math.max(15_000, Math.min(120_000, Number(process.env.ECLIPSE_PROFILE_GUARD_INTERVAL_MS || 60_000)));
const RESTORE_RETRY_MS = Math.max(15_000, Math.min(5 * 60_000, Number(process.env.ECLIPSE_PROFILE_RESTORE_RETRY_MS || 30_000)));
const lastChange = new Map();
const lastRestoreAttempt = new Map();
const mismatchObservations = new Map();
let guardTimer = null;
let guardRunning = false;

function cooldownLeft(threadId, kind) {
  const key = threadId + ":" + kind;
  const last = lastChange.get(key) || 0;
  const left = COOLDOWN_MS - (Date.now() - last);
  if (left <= 0) {
    lastChange.delete(key);
    return 0;
  }
  return Math.ceil(left / 1000);
}

function messengerErrorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  if (error == null) return "Unknown Messenger API error.";
  const description = error?.errorDescription;
  const candidates = [
    typeof error === "string" ? error : "",
    error?.message,
    error?.errorSummary,
    typeof description === "string" ? description : "",
    description?.__html,
    error?.error,
  ].map(value => String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim())
   .filter(Boolean);
  const code = Number(error?.errorCode ?? error?.code ?? error?.error ?? 0);
  const message = candidates.find(value => !/^\[object Object\]$/i.test(value));
  if (message) return code && !message.includes(String(code))
    ? `Messenger error ${code}: ${message}`
    : message;
  return code ? `Messenger returned error code ${code}.` : "Unknown Messenger API error.";
}

function callApi(api, method, args) {
  return new Promise((resolve, reject) => {
    const fn = api && api[method];
    if (typeof fn !== "function") return reject(new Error("Messenger API method is unavailable: " + method));
    let settled = false;
    const done = (error, value) => {
      if (settled) return;
      settled = true;
      if (error) { const wrapped = new Error(messengerErrorMessage(error)); wrapped.cause = error; reject(wrapped); }
      else resolve(value);
    };
    let result;
    try { result = fn.call(api, ...args, done); }
    catch (error) { done(error); return; }
    if (result && typeof result.then === "function") {
      // ws3-fca may return a promise that resolves to null before its
      // getThreadInfo callback supplies the actual thread info. Ignore only
      // that empty promise result; let the callback provide the final value.
      result.then(
        value => {
          if (!["getThreadInfo", "getThreadInfoDeprecated", "getThreadList"].includes(method) || value != null) done(null, value);
        },
        error => done(error),
      );
    }
  });
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Messenger profile update timed out")), ms);
      timer.unref?.();
    }),
  ]).finally(() => clearTimeout(timer));
}

function decodeProfileImage(dataUrl) {
  if (typeof dataUrl !== "string") throw Object.assign(new Error("Choose a JPEG or PNG photo."), { status: 400 });
  const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw Object.assign(new Error("Photo must be a JPEG or PNG."), { status: 400 });
  const encoded = match[2];
  if (encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4) {
    throw Object.assign(new Error("Photo is too large (max 1 MB)."), { status: 413 });
  }
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES || buffer.toString("base64") !== encoded) {
    throw Object.assign(new Error("Photo data is invalid or too large (max 1 MB)."), { status: buffer.length > MAX_IMAGE_BYTES ? 413 : 400 });
  }
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if ((match[1] === "jpeg" && !isJpeg) || (match[1] === "png" && !isPng)) {
    throw Object.assign(new Error("Photo content does not match its file type."), { status: 400 });
  }
  return { buffer, extension: match[1] === "png" ? ".png" : ".jpg", mime: match[1] === "png" ? "image/png" : "image/jpeg" };
}

function normalizePhotoUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return (url.hostname + url.pathname).replace(/\/$/, "");
  } catch {
    return value.trim().split(/[?#]/, 1)[0] || null;
  }
}

function getImageUrl(info) {
  return normalizePhotoUrl(info?.imageSrc || info?.imageUrl || info?.threadPictureUrl || null);
}

function getPhotoUrlDiagnostic(info) {
  if (info == null) return "thread-info-null";
  if (typeof info !== "object") return "thread-info-unexpected-type";
  const fields = ["imageSrc", "imageUrl", "threadPictureUrl"];
  const present = fields.filter(field => Object.prototype.hasOwnProperty.call(info, field));
  if (!present.length) return "photo-url-fields-absent";
  if (getImageUrl(info)) return "photo-url-present";
  return "photo-url-fields-empty-or-invalid";
}

function sleep(ms) {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}


async function writeBufferToTemp(buffer, extension) {
  const file = path.join(os.tmpdir(), "eclipse-group-profile-" + crypto.randomBytes(12).toString("hex") + extension);
  await fsp.writeFile(file, buffer, { flag: "wx", mode: 0o600 });
  return file;
}

async function changeImage(api, threadId, buffer, extension) {
  // ws3-fca's documented changeGroupImage contract expects a file stream.
  // A real temporary file also supplies a filename to the upload implementation.
  const file = await writeBufferToTemp(buffer, extension);
  try {
    await withTimeout(callApi(api, "changeGroupImage", [fs.createReadStream(file), String(threadId)]), API_TIMEOUT_MS);
  } finally {
    await fsp.rm(file, { force: true }).catch(() => {});
  }
}

async function saveExpectedUrl(db, threadId, api) {
  try {
    const info = await withTimeout(callApi(api, "getThreadInfo", [threadId]), 10_000);
    const url = getImageUrl(info);
    if (url) {
      await db.query("UPDATE group_photo_guard SET expected_image_url = $2 WHERE thread_id = $1", [threadId, url]);
      return url;
    }
  } catch (error) {
    console.warn("[PHOTO-GUARD] Could not refresh expected photo URL for " + threadId + ": " + String(error?.message || error).slice(0, 120));
  }
  return null;
}

async function restoreSavedPhoto(api, db, row) {
  const threadId = String(row.thread_id);
  const data = Buffer.isBuffer(row.image_data) ? row.image_data : Buffer.from(row.image_data || "");
  if (!data.length) throw new Error("Saved photo backup is empty");
  await changeImage(api, threadId, data, row.image_mime === "image/png" ? ".png" : ".jpg");
  await sleep(2500);
  const url = await saveExpectedUrl(db, threadId, api);
  await db.query("UPDATE group_photo_guard SET last_restore_at = $2, updated_at = $2 WHERE thread_id = $1", [threadId, Date.now()]);
  console.log("[PHOTO-GUARD] Restored saved group photo for " + threadId + (url ? "" : " (photo URL not yet available)"));
}

// Share thread-list results across guard passes. A failed request is also
// cooled down so a Messenger outage/rate limit cannot trigger a request storm.
const sharedThreadLists = new WeakMap();
async function getSharedThreadList(api) {
  if (!api || (typeof api !== "object" && typeof api !== "function")) return null;
  let state = sharedThreadLists.get(api);
  if (!state) {
    state = { value: null, expiresAt: 0, failedUntil: 0, promise: null };
    sharedThreadLists.set(api, state);
  }
  const now = Date.now();
  if (state.value && now < state.expiresAt) return state.value;
  if (state.promise) return state.promise;
  if (now < state.failedUntil) return state.value;
  state.promise = withTimeout(callApi(api, "getThreadList", [1000, null, []]), 10_000)
    .then(value => {
      if (Array.isArray(value) && value.length) {
        state.value = value;
        state.expiresAt = Date.now() + 60_000;
        state.failedUntil = 0;
        return value;
      }
      state.failedUntil = Date.now() + 15_000;
      return state.value;
    })
    .catch(error => {
      state.failedUntil = Date.now() + 30_000;
      throw error;
    })
    .finally(() => { state.promise = null; });
  return state.promise;
}

async function getThreadInfoWithFallback(api, threadId, threadListState) {
  let info = null;
  try {
    info = await withTimeout(callApi(api, "getThreadInfo", [threadId]), 10_000);
  } catch (error) {
    console.warn("[PROFILE-GUARD] getThreadInfo failed for " + threadId + ": " + String(error?.message || error).slice(0, 120));
  }
  const hasUsefulFields = value => Boolean(value && typeof value === "object" && (
    getImageUrl(value) ||
    ["threadName", "name", "title", "thread_name"].some(key =>
      typeof value[key] === "string" && value[key].trim()
    )
  ));
  if (hasUsefulFields(info)) return info;

  // Do not call getThreadInfoDeprecated here. In the current ws3-fca
  // runtime it throws internally when Messenger omits the expected Mercury
  // payload, producing repeated errors for every protected group. Prefer the
  // supported thread-list fallback; if it is unavailable, fail closed by
  // skipping this pass rather than invoking the broken legacy method.

  // If thread info omits the group, fetch the thread list only once per guard
  // pass and reuse the matching group record for the remaining rows.
  if (typeof api?.getThreadList === "function") {
    try {
      if (!threadListState.promise) {
        threadListState.promise = getSharedThreadList(api);
      }
      const threads = await threadListState.promise;
      if (Array.isArray(threads)) {
        const listed = threads.find(item =>
          String(item?.threadID ?? item?.threadId ?? item?.thread_id ?? "") === String(threadId)
        );
        if (hasUsefulFields(listed)) return listed;
      }
    } catch (error) {
      console.warn("[PROFILE-GUARD] thread-list fallback failed for " + threadId + ": " + String(error?.message || error).slice(0, 120));
    }
  }
  return info;
}

function getGroupTitle(info) {
  for (const key of ["threadName", "name", "title", "thread_name"]) {
    if (typeof info?.[key] === "string" && info[key].trim()) return info[key].replace(/\s+/g, " ").trim();
  }
  return null;
}

async function runGuardCheck({ db, getApi, audit = () => {}, immediateThreadId = null }) {
  if (guardRunning) return;
  const api = getApi();
  if (!api || typeof api.getThreadInfo !== "function") return;
  guardRunning = true;
  try {
    const result = await db.query(
      "SELECT thread_id, image_data, image_mime, expected_image_url, expected_title, last_restore_at " +
      "FROM group_photo_guard WHERE enabled = TRUE AND (image_data IS NOT NULL OR expected_title IS NOT NULL) " +
      "ORDER BY updated_at ASC LIMIT 250"
    );
    const threadListState = { promise: null };
    for (const row of result.rows) {
      const threadId = String(row.thread_id);
      let info;
      try {
        info = await getThreadInfoWithFallback(api, threadId, threadListState);
      } catch (error) {
        console.warn("[PROFILE-GUARD] Info check failed for " + threadId + ": " + String(error?.message || error).slice(0, 140));
        continue;
      }
      if (!info || typeof info !== "object") {
        console.warn("[PROFILE-GUARD] Group profile unavailable for " + threadId + "; skipping this check.");
        const hasPhotoBackup = Buffer.isBuffer(row.image_data) ? row.image_data.length > 0 : Boolean(row.image_data);
        if (hasPhotoBackup) {
          console.warn("[PHOTO-GUARD] Current photo URL unavailable for " + threadId
            + " (reason: " + getPhotoUrlDiagnostic(info) + "); skipping this check.");
        }
        continue;
      }

      const currentTitle = getGroupTitle(info);
      const expectedTitle = typeof row.expected_title === "string" ? row.expected_title.trim() : "";
      const titleKey = threadId + ":title";
      if (expectedTitle && currentTitle && currentTitle !== expectedTitle) {
        const previous = mismatchObservations.get(titleKey);
        if ((!previous || previous.value !== currentTitle) && String(immediateThreadId || "") !== threadId) {
          mismatchObservations.set(titleKey, { value: currentTitle, at: Date.now() });
          console.warn("[PROFILE-GUARD] Group name differs for " + threadId + "; waiting for confirmation before restoring.");
        } else if (Date.now() - (lastRestoreAttempt.get(titleKey) || 0) >= RESTORE_RETRY_MS) {
          mismatchObservations.delete(titleKey);
          lastRestoreAttempt.set(titleKey, Date.now());
          try {
            if (typeof api.setTitle !== "function") throw new Error("setTitle is unavailable");
            await withTimeout(callApi(api, "setTitle", [expectedTitle, threadId]), API_TIMEOUT_MS);
            await db.query("UPDATE group_photo_guard SET last_restore_at = $2, updated_at = $2 WHERE thread_id = $1", [threadId, Date.now()]);
            audit("[PROFILE-GUARD] Restored saved group name in " + threadId);
          } catch (error) {
            console.warn("[PROFILE-GUARD] Name restore failed for " + threadId + ": " + String(error?.message || error).slice(0, 150));
          }
        }
      } else {
        mismatchObservations.delete(titleKey);
      }

      const hasPhotoBackup = Buffer.isBuffer(row.image_data) ? row.image_data.length > 0 : Boolean(row.image_data);
      if (!hasPhotoBackup) continue;
      const currentPhoto = getImageUrl(info);
      const expectedPhoto = normalizePhotoUrl(row.expected_image_url);
      const photoKey = threadId + ":image";
      if (!currentPhoto) {
        mismatchObservations.delete(photoKey);
        console.warn("[PHOTO-GUARD] Current photo URL unavailable for " + threadId
          + " (reason: " + getPhotoUrlDiagnostic(info) + "); skipping this check.");
        continue;
      }
      if (!expectedPhoto) {
        await db.query("UPDATE group_photo_guard SET expected_image_url = $2 WHERE thread_id = $1", [threadId, currentPhoto]);
        mismatchObservations.delete(photoKey);
        continue;
      }
      if (currentPhoto === expectedPhoto) {
        mismatchObservations.delete(photoKey);
        continue;
      }
      const previousPhoto = mismatchObservations.get(photoKey);
      if ((!previousPhoto || previousPhoto.value !== currentPhoto) && String(immediateThreadId || "") !== threadId) {
        mismatchObservations.set(photoKey, { value: currentPhoto, at: Date.now() });
        console.warn("[PHOTO-GUARD] Photo URL differs for " + threadId + "; waiting for confirmation before restoring.");
        continue;
      }
      if (Date.now() - (lastRestoreAttempt.get(photoKey) || 0) < RESTORE_RETRY_MS) continue;
      mismatchObservations.delete(photoKey);
      lastRestoreAttempt.set(photoKey, Date.now());
      audit("[PHOTO-GUARD] Photo change confirmed; restoring saved image in " + threadId);
      try {
        await restoreSavedPhoto(api, db, row);
      } catch (error) {
        console.warn("[PHOTO-GUARD] Restore failed for " + threadId + ": " + String(error?.message || error).replace(/[\r\n]+/g, " ").slice(0, 150));
      }
    }
  } catch (error) {
    console.warn("[PROFILE-GUARD] Check unavailable: " + String(error?.message || error).replace(/[\r\n]+/g, " ").slice(0, 150));
  } finally {
    guardRunning = false;
  }
}

function startGuardScheduler(dependencies) {
  if (guardTimer) return;
  guardTimer = setInterval(() => { void runGuardCheck(dependencies); }, GUARD_INTERVAL_MS);
  guardTimer.unref?.();
}

let activeGuardDependencies = null;

async function handleGroupProfileEvent(api, event) {
  const eventType = String(event?.logMessageType || "");
  const threadId = String(event?.threadID || "").trim();
  if (event?.type !== "event" || !threadId || !["log:thread-name", "log:thread-image"].includes(eventType)) return false;
  if (!activeGuardDependencies || !api) return false;
  await runGuardCheck({ ...activeGuardDependencies, getApi: () => api, immediateThreadId: threadId });
  return true;
}

function registerGroupProfileRoutes(app, { auth, getApi, isKnownGroup, db, audit = () => {} }) {
  if (!app || typeof app.put !== "function") throw new TypeError("An Express app is required.");
  if (typeof auth !== "function" || typeof getApi !== "function" || typeof isKnownGroup !== "function" || !db || typeof db.query !== "function") {
    throw new TypeError("auth, getApi, isKnownGroup, and db are required.");
  }
  const parseProfileJson = express.json({ limit: "1.5mb" });
  const validateGroup = (req, res) => {
    const threadId = String(req.params.threadId || "").trim();
    if (!threadId || !isKnownGroup(threadId)) {
      res.status(400).json({ ok: false, error: "Choose a group from the refreshed group list." });
      return null;
    }
    return threadId;
  };
  const parseBody = (req, res, next) => parseProfileJson(req, res, error => {
    if (!error) return next();
    const status = Number(error.status || error.statusCode) || 400;
    return res.status(status).json({ ok: false, error: status === 413 ? "Photo request is too large (max 1 MB image)." : "Invalid profile request body." });
  });

  app.get("/api/dashboard/groups/:threadId/profile/guard", auth, async (req, res) => {
    const threadId = validateGroup(req, res);
    if (!threadId) return;
    try {
      const result = await db.query("SELECT enabled, image_data IS NOT NULL AS has_backup, updated_at FROM group_photo_guard WHERE thread_id = $1", [threadId]);
      const row = result.rows[0];
      return res.json({ ok: true, enabled: Boolean(row?.enabled), has_backup: Boolean(row?.has_backup), updated_at: row?.updated_at || null });
    } catch (error) {
      audit("[PHOTO-GUARD] Settings read failed for " + threadId + ": " + String(error?.message || error).slice(0, 140));
      return res.status(503).json({ ok: false, error: "Photo protection settings are temporarily unavailable." });
    }
  });

  app.patch("/api/dashboard/groups/:threadId/profile/guard", auth, parseBody, async (req, res) => {
    const threadId = validateGroup(req, res);
    if (!threadId) return;
    if (typeof req.body?.enabled !== "boolean") return res.status(400).json({ ok: false, error: "Choose whether photo protection is on or off." });
    try {
      if (req.body.enabled) {
        const backup = await db.query("SELECT image_data IS NOT NULL AS has_backup, expected_title FROM group_photo_guard WHERE thread_id = $1", [threadId]);
        let hasPhotoBackup = Boolean(backup.rows[0]?.has_backup);
        let expectedTitle = String(backup.rows[0]?.expected_title || "").trim();

        // Name protection must not depend on having a photo backup. Snapshot
        // the current title when possible, then allow title-only protection.
        if (!expectedTitle) {
          const api = getApi();
          if (api) {
            try {
              const info = await getThreadInfoWithFallback(api, threadId, { promise: null });
              const currentTitle = getGroupTitle(info);
              if (currentTitle) {
                await db.query("UPDATE group_photo_guard SET expected_title = $2 WHERE thread_id = $1", [threadId, currentTitle]);
                expectedTitle = currentTitle;
              }
            } catch (error) {
              audit("[PROFILE-GUARD] Could not snapshot current group name for " + threadId + ": " + String(error?.message || error).slice(0, 120));
            }
          }
        }

        // Enabling protection without either a saved photo or a saved name
        // would falsely imply that the group profile is protected.
        if (!hasPhotoBackup && !expectedTitle) {
          return res.status(409).json({
            ok: false,
            error: "Save a group photo backup or set/save the group name first so the bot has something to restore."
          });
        }
      }
      const result = await db.query(`
        INSERT INTO group_photo_guard(thread_id, enabled, updated_at)
        VALUES ($1, $2, $3)
        ON CONFLICT(thread_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at
        RETURNING enabled, image_data IS NOT NULL AS has_backup
      `, [threadId, req.body.enabled, Date.now()]);
      audit("[PHOTO-GUARD] " + (req.body.enabled ? "Enabled" : "Disabled") + " for " + threadId);
      return res.json({ ok: true, enabled: Boolean(result.rows[0]?.enabled), has_backup: Boolean(result.rows[0]?.has_backup) });
    } catch (error) {
      audit("[PHOTO-GUARD] Settings update failed for " + threadId + ": " + String(error?.message || error).slice(0, 140));
      return res.status(503).json({ ok: false, error: "Could not save photo protection settings." });
    }
  });

  app.put("/api/dashboard/groups/:threadId/profile", auth, parseBody, async (req, res) => {
    const threadId = validateGroup(req, res);
    if (!threadId) return;
    const title = typeof req.body?.title === "string" ? req.body.title.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    const image = typeof req.body?.image === "string" ? req.body.image : "";
    if (Boolean(title) === Boolean(image)) return res.status(400).json({ ok: false, error: "Send either a group name or a photo, not both." });
    const api = getApi();
    if (!api) return res.status(503).json({ ok: false, error: "The bot is not connected to Messenger right now." });
    const kind = image ? "image" : "title";
    const wait = cooldownLeft(threadId, kind);
    if (wait) return res.status(429).json({ ok: false, error: "Cooldown active. Try again in " + Math.ceil(wait / 60) + " min.", retry_after_seconds: wait });
    try {
      if (title && typeof api.setTitle !== "function") return res.status(501).json({ ok: false, error: "This bot library has no setTitle method." });
      if (image && typeof api.changeGroupImage !== "function") return res.status(501).json({ ok: false, error: "This bot library has no changeGroupImage method." });
      if (title) {
        await withTimeout(callApi(api, "setTitle", [title, threadId]), API_TIMEOUT_MS);
        // Keep the expected GC name alongside the saved photo so the guard can
        // restore both pieces of the profile after manual resets.
        await db.query(
          "INSERT INTO group_photo_guard(thread_id, expected_title, updated_at) VALUES ($1, $2, $3) " +
          "ON CONFLICT(thread_id) DO UPDATE SET expected_title = EXCLUDED.expected_title, updated_at = EXCLUDED.updated_at",
          [threadId, title, Date.now()],
        );
      } else {
        const decoded = decodeProfileImage(image);
        await changeImage(api, threadId, decoded.buffer, decoded.extension);
        // Persist the actual backup in PostgreSQL; never depend on Render's temporary disk.
        const currentUrl = await saveExpectedUrl(db, threadId, api);
        await db.query(`
          INSERT INTO group_photo_guard(thread_id, enabled, image_data, image_mime, expected_image_url, updated_at)
          VALUES ($1, FALSE, $2, $3, $4, $5)
          ON CONFLICT(thread_id) DO UPDATE SET
            image_data = EXCLUDED.image_data,
            image_mime = EXCLUDED.image_mime,
            expected_image_url = EXCLUDED.expected_image_url,
            updated_at = EXCLUDED.updated_at
        `, [threadId, decoded.buffer, decoded.mime, currentUrl, Date.now()]);
      }
      lastChange.set(threadId + ":" + kind, Date.now());
      audit("[PROFILE] " + kind + " changed in " + threadId);
      return res.json({ ok: true, kind, ...(title ? { title } : {}), ...(image ? { backup_saved: true } : {}) });
    } catch (error) {
      const detail = String(error?.message || error).replace(/[\r\n]+/g, " ").slice(0, 180);
      audit("[PROFILE] " + kind + " change failed in " + threadId + ": " + detail);
      return res.status(502).json({ ok: false, error: "Group profile update failed: " + detail });
    }
  });

  activeGuardDependencies = { db, getApi, audit };
  startGuardScheduler(activeGuardDependencies);
}

module.exports = {
  registerGroupProfileRoutes,
  handleGroupProfileEvent,
  decodeProfileImage,
  normalizePhotoUrl,
  getImageUrl,
  runGuardCheck,
};
