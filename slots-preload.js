"use strict";

// Loads the slot engine and lightweight Social Chaos games without replacing
// the legacy games.js. The preload keeps the existing command router intact
// and intercepts only the additive game commands.

const Module = require("module");
const path = require("path");

const SOCIAL_COMMANDS = [
  "rizz", "simp", "clown", "aura", "npc", "delulu", "menace",
  "grass", "bro", "roast", "compat", "compatibility", "ship", "battle",
  "vibes", "social", "socialgames",
];

const originalCompile = Module.prototype._compile;
let indexRouterPatched = false;

Module.prototype._compile = function patchedCompile(content, filename) {
  const base = path.basename(filename || "");

  // Repair the malformed template interpolation in the current Social Chaos
  // renderer before Node compiles it. This keeps the existing game module as
  // the single source of truth instead of creating a duplicate game engine.
  if (base === "social-games.js") {
    const malformed = '`⚡ ${label === "Rizz" ? "Smoothness" : "Chaos":} ${secondary}%`';
    const corrected = '`⚡ ${label === "Rizz" ? "Smoothness" : "Chaos"}: ${secondary}%`';
    if (content.includes(malformed)) {
      content = content.replace(malformed, corrected);
      console.log("[social-games] Repaired malformed metric renderer.");
    }
  }

  if (
    !indexRouterPatched &&
    base === "index.js" &&
    path.dirname(filename || "") === __dirname
  ) {
    let patched = false;

    const parserNeedle =
      "|chamber|roulette|lastchamber)(?:\\s+(.*))?$/i";
    const parserReplacement =
      `|chamber|roulette|lastchamber|${SOCIAL_COMMANDS.join("|")})(?:\\s+(.*))?$/i`;

    if (content.includes(parserNeedle)) {
      content = content.replace(parserNeedle, parserReplacement);
      patched = true;
      console.log("[social-games] Registered Social Chaos commands in main parser.");
    }

    const gate = /if\s*\(\s*gameCommand\s*===\s*["']games["']\s*\)\s*\{/g;
    const replacement = `if (${JSON.stringify(["games", "game", ...SOCIAL_COMMANDS])}.includes(gameCommand)) {`;

    if (gate.test(content)) {
      gate.lastIndex = 0;
      content = content.replace(gate, replacement);
      patched = true;
      console.log("[social-games] Expanded game command router.");
    }

    if (patched) indexRouterPatched = true;
  }

  return originalCompile.call(this, content, filename);
};

const originalLoad = Module._load;
let installed = false;

Module._load = function patchedLoad(request, parent, isMain) {
  const loaded = originalLoad.apply(this, arguments);

  if (installed) return loaded;
  if (request !== "./games") return loaded;
  if (!parent || path.basename(parent.filename || "") !== "index.js") return loaded;

  installed = true;

  const slots = require("./slots");
  const social = require("./social-games");
  const originalHandleGamesCommand = loaded.handleGamesCommand;

  return {
    ...loaded,
    handleGamesCommand: async function handleGamesCommandWithExtras(api, event, command, args) {
      const normalized = String(command || "").toLowerCase().replace(/^!/, "");
      const normalizedArgs = Array.isArray(args) ? args : [];

      if (normalized === "slots" || normalized === "slot") {
        return slots.handleSlots(api, event, normalizedArgs);
      }

      if (SOCIAL_COMMANDS.includes(normalized)) {
        const socialText = social.handleSocialGame(normalized, normalizedArgs);
        if (socialText) await api.sendMessage(socialText, event.threadID);
        return true;
      }

      if (
        (normalized === "games" || normalized === "game") &&
        String(normalizedArgs[0] || "").toLowerCase() === "rules"
      ) {
        const result = await originalHandleGamesCommand(api, event, command, normalizedArgs);
        try {
          await api.sendMessage(social.getSocialGameRules(), event.threadID);
        } catch (error) {
          console.error("[social-games] rules:", error);
        }
        return result;
      }

      const result = await originalHandleGamesCommand(api, event, command, args);

      if (normalized === "games" || normalized === "game") {
        try {
          await api.sendMessage(social.getSocialGameMenuLines().join("\n"), event.threadID);
        } catch (error) {
          console.error("[social-games] menu:", error);
        }
      }

      return result;
    },
  };
};
