"use strict";

const crypto = require("node:crypto");
const ROOM_TTL_HOURS = 4;
const MAX_ROOM_MEMBERS = 20;
const MAX_QUEUE_ITEMS = 30;

function cleanText(value, max = 120) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

function cleanTrack(value) {
  if (!value || typeof value !== "object") return null;
  const uri = cleanText(value.uri, 160);
  if (!/^spotify:track:[A-Za-z0-9]+$/.test(uri)) return null;
  const image = cleanText(value.image || value.album?.images?.[0]?.url, 500);
  return {
    id: cleanText(value.id, 80) || uri.split(":").pop(),
    uri,
    name: cleanText(value.name, 180) || "Unknown track",
    artists: Array.isArray(value.artists)
      ? value.artists.slice(0, 5).map(item => cleanText(typeof item === "string" ? item : item?.name, 100)).filter(Boolean)
      : [],
    album: cleanText(value.album?.name || value.album, 180),
    image: /^https:\/\/i\.scdn\.co\/image\//.test(image) ? image : "",
    duration_ms: Math.max(0, Math.min(24 * 60 * 60 * 1000, Number(value.duration_ms) || 0)),
  };
}

function cleanState(value, previous = {}) {
  const input = value && typeof value === "object" ? value : {};
  const queue = Array.isArray(input.queue)
    ? input.queue.slice(0, MAX_QUEUE_ITEMS).map(cleanTrack).filter(Boolean)
    : (previous.queue || []);
  const progress = Number(input.progress_ms);
  return {
    track: cleanTrack(input.track),
    is_playing: input.is_playing === true,
    progress_ms: Number.isFinite(progress) ? Math.max(0, Math.min(24 * 60 * 60 * 1000, Math.floor(progress))) : 0,
    duration_ms: Math.max(0, Math.min(24 * 60 * 60 * 1000, Number(input.duration_ms) || 0)),
    queue,
  };
}

function createSpotifyListeningRooms({ app, db, auth } = {}) {
  if (!app || typeof app.post !== "function" || typeof app.get !== "function" || typeof app.put !== "function") throw new TypeError("An Express app is required.");
  if (!db || typeof db.query !== "function") throw new TypeError("A database query interface is required.");
  if (typeof auth !== "function") throw new TypeError("A dashboard authentication middleware is required.");

  let schemaPromise = null;
  async function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await db.query("CREATE TABLE IF NOT EXISTS eclipse_spotify_rooms (room_id TEXT PRIMARY KEY, host_account_id TEXT NOT NULL, host_name TEXT NOT NULL, room_name TEXT NOT NULL, state JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL)");
        await db.query("CREATE TABLE IF NOT EXISTS eclipse_spotify_room_members (room_id TEXT NOT NULL REFERENCES eclipse_spotify_rooms(room_id) ON DELETE CASCADE, account_id TEXT NOT NULL, display_name TEXT NOT NULL, joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (room_id, account_id))");
        await db.query("CREATE INDEX IF NOT EXISTS eclipse_spotify_rooms_expiry_idx ON eclipse_spotify_rooms (expires_at)");
        await db.query("CREATE INDEX IF NOT EXISTS eclipse_spotify_room_members_presence_idx ON eclipse_spotify_room_members (room_id, last_seen_at DESC)");
      })().catch(error => { schemaPromise = null; throw error; });
    }
    return schemaPromise;
  }

  function accountFor(req, res) {
    const account = req.dashboardAccount;
    const id = cleanText(account?.id, 128);
    if (!id) {
      res.status(401).json({ ok: false, error: "Sign in with your individual dashboard account to use Listening Rooms." });
      return null;
    }
    return { id, name: cleanText(account.email?.split("@")[0] || account.name || "Dashboard member", 80) };
  }

  async function cleanupExpired() {
    await db.query("DELETE FROM eclipse_spotify_rooms WHERE expires_at <= NOW() OR updated_at < NOW() - INTERVAL '12 hours'");
  }

  async function getRoom(roomId) {
    const result = await db.query("SELECT room_id, host_account_id, host_name, room_name, state, created_at, updated_at, expires_at FROM eclipse_spotify_rooms WHERE room_id = $1 AND expires_at > NOW() LIMIT 1", [roomId]);
    return result.rows?.[0] || null;
  }

  async function getMembers(roomId, hostId) {
    const result = await db.query("SELECT account_id, display_name, joined_at, last_seen_at FROM eclipse_spotify_room_members WHERE room_id = $1 AND last_seen_at > NOW() - INTERVAL '45 seconds' ORDER BY CASE WHEN account_id = $2 THEN 0 ELSE 1 END, joined_at ASC", [roomId, hostId]);
    return (result.rows || []).map(row => ({
      name: cleanText(row.display_name, 80),
      is_host: String(row.account_id) === String(hostId),
      joined_at: row.joined_at,
      last_seen_at: row.last_seen_at,
    }));
  }

  async function sendRoom(res, room, accountId) {
    const members = await getMembers(room.room_id, room.host_account_id);
    res.setHeader("Cache-Control", "no-store");
    return res.json({ ok: true, room: {
      id: room.room_id,
      name: room.room_name,
      host_name: room.host_name,
      is_host: String(room.host_account_id) === String(accountId),
      state: room.state || {},
      created_at: room.created_at,
      updated_at: room.updated_at,
      expires_at: room.expires_at,
      members,
    } });
  }

  const base = "/api/spotify/rooms";

  app.post(base, auth, async (req, res) => {
    const account = accountFor(req, res);
    if (!account) return;
    try {
      await ensureSchema();
      await cleanupExpired();
      const roomId = crypto.randomBytes(18).toString("base64url");
      const displayName = cleanText(req.body?.display_name, 80) || account.name;
      const roomName = cleanText(req.body?.name, 80) || "ECLIPSE Listening Room";
      const initialState = cleanState(req.body?.state);
      const insert = await db.query(
        "INSERT INTO eclipse_spotify_rooms (room_id, host_account_id, host_name, room_name, state, expires_at) VALUES ($1, $2, $3, $4, $5::jsonb, NOW() + INTERVAL '" + ROOM_TTL_HOURS + " hours') RETURNING room_id, host_account_id, host_name, room_name, state, created_at, updated_at, expires_at",
        [roomId, account.id, displayName, roomName, JSON.stringify({ ...initialState, version: 1, updated_at: new Date().toISOString() })]
      );
      await db.query("INSERT INTO eclipse_spotify_room_members (room_id, account_id, display_name) VALUES ($1, $2, $3)", [roomId, account.id, displayName]);
      return sendRoom(res, insert.rows[0], account.id);
    } catch (error) {
      console.error("[SPOTIFY ROOM] Create failed:", error?.message || error);
      return res.status(500).json({ ok: false, error: "Could not create a listening room." });
    }
  });

  app.post(base + "/:room_id/join", auth, async (req, res) => {
    const account = accountFor(req, res);
    if (!account) return;
    const roomId = cleanText(req.params.room_id, 80);
    if (!/^[A-Za-z0-9_-]{20,40}$/.test(roomId)) return res.status(400).json({ ok: false, error: "That listening room link is invalid." });
    try {
      await ensureSchema();
      await cleanupExpired();
      const room = await getRoom(roomId);
      if (!room) return res.status(404).json({ ok: false, error: "This listening room has expired or no longer exists." });
      const displayName = cleanText(req.body?.display_name, 80) || account.name;
      const count = await db.query("SELECT COUNT(*)::int AS count FROM eclipse_spotify_room_members WHERE room_id = $1", [roomId]);
      const alreadyJoined = await db.query("SELECT 1 FROM eclipse_spotify_room_members WHERE room_id = $1 AND account_id = $2", [roomId, account.id]);
      if (!alreadyJoined.rows?.length && Number(count.rows?.[0]?.count || 0) >= MAX_ROOM_MEMBERS) {
        return res.status(409).json({ ok: false, error: "This listening room is full." });
      }
      await db.query("INSERT INTO eclipse_spotify_room_members (room_id, account_id, display_name) VALUES ($1, $2, $3) ON CONFLICT (room_id, account_id) DO UPDATE SET display_name = EXCLUDED.display_name, last_seen_at = NOW()", [roomId, account.id, displayName]);
      await db.query("UPDATE eclipse_spotify_rooms SET updated_at = NOW(), expires_at = NOW() + INTERVAL '" + ROOM_TTL_HOURS + " hours' WHERE room_id = $1", [roomId]);
      return sendRoom(res, room, account.id);
    } catch (error) {
      console.error("[SPOTIFY ROOM] Join failed:", error?.message || error);
      return res.status(500).json({ ok: false, error: "Could not join this listening room." });
    }
  });

  app.get(base + "/:room_id", auth, async (req, res) => {
    const account = accountFor(req, res);
    if (!account) return;
    const roomId = cleanText(req.params.room_id, 80);
    try {
      await ensureSchema();
      const room = await getRoom(roomId);
      if (!room) return res.status(404).json({ ok: false, error: "This listening room has expired or no longer exists." });
      const member = await db.query("SELECT 1 FROM eclipse_spotify_room_members WHERE room_id = $1 AND account_id = $2", [roomId, account.id]);
      if (!member.rows?.length) return res.status(403).json({ ok: false, error: "Join this listening room before viewing it." });
      await db.query("UPDATE eclipse_spotify_room_members SET last_seen_at = NOW() WHERE room_id = $1 AND account_id = $2", [roomId, account.id]);
      return sendRoom(res, room, account.id);
    } catch (error) {
      console.error("[SPOTIFY ROOM] Read failed:", error?.message || error);
      return res.status(500).json({ ok: false, error: "Could not load this listening room." });
    }
  });

  app.post(base + "/:room_id/heartbeat", auth, async (req, res) => {
    const account = accountFor(req, res);
    if (!account) return;
    const roomId = cleanText(req.params.room_id, 80);
    try {
      await ensureSchema();
      const room = await getRoom(roomId);
      if (!room) return res.status(404).json({ ok: false, error: "This listening room has expired or no longer exists." });
      const member = await db.query("UPDATE eclipse_spotify_room_members SET last_seen_at = NOW() WHERE room_id = $1 AND account_id = $2 RETURNING account_id", [roomId, account.id]);
      if (!member.rows?.length) return res.status(403).json({ ok: false, error: "You are no longer a member of this room." });
      await db.query("UPDATE eclipse_spotify_rooms SET updated_at = NOW(), expires_at = NOW() + INTERVAL '" + ROOM_TTL_HOURS + " hours' WHERE room_id = $1", [roomId]);
      return res.json({ ok: true });
    } catch (error) {
      console.error("[SPOTIFY ROOM] Heartbeat failed:", error?.message || error);
      return res.status(500).json({ ok: false, error: "Listening room heartbeat failed." });
    }
  });

  app.put(base + "/:room_id/state", auth, async (req, res) => {
    const account = accountFor(req, res);
    if (!account) return;
    const roomId = cleanText(req.params.room_id, 80);
    try {
      await ensureSchema();
      const room = await getRoom(roomId);
      if (!room) return res.status(404).json({ ok: false, error: "This listening room has expired or no longer exists." });
      if (String(room.host_account_id) !== account.id) return res.status(403).json({ ok: false, error: "Only the room host can update shared playback." });
      const previous = room.state || {};
      const next = cleanState(req.body?.state, previous);
      const changed = String(previous.track?.uri || "") !== String(next.track?.uri || "") || Boolean(previous.is_playing) !== Boolean(next.is_playing);
      const version = Math.max(1, Number(previous.version) || 1) + (changed ? 1 : 0);
      const state = { ...next, version, updated_at: new Date().toISOString() };
      const update = await db.query("UPDATE eclipse_spotify_rooms SET state = $2::jsonb, updated_at = NOW(), expires_at = NOW() + INTERVAL '" + ROOM_TTL_HOURS + " hours' WHERE room_id = $1 RETURNING room_id, host_account_id, host_name, room_name, state, created_at, updated_at, expires_at", [roomId, JSON.stringify(state)]);
      return sendRoom(res, update.rows[0], account.id);
    } catch (error) {
      console.error("[SPOTIFY ROOM] State update failed:", error?.message || error);
      return res.status(500).json({ ok: false, error: "Could not update shared playback." });
    }
  });

  app.post(base + "/:room_id/leave", auth, async (req, res) => {
    const account = accountFor(req, res);
    if (!account) return;
    const roomId = cleanText(req.params.room_id, 80);
    try {
      await ensureSchema();
      const room = await getRoom(roomId);
      if (!room) return res.json({ ok: true });
      if (String(room.host_account_id) === account.id) await db.query("DELETE FROM eclipse_spotify_rooms WHERE room_id = $1", [roomId]);
      else await db.query("DELETE FROM eclipse_spotify_room_members WHERE room_id = $1 AND account_id = $2", [roomId, account.id]);
      return res.json({ ok: true });
    } catch (error) {
      console.error("[SPOTIFY ROOM] Leave failed:", error?.message || error);
      return res.status(500).json({ ok: false, error: "Could not leave the listening room." });
    }
  });

  return { ensureSchema };
}

module.exports = { createSpotifyListeningRooms, cleanTrack, cleanState };
