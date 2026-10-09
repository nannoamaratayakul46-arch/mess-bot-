"use strict";

/**
 * ECLIPSE Banat Human Layer
 *
 * Orchestrates the existing human modules. This layer owns Banat-specific
 * behavior selection and state; text transformation, timing, and typing stay
 * in their existing modules.
 */

const fs = require("fs");
const { BANAT_SHORTHANDS } = require("./banat-abbreviations");
const { chooseSocialResponse, socialTimingMultiplier } = require("./banat-social");
const {
  humanize,
  createHumanContext,
  calculateHumanDelay,
  humanizationProfile,
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
const BANAT_FULL_REPLY_RATE = Math.min(
  1,
  Math.max(0.80, Number(process.env.ECLIPSE_BANAT_FULL_REPLY_RATE || 0.96))
);

// Human behavior should be sparse and contextual, not applied at full strength
// to every message. These rates are deliberately capped so the mimic layer
// never turns normal Banat lines into visibly corrupted text.
const BANAT_REPEATED_LETTER_RATE = Math.min(
  0.045,
  Math.max(0, Number(process.env.ECLIPSE_BANAT_REPEATED_LETTER_RATE || 0.012))
);
const BANAT_REACTION_STYLE_RATE = Math.min(
  0.12,
  Math.max(0, Number(process.env.ECLIPSE_BANAT_REACTION_STYLE_RATE || 0.02))
);

function countReplyWords(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function isShortIncoming(text) {
  const value = String(text || "").trim();
  return countReplyWords(value) <= 7 || value.length <= 42;
}

function incomingEnergy(text) {
  const value = String(text || "");
  let score = 0;

  if (/[!?]{2,}/.test(value)) score += 1;
  if (/\b(?:HAHA+|LMFAO+|LMAO+)\b/i.test(value)) score += 1;
  if (/[😭💀🤣😂]/u.test(value)) score += 1;
  if (/\b(?:bro|bruh|wtf|nah|wtf|omg)\b/i.test(value)) score += 1;
  if (value === value.toUpperCase() && /[A-Z]/.test(value)) score += 1;

  return Math.min(5, score);
}

function buildHumanMimicOptions(incomingText, context, social) {
  const energy = incomingEnergy(incomingText);
  const short = isShortIncoming(incomingText);
  const momentum = Number(context?.momentum || 1);

  // High-energy messages can naturally produce more expressive casing,
  // repeated letters and reactions. Calm messages stay mostly clean.
  const energyBoost = energy * 0.006;
  const momentumBoost = Math.min(0.018, Math.max(0, momentum - 2) * 0.004);

  return {
    abbreviations: BANAT_SHORTHANDS,
    abbreviationRate: Math.min(
      0.16,
      BANAT_SHORTHAND_RATE + (short ? 0.012 : 0) + energyBoost
    ),
    typoRate: Math.min(
      0.12,
      BANAT_TYPO_RATE + (energy >= 3 ? 0.012 : 0) + momentumBoost
    ),
    caseVariationRate: Math.min(
      0.10,
      BANAT_CASE_VARIATION_RATE + energy * 0.008
    ),
    spaceVariationRate: Math.min(
      0.045,
      BANAT_SPACE_SLIP_RATE + (momentum >= 4 ? 0.004 : 0)
    ),
    repeatedLetterRate: Math.min(
      0.045,
      BANAT_REPEATED_LETTER_RATE + energy * 0.004
    ),
    reactionStyleRate: Math.min(
      0.12,
      BANAT_REACTION_STYLE_RATE + energy * 0.012
    ),
    // Short answers should not be aggressively transformed. Social behavior
    // still decides the response family; this only shapes the chosen text.
    styleRate: short ? 0.78 : 1,
    abbreviate: true,
    typos: true,
    punctuation: true,
    social,
  };
}

function chooseReplyShape(text, incomingText, context = {}) {
  const words = countReplyWords(text);
  if (!text || words <= 2) return text;

  if (Math.random() < BANAT_FULL_REPLY_RATE) return text;

  if (context.momentum >= 6 && words >= 18) {
    const parts = String(text).trim().split(/\s+/);
    return parts.slice(0, 12).join(" ").replace(/[,.]$/, "");
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
  const context = createHumanContext(threadID, incomingText, humanState);
  const incomingProfile = humanizationProfile(incomingText);
  const social = chooseSocialResponse(incomingText, String(message || ""), context);

  let text = humanize(
    message,
    buildHumanMimicOptions(incomingText, context, social)
  );

  text = chooseReplyShape(text, incomingText, context);

  // Keep the calculated profile attached to the context so timing can react
  // to message complexity without reimplementing timing math here.
  const socialContext = {
    ...context,
    incomingProfile,
    social,
    incomingEnergy: incomingEnergy(incomingText),
  };

  const timing = calculateHumanDelay(text, socialContext, {
    max: BANAT_MAX_HUMAN_DELAY_MS,
    maxTypingMs: BANAT_MAX_HUMAN_DELAY_MS,
    hesitationRate: BANAT_HESITATION_RATE,
  });

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
  const energy = incomingEnergy(text);

  const base = 850 + Math.min(900, length * 12);
  const crowdPause = Math.min(700, (candidates - 1) * 140);
  const energyAdjustment = energy >= 4 ? -120 : energy === 0 ? 100 : 0;
  const hesitation = Math.random() < BANAT_HESITATION_RATE
    ? [120, 180, 240, 320, 450, 600][Math.floor(Math.random() * 6)]
    : 0;

  return Math.max(
    700,
    Math.min(
      2800,
      Math.round(
        base + crowdPause + energyAdjustment + hesitation + (Math.random() * 360 - 180)
      )
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

  if (typeof trafficSendMessage !== "function") return Promise.resolve(false);

  return new Promise((resolve) => {
    const prepared = prepareBanatReply(threadID, message, incomingText);
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
          const memePath = attachMeme && typeof getRandomMemePath === "function"
            ? getRandomMemePath()
            : null;

          // One Banat turn = one Messenger send. Keep optional link
          // and meme on the same payload instead of sending a follow-up.
          const outgoingMessage =
            linkUrl || memePath
              ? {
                  body: prepared.text,
                  ...(linkUrl ? { url: linkUrl } : {}),
                  ...(memePath
                    ? { attachment: fs.createReadStream(memePath) }
                    : {}),
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

              // Explicitly connect every successful Banat send (including the
              // backslash pool) to the self-laugh reaction. ws3-fca versions
              // differ in the shape of messageInfo, so accept common ID keys.
              const sentMessageID = typeof messageInfo === "string"
                ? messageInfo
                : messageInfo?.messageID ||
                  messageInfo?.messageId ||
                  messageInfo?.message_id ||
                  messageInfo?.mid ||
                  messageInfo?.id ||
                  null;

              if (sentMessageID) {
                // A human does not normally react to their own freshly sent
                // message in the same millisecond. Keep the reaction outside
                // the message send path, but give it a small context-sensitive
                // delay so it cannot make the reply look mechanically chained.
                const reactionDelayMs = Math.max(
                  350,
                  Math.min(
                    1600,
                    Math.round(
                      450 +
                        Math.random() * 550 +
                        Math.min(450, prepared.typingMs * 0.08)
                    )
                  )
                );

                setTimeout(() => {
                  try {
                    const reactionCallback = (reactionError) => {
                      if (reactionError) {
                        console.error(
                          "[BANAT] Self-laugh reaction failed for message " +
                            String(sentMessageID) + ":",
                          reactionError
                        );
                      } else {
                        console.log(
                          "[BANAT] Self-reaction API callback completed without error for message:",
                          String(sentMessageID)
                        );
                      }
                    };

                    if (typeof api?.setMessageReaction === "function") {
                      api.setMessageReaction(
                        "😆",
                        String(sentMessageID),
                        reactionCallback
                      );
                    } else if (typeof api?.setMessageReactionMqtt === "function") {
                      api.setMessageReactionMqtt(
                        "😆",
                        String(sentMessageID),
                        reactionCallback
                      );
                    } else {
                      console.warn(
                        "[BANAT] Cannot self-laugh: this API exposes no supported message-reaction method."
                      );
                    }
                  } catch (reactionError) {
                    console.error(
                      "[BANAT] Self-laugh reaction error:",
                      reactionError
                    );
                  }
                }, reactionDelayMs);
              } else {
                console.warn(
                  "[BANAT] Banat message sent without a readable message ID; self-laugh skipped.",
                  messageInfo
                );
              }

              // No follow-up meme send: the current turn already carries the meme/link.

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
