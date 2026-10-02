"use strict";

/**
 * ECLIPSE Banat Human Layer
 *
 * Orchestrates the already-separated human modules:
 *   human-mimic.js  -> text transformation
 *   human-delay.js  -> reaction/typing timing
 *   human-typing.js -> Messenger typing lifecycle
 *
 * This file owns only Banat conversation state and the send orchestration.
 * It does NOT duplicate typo, shorthand, timing, or typing implementations.
 */

const fs = require("fs");
const { BANAT_SHORTHANDS } = require("./banat-abbreviations");
const {
  humanize,
  createHumanContext,
  calculateHumanDelay,
  startTyping,
  stopTyping,
} = require("./human-mimic/index);

const BANAT_REPLY_DELAY_MS = Math.max(
  0,
  Number(process.env.ECLIPSE_BANAT_REPLY_DELAY_MS || 2000)
);
const BANAT_MAX_HUMAN_DELAY_MS = Math.max(
  2500,
  Number(process.env.ECLIPSE_BANAT_MAX_HUMAN_DELAY_MS || 6500)
);

const BANAT_TYPO_RATE = Math.min(
  0.18,
  Math.max(0, Number(process.env.ECLIPSE_BANAT_TYPO_RATE || 0.085))
);

const BANAT_SHORTHAND_RATE = Math.min(
  0.22,
  Math.max(0, Number(process.env.ECLIPSE_BANAT_SHORTHAND_RATE || 0.035))
);

const BANAT_CASE_VARIATION_RATE = Math.min(
  0.18,
  Math.max(0, Number(process.env.ECLIPSE_BANAT_CASE_VARIATION_RATE || 0.035))
);

const BANAT_SPACE_SLIP_RATE = Math.min(
  0.08,
  Math.max(0, Number(process.env.ECLIPSE_BANAT_SPACE_SLIP_RATE || 0.018))
);

const humanState = new Map();

function cleanupHumanState() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [threadID, state] of humanState) {
    if (state.at < cutoff) humanState.delete(threadID);
  }
}

function prepareBanatReply(threadID, message, incomingText = "") {
  const context = createHumanContext(
    threadID,
    incomingText,
    humanState
  );

  const text = humanize(message, {
    abbreviations: BANAT_SHORTHANDS,
    abbreviationRate: BANAT_SHORTHAND_RATE,
    typoRate: BANAT_TYPO_RATE,
    caseVariationRate: BANAT_CASE_VARIATION_RATE,
    spaceVariationRate: BANAT_SPACE_SLIP_RATE,
    abbreviate: true,
    typos: true,
    punctuation: true,
  });

  const timing = calculateHumanDelay(
    text,
    context,
    { max: BANAT_MAX_HUMAN_DELAY_MS, maxTypingMs: BANAT_MAX_HUMAN_DELAY_MS }
  );

  return {
    text,
    context,
    reactionMs: Math.max(
      120,
      Math.min(
        1800,
        Number(timing.reactionMs) || BANAT_REPLY_DELAY_MS
      )
    ),
    typingMs: Math.max(
      350,
      Math.min(BANAT_MAX_HUMAN_DELAY_MS, Number(timing.typingMs) || 350)
    ),
  };
}

function sendBanatReplyWithTyping(
  api,
  message,
  threadID,
  replyToMessageID = null,
  attachMeme = false,
  linkUrl = null,
  replyDelayMs = BANAT_REPLY_DELAY_MS,
  incomingText = "",
  dependencies = {}
) {
  const trafficSendMessage = dependencies.trafficSendMessage;
  const getRandomMemePath = dependencies.getRandomMemePath;

  if (typeof trafficSendMessage !== "function") {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const prepared = prepareBanatReply(
      threadID,
      message,
      incomingText
    );

    const requestedReaction = Number(replyDelayMs);
    const reactionMs = Number.isFinite(requestedReaction) && requestedReaction > 0
      ? Math.max(120, Math.min(1800, requestedReaction))
      : prepared.reactionMs;

    setTimeout(() => {
      startTyping(api, threadID);

      setTimeout(() => {
        let settled = false;

        const finish = (value) => {
          if (settled) return;
          settled = true;
          stopTyping(api, threadID);
          resolve(value);
        };

        try {
          const memePath =
            attachMeme &&
            !linkUrl &&
            typeof getRandomMemePath === "function"
              ? getRandomMemePath()
              : null;

          const outgoingMessage = linkUrl
            ? { body: prepared.text, url: linkUrl }
            : memePath
            ? {
                body: prepared.text,
                attachment: fs.createReadStream(memePath),
              }
            : prepared.text;

          trafficSendMessage(
            api,
            outgoingMessage,
            threadID,
            (sendError, messageInfo) => {
              if (sendError) {
                console.error("[BANAT] Reply failed:", sendError);
                finish(false);
                return;
              }

              const sentMessageID =
                typeof messageInfo === "string"
                  ? messageInfo
                  : messageInfo?.messageID ||
                    messageInfo?.messageId ||
                    messageInfo?.id ||
                    null;

              if (sentMessageID) {
                try {
                  const reactionCallback = (reactionError) => {
                    if (reactionError) {
                      console.error(
                        "[BANAT] Self-reaction failed:",
                        reactionError
                      );
                    }
                  };

                  if (typeof api?.setMessageReactionMqtt === "function") {
                    api.setMessageReactionMqtt(
                      "😆",
                      String(sentMessageID),
                      String(threadID),
                      reactionCallback
                    );
                  } else if (typeof api?.setMessageReaction === "function") {
                    api.setMessageReaction(
                      "😆",
                      String(sentMessageID),
                      reactionCallback,
                      true
                    );
                  }
                } catch (reactionError) {
                  console.error(
                    "[BANAT] Self-reaction error:",
                    reactionError
                  );
                }
              }

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
                        (followUpError) => {
                          if (followUpError) {
                            console.error(
                              "[BANAT] Meme follow-up failed:",
                              followUpError
                            );
                          }
                        }
                      );
                    } catch (followUpError) {
                      console.error(
                        "[BANAT] Meme follow-up error:",
                        followUpError
                      );
                    }
                  }, 400);
                }
              }

              finish(true);
            },
            replyToMessageID || null
          );
        } catch (sendError) {
          console.error("[BANAT] Reply error:", sendError);
          finish(false);
        }
      }, prepared.typingMs);
    }, reactionMs);

    if (humanState.size > 500) cleanupHumanState();
  });
}

module.exports = {
  BANAT_REPLY_DELAY_MS,
  BANAT_MAX_HUMAN_DELAY_MS,
  cleanupHumanState,
  prepareBanatReply,
  sendBanatReplyWithTyping,
};
