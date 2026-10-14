"use strict";

// Raid Shield core. This module deliberately proposes mitigation only; it never
// bans, removes, demotes, or changes group settings.
const DEFAULTS = Object.freeze({
  watch: 4,
  elevated: 7,
  lockdown: 10,
  decayMs: 60_000,
  lockdownMs: 5 * 60_000,
  messageWindowMs: 8_000,
  maxMessages: 6,
  repeatMax: 4,
  mentionWindowMs: 10_000,
  mentionPerMessage: 5,
  mentionWindowMax: 10,
  coordinatedWindowMs: 10_000,
  coordinatedAccounts: 3,
  joinWindowMs: 30_000,
  joinBurst: 5,
  profileWindowMs: 60_000,
  profileBurst: 3,
  maxGroups: 1000,
  maxEventsPerGroup: 100,
  maxMessageLength: 1000,
});

const clamp = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.trunc(n))) : fallback;
};
const cleanId = value => String(value ?? "").trim().slice(0, 80);
const normalizeText = value => String(value ?? "").normalize("NFKC").toLowerCase().replace(/https?:\/\/\S+/g, "<url>").replace(/\s+/g, " ").trim().slice(0, 1000);

function createRaidShield(options = {}) {
  const cfg = { ...DEFAULTS, ...(options.config || {}) };
  const now = typeof options.now === "function" ? options.now : Date.now;
  const persistIncident = typeof options.persistIncident === "function" ? options.persistIncident : async () => {};
  const persistState = typeof options.persistState === "function" ? options.persistState : async () => {};
  const groups = new Map();
  const incidents = [];
  const recentEventKeys = new Map();

  function stateFor(threadId) {
    const id = cleanId(threadId);
    if (!id) throw new TypeError("threadId is required");
    let state = groups.get(id);
    if (!state) {
      if (groups.size >= cfg.maxGroups) {
        // Evict only the least recently updated non-locked group.
        const candidate = [...groups.entries()].find(([, s]) => !s.lockdownUntil || s.lockdownUntil <= now());
        if (!candidate) throw new Error("Raid Shield group capacity reached; refusing unsafe eviction");
        groups.delete(candidate[0]);
      }
      state = { threadId: id, score: 0, scoreAt: now(), level: "normal", lockdownUntil: 0, lastEventAt: 0, messages: new Map(), joins: [], profileChanges: [], fingerprints: new Map(), lastTouched: now() };
      groups.set(id, state);
    }
    state.lastTouched = now();
    return state;
  }

  function decay(state, at = now()) {
    const elapsed = Math.max(0, at - state.scoreAt);
    if (elapsed >= cfg.decayMs) state.score = 0;
    else if (elapsed > 0) state.score *= 1 - elapsed / cfg.decayMs;
    state.scoreAt = at;
    if (state.lockdownUntil <= at) state.lockdownUntil = 0;
  }

  function levelFor(state) {
    if (state.lockdownUntil > now() || state.score >= cfg.lockdown) return "lockdown";
    if (state.score >= cfg.elevated) return "elevated";
    if (state.score >= cfg.watch) return "watch";
    return "normal";
  }

  async function emit(threadId, type, points, detail = {}, eventKey) {
    const state = stateFor(threadId);
    const at = now();
    decay(state, at);
    const key = eventKey ? cleanId(eventKey) : "";
    if (key) {
      const dedupeKey = state.threadId + ":" + key;
      const prior = recentEventKeys.get(dedupeKey);
      if (prior && at - prior < cfg.decayMs) return { duplicate: true, state: snapshot(state) };
      recentEventKeys.set(dedupeKey, at);
    }
    state.score = Math.min(30, state.score + clamp(points, 0, 10, 0));
    state.lastEventAt = at;
    if (state.score >= cfg.lockdown && !state.lockdownUntil) state.lockdownUntil = at + cfg.lockdownMs;
    state.level = levelFor(state);
    const incident = {
      id: state.threadId + ":" + at + ":" + type + ":" + (incidents.length + 1),
      thread_id: state.threadId,
      event_type: String(type).slice(0, 60),
      risk_points: clamp(points, 0, 10, 0),
      score: Math.round(state.score * 100) / 100,
      severity: state.level,
      status: state.level === "lockdown" ? "mitigating" : state.level === "normal" ? "watch" : "mitigating",
      evidence: sanitizeDetail(detail),
      created_at: new Date(at).toISOString(),
    };
    incidents.push(incident);
    while (incidents.length > cfg.maxGroups * cfg.maxEventsPerGroup) incidents.shift();
    await persistIncident(incident);
    await persistState(snapshot(state));
    if (typeof options.onIncident === "function") await options.onIncident({ ...incident });
    return { duplicate: false, incident: { ...incident }, state: snapshot(state) };
  }

  function snapshot(state) {
    return {
      thread_id: state.threadId,
      score: Math.round(state.score * 100) / 100,
      protection_level: levelFor(state),
      lockdown_until: state.lockdownUntil ? new Date(state.lockdownUntil).toISOString() : null,
      last_event_at: state.lastEventAt ? new Date(state.lastEventAt).toISOString() : null,
    };
  }

  function pruneMap(map, cutoff) {
    for (const [key, value] of map) if (value.at < cutoff) map.delete(key);
  }

  async function observeMessage(event = {}) {
    const threadId = cleanId(event.threadID);
    const userId = cleanId(event.senderID);
    const body = String(event.body ?? "").slice(0, cfg.maxMessageLength);
    if (!threadId || !userId || !body.trim()) return { ignored: true };
    if (event.isTrustedAdmin === true || event.isBot === true) return { ignored: true };
    const state = stateFor(threadId);
    const at = now();
    decay(state, at);
    const key = userId;
    const windowStart = at - cfg.messageWindowMs;
    const prior = (state.messages.get(key) || []).filter(x => x.at >= windowStart);
    const normalized = normalizeText(body);
    prior.push({ at, text: normalized });
    state.messages.set(key, prior.slice(-20));

    const burst = prior.length >= cfg.maxMessages;
    const repeated = normalized.length >= 3 && prior.filter(x => x.text === normalized).length >= cfg.repeatMax;
    const mentions = (body.match(/@[\w.:-]+/g) || []).length;
    const mentionWindowStart = at - cfg.mentionWindowMs;
    const mentionEvents = (state.messages.get(key) || []).filter(x => x.at >= mentionWindowStart);
    const mentionCount = mentionEvents.reduce((sum, x) => sum + (x.mentions || 0), 0);
    // Store mention counts for subsequent rolling-window checks.
    prior[prior.length - 1].mentions = mentions;
    state.messages.set(key, prior.slice(-20));

    if (burst) return emit(threadId, "message_burst", 2, { sender_id: userId, count: prior.length, window_ms: cfg.messageWindowMs }, "burst:" + userId + ":" + Math.floor(at / cfg.messageWindowMs));
    if (repeated) return emit(threadId, "repeated_message", 2, { sender_id: userId, repeats: prior.filter(x => x.text === normalized).length }, "repeat:" + userId + ":" + normalized.slice(0, 80) + ":" + Math.floor(at / cfg.messageWindowMs));
    if (mentions >= cfg.mentionPerMessage || mentionCount + mentions >= cfg.mentionWindowMax) return emit(threadId, "mention_flood", 3, { sender_id: userId, mentions: Math.max(mentions, mentionCount + mentions) }, "mentions:" + userId + ":" + Math.floor(at / cfg.mentionWindowMs));

    const fingerprint = normalized.replace(/\b\d+\b/g, "#");
    const seen = (state.fingerprints.get(fingerprint) || []).filter(x => at - x.at < cfg.coordinatedWindowMs && x.userId !== userId);
    seen.push({ at, userId });
    state.fingerprints.set(fingerprint, seen.slice(-10));
    pruneMap(state.fingerprints, at - cfg.coordinatedWindowMs);
    if (seen.length >= cfg.coordinatedAccounts) {
      return emit(threadId, "coordinated_duplicate", 4, { distinct_accounts: new Set(seen.map(x => x.userId)).size }, "coord:" + fingerprint.slice(0, 80) + ":" + Math.floor(at / cfg.coordinatedWindowMs));
    }
    return { ignored: true, state: snapshot(state) };
  }

  async function observeJoin(threadId, userId, reliable = false) {
    if (!reliable) return { ignored: true, reason: "join event not confirmed reliable" };
    const state = stateFor(threadId);
    const at = now();
    state.joins = state.joins.filter(t => at - t < cfg.joinWindowMs);
    state.joins.push(at);
    if (state.joins.length < cfg.joinBurst) return { ignored: true, state: snapshot(state) };
    return emit(threadId, "join_burst", 3, { joins: state.joins.length, window_ms: cfg.joinWindowMs, latest_user_id: cleanId(userId) }, "join:" + Math.floor(at / cfg.joinWindowMs));
  }

  async function observeProfileChange(threadId, eventKey, details = {}) {
    const state = stateFor(threadId);
    const at = now();
    state.profileChanges = state.profileChanges.filter(t => at - t < cfg.profileWindowMs);
    state.profileChanges.push(at);
    if (details.confirmedUnauthorized === true) {
      return emit(threadId, "unauthorized_profile_change", 5, details, "profile:" + cleanId(eventKey));
    }
    if (state.profileChanges.length >= cfg.profileBurst) {
      return emit(threadId, "profile_change_burst", 3, { changes: state.profileChanges.length, window_ms: cfg.profileWindowMs }, "profile-burst:" + Math.floor(at / cfg.profileWindowMs));
    }
    return { ignored: true, state: snapshot(state) };
  }

  async function setLockdown(threadId, durationMs = cfg.lockdownMs, reason = "admin_manual") {
    const state = stateFor(threadId);
    const duration = clamp(durationMs, 30_000, 30 * 60_000, cfg.lockdownMs);
    state.lockdownUntil = now() + duration;
    state.level = "lockdown";
    state.lastEventAt = now();
    await persistState(snapshot(state));
    return { ...snapshot(state), reason: String(reason).slice(0, 100) };
  }

  async function releaseLockdown(threadId, reason = "admin_release") {
    const state = stateFor(threadId);
    state.lockdownUntil = 0;
    state.score = Math.min(state.score, cfg.watch - 0.01);
    state.scoreAt = now();
    state.level = levelFor(state);
    await persistState(snapshot(state));
    return { ...snapshot(state), reason: String(reason).slice(0, 100) };
  }

  function restoreStates(rows = []) {
    const restored = [];
    for (const row of rows.slice(0, cfg.maxGroups)) {
      const id = cleanId(row?.thread_id);
      if (!id) continue;
      const score = Number(row.score);
      const lockdownUntil = row.lockdown_until ? new Date(row.lockdown_until).getTime() : 0;
      const lastEventAt = row.last_event_at ? new Date(row.last_event_at).getTime() : 0;
      const state = {
        threadId: id,
        score: Number.isFinite(score) ? Math.max(0, Math.min(30, score)) : 0,
        scoreAt: Number.isFinite(lastEventAt) && lastEventAt > 0 ? lastEventAt : now(),
        level: "normal",
        lockdownUntil: Number.isFinite(lockdownUntil) && lockdownUntil > now() ? lockdownUntil : 0,
        lastEventAt: Number.isFinite(lastEventAt) ? lastEventAt : 0,
        messages: new Map(),
        joins: [],
        profileChanges: [],
        fingerprints: new Map(),
        lastTouched: now(),
      };
      decay(state);
      state.level = levelFor(state);
      groups.set(id, state);
      restored.push(snapshot(state));
    }
    return restored;
  }

  function getState(threadId) {
    const state = groups.get(cleanId(threadId));
    if (!state) return { thread_id: cleanId(threadId), score: 0, protection_level: "normal", lockdown_until: null, last_event_at: null };
    decay(state);
    state.level = levelFor(state);
    return snapshot(state);
  }

  function listIncidents({ threadId, limit = 50 } = {}) {
    const safeLimit = clamp(limit, 1, 100, 50);
    return incidents.filter(x => !threadId || x.thread_id === cleanId(threadId)).slice(-safeLimit).reverse().map(x => ({ ...x, evidence: { ...x.evidence } }));
  }

  function cleanup() {
    const at = now();
    for (const [id, state] of groups) {
      decay(state, at);
      for (const [userId, entries] of state.messages) {
        const fresh = entries.filter(x => at - x.at < Math.max(cfg.messageWindowMs, cfg.mentionWindowMs) * 2);
        if (fresh.length) state.messages.set(userId, fresh); else state.messages.delete(userId);
      }
      pruneMap(state.fingerprints, at - cfg.coordinatedWindowMs);
      if (state.lockdownUntil <= at && state.score < cfg.watch && at - state.lastTouched > cfg.decayMs * 2) groups.delete(id);
    }
    for (const [key, atSeen] of recentEventKeys) if (at - atSeen >= cfg.decayMs) recentEventKeys.delete(key);
  }

  return { observeMessage, observeJoin, observeProfileChange, setLockdown, releaseLockdown, getState, listIncidents, restoreStates, cleanup, defaults: { ...DEFAULTS } };
}

function sanitizeDetail(detail) {
  const result = {};
  for (const [key, value] of Object.entries(detail || {}).slice(0, 12)) {
    if (/body|message|text|cookie|token|password/i.test(key)) continue;
    if (typeof value === "string") result[key.slice(0, 40)] = value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 160);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) result[key.slice(0, 40)] = value;
  }
  return result;
}

module.exports = { createRaidShield, RAID_SHIELD_DEFAULTS: DEFAULTS };
