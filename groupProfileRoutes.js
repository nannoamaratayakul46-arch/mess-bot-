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
const lastChange = new Map();

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
    if (typeof fn !== "function") {
      reject(new Error("Messenger API method is unavailable: " + method));
      return;
    }

    let settled = false;
    const done = (error, value) => {
      if (settled) return;
      settled = true;
      if (error) reject(error instanceof Error ? error : new Error(String(error)));
      else resolve(value);
    };

    let result;
    try {
      result = fn.call(api, ...args, done);
    } catch (error) {
      done(error);
      return;
    }

    // ws3-fca supports both callbacks and promises. Settle only once.
    if (result && typeof result.then === "function") {
      result.then(value => done(null, value), done);
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
  if (typeof dataUrl !== "string") {
    const error = new Error("Choose a JPEG or PNG photo.");
    error.status = 400;
    throw error;
  }

  const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) {
    const error = new Error("Photo must be a JPEG or PNG.");
    error.status = 400;
    throw error;
  }

  const encoded = match[2];
  if (encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4) {
    const error = new Error("Photo is too large (max 1 MB).");
    error.status = 413;
    throw error;
  }

  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES || buffer.toString("base64") !== encoded) {
    const error = new Error("Photo data is invalid or too large (max 1 MB).");
    error.status = buffer.length > MAX_IMAGE_BYTES ? 413 : 400;
    throw error;
  }

  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if ((match[1] === "jpeg" && !isJpeg) || (match[1] === "png" && !isPng)) {
    const error = new Error("Photo content does not match its file type.");
    error.status = 400;
    throw error;
  }

  return { buffer, extension: match[1] === "png" ? ".png" : ".jpg" };
}

function registerGroupProfileRoutes(app, { auth, getApi, isKnownGroup, audit = () => {} }) {
  if (!app || typeof app.put !== "function") throw new TypeError("An Express app is required.");
  if (typeof auth !== "function" || typeof getApi !== "function" || typeof isKnownGroup !== "function") {
    throw new TypeError("auth, getApi, and isKnownGroup callbacks are required.");
  }

  // index.js deliberately skips this path in its small global JSON parser,
  // allowing this route to parse the image payload with its own bounded limit.
  const parseProfileJson = express.json({ limit: "1.5mb" });

  app.put(
    "/api/dashboard/groups/:threadId/profile",
    auth,
    (req, res, next) => parseProfileJson(req, res, error => {
      if (!error) return next();
      const status = Number(error.status || error.statusCode) || 400;
      return res.status(status).json({
        ok: false,
        error: status === 413 ? "Photo request is too large (max 1 MB image)." : "Invalid profile request body.",
      });
    }),
    async (req, res) => {
      const threadId = String(req.params.threadId || "").trim();
      const title = typeof req.body?.title === "string" ? req.body.title.replace(/\s+/g, " ").trim().slice(0, 80) : "";
      const image = typeof req.body?.image === "string" ? req.body.image : "";
      if (!threadId || !isKnownGroup(threadId)) {
        return res.status(400).json({ ok: false, error: "Choose a group from the refreshed group list." });
      }
      if (Boolean(title) === Boolean(image)) {
        return res.status(400).json({ ok: false, error: "Send either a group name or a photo, not both." });
      }

      const api = getApi();
      if (!api) return res.status(503).json({ ok: false, error: "The bot is not connected to Messenger right now." });

      const kind = image ? "image" : "title";
      const wait = cooldownLeft(threadId, kind);
      if (wait) {
        return res.status(429).json({
          ok: false,
          error: "Cooldown active. Try again in " + Math.ceil(wait / 60) + " min.",
          retry_after_seconds: wait,
        });
      }

      let tmpFile = "";
      try {
        if (title && typeof api.setTitle !== "function") {
          return res.status(501).json({ ok: false, error: "This bot library has no setTitle method." });
        }
        if (image && typeof api.changeGroupImage !== "function") {
          return res.status(501).json({ ok: false, error: "This bot library has no changeGroupImage method." });
        }

        if (title) {
          await withTimeout(callApi(api, "setTitle", [title, threadId]), API_TIMEOUT_MS);
        } else {
          const decoded = decodeProfileImage(image);
          tmpFile = path.join(os.tmpdir(), "eclipse-group-profile-" + crypto.randomBytes(12).toString("hex") + decoded.extension);
          await fsp.writeFile(tmpFile, decoded.buffer, { flag: "wx", mode: 0o600 });
          await withTimeout(callApi(api, "changeGroupImage", [fs.createReadStream(tmpFile), threadId]), API_TIMEOUT_MS);
        }

        lastChange.set(threadId + ":" + kind, Date.now());
        const message = "[PROFILE] " + kind + " changed in " + threadId;
        audit(message);
        return res.json({ ok: true, kind, ...(title ? { title } : {}) });
      } catch (error) {
        const detail = String(error?.message || error).replace(/[\r\n]+/g, " ").slice(0, 180);
        audit("[PROFILE] " + kind + " change failed in " + threadId + ": " + detail);
        return res.status(502).json({
          ok: false,
          error: "Messenger refused the change or the request timed out. Check bot permissions and Render logs.",
        });
      } finally {
        if (tmpFile) await fsp.rm(tmpFile, { force: true }).catch(() => {});
      }
    },
  );
}

module.exports = { registerGroupProfileRoutes, decodeProfileImage };
