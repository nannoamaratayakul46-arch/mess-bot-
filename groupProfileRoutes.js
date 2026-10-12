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
const GUARD_INTERVAL_MS = 2 * 60 * 1000;
const RESTORE_RETRY_MS = 5 * 60 * 1000;
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

function callApi(api, method, args) {
  return new Promise((resolve, reject) => {
    const fn = api && api[method];
    if (typeof fn !== "function") return reject(new Error("Messenger API method is unavailable: " + method));
    let settled = false;
    const done = (error, value) => {
      if (settled) return;
      settled = true;
      if (error) reject(error instanceof Error ? error : new Error(String(error)));
      else resolve(value);
    };
    let result;
    try { result = fn.call(api, ...args, done); }
    catch (error) { done(error); return; }
    if (result && typeof result.then === "function") result.then(value => done(null, value), done);
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
  const file = await writeBufferToTemp(buffer, extension);
  try {
    await withTimeout(callApi(api, "changeGroupImage", [fs.createReadStream(file), threadId]), API_TIMEOUT_MS);
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

async function runGuardCheck({ db, getApi, audit = () => {} }) {
  if (guardRunning) return;
  const api = getApi();
  if (!api || typeof api.getThreadInfo !== "function" || typeof api.changeGroupImage !== "function") return;
  guardRunning = true;
  try {
    const result = await db.query(`
      SELECT thread_id, image_data, image_mime, expected_image_url, last_restore_at
      FROM group_photo_guard
      WHERE enabled = TRUE AND image_data IS NOT NULL
      ORDER BY updated_at ASC
      LIMIT 250
    `);
    for (const row of result.rows) {
      const threadId = String(row.thread_id);
      const lastAttempt = lastRestoreAttempt.get(threadId) || 0;
      if (Date.now() - lastAttempt < RESTORE_RETRY_MS) continue;
      try {
        const info = await withTimeout(callApi(api, "getThreadInfo", [threadId]), 10_000);
        const current = getImageUrl(info);
        const expected = normalizePhotoUrl(row.expected_image_url);

        // A missing Messenger photo URL is an unavailable observation, not proof
        // that the group photo changed. Never upload a backup on a null URL.
        if (!current) {
          mismatchObservations.delete(threadId);
          console.warn("[PHOTO-GUARD] Current photo URL unavailable for " + threadId + "; skipping this check.");
          continue;
        }

        if (!expected) {
          await db.query("UPDATE group_photo_guard SET expected_image_url = $2 WHERE thread_id = $1", [threadId, current]);
          mismatchObservations.delete(threadId);
          continue;
        }

        if (current === expected) {
          mismatchObservations.delete(threadId);
          continue;
        }

        // Confirm the same differing URL in two checks before restoring. This
        // avoids treating transient/rotating Messenger CDN URLs as a real change.
        const previousMismatch = mismatchObservations.get(threadId);
        if (!previousMismatch || previousMismatch.url !== current) {
          mismatchObservations.set(threadId, { url: current, at: Date.now() });
          console.warn("[PHOTO-GUARD] Photo URL differs for " + threadId + "; waiting for confirmation before restoring.");
          continue;
        }

        mismatchObservations.delete(threadId);
        lastRestoreAttempt.set(threadId, Date.now());
        audit("[PHOTO-GUARD] Photo change confirmed; restoring saved image in " + threadId);
        await restoreSavedPhoto(api, db, row);
      } catch (error) {
        console.warn("[PHOTO-GUARD] Check failed for " + threadId + ": " + String(error?.message || error).replace(/[\r\n]+/g, " ").slice(0, 150));
      }
    }
  } catch (error) {
    // Database may not be ready yet during boot. The next scheduled check retries.
    console.warn("[PHOTO-GUARD] Check unavailable: " + String(error?.message || error).replace(/[\r\n]+/g, " ").slice(0, 150));
  } finally {
    guardRunning = false;
  }
}

function startGuardScheduler(dependencies) {
  if (guardTimer) return;
  guardTimer = setInterval(() => { void runGuardCheck(dependencies); }, GUARD_INTERVAL_MS);
  guardTimer.unref?.();
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
        const backup = await db.query("SELECT image_data IS NOT NULL AS has_backup FROM group_photo_guard WHERE thread_id = $1", [threadId]);
        if (!backup.rows[0]?.has_backup) return res.status(409).json({ ok: false, error: "Set a group photo first so the bot has a saved backup." });
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
    let tmpFile = "";
    try {
      if (title && typeof api.setTitle !== "function") return res.status(501).json({ ok: false, error: "This bot library has no setTitle method." });
      if (image && typeof api.changeGroupImage !== "function") return res.status(501).json({ ok: false, error: "This bot library has no changeGroupImage method." });
      if (title) {
        await withTimeout(callApi(api, "setTitle", [title, threadId]), API_TIMEOUT_MS);
      } else {
        const decoded = decodeProfileImage(image);
        tmpFile = await writeBufferToTemp(decoded.buffer, decoded.extension);
        await withTimeout(callApi(api, "changeGroupImage", [fs.createReadStream(tmpFile), threadId]), API_TIMEOUT_MS);
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
      return res.status(502).json({ ok: false, error: "Messenger refused the change or the backup could not be saved. Check bot permissions and Render logs." });
    } finally {
      if (tmpFile) await fsp.rm(tmpFile, { force: true }).catch(() => {});
    }
  });

  startGuardScheduler({ db, getApi, audit });
}

module.exports = {
  registerGroupProfileRoutes,
  decodeProfileImage,
  normalizePhotoUrl,
  getImageUrl,
  runGuardCheck,
};
