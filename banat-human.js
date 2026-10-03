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
const { chooseSocialResponse, socialTimingMultiplier } = require("./banat-social");
const {
  humanize,
  createHumanContext,
  calculateHumanDelay,
  startTyping,
  stopTyping,
} = require("./human-mimic/index");

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

const BANAT_HESITATION_RATE = Math.min(
  0.35,
  Math.max(0, Number(process.env.ECLIPSE_BANAT_HESITATION_RATE || 0.11))
);

// Keep response length/style varied. Short reactions are intentionally
// favored for short incoming messages so Banat does not answer everything
// with a full sentence.
const BANAT_SHORT_REPLY_RATE = Math.min(
  0.65,
  Math.max(0, Number(process.env.ECLIPSE_BANAT_SHORT_REPLY_RATE || 0.24))
);

const BANAT_MINIMAL_REACTION_RATE = Math.min(
  0.30,
  Math.max(0, Number(process.env.ECLIPSE_BANAT_MINIMAL_REACTION_RATE || 0.07))
);

const SHORT_REACTION_RE = /^(?:bro|bruh|nah|wtf|what|wait|okay|ok|fr|real|damn|pls|please|😭+|💀+|\?+|!+|lol+|lmao+|lmfao+)$/i;

function countReplyWords(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function isShortIncoming(text) {
  const value = String(text || "").trim();
  const words = countReplyWords(value);
  return words <= 7 || value.length <= 42;
}

function incomingEnergy(text) {
  const value = String(text || "");
  let score = 0;

  if (/[!?]{2,}/.test(value)) score += 1;
  if (/\b(?:HAHA+|LMFAO+|LMAO+)\b/i.test(value)) score += 1;
  if (/[😭💀🤣]/u.test(value)) score += 1;
  if (/\b(?:bro|bruh|wtf|nah)\b/i.test(value)) score += 1;
  if (value === value.toUpperCase() && /[A-Z]/.test(value)) score += 1;

  return Math.min(5, score);
}

function chooseReplyShape(text, incomingText, context = {}) {
  const incomingShort = isShortIncoming(incomingText);
  const energy = incomingEnergy(incomingText);
  const words = countReplyWords(text);
  const random = Math.random();

  if (!text || words <= 2) return text;

  // Short incoming messages should often get a quick reaction instead of
  // a polished paragraph.
  if (
    incomingShort &&
    random < BANAT_MINIMAL_REACTION_RATE
  ) {
    const reactions = energy >= 2
      ? ["😭", "💀", "bro 😭", "nah 😭", "LMFAO"]
      : ["bro", "nah", "wait", "😭", "💀"];

    return reactions[Math.floor(Math.random() * reactions.length)];
  }

  if (
    incomingShort &&
    random < BANAT_SHORT_REPLY_RATE &&
    words >= 4
  ) {
    const parts = String(text).trim().split(/\s+/);
    const target = Math.min(
      parts.length,
      energy >= 2 ? 5 : 7
    );

    // Prefer a natural front-loaded reaction rather than chopping a
    // sentence at a random point.
    if (/^(?:baby|bro|bruh|nah|wait|okay|lmao|lmfao|haha)/i.test(text)) {
      return parts.slice(0, target).join(" ").replace(/[,.]$/, "");
    }
  }

  // Very short conversational momentum: occasionally keep a response
  // short even when the candidate itself is longer.
  if (
    context.momentum >= 4 &&
    words >= 8 &&
    random < 0.12
  ) {
    const parts = String(text).trim().split(/\s+/);
    return parts.slice(0, 6).join(" ").replace(/[,.]$/, "");
  }

  return text;
}

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

  let text = humanize(message, {
    abbreviations: BANAT_SHORTHANDS,
    abbreviationRate: BANAT_SHORTHAND_RATE,
    typoRate: BANAT_TYPO_RATE,
    caseVariationRate: BANAT_CASE_VARIATION_RATE,
    spaceVariationRate: BANAT_SPACE_SLIP_RATE,
    abbreviate: true,
    typos: true,
    punctuation: true,
  });

  text = chooseReplyShape(text, incomingText, context);

  const social = chooseSocialResponse(
    incomingText,
    text,
    context
  );

  const socialContext = {
    ...context,
    social,
  };

  const timing = calculateHumanDelay(
    text,
    socialContext,
    {
      max: BANAT_MAX_HUMAN_DELAY_MS,
      maxTypingMs: BANAT_MAX_HUMAN_DELAY_MS,
      hesitationRate: BANAT_HESITATION_RATE,
    }
  );

  const timingMultiplier = socialTimingMultiplier(social);

  return {
    text,
    context: socialContext,
    social,
    reactionMs: Math.max(
      120,
      Math.min(
        1800,
        (Number(timing.reactionMs) || BANAT_REPLY_DELAY_MS) * timingMultiplier
      )
    ),
    typingMs: Math.max(
      350,
      Math.min(
        BANAT_MAX_HUMAN_DELAY_MS,
        (Number(timing.typingMs) || 350) * timingMultiplier
      )
    ),
  };
}


function calculateBanatDecisionDelay(incomingText = "", candidateCount = 1) {
  const text = String(incomingText || "").trim();
  const length = text.length;
  const candidates = Math.max(1, Number(candidateCount) || 1);
  const base = 850 + Math.min(900, length * 12);
  const crowdPause = Math.min(700, (candidates - 1) * 140);
  const hesitation = Math.random() < BANAT_HESITATION_RATE
    ? [120, 180, 240, 320, 450, 600][Math.floor(Math.random() * 6)]
    : 0;
  return Math.max(
    700,
    Math.min(
      2800,
      Math.round(base + crowdPause + hesitation + (Math.random() * 360 - 180))
    )
  );
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
  BANAT_HESITATION_RATE,
  cleanupHumanState,
  prepareBanatReply,
  calculateBanatDecisionDelay,
  sendBanatReplyWithTyping,
};
