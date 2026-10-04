"use strict";

const ON_REPLIES = Object.freeze([
  "andito na boss mo tanga, supaen mo ttko",
  "e kung suntukin ko ulo niyo?",
  "hev owns you mga garapata",
  "sabi ko wag ka tanga",
]);

const OFF_REPLIES = Object.freeze([
  "bounce na ako, di kaya kakunatan ko",
  "yoko na, baduy na",
  "pass na, bumaho na kasi andito na ea ni tanga",
  "ano ba yan, tukmol squad yan?",
]);

const UNAUTHORIZED_REPLIES = Object.freeze([
  "bawal bobo",
  "tuwad ka muna",
  "bilang ka mga sampo, tangina mong banlag ka",
  "gamit pa slash, walang bot dito gago",
  "kunware may bot sa acc ko na to",
  "slash mo pa mukha mo",
  "hev abi owns you, wag mo na off, nakakaturn off naman pagmumukha mo kaya ako na mag bbounce",
]);

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function pickSlashBanat(mode = "on") {
  if (String(mode).toLowerCase() === "off") {
    return pick(OFF_REPLIES);
  }

  return pick(ON_REPLIES);
}

function pickUnauthorizedSlashBanat() {
  return pick(UNAUTHORIZED_REPLIES);
}

pickSlashBanat.onReplies = ON_REPLIES.slice();
pickSlashBanat.offReplies = OFF_REPLIES.slice();
pickSlashBanat.unauthorizedReplies = UNAUTHORIZED_REPLIES.slice();

module.exports = pickSlashBanat;
module.exports.pickUnauthorizedSlashBanat = pickUnauthorizedSlashBanat;
