"use strict";

const banatStateStore = require("./banat-state-store");
const { renderTargetReply } = require("./targetName");

// Separate Jaiden reply pool, copied from jaiden-target-pool.js.
// It has its own saved shuffle bags so using this pool does not consume
// replies from the original dashboard-target pool.
const STATE_SECTION = "jaidenSeparateBags";

const TEMPLATES = [
  "aaaaawagkasabiumungolsatengako?",
  "daming dada, kantutin ko ate mo",
  "kunware may pake ttko sayo",
  "lahsitaba?",
  "wag ka mapikon, subo mo na lang ttko",
  "sinabi ko ba tabaan mo?",
  "bakit andito yung titanic sa gc",
  "bilang ka gamit mataba mong daliri",
  "moka ka aspalto",
  "moka ka libro",
  "moka ka aso",
  "moka ka moka mo",
  "panget moka mo",
  "moka ka paa",
  "moka ka tuhod",
  "e moka ka kawali",
  "e moka ka uling",
  "lah, wag reklamo tababoy",
  "kunware may pake tao rito",
  "atinsyun siker sakin enoh",
  "di ka makakaisa sakin kahit tumuwad ka",
  "sabi ko kakantutin ko ate mo",
  "moka ka tsinelas",
  "moka ka halaman",
  "moka ka hamburger",
  "tamo pikon si hamburger",
  "sayang kung nag review ka na lang sana",
  "wala na, paalam kolehiyo",
  "gage bobo mo",
  "sino ba nag sabi umungol ka",
  "ingay mo",
  "wag ka tumahol sabe",
  "upuan ko moka mama mo",
  "ate mo kinakantot ko sa backseat",
  "bahayniyogawasalego",
  "uso hygiene",
  "moka ka kanal gago",
  "moka ka pokwang x wally",
  "wala ka chance saken",
  "kapatid mo tinira ko",
  "focus ka saken taba",
  "sabi ko focus ka saken, wag sa iba",
  "bilang mga 1 to oten",
  "may pOTENtial si taba"
];

const savedBags = banatStateStore.readSection(STATE_SECTION, {});
const bags = new Map(
  Object.entries(savedBags).map(([threadID, bag]) => [
    String(threadID),
    Array.isArray(bag)
      ? bag.filter((index, position, values) =>
          Number.isInteger(index) &&
          index >= 0 &&
          index < TEMPLATES.length &&
          values.indexOf(index) === position
        )
      : []
  ])
);

function persistBags() {
  banatStateStore.writeSection(
    STATE_SECTION,
    Object.fromEntries(
      Array.from(bags.entries()).filter(([, bag]) => Array.isArray(bag) && bag.length > 0)
    )
  );
}

function renderTargetTemplate(template, targetName) {
  const name = String(targetName || "").trim().slice(0, 80) || "you";
  return renderTargetReply(template, name);
}

function pickJaidenSeparateReply(threadID, targetName, options = {}) {
  const key = String(threadID || "default");
  const random = typeof options.random === "function" ? options.random : Math.random;
  let bag = bags.get(key);

  if (!Array.isArray(bag) || bag.length === 0) {
    bag = TEMPLATES.map((_, index) => index);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.max(0, Math.min(i, Math.floor(random() * (i + 1))));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    bags.set(key, bag);
  }

  const index = bag.pop();
  persistBags();
  return renderTargetTemplate(TEMPLATES[index], targetName);
}

function clearJaidenSeparatePool(threadID) {
  if (threadID == null) bags.clear();
  else bags.delete(String(threadID || "default"));
  persistBags();
}

module.exports = {
  TEMPLATES,
  renderTargetTemplate,
  pickJaidenSeparateReply,
  clearJaidenSeparatePool
};
