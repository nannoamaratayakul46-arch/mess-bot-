"use strict";

/**
 * ECLIPSE Banat target awareness.
 *
 * Explicit trigger matching stays outside this module. This layer only
 * decides whether an ordinary Banat response has a clear reason to address
 * ECLIPSE.
 */

const DIRECT_ADDRESS_PATTERNS = [
  /^(?:hey|hi|hello|yo|sup|oi|ayy|bro|bruh)?\s*(?:eclipse|ecl|bot)\b/i,
  /\b(?:hey|hi|hello|yo|sup)\s+(?:eclipse|ecl|bot)\b/i,
];

const QUESTION_OPENERS =
  /^(?:who|what|why|when|where|how|can|could|would|will|do|does|did|is|are|am|should|shouldn't|may|might)\b/i;

function normalize(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function getReplyTargetID(event) {
  const reply = event?.messageReply;

  return (
    reply?.senderID ??
    reply?.senderId ??
    reply?.sender_id ??
    reply?.authorID ??
    reply?.authorId ??
    null
  );
}

function getMentionedIDs(event) {
  const mentions = event?.mentions;

  if (!mentions || typeof mentions !== "object") {
    return [];
  }

  return Object.keys(mentions)
    .map((id) => String(id).trim())
    .filter(Boolean);
}

function isDirectAddress(body) {
  const text = normalize(body);

  if (!text) {
    return false;
  }

  return (
    DIRECT_ADDRESS_PATTERNS.some((pattern) => pattern.test(text)) ||
    /^@?(?:eclipse|ecl|bot)\b/i.test(text)
  );
}

function looksLikeQuestion(body) {
  const text = normalize(body);

  return /\?\s*$/.test(text) || QUESTION_OPENERS.test(text);
}

function classifyBanatTarget({
  event,
  body,
  eclipseUserID = "",
}) {
  const text = normalize(body);
  const botID = String(eclipseUserID || "").trim();

  if (!text) {
    return {
      shouldRespond: false,
      reason: "empty-message",
      directed: false,
      via: "none",
      replyToBot: false,
      mentionedBot: false,
      directAddress: false,
      question: false,
    };
  }

  const replyTargetID = getReplyTargetID(event);

  const replyToBot =
    Boolean(botID) &&
    Boolean(replyTargetID) &&
    String(replyTargetID) === botID;

  const mentionedBot =
    Boolean(botID) &&
    getMentionedIDs(event).some((id) => id === botID);

  const directAddress = isDirectAddress(text);
  const question = looksLikeQuestion(text);

  if (replyToBot) {
    return {
      shouldRespond: true,
      reason: "reply-to-eclipse",
      directed: true,
      via: "reply",
      replyToBot: true,
      mentionedBot,
      directAddress,
      question,
    };
  }

  if (mentionedBot) {
    return {
      shouldRespond: true,
      reason: "mention-eclipse",
      directed: true,
      via: "mention",
      replyToBot,
      mentionedBot: true,
      directAddress,
      question,
    };
  }

  if (directAddress) {
    return {
      shouldRespond: true,
      reason: "name-address",
      directed: true,
      via: "name",
      replyToBot,
      mentionedBot,
      directAddress: true,
      question,
    };
  }

  return {
    shouldRespond: false,
    reason: question
      ? "question-not-directed-to-eclipse"
      : "not-directed-to-eclipse",
    directed: false,
    via: "none",
    replyToBot,
    mentionedBot,
    directAddress,
    question,
  };
}

module.exports = {
  classifyBanatTarget,
};
