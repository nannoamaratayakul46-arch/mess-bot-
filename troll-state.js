"use strict";

// Per-group state only. This module intentionally contains no Messenger/API
// code so triggers.js can safely consult it without creating a require cycle.
const activeTrolls = new Map();

function normalize(value) {
  return String(value || "").trim();
}

function activate(threadID, targetUserID, targetName = "the target") {
  const thread = normalize(threadID);
  const target = normalize(targetUserID);
  if (!thread || !target) return null;

  const previous = activeTrolls.get(thread) || null;
  const state = {
    threadID: thread,
    targetUserID: target,
    targetName: String(targetName || "the target").trim() || "the target",
    startedAt: Date.now(),
  };

  activeTrolls.set(thread, state);
  return previous;
}

function deactivate(threadID) {
  const thread = normalize(threadID);
  if (!thread) return null;
  const state = activeTrolls.get(thread) || null;
  activeTrolls.delete(thread);
  return state;
}

function get(threadID) {
  return activeTrolls.get(normalize(threadID)) || null;
}

function isActive(threadID) {
  return Boolean(get(threadID));
}

module.exports = {
  activate,
  deactivate,
  get,
  isActive,
};
