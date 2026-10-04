"use strict";

/* Banat runtime compatibility layer. Loaded before index.js by bootstrap.js. */
const Module = require("module");
const path = require("path");

const originalLoad = Module._load;

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

const ADMIN_SAFE_FALLBACKS = [
  "bro what 😭",
  "ano ba yan 😭",
  "wait lang HAHAHA",
  "teka lang, what is this",
  "grabe ka naman",
  "hindi ko alam sayo",
  "wala ka talagang preno no",
  "okay??? 😭",
  "saan mo nakuha yan",
  "bakit ganyan ka",
  "beh please 😭",
  "hoy HAHAHAHA",
  "tama na please",
  "ikaw talaga",
  "ang lala mo",
  "wala na, ikaw na",
  "sige ikaw na tama",
  "gets ko naman pero 😭",
  "valid, pero ang funny",
  "lowkey true",
  "real naman",
  "okay noted yan",
  "wait kasi",
  "wala na akong masabi",
  "speechless ako 😭",
  "anyway moving on",
  "sige next topic",
  "go, explain mo",
  "interesting choice",
  "choice mo yan",
  "fair enough naman",
  "okay lang yan",
  "ganun talaga minsan",
  "i'm just observing",
  "spectator lang ako dito",
  "okay this is entertaining",
  "that got me ngl",
  "fair point actually",
  "can't lie",
  "real talk though",
  "honestly though",
];

const SLASH_ON_REPLIES = [
  "andito na ang bot",
  "sige, on na tayo",
  "okay, active na",
  "nandito na ako",
];

const SLASH_OFF_REPLIES = [
  "bounce na ako",
  "yoko na",
  "pass na",
  "ano ba yan",
];

function install() {
  if (global.__banatRuntimeInstalled) return;
  global.__banatRuntimeInstalled = true;

  Module._load = function patchedLoad(request, parent, isMain) {
    const loaded = originalLoad.apply(this, arguments);

    if (request === "./triggers" || request.endsWith("/triggers")) {
      if (loaded.__banatRuntimePatched) return loaded;

      const permissions = originalLoad.call(
        this,
        path.join(__dirname, "permissions.js"),
        parent,
        false
      );
      const isAdmin =
        typeof permissions?.isAdmin === "function"
          ? permissions.isAdmin
          : () => false;

      const wrapped = { ...loaded };

      wrapped.getTriggerReply = async function (...args) {
        if (isAdmin(args[1])) return null;
        return loaded.getTriggerReply(...args);
      };

      wrapped.getRandomRoastReply = function (threadId, incomingText, senderId) {
        if (!isAdmin(senderId)) {
          return loaded.getRandomRoastReply(threadId, incomingText, senderId);
        }

        const group = Array.isArray(loaded.groups)
          ? loaded.groups.find((item) => item.name === "banat-natural")
          : null;
        const pool = Array.isArray(group?.replies) && group.replies.length
          ? group.replies
          : ADMIN_SAFE_FALLBACKS;

        return pick(pool);
      };

      wrapped.__banatRuntimePatched = true;
      return wrapped;
    }

    if (request === "./slash-banats" || request.endsWith("/slash-banats")) {
      const slashReply = function () {
        const state = global.__eclipseBanatToggle;
        if (state?.enabled === false) return pick(SLASH_OFF_REPLIES);
        return pick(SLASH_ON_REPLIES);
      };
      slashReply.onReplies = SLASH_ON_REPLIES.slice();
      slashReply.offReplies = SLASH_OFF_REPLIES.slice();
      return slashReply;
    }

    return loaded;
  };

  const db = require("./db");
  if (typeof db.setRoastEnabled === "function" && !db.setRoastEnabled.__banatRuntimePatched) {
    const originalSet = db.setRoastEnabled.bind(db);
    const patchedSet = async function (threadId, enabled, ...rest) {
      global.__eclipseBanatToggle = {
        threadId: String(threadId || ""),
        enabled: Boolean(enabled),
        at: Date.now(),
      };
      return originalSet(threadId, enabled, ...rest);
    };
    patchedSet.__banatRuntimePatched = true;
    db.setRoastEnabled = patchedSet;
  }
}

install();
