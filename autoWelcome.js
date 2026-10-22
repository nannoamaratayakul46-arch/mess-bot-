"use strict";

const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const IMAGE_LIMIT = 2 * 1024 * 1024;
const DEFAULT_MESSAGE = "Welcome {{NAME}}!";

function callSend(api, payload, threadID) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = error => {
      if (settled) return;
      settled = true;
      if (error) reject(error); else resolve();
    };
    try {
      const result = api.sendMessage(payload, threadID, done);
      if (result && typeof result.then === "function") result.then(() => done()).catch(done);
    } catch (error) { done(error); }
  });
}

function createAutoWelcome({ db, getApi = () => null, isKnownGroup = () => true, log = () => {} }) {
  if (!db || typeof db.query !== "function") throw new TypeError("Auto Welcome requires the database query interface");
  let schemaReady;
  function ensureSchema() {
    if (!schemaReady) schemaReady = db.query(`
      CREATE TABLE IF NOT EXISTS auto_welcome_settings (
        thread_id TEXT PRIMARY KEY,
        enabled BOOLEAN NOT NULL DEFAULT FALSE,
        message_template TEXT NOT NULL DEFAULT 'Welcome {{NAME}}!',
        media_data_url TEXT,
        updated_at BIGINT NOT NULL
      )
    `).catch(error => { schemaReady = null; throw error; });
    return schemaReady;
  }
  async function getSettings(threadID) {
    await ensureSchema();
    const { rows } = await db.query("SELECT thread_id, enabled, message_template, media_data_url, updated_at FROM auto_welcome_settings WHERE thread_id = $1 LIMIT 1", [threadID]);
    return rows[0] || { thread_id: threadID, enabled: false, message_template: DEFAULT_MESSAGE, media_data_url: null, updated_at: null };
  }
  async function saveSettings(threadID, values) {
    await ensureSchema();
    const current = await getSettings(threadID);
    const enabled = typeof values.enabled === "boolean" ? values.enabled : current.enabled;
    const message = typeof values.message_template === "string" ? values.message_template : current.message_template;
    const media = Object.prototype.hasOwnProperty.call(values, "media_data_url") ? values.media_data_url : current.media_data_url;
    const { rows } = await db.query(`
      INSERT INTO auto_welcome_settings (thread_id, enabled, message_template, media_data_url, updated_at)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (thread_id) DO UPDATE SET enabled=EXCLUDED.enabled, message_template=EXCLUDED.message_template,
        media_data_url=EXCLUDED.media_data_url, updated_at=EXCLUDED.updated_at
      RETURNING thread_id, enabled, message_template, media_data_url, updated_at
    `, [threadID, enabled, message, media, Date.now()]);
    return rows[0];
  }
  function registerRoutes(app, auth) {
    app.use("/api/dashboard/auto-welcome", express.json({ limit: "3mb" }));
    app.get("/api/dashboard/auto-welcome/:thread_id", auth, async (req, res) => {
      const id = String(req.params.thread_id || "").trim();
      if (!/^\d{6,32}$/.test(id) || !isKnownGroup(id)) return res.status(400).json({ ok: false, error: "Choose a group from the refreshed group list." });
      try { return res.json({ ok: true, settings: await getSettings(id) }); }
      catch (error) { log("[AUTO-WELCOME] settings load failed: " + String(error?.message || error)); return res.status(500).json({ ok: false, error: "Could not load Auto Welcome settings." }); }
    });
    app.put("/api/dashboard/auto-welcome/:thread_id", auth, async (req, res) => {
      const id = String(req.params.thread_id || "").trim();
      if (!/^\d{6,32}$/.test(id) || !isKnownGroup(id)) return res.status(400).json({ ok: false, error: "Choose a group from the refreshed group list." });
      const body = req.body || {};
      if (typeof body.message_template !== "string" || !body.message_template.trim() || body.message_template.length > 1000) return res.status(400).json({ ok: false, error: "Greeting must be 1–1000 characters." });
      if (typeof body.enabled !== "boolean") return res.status(400).json({ ok: false, error: "Enabled must be true or false." });
      if (body.media_data_url !== undefined && body.media_data_url !== null && body.media_data_url !== "") {
        const match = /^data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=]+)$/.exec(body.media_data_url);
        if (!match || Buffer.from(match[2], "base64").length > IMAGE_LIMIT) return res.status(400).json({ ok: false, error: "Choose a PNG, JPG, GIF, or WEBP image up to 2 MiB." });
      }
      const media = body.media_data_url === "" ? null : body.media_data_url;
      try {
        const settings = await saveSettings(id, { enabled: body.enabled, message_template: body.message_template, ...(body.media_data_url !== undefined ? { media_data_url: media } : {}) });
        return res.json({ ok: true, settings });
      } catch (error) { log("[AUTO-WELCOME] settings save failed: " + String(error?.message || error)); return res.status(500).json({ ok: false, error: "Could not save Auto Welcome settings." }); }
    });
  }
  async function onGroupEvent(api, event) {
    if (event?.type !== "event" || String(event?.logMessageType || "") !== "log:subscribe") return;
    const threadID = String(event?.threadID || "").trim();
    if (!/^\d{6,32}$/.test(threadID)) return;
    const data = event?.logMessageData && typeof event.logMessageData === "object" ? event.logMessageData : {};
    const added = data.addedParticipants ?? data.added_participants ?? data.addedParticipantsList;
    if (!Array.isArray(added) || !added.length) return;
    const botID = String(typeof api?.getCurrentUserID === "function" ? api.getCurrentUserID() : "");
    let settings;
    try { settings = await getSettings(threadID); } catch (error) { log("[AUTO-WELCOME] DB read failed: " + String(error?.message || error)); return; }
    if (!settings.enabled || !api || typeof api.sendMessage !== "function") return;
    for (const participant of added) {
      const id = String(participant?.userFbId ?? participant?.userFBID ?? participant?.userID ?? participant?.userId ?? participant?.id ?? "").trim();
      if (!/^\d{6,32}$/.test(id) || id === botID) continue;
      const name = String(participant?.fullName || participant?.name || participant?.firstName || id).trim();
      const message = String(settings.message_template || DEFAULT_MESSAGE).replace(/\{\{NAME\}\}/g, name);
      let attachment;
      let tempPath;
      try {
        if (settings.media_data_url) {
          const match = /^data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=]+)$/.exec(settings.media_data_url);
          if (match) {
            const ext = match[1] === "jpeg" ? "jpg" : match[1];
            tempPath = path.join(os.tmpdir(), "auto-welcome-" + crypto.randomBytes(10).toString("hex") + "." + ext);
            await fs.promises.writeFile(tempPath, Buffer.from(match[2], "base64"), { flag: "wx" });
            attachment = fs.createReadStream(tempPath);
          }
        }
        await callSend(api, attachment ? { body: message, attachment } : message, threadID);
      } catch (error) {
        log("[AUTO-WELCOME] send failed in " + threadID + ": " + String(error?.message || error).slice(0, 160));
      } finally {
        if (tempPath) await fs.promises.unlink(tempPath).catch(() => {});
      }
    }
  }
  return { registerRoutes, onGroupEvent, getSettings };
}

module.exports = { createAutoWelcome, DEFAULT_MESSAGE, IMAGE_LIMIT };
