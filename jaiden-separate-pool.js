"use strict";

const banatStateStore = require("./banat-state-store");
const { renderTargetReply } = require("./targetName");

// Separate Jaiden reply pool, copied from jaiden-target-pool.js.
// It has its own saved shuffle bags so using this pool does not consume
// replies from the original dashboard-target pool.
const STATE_SECTION = "jaidenSeparateBags";

const TEMPLATES = [
  "{{target}}, ang confidence mo pang finals pero yung sagot pang practice.",
  "{{target}}, parang loading screen ka—matagal dumating yung point.",
  "{{target}}, ang daming tabs bukas pero wala pa ring conclusion.",
  "{{target}}, ikaw yung notification na walang importanteng laman.",
  "{{target}}, yung punchline mo nag-timeout bago pa makarating.",
  "{{target}}, parang group project ka—present sa pangalan, missing sa gawa.",
  "{{target}}, nagdala ng confidence pero naiwan sa bahay yung facts.",
  "{{target}}, ang lakas ng intro mo, nasaan yung actual content?",
  "{{target}}, parang GPS na sira—ang lakas mag-direksyon, ligaw naman.",
  "{{target}}, ang daming sinabi pero walang na-save na progress.",
  "{{target}}, ikaw yung update na puro bug ang dala.",
  "{{target}}, parang printer—ang ingay pero walang matinong output.",
  "{{target}}, yung argumento mo nag-commute pero hindi nakarating.",
  "{{target}}, parang draft message na dapat hindi na-send.",
  "{{target}}, nag-flex ng IQ tapos nag-error yung calculator.",
  "{{target}}, ikaw yung ad na hindi ma-skip sa usapan.",
  "{{target}}, nag-open ng debate pero vibes lang ang dala.",
  "{{target}}, parang tutorial na mas nakakalito kaysa sa problema.",
  "{{target}}, ang tapang ng delivery, nasaan yung laman?",
  "{{target}}, yung point mo nag-apply pero hindi natanggap.",
  "{{target}}, parang low-battery warning—paalala nang paalala, walang action.",
  "{{target}}, nagdala ng resibo pero resibo ng sariling kapalpakan.",
  "{{target}}, parang sirang remote—pindot nang pindot, walang nangyayari.",
  "{{target}}, ikaw yung meeting na puwedeng isang message na lang.",
  "{{target}}, ang haba ng paragraph para sa isang maliit na point.",
  "{{target}}, parang Wi-Fi sa elevator—nawawala kapag kailangan.",
  "{{target}}, nag-announce ng comeback pero walang na-impress.",
  "{{target}}, parang menu na puro pictures tapos walang available.",
  "{{target}}, nag-claim ng victory sa tutorial level.",
  "{{target}}, parang calendar reminder na laging maling oras.",
  "{{target}}, nag-type ng trust me imbes na magbigay ng proof.",
  "{{target}}, ikaw yung side quest na hindi naman kailangan tapusin.",
  "{{target}}, parang empty folder—pangalan lang ang laman.",
  "{{target}}, yung logic mo nag-loading pa rin hanggang ngayon.",
  "{{target}}, parang expired coupon—sayang lang yung pag-click.",
  "{{target}}, ang dami mong side quest, nasaan yung main mission?",
  "{{target}}, parang broken link—click nang click, walang destination.",
  "{{target}}, nagdala ng plot armor pero side character pa rin.",
  "{{target}}, parang app na laging may update pero walang improvement.",
  "{{target}}, ang bilis mag-send, ang bagal dumating ng point."
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
