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
  "may pOTENtial si taba",
  "mukha kang assignment na pinasa kahit walang pangalan",
  "brain cells mo nag-resign sabay sabay",
  "pag nag isip ka, loading screen lang",
  "ikaw yung plot twist na sana tinanggal sa script",
  "puro ka notification, wala namang laman",
  "confidence mo naka-premium, utak mo free trial",
  "mas may direction pa yung electric fan",
  "parang group project ka, puro abala walang ambag",
  "kung bobo ang currency, billionaire ka na",
  "ikaw ang dahilan bakit may terms and conditions",
  "parang expired na joke, pilit pa ring pinapainit",
  "yung logic mo parang WiFi sa basement, walang signal",
  "may potential ka, kaso potential problem",
  "parang thesis na walang conclusion",
  "puro ka side quest, wala kang main character arc",
  "kahit autocorrect sumusuko sa argumento mo",
  "pag nagsalita ka, nagiging loading screen ang usapan",
  "mas organized pa yung kalat sa ilalim ng kama",
  "ikaw yung update na puro bug ang dala",
  "ang ambag mo sa GC ay dagdag storage lang",
  "parang charger na kailangang hawakan sa tamang angle",
  "may utak ka naman siguro, naka-airplane mode lang",
  "parang calculator na laging syntax error",
  "ikaw yung spoiler na walang gustong makarinig",
  "parang resume na puro objective, walang experience",
  "kahit echo ayaw ibalik mga sinasabi mo",
  "yung banat mo parang kanin na walang ulam",
  "mukha kang deadline na biglang sumulpot",
  "ang aura mo parang meeting na puwedeng email",
  "parang password na mali kahit tama na",
  "kung common sense lang, naka-out of stock ka",
  "ikaw yung pop-up ad ng totoong buhay",
  "mas mabilis pa mag-isip yung loading icon",
  "parang group chat poll na walang bumoto",
  "lahat ng sinabi mo may free trial ng hiya",
  "ikaw yung draft na hindi na dapat pinublish",
  "parang keyboard na puro caps lock, walang point",
  "yung reasoning mo nag-file na ng resignation",
  "parang exam na blanko pero may confidence",
  "ikaw yung footnote na mas mahaba pa sa sagot",
  "mukha kang warning label na hindi binasa",
  "parang elevator music, nandiyan pero walang may pake",
  "ang logic mo parang spaghetti na nahulog sa sahig",
  "ikaw yung typo na naging buong personality",
  "mas may substance pa yung hangin sa plastic",
  "parang calendar invite na walang agenda",
  "pag may idea ka, automatic maintenance mode",
  "ikaw yung tab na 37 na bukas pero walang silbi",
  "parang power bank na 1% mula kahapon",
  "yung argumento mo parang screenshot ng walang context",
  "ikaw yung extra sa sarili mong kwento",
  "parang app na crash bago pa mag-open",
  "ang ambag mo parang sukli na kulang ng piso",
  "ikaw yung tutorial na mas nakakalito kaysa tanong",
  "parang printer na may papel pero ayaw gumana",
  "kung charisma ang exam, absent ka",
  "ikaw yung draft message na dapat dinelete",
  "parang spoiler alert na walang magandang spoiler",
  "puro ka opinion, walang resibo",
  "ikaw yung foot traffic na walang pumapasok",
  "parang assignment na kinopya pati maling sagot",
  "mas may character development pa yung bato",
  "ikaw yung extra rice na malamig na",
  "yung utak mo parang browser na 98 tabs, lahat frozen",
  "parang calendar na puro holiday pero walang pahinga",
  "ikaw yung notification na walang bagong message",
  "kung wisdom ang load, zero balance ka",
  "parang shortcut na mas malayo ang nilakad",
  "ikaw yung typo sa pangalan ng sariling buhay",
  "puro ka drama, budget production naman",
  "parang trailer na mas maganda kaysa buong pelikula",
  "ikaw yung sequel na walang humiling",
  "ang dating mo parang apology na walang sincerity",
  "parang traffic cone, nasa gitna at sagabal",
  "ikaw yung loading bar na stuck sa 99%",
  "mas may ambag pa yung seen zone",
  "parang meme na kailangan pang ipaliwanag",
  "ikaw yung meeting na nag-overtime nang walang output",
  "kung utak ang battery, low power mode ka lagi",
  "parang kanta na puro intro, walang chorus",
  "ikaw yung error 404 ng matinong argumento",
  "mukha kang draft na na-save nang aksidente",
  "parang menu na lahat unavailable",
  "ikaw yung plot hole na hindi na inayos",
  "ang confidence mo parang fake receipt",
  "parang flashlight na walang battery",
  "ikaw yung groupmate na nagtanong kung ano gagawin pagkatapos ng deadline",
  "mas stable pa yung monoblock sa bagyo",
  "parang calendar reminder na snooze nang snooze",
  "ikaw yung extra step sa simpleng proseso",
  "puro ka comeback, pero walang original line",
  "parang essay na 500 words pero walang sagot",
  "ikaw yung update na kailangan i-rollback",
  "yung logic mo may sariling black hole",
  "parang elevator na hanggang second floor lang",
  "ikaw yung screenshot na cropped yung importanteng part",
  "mas may timing pa yung delayed notification",
  "parang headset na isang side lang gumagana",
  "ikaw yung mic na naka-mute pero maingay pa rin",
  "parang form na required lahat pero walang submit button",
  "ikaw yung FAQ na hindi sinasagot ang tanong",
  "puro ka teaser, wala namang release date",
  "parang playlist na puro skip",
  "ikaw yung extra charge sa bill na walang paliwanag",
  "mas useful pa yung empty folder",
  "parang GPS na pinapaikot ka lang",
  "ikaw yung password hint na lalo kang nilito",
  "parang elevator pitch na walang elevator",
  "ikaw yung draft na puro undo",
  "yung common sense mo parang limited edition, wala sa stock",
  "parang spreadsheet na puro #VALUE!",
  "ikaw yung notification sound na nakaka-stress",
  "parang charger na umiinit pero walang charge",
  "ikaw yung trailer voice-over ng walang pelikula",
  "parang WiFi password na 48 characters pero mali",
  "ikaw yung typo na paulit-ulit kahit naka-autocorrect",
  "mas may purpose pa yung loading spinner",
  "parang camera na naka-lens cap",
  "ikaw yung receipt na walang total",
  "parang calendar na mali lahat ng dates",
  "ikaw yung side character na nag-audition sa villain role",
  "puro ka confidence, kulang sa evidence",
  "parang alarm na tumunog pagkatapos mong bumangon",
  "ikaw yung draft reply na hindi na-send kasi sayang data",
  "parang vending machine na kinain na yung bayad",
  "ikaw yung dead link ng conversation",
  "mas may plot pa yung resibo sa bulsa",
  "parang phone na 2% pero 4K video pa rin",
  "ikaw yung pop quiz na walang lesson",
  "parang app permissions na humihingi ng lahat, walang silbi",
  "ikaw yung calendar event na walang venue",
  "puro ka hot take, malamig naman ang logic",
  "parang code na walang comments at walang gumagana",
  "ikaw yung bug na naging feature dahil tinamad ayusin",
  "parang essay title na mas magaling kaysa content",
  "ikaw yung meeting minutes na walang decisions",
  "mas may laman pa yung empty promise",
  "parang map na kulang ang legend",
  "ikaw yung checkout line na walang cashier",
  "parang playlist shuffle na iisang kanta lang",
  "ikaw yung warning na lumabas pagkatapos ng crash",
  "yung brainpower mo parang free sample, isang tikim lang",
  "parang deadline extension na hindi naman nakatulong",
  "ikaw yung answer key na mali ang numbering",
  "parang comment section na puro typo at confidence",
  "ikaw yung backup plan na kailangan pa ng backup",
  "parang password reset na bumalik sa parehong problema",
  "ikaw yung typo sa headline, yun lang napansin",
  "puro ka reaction, walang comprehension",
  "parang presentation na 40 slides, zero point",
  "ikaw yung summary na mas mahaba sa original",
  "parang tutorial na skip intro pero intro pa rin",
  "ikaw yung loading screen na may sariling loading screen",
  "parang receipt printer na ayaw tumigil pero walang resibo",
  "ikaw yung last straw na gawa sa tissue",
  "parang calendar na may date pero walang plano"
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
