"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createSpotifyListeningRooms, cleanTrack, cleanState } = require("../spotifyListeningRooms");

test("cleanTrack accepts Spotify track URIs and strips untrusted fields", () => {
  const track = cleanTrack({
    id: "track-1",
    uri: "spotify:track:123abc",
    name: "  Song\nTitle ",
    artists: [{ name: "Artist" }, { name: "A".repeat(200) }],
    album: { name: "Album", images: [{ url: "https://i.scdn.co/image/abc" }] },
    duration_ms: 200000,
    access_token: "must-not-persist",
  });
  assert.equal(track.uri, "spotify:track:123abc");
  assert.equal(track.name, "SongTitle");
  assert.equal(track.artists.length, 2);
  assert.equal(track.image, "https://i.scdn.co/image/abc");
  assert.equal("access_token" in track, false);
});

test("cleanTrack rejects non-track and unsafe image values", () => {
  assert.equal(cleanTrack({ uri: "https://example.com/track" }), null);
  const track = cleanTrack({ uri: "spotify:track:123", image: "https://example.com/image.jpg" });
  assert.equal(track.image, "");
});

test("cleanState bounds progress and filters shared queue entries", () => {
  const state = cleanState({
    track: { uri: "spotify:track:abc", name: "Current" },
    is_playing: true,
    progress_ms: 999999999,
    duration_ms: 1000,
    queue: [
      { uri: "spotify:track:q1", name: "Queue one" },
      { uri: "spotify:episode:q2", name: "Not a track" },
    ],
  });
  assert.equal(state.track.uri, "spotify:track:abc");
  assert.equal(state.progress_ms, 24 * 60 * 60 * 1000);
  assert.equal(state.is_playing, true);
  assert.equal(state.queue.length, 1);
  assert.equal(state.queue[0].uri, "spotify:track:q1");
});

test("cleanState preserves the previous queue when no queue is supplied", () => {
  const state = cleanState({ progress_ms: 500 }, { queue: [{ uri: "spotify:track:keep" }] });
  assert.equal(state.queue[0].uri, "spotify:track:keep");
});


test("only the room host can publish shared playback state", async () => {
  const routes = new Map();
  const app = {
    post(path, ...handlers) { routes.set("POST " + path, handlers[handlers.length - 1]); },
    get(path, ...handlers) { routes.set("GET " + path, handlers[handlers.length - 1]); },
    put(path, ...handlers) { routes.set("PUT " + path, handlers[handlers.length - 1]); },
  };
  const room = {
    room_id: "ABCDEFGHIJKLMNOPQRSTUVWX",
    host_account_id: "host-account",
    host_name: "Host",
    room_name: "Private room",
    state: { track: null, is_playing: false, progress_ms: 0, duration_ms: 0, queue: [], version: 1 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
  const db = {
    async query(sql) {
      if (sql.startsWith("SELECT room_id, host_account_id")) return { rows: [room] };
      return { rows: [] };
    },
  };
  createSpotifyListeningRooms({ app, db, auth: (_req, _res, next) => next() });
  const handler = routes.get("PUT /api/spotify/rooms/:room_id/state");
  assert.ok(handler);
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    setHeader() {},
  };
  await handler({ dashboardAccount: { id: "guest-account", email: "guest@example.com" }, params: { room_id: room.room_id }, body: { state: { is_playing: true } } }, response);
  assert.equal(response.statusCode, 403);
  assert.equal(response.payload.error, "Only the room host can update shared playback.");
});
