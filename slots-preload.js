"use strict";

// Loads the new slot engine without touching the large legacy games.js file.
// index.js still owns game enable/disable checks; this only replaces the
// !slots / !slot handler before games.js gets the command.

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
  const originalHandleGamesCommand = loaded.handleGamesCommand;

  return {
    ...loaded,
    handleGamesCommand: async function handleGamesCommandWithSlots(
      api,
      event,
      command,
      args
    ) {
      const normalized = String(command || "").toLowerCase();

      if (normalized === "slots" || normalized === "slot") {
        return slots.handleSlots(api, event, args || []);
      }

      return originalHandleGamesCommand(
        api,
        event,
        command,
        args
      );
    },
  };
};
