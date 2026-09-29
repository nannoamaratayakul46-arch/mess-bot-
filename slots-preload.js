"use strict";

// Loads the slot engine and the lightweight social-chaos games without
// replacing the large legacy games.js file. The preload keeps the existing
// command router intact and only intercepts the new commands first.

const Module = require("module");
const path = require("path");

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
