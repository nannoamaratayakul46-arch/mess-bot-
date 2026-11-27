"use strict";

// Shared durable state for Banat selectors. Uses the same data/ directory as
// Trivia so shuffle-bag progress survives ordinary process restarts when the
// deployment filesystem is persistent.
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

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

  // Test workers and separate Node processes can write this shared file at
  // the same time. A single fixed ".tmp" name lets one writer rename another
  // writer's temporary file, producing ENOENT. Give every write its own
  // same-directory temporary file so rename remains atomic and isolated.
  const temporary = `${STATE_FILE}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(all, null, 2), { encoding: "utf8", flag: "wx" });
    fs.renameSync(temporary, STATE_FILE);
  } finally {
    try {
      fs.unlinkSync(temporary);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

module.exports = { readSection, writeSection, STATE_FILE };
