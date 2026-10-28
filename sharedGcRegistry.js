"use strict";

const THREAD_ID = /^\d{6,32}$/;
const syncedApis = new WeakSet();

function createSharedGcRegistry({ log = (message) => console.log(message) } = {}) {
  const endpoint = String(process.env.ECLIPSE_SUPPORT_REGISTRY_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.ECLIPSE_SUPPORT_REGISTRY_KEY || "").trim();
  const pending = new Map();

  async function send(groups, source) {
    if (!endpoint || !key || !groups.length) return { skipped: true };
    const response = await fetch(endpoint + "/v1/shared-groups/sync", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-support-admin-key": key,
      },
      body: JSON.stringify({ source, groups }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("support_registry_http_" + response.status);
    return response.json().catch(() => ({}));
  }

  function publishGroup(group, source = "main-bot-event") {
    const id = String(group?.thread_id ?? group?.threadID ?? group?.id ?? "").trim();
    if (!THREAD_ID.test(id)) return Promise.resolve(false);
    const previous = pending.get(id);
    if (previous) return previous;
    const task = send([{
      thread_id: id,
      thread_name: String(group?.thread_name ?? group?.name ?? "Unnamed group").slice(0, 160),
      eligible: group?.eligible !== false,
      event_id: String(group?.event_id || ""),
      last_seen_at: Date.now(),
      allow_reactivate: group?.allow_reactivate === true,
    }], source).then(() => true).catch((error) => {
      log("[SHARED-GC-REGISTRY] Registration sync failed for " + id + ": " + String(error?.message || error).slice(0, 160));
      return false;
    }).finally(() => pending.delete(id));
    pending.set(id, task);
    return task;
  }

  async function onEvent(api, event) {
    if (event?.type !== "event" || String(event?.logMessageType || "") !== "log:subscribe") return false;
    const threadID = String(event?.threadID || "").trim();
    if (!THREAD_ID.test(threadID)) return false;
    const data = event?.logMessageData && typeof event.logMessageData === "object" ? event.logMessageData : {};
    const added = data.addedParticipants ?? data.added_participants ?? data.addedParticipantsList;
    if (!Array.isArray(added) || !added.length) return false;
    const selfId = String(typeof api?.getCurrentUserID === "function" ? api.getCurrentUserID() : "");
    const selfJoined = added.some((participant) => {
      const id = String(participant?.userFbId ?? participant?.userFBID ?? participant?.userID ?? participant?.userId ?? participant?.id ?? "");
      return id && id === selfId;
    });
    if (!selfJoined) return false;
    const cached = event?.threadName || event?.thread_name || data.threadName || data.thread_name || "Unnamed group";
    return publishGroup({ thread_id: threadID, thread_name: cached, event_id: event?.messageID || event?.eventID || "", allow_reactivate: true });
  }

  async function syncExisting(api) {
    if (!api || (typeof api !== "object" && typeof api !== "function") || syncedApis.has(api)) return;
    syncedApis.add(api);
    if (!endpoint || !key || typeof api.getThreadList !== "function") return;
    try {
      const threads = await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error, rows) => {
          if (settled) return;
          if (Array.isArray(error) && rows === undefined) { rows = error; error = null; }
          settled = true;
          if (error) reject(error);
          else resolve(Array.isArray(rows) ? rows : []);
        };
        const timer = setTimeout(() => finish(new Error("getThreadList_timeout")), 10000);
        timer.unref?.();
        try {
          const returned = api.getThreadList(1000, null, [], (error, rows) => {
            clearTimeout(timer);
            finish(error, rows);
          });
          if (returned && typeof returned.then === "function") returned.then((rows) => {
            clearTimeout(timer);
            finish(null, rows);
          }, (error) => {
            clearTimeout(timer);
            finish(error);
          });
          else if (Array.isArray(returned)) {
            clearTimeout(timer);
            finish(null, returned);
          }
        } catch (error) {
          clearTimeout(timer);
          finish(error);
        }
      });
      const groups = threads.filter((thread) => thread && THREAD_ID.test(String(thread.threadID || "")) && (
        thread.isGroup === true || thread.threadType === "GROUP" || thread.threadType === 2 ||
        (Array.isArray(thread.participantIDs) && thread.participantIDs.length > 2)
      )).map((thread) => ({
        thread_id: String(thread.threadID),
        thread_name: String(thread.name || thread.threadName || "Unnamed group").slice(0, 160),
        eligible: true,
        last_seen_at: Date.now(),
        allow_reactivate: true,
      }));
      // This is intentionally an upsert-only best-effort import. getThreadList
      // caps at 1000 and may be incomplete, so never infer removals from absence.
      for (let offset = 0; offset < groups.length; offset += 100) {
        const batch = groups.slice(offset, offset + 100);
        try { await send(batch, "main-bot-existing-import"); }
        catch (error) {
          log("[SHARED-GC-REGISTRY] Existing-group import batch failed: " + String(error?.message || error).slice(0, 160));
        }
      }
      log("[SHARED-GC-REGISTRY] Existing-group import attempted; rows=" + groups.length + ", sourceLimit=1000, completeness=unverified.");
    } catch (error) {
      log("[SHARED-GC-REGISTRY] Existing-group import failed: " + String(error?.message || error).slice(0, 160));
    }
  }

  return { onEvent, syncExisting, publishGroup };
}

module.exports = { createSharedGcRegistry };
