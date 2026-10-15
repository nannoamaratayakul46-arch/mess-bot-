"use strict";

const banatStateStore = require("./banat-state-store");
const { renderTargetReply } = require("./targetName");

// Jaiden replies use the same thread-wide no-repeat cycle as the classic slash Banat pool.
const STATE_SECTION = "banatJaidenPool";

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
  "bobo mo naman gago",
  "tahimik ka na lang, wala ka nang ambag",
  "ang ingay mo, wala namang sense",
  "pikon ka agad, hina ng kalaban",
  "wag ka ngang dada nang dada",
  "utak mo ba naka-leave?",
  "gago ka ba o trip mo lang?",
  "moka ka talangka",
  "moka ka basurahan",
  "moka ka timba",
  "moka ka lumang tsinelas",
  "moka ka kanal na tuyo",
  "moka ka kalderong sunog",
  "moka ka sabaw na malamig",
  "moka ka walis tambo",
  "moka ka basang karton",
  "moka ka upuang bali",
  "moka ka sirang electric fan",
  "moka ka pritong hangin",
  "moka ka kaning lamig",
  "moka ka ulam na walang lasa",
  "moka ka itlog na hilaw",
  "moka ka sardinas na walang lata",
  "moka ka suka na panis",
  "moka ka kutsarang walang hawakan",
  "moka ka medyas na nawawala pares",
  "moka ka payong na butas",
  "moka ka charger na di gumagana",
  "moka ka cellphone na walang signal",
  "moka ka load na expired",
  "moka ka piso na kinain ng vending machine",
  "moka ka traffic sa alas-dose",
  "moka ka pila na walang dulo",
  "moka ka exam na puro trick question",
  "moka ka assignment na walang pangalan",
  "moka ka notebook na puro doodle",
  "moka ka ballpen na walang tinta",
  "moka ka lapis na mapurol",
  "moka ka eraser na dumudumi lang",
  "moka ka calculator na lowbat",
  "moka ka groupmate na seen lang",
  "moka ka kagrupong nawawala pag deadline",
  "moka ka report na walang conclusion",
  "moka ka recitation na puro 'present'",
  "moka ka essay na puro paligoy-ligoy",
  "moka ka project na cramming ang ambag",
  "moka ka thesis na walang source",
  "moka ka reviewer na mali lahat",
  "moka ka quiz na blanko pero confident",
  "moka ka diploma na nakaprint sa bond paper",
  "moka ka honor student ng katangahan",
  "ikaw ba yung dahilan kaya may remedial?",
  "kahit simpleng tanong pinapahirapan mo",
  "mag-isip ka muna bago ka mag-type",
  "yung utak mo pang-display lang ba?",
  "may laman ba yan o hangin lang?",
  "nag-update ka ba? lalong bumagal utak mo",
  "kahit calculator nahihiya sa sagot mo",
  "pag nagsalita ka, nawawala yung point",
  "ang point mo parang bilog, paikot-ikot",
  "argumento mo parang lata, maingay pero walang laman",
  "wala ka nang sense, may volume ka pa",
  "puro ka yabang, saan ang resibo?",
  "angas mo pang-finals, laro mo pang-tutorial",
  "lakas mo mang-asar, iyak ka naman agad",
  "wag ka maghamon kung madaling mapikon",
  "ikaw unang nag-ingay tapos ikaw nagalit",
  "puro ka tapang sa chat, tahimik sa totoong usapan",
  "keyboard warrior na lowbat",
  "angas mo pang-caption lang",
  "bida-bida ka na naman, wala namang eksena",
  "main character ka sa kwento mong gawa-gawa",
  "kahit extra ka, wala ka pa ring linya",
  "puro ka flex, pati utak mo hiniram",
  "yabang mo naka-install, skill mo hindi",
  "mayabang ka na nga, mali ka pa",
  "di ka na nga tama, di ka pa tumitigil",
  "galing mong magpaliwanag ng mali",
  "confident na confident, sablay naman",
  "ikaw yung sagot na mali pero naka-bold",
  "mukha kang maling send sa GC",
  "mukha kang screenshot na putol yung context",
  "mukha kang meme na walang punchline",
  "mukha kang joke na di natawanan",
  "mukha kang typo sa sariling pangalan",
  "mukha kang assignment na kinopya sa mali",
  "mukha kang kanin na nakalimutang lutuin",
  "mukha kang sabaw na puro tubig",
  "mukha kang lumpiang puro hangin",
  "mukha kang hotdog na walang laman",
  "mukha kang tinapay na walang palaman",
  "mukha kang softdrinks na puro bula",
  "mukha kang fishball na nahulog sa kanal",
  "mukha kang ulam na pinasa-pasa na",
  "mukha kang leftover na ayaw na kainin",
  "mukha kang walis na puro tingting na lang",
  "mukha kang payong na binabaliktad ng hangin",
  "mukha kang pinto na ayaw bumukas",
  "mukha kang kandado na walang susi",
  "mukha kang remote na walang battery",
  "mukha kang TV na puro static",
  "mukha kang radyo na puro interference",
  "mukha kang speaker na basag ang tunog",
  "mukha kang alarm na walang tumatayo",
  "mukha kang GPS na ligaw din",
  "mukha kang mapa na baliktad",
  "mukha kang shortcut na mas nakakapagod",
  "mukha kang loading na di matatapos",
  "mukha kang error na walang solution",
  "mukha kang bug na di mahanap",
  "mukha kang app na laging nagka-crash",
  "mukha kang password na di matandaan",
  "mukha kang file na corrupted",
  "mukha kang folder na walang laman",
  "mukha kang link na expired",
  "mukha kang notification na walang kwenta",
  "mukha kang message na dinelete bago mabasa",
  "mukha kang seen na walang reply",
  "mukha kang call na binaba agad",
  "mukha kang GC na naka-mute",
  "mukha kang sticker na di bagay sa usapan",
  "mukha kang reaction na maling-mali ang timing",
  "mukha kang joke na pang-2012 pa",
  "mukha kang trend na tapos na kahapon",
  "mukha kang rerun na walang nanonood",
  "mukha kang sequel na walang nag-request",
  "mukha kang trailer na di tinuloy ang movie",
  "mukha kang ending na walang buildup",
  "mukha kang plot twist na nahulaan na",
  "mukha kang villain na di nakakatakot",
  "mukha kang boss fight na tutorial lang",
  "mukha kang side quest na walang reward",
  "mukha kang NPC na paulit-ulit ang linya",
  "mukha kang respawn na bumalik para matalo",
  "mukha kang lag na may sariling lag",
  "mukha kang ping na 999",
  "mukha kang WiFi na isang bar lang",
  "mukha kang data na ubos pero ayaw tumigil",
  "mukha kang charger na kailangan pang dasalan",
  "mukha kang powerbank na walang charge",
  "mukha kang laptop na umiinit sa calculator",
  "mukha kang printer na laging paper jam",
  "mukha kang mouse na ayaw mag-click",
  "mukha kang keyboard na puro maling pindot",
  "mukha kang headset na isang tenga lang",
  "mukha kang mic na puro hangin",
  "mukha kang webcam na takip pa rin",
  "mukha kang camera na laging malabo",
  "mukha kang flash drive na di mabasa",
  "mukha kang update na walang nagbago",
  "mukha kang backup na sira rin",
  "mukha kang settings na walang nag-aayos",
  "mukha kang tutorial na di makasunod",
  "mukha kang FAQ na walang sagot",
  "mukha kang terms and conditions na walang nagbabasa",
  "mukha kang warning na huli nang lumabas"
];

const restoredState = banatStateStore.readSection(STATE_SECTION, {});
const usedByThread = new Map(
  Object.entries(restoredState.usedByThread || {}).map(([key, values]) => [
    key,
    new Set(Array.isArray(values) ? values.filter((value) => typeof value === "string") : []),
  ])
);
const lastByThread = new Map(Object.entries(restoredState.lastByThread || {}));
const HISTORY_LIMIT = 500;

function persistState() {
  banatStateStore.writeSection(STATE_SECTION, {
    usedByThread: Object.fromEntries(
      Array.from(usedByThread.entries(), ([key, values]) => [key, Array.from(values)])
    ),
    lastByThread: Object.fromEntries(lastByThread.entries()),
  });
}

function renderBanatJaidenTemplate(template, targetName) {
  const name = String(targetName || "").trim().slice(0, 80) || "you";
  return renderTargetReply(template, name);
}

function rememberBounded(map, key, value) {
  map.delete(key);
  map.set(key, value);
  while (map.size > HISTORY_LIMIT) map.delete(map.keys().next().value);
}

function pickBanatJaidenReply(threadID, targetName) {
  const thread = String(threadID || "global");
  const used = usedByThread.get(thread) || new Set();
  let candidates = TEMPLATES.filter((line) => !used.has(line));
  if (!candidates.length) {
    used.clear();
    candidates = TEMPLATES.slice();
  }
  const last = lastByThread.get(thread);
  if (candidates.length > 1 && last) {
    const fresh = candidates.filter((line) => line !== last);
    if (fresh.length) candidates = fresh;
  }
  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  used.add(selected);
  rememberBounded(usedByThread, thread, used);
  rememberBounded(lastByThread, thread, selected);
  persistState();
  return renderBanatJaidenTemplate(selected, targetName);
}

function clearBanatJaidenPool(threadID) {
  if (threadID == null) {
    usedByThread.clear();
    lastByThread.clear();
  } else {
    const key = String(threadID || "global");
    usedByThread.delete(key);
    lastByThread.delete(key);
  }
  persistState();
}

module.exports = {
  TEMPLATES,
  renderBanatJaidenTemplate,
  pickBanatJaidenReply,
  clearBanatJaidenPool,
};
