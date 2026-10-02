"use strict";

/**
 * Generic delayed reply transport.
 *
 * Human text transformation belongs to human-mimic.js.
 * Banat timing belongs to banat-human.js.
 * Messenger transport belongs to index.js / Traffic Governor.
 *
 * This module only preserves the generic legacy reply behavior used by
 * command handlers: optional meme/url payload + fixed typing delay.
 */

const fs = require("fs");
const { startTyping, stopTyping } = require("./human-typing");

const DEFAULT_TYPING_DELAY_MS = Math.max(
  0,
  Number(process.env.ECLIPSE_REPLY_TYPING_DELAY_MS || 1200)
);

function sendReplyWithTyping(
  api,
  message,
  threadID,
  attachMeme = false,
  linkUrl = null,
  dependencies = {}
) {
  const trafficSendMessage = dependencies.trafficSendMessage;
  const getRandomMemePath = dependencies.getRandomMemePath;

  if (typeof trafficSendMessage !== "function") {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    startTyping(api, threadID);

    setTimeout(() => {
      try {
        const memePath =
          attachMeme &&
          !linkUrl &&
          typeof getRandomMemePath === "function"
            ? getRandomMemePath()
            : null;

        const outgoingMessage = linkUrl
          ? { body: message, url: linkUrl }
          : memePath
          ? {
              body: message,
              attachment: fs.createReadStream(memePath),
            }
          : message;

        trafficSendMessage(
          api,
          outgoingMessage,
          threadID,
          (sendError) => {
            stopTyping(api, threadID);

            if (sendError) {
              console.error("[REPLY] Reply failed:", sendError);
              resolve(false);
              return;
            }

            resolve(true);
          }
        );

        if (
          attachMeme &&
          linkUrl &&
          typeof getRandomMemePath === "function"
        ) {
          const followUpMemePath = getRandomMemePath();

          if (followUpMemePath) {
            setTimeout(() => {
              try {
                trafficSendMessage(
                  api,
                  {
                    attachment: fs.createReadStream(followUpMemePath),
                  },
                  threadID,
                  (sendError) => {
                    if (sendError) {
                      console.error(
                        "[REPLY] Meme follow-up failed:",
                        sendError
                      );
                    }
                  }
                );
              } catch (error) {
                console.error("[REPLY] Meme follow-up error:", error);
              }
            }, 400);
          }
        }
      } catch (error) {
        stopTyping(api, threadID);
        console.error("[REPLY] Reply error:", error);
        resolve(false);
      }
    }, DEFAULT_TYPING_DELAY_MS);
  });
}

module.exports = {
  DEFAULT_TYPING_DELAY_MS,
  sendReplyWithTyping,
};
