"use strict";

const mimic = require("../human-mimic");
const delay = require("../human-delay");
const typing = require("../human-typing");

/**
 * Single public facade for human-like Banat behavior.
 *
 * This prevents index.js from importing three different implementations and
 * accidentally growing duplicate timing/typing logic again.
 */
function createHumanContext(threadID, incomingText = "", state = new Map()) {
  const key = String(threadID || "unknown");
  const now = Date.now();
  const previous = state.get(key);
  const recentMessages = previous && now - previous.at < 45_000
    ? previous.count + 1
    : 1;

  state.set(key, { at: now, count: recentMessages });

  return {
    threadID: key,
    incomingText: String(incomingText || ""),
    recentMessages,
  };
}

function prepareReply(text, options = {}) {
  const output = mimic.humanize(text, options);
  const timing = delay.calculateHumanDelay(output, options.context || {}, options);
  return { text: output, timing };
}

module.exports = {
  ...mimic,
  ...delay,
  ...typing,
  createHumanContext,
  prepareReply,
};
