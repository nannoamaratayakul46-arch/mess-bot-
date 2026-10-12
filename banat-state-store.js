"use strict";

// Shared durable state for Banat selectors. Uses the same data/ directory as
// Trivia so shuffle-bag progress survives ordinary process restarts when the
// deployment filesystem is persistent.
const fs = require("fs");
const path = require("path");

const STATE_DIR = path.join(__dirname, "data");
const STATE_FILE = path.join(STATE_DIR, "banat-state.json");

function readAll() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readSection(name, fallback = {}) {
  const all = readAll();
  const value = all[name];
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function writeSection(name, value) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const all = readAll();
  all[name] = value && typeof value === "object" ? value : {};
  const temporary = STATE_FILE + ".tmp";
  fs.writeFileSync(temporary, JSON.stringify(all, null, 2), "utf8");
  fs.renameSync(temporary, STATE_FILE);
}

module.exports = { readSection, writeSection, STATE_FILE };
