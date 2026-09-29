"use strict";

// Loads the slot engine and the lightweight social-chaos games without
// replacing the large legacy games.js file. The preload keeps the existing
// command router intact and only intercepts the new commands first.

const Module = require("module");
const path = require("path");

// The main command router historically entered the game handler only after
// the command matched a hard-coded !games-style regex. Social commands need
// to be registered in that parser too; otherwise the handler is never called.
const originalCompile = Module.prototype._compile;
let indexRouterPatched = false;

Module.prototype._compile = function patchedCompile(content, filename) {
  if (
    !indexRouterPatched &&
    path.basename(filename || "") === "index.js" &&
    path.dirname(filename || "") === __dirname
  ) {
    let patched = false;

    // Register Social Chaos commands in the actual !command parser.
    // This is the critical path: without it, !rizz / !delulu / etc.
    // never produce a gameMatch and can never reach handleGamesCommand.
    const parserNeedle =
      "|chamber|roulette|lastchamber)(?:\\s+(.*))?$/i";
    const parserReplacement =
      "|chamber|roulette|lastchamber|rizz|simp|clown|aura|npc|delulu|menace|grass|bro|battle|vibes|social|socialgames)(?:\\s+(.*))?$/i";

    if (content.includes(parserNeedle)) {
      content = content.replace(parserNeedle, parserReplacement);
      patched = true;
      console.log(
        "[social-games] Registered Social Chaos commands in the main parser."
      );
    }

    // Preserve the existing handler gate while allowing the newly registered
    // commands to enter handleGamesCommand.
    const socialCommands = [
      "games",
      "game",
      "rizz",
      "simp",
      "clown",
      "aura",
      "npc",
      "delulu",
      "menace",
      "grass",
      "bro",
      "battle",
      "vibes",
      "social",
      "socialgames",
    ];

    const gate = /if\s*\(\s*gameCommand\s*===\s*["']games["']\s*\)\s*\{/g;
    const replacement = `if (${JSON.stringify(socialCommands)}.includes(gameCommand)) {`;

    if (gate.test(content)) {
      gate.lastIndex = 0;
      content = content.replace(gate, replacement);
      patched = true;
      console.log(
        "[social-games] Expanded game command router for Social Chaos."
      );
    }

    if (patched) {
      indexRouterPatched = true;
    }
  }

  return originalCompile.call(this, content, filename);
};

const originalLoad = Module._load;
let installed = false;

Module._load = function patchedLoad(request, parent, isMain) {
  const loaded = originalLoad.apply(this, arguments);

  if (installed) return loaded;
  if (request !== "./games") return loaded;
  if (!parent || path.basename(parent.filename || "") !== "index.js") {
    return loaded;
  }

  installed = true;

  const slots = require("./slots");
  const social = require("./social-games");
  const originalHandleGamesCommand = loaded.handleGamesCommand;

  return {
    ...loaded,
    handleGamesCommand: async function handleGamesCommandWithExtras(
      api,
      event,
      command,
      args
    ) {
      const normalized = String(command || "").toLowerCase().replace(/^!/, "");
      const normalizedArgs = Array.isArray(args) ? args : [];

      if (normalized === "slots" || normalized === "slot") {
        return slots.handleSlots(api, event, normalizedArgs);
      }

      if (
        normalized === "rizz" ||
        normalized === "simp" ||
        normalized === "clown" ||
        normalized === "aura" ||
        normalized === "npc" ||
        normalized === "delulu" ||
        normalized === "menace" ||
        normalized === "grass" ||
        normalized === "bro" ||
        normalized === "battle" ||
        normalized === "vibes" ||
        normalized === "social" ||
        normalized === "socialgames"
      ) {
        const socialText = social.handleSocialGame(normalized, normalizedArgs);

        if (socialText) {
          await api.sendMessage(socialText, event.threadID);
        }

        return true;
      }

      // !games rules / !game rules keeps the established complete rules,
      // then appends the Social Chaos rules as another game category.
      if (
        (normalized === "games" || normalized === "game") &&
        String(normalizedArgs[0] || "").toLowerCase() === "rules"
      ) {
        const result = await originalHandleGamesCommand(
          api,
          event,
          command,
          normalizedArgs
        );

        try {
          await api.sendMessage(
            social.getSocialGameRules(),
            event.threadID
          );
        } catch (error) {
          console.error("[social-games] rules:", error);
        }

        return result;
      }

      const result = await originalHandleGamesCommand(
        api,
        event,
        command,
        args
      );

      // Keep the established game menu and append the new social-chaos
      // category instead of replacing the existing games system.
      if (normalized === "games" || normalized === "game") {
        try {
          await api.sendMessage(
            social.getSocialGameMenuLines().join("\n"),
            event.threadID
          );
        } catch (error) {
          console.error("[social-games] menu:", error);
        }
      }

      return result;
    },
  };
};
