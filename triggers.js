const { generateTriggerReply } = require("./ai/provider");
const { isPrimaryUser } = require("./ai/access");
const { rememberBanatReply, pickBanatReply, isRecent } = require("./banat-memory");
const { pickFromBag, pickTriggerVariant } = require("./banat-randomizer");
const { chooseSocialResponse } = require("./banat-social");
const { isAdmin } = require("./permissions");
const { pickJaidenTargetReply } = require("./jaiden-target-pool");

// ============================================================
// TRIGGERS / BANAT SYSTEM
// ============================================================

const groups = [
  {
    name: "jaiden",
    triggers: ["jaiden"],
    index: 0,
    replies: [
      "jaiden na naman",
      "jaiden, bilang ka nga kung moka ka paa",
      "al-bai-no",
      "nag reklamo yung mukhang kawali, ano jaiden?",
      "bai-gone",
      "bai-tamins",
      "ang taba mo",
      "wagmokodaganansabi",
      "kunware may pake ako",
      "hoy jaiden, moka ka bulldog",
      "one bai one",
      "why u coming at me? i rhyme the best, and you look like a hobo stupid like the rest",
      "man everybody finna wish theyve seen this, yo brain is small as yo dick",
      "ngl, idc since i have a home, n yo big ass booty stays on the street of rome",
      "jaiden, yung mukhang paa ba?",
      "ai nang ai tong utak kulugo na to",
      "mamaya ka na ulit mag kwento, jinajakol ako mama mo",
      "while some people debate na its not a mental health disorder, marami pa rin nag o-opposed sa idea na 'yan but jaiden is a living proof that being gay is a mental illness",
      "yung pinanganak ka, tapos may extra package kasi kamukha mo yung airbender",
      "ano kaya thought process neto at puro bintang sakin?",
      "ate mo kinakain ko puke, nilagyan ko peanut",
      "wrap it up kapatid, mukha kang kalabaw",
      "mama mo may tamod sa labi, galing sakin btw",
      "papa mo nakita ko sa alfamart taga bukas ng pinto",
      "kita ko mama mo nakikipag threesome sa aso",
      "mamaya mag rreport na to",
      "diko sinabi mag dabog ka sa harap ko gago",
      "pakunatan mental heath, tapos ako kinalaban mong pulubi ka",
      "la, jaiden ulit",
      "kinakantot ko ate mo sa backseat",
      "geh geh kwento ka lang habang jinajakol moko",
      "g na g mag talk a lot e wala naman akong pake",
      "tito mong daga mukhang nilaga",
      "ttkels lang kita",
      "si jaiden nasa kmjs, title e batang pinaglihi sa burat",
      "kelan kaya ma-phase out kagaya ni jaiden?",
      "si jaiden nakita ko nakatambay sa grinder e",
      "jaiden and his broke boys era",
      "pag broke jaiden, mamakla ka",
      "jaiden mukhang nahulugan langka e",
      "tangina mo, pake ko sa opinion mo",
      "kelan kaya tatangaling freedom of speech netong gago na to?",
      "onga e, mukha kang kumakain pwet",
      "todo sabat, akala mo naman may arit e anghit dala mo",
      "iyak si gago",
      "pake ko nga?",
      "turo mo sino nag tanong",
      "bilang ka muna",
      "moka ka libro",
      "moka ma fan",
      "moka ka mama mo",
      "moka ka lapis",
      "moka ka ttkels",
      "moka ka tiles",
      "moka ka jaiden, aahhh si jaiden ka nga pala hahahaah malas mo naman",
      "moka ka bahay",
      "moka ka semento",
      "moka ka aspalto",
      "moka ka braided na bulbul",
      "moka ka tanga",
      "moka ka gago",
      "moka ka loonie",
      "moka ka beetle juice",
      "si jaiden spotted namamakla",
      "yung tipong nag work out ka para lumaki katawan, eh kaso naging kamukha mo si jaiden",
      "jaiden pumasok sa usapan, bumaba agad yung quality",
      "jaiden, ikaw ba yung loading screen na hindi matapos-tapos?",
      "moka ka electric fan, puro hangin walang ambag",
      "jaiden spotted, ingay ang ambag pero wala yung point",
      "bro talks like may premium subscription sa kalat",
      "jaiden, pati autocorrect sumusuko na sa argumento mo",
      "may sinabi ka na naman, pwede na ulit mag-mute",
      "jaiden ikaw yung plot twist na sana tinanggal sa script",
      "moka ka sirang alarm, maingay pero walang silbi sa oras",
      "jaiden, ang confidence mo pang finals pero yung sagot pang practice",
      "puro ka side quest, wala ka namang main mission",
      "jaiden nag-loading pa rin yung punchline mo, kanina pa kami naghihintay",
      "moka ka low-battery warning, puro ka paalala walang gawa",
      "may ambag ka ba o nag-check in ka lang sa chat?",
      "jaiden, parang group project ka—present sa pangalan, missing sa gawa",
      "bro entered the chat just to lower the frame rate",
      "moka ka calculator na walang equals button, paikot-ikot lang",
      "jaiden, kahit yung typing indicator mo mas may sense kaysa sa message",
      "ang tapang ng delivery, nasaan yung laman?",
      "moka ka expired voucher, mukhang may value pero wala nang silbi",
      "jaiden, ikaw yung ad na hindi ma-skip sa usapan",
      "pindot ka nang pindot ng send, pero wala pa ring point",
      "moka ka sirang GPS, lakas mag-direksyon pero ligaw naman",
      // Added pool entries: keep these inside the same array so the Jaiden
      // shuffle bag can use every reply once before it refills.
      "jaiden nag-drop ng hot take, kaso malamig pa sa ref",
      "moka ka electric bill, ang taas ng singil wala namang serbisyo",
      "jaiden ikaw yung update na puro bug ang dala",
      "parang printer ka, ang ingay mo pero walang lumalabas na matinong output",
      "jaiden, nag-open ka ng bibig tapos nag-close yung common sense",
      "moka ka loading bar na stuck sa 1 percent",
      "bro nag-type ng paragraph para sabihin na wala siyang point",
      "jaiden, yung argumento mo parang free trial—bitin at walang kwenta",
      "moka ka sirang remote, pindot nang pindot walang nangyayari",
      "jaiden pumasok na naman, nag-timeout yung katahimikan",
      "parang app ka na laging may update pero walang improvement",
      "jaiden, ang dami mong tabs bukas pero wala kang conclusion",
      "moka ka low storage, puro kalat ang laman",
      "bro nagdala ng resibo pero resibo ng sariling kapalpakan",
      "jaiden, yung logic mo nag-commute pero hindi nakarating",
      "moka ka Wi-Fi sa elevator, nawawala pag kailangan",
      "ang lakas ng intro mo, nasaan yung actual content?",
      "jaiden, parang trailer ka lang—maingay pero walang full movie",
      "moka ka keyboard na kulang ang spacebar, dikit-dikit yung nonsense",
      "bro nag-submit ng opinion na walang supporting documents",
      "jaiden, ikaw yung notification na walang importanteng laman",
      "moka ka expired coupon, sayang lang yung pag-click",
      "parang calculator ka na naka-demo mode, limitado ang sagot",
      "jaiden, nag-announce ng comeback pero walang umalis na impressed",
      "moka ka sirang vending machine, pera na nga wala pang product",
      "bro nagdala ng confidence pero naiwan sa bahay yung facts",
      "jaiden, yung point mo nag-apply pero hindi natanggap",
      "moka ka traffic cone, nasa gitna ka lang at sagabal",
      "ang daming sinabi, parang wala namang na-save na progress",
      "jaiden, ikaw yung tutorial na mas nakakalito kaysa sa problema",
      "moka ka alarm clock na walang snooze, nakakainis na nga mali pa oras",
      "bro nag-flex ng IQ tapos nag-error yung calculator",
      "jaiden, parang draft message na dapat hindi na-send",
      "moka ka empty folder, pangalan lang ang laman",
      "yung banat mo parang soft launch, walang follow-through",
      "jaiden, nag-buffer yung utak mo sa pinakamadaling tanong",
      "moka ka broken link, click nang click walang destination",
      "bro nagdala ng plot armor pero side character pa rin",
      "jaiden, ikaw yung meeting na puwedeng email na lang",
      "moka ka paper straw, mabilis mawalan ng silbi",
      "ang point mo parang lost parcel, hindi na mahanap",
      "jaiden, yung punchline mo na-late sa sarili niyang joke",
      "moka ka phone na 2 percent, puro warning walang action",
      "bro nag-open ng debate tapos nagdala lang ng vibes",
      "jaiden, parang menu na puro pictures tapos walang available",
      "moka ka captcha, paulit-ulit ka lang at walang gustong gumawa",
      "yung argumento mo parang screenshot na cropped yung context",
      "jaiden, nag-claim ng victory sa tutorial level",
      "moka ka calendar reminder, lagi kang present sa maling oras",
      "bro nag-type ng trust me imbes na magbigay ng proof",
      "jaiden, ikaw yung loading spinner ng group chat",
      "moka ka elevator music, naririnig ka pero walang nakikinig",
      "yung rebuttal mo parang empty cart, walang laman pag checkout",
      "jaiden, parang beta version na hindi na na-update",
      "moka ka password hint, mas nakakalito ka pa sa password",
      "bro nagdala ng source: trust me bro university",
      "jaiden, yung thought process mo naka-airplane mode",
      "moka ka flashlight na low battery, mahina na nga nangingislap pa",
      "ang haba ng explanation mo para sa isang maling sagot",
      "jaiden, parang pop-up ad na biglang sumingit sa magandang scene",
      "moka ka shopping cart na may isang gulong na baliktad",
      "bro naglabas ng statement na kailangan pa ng fact-check",
      "jaiden, yung comeback mo parang package na walang laman",
      "moka ka keyboard shortcut na walang assigned function",
      "puro ka plot twist, kaso walang plot",
      "jaiden, nag-start ng argument tapos nag-afk sa logic",
      "moka ka sirang mic, volume lang ang contribution",
      "bro nagdala ng evidence pero puro vibes ang attachment",
      "jaiden, ikaw yung loading screen bago pa mag-crash yung app",
      "moka ka unskippable tutorial, alam na namin pero pinipilit mo pa",
      "ang reply mo parang auto-save na hindi talaga nag-save",
      "jaiden, yung confidence mo naka-4K, yung reasoning naka-144p",
      "moka ka map na walang legend, walang nakakaintindi",
      "bro nag-post ng announcement para i-report ang sarili",
      "jaiden, parang group chat poll na walang options",
      "moka ka charger na kailangan i-angle para gumana",
      "yung logic mo nag-404 not found",
      "jaiden, ikaw yung patch notes na walang na-fix",
      "moka ka printer queue, puro pending walang output",
      "bro nagbigay ng final answer na may loading icon pa",
      "jaiden, parang free sample—maingay ang packaging, konti ang laman",
      "moka ka USB na pangatlong baliktad bago pumasok",
      "ang rebuttal mo parang typo na naging buong paragraph",
      "jaiden, yung argumento mo naka-save as draft",
      "moka ka low-res screenshot, malabo na nga kulang pa details",
      "bro nag-open ng thread tapos walang thread na na-connect",
      "jaiden, ikaw yung extra step sa proseso na walang purpose",
      "moka ka broken search bar, tanong ka nang tanong walang result",
      "yung banat mo parang demo account, walang access sa punchline",
      "jaiden, nagdala ng confidence pero walang kasamang manual",
      "moka ka lag spike, saglit ka lang pero sira buong flow",
      "bro nagbigay ng hot take na kailangan pa painitin",
      "jaiden, parang app review na one star pero walang explanation",
      "moka ka sticky note na natanggal bago pa mabasa",
      "ang point mo parang typo sa headline, yun lang ang napansin",
      "jaiden, ikaw yung error message na walang solution",
      "moka ka empty battery icon, warning ka lang buong araw",
      "bro nag-enter ng chat na parang accidental tap",
      "jaiden, yung comeback mo naka-schedule pero hindi dumating",
      "moka ka sirang scanner, kahit malinaw na hindi mabasa",
    ],
  },

  {
    name: "bot",
    triggers: ["bot"],
    index: 0,
    replies: [
      "ikaw bot",
      "mama mo bot",
      "tapos ang laban NAG D.O SI TABA TAPOS PAULIT-ULIT NA LANG SA MGA INSULTO, DI CREATIVE PAG DATING SA TROLLING KAHIT TROLLER. LEHITOMONG BABOY NA SA FARM NA KAMUKHA NI WALLY BAYOLA AAAHA BAWI KA SAKIN DOGS KO, UPUAN MO TTKO BAGO KA ULIT SUMUBOK",
      "asan bot?",
      "hellmerry nga pala, crush moko kaya tingen panty",
      "bago bumoses dapat malaki dede ah",
      "turo mo yung bot gamit mataba mong daliri",
      "bot nang bot, aning ka?",
      "ikaw mukhang bot tanga",
      "wag aning sa ope",
      "onga e, bot lola mong paro paro",
      "bot nganii yung lolo mo",
      "ona bot na",
      "sige, on ko bot ko tapos deep talk kayo",
      "pumapalag ka pala sa bot e",
      "on mo lola mong bot",
      "kuha lang ako plato, tapos kain tayo kasama bot ko",
      "may bot pala?",
      "asan nga yung bot, kulit mo kalbo",
      "mamaya na, kausapin mo bot ko",
      "bilang ako mga 1 to 2 3 5 5 6 7 8 9 10 11 12 tapos mag on ako bot",
      "aaahh moka ka bot nga",
      "tangina, paulit-ulit",
      "paulit-ulit ka ba?",
      "bot ka nang bot, nagiging meme ka na",
      "bobo, wala akong pake sa sinasabi mo",
      "edi bot, kwento mo 'yan",
      "eh walang bawi?",
      "amoy basang aso tong kumag na 'to",
      "puta, baho mo, layo ka nga",
    ],
  },



  // ==========================================================
  // NO ONE-LINERS GROUP
  // k / lol / haha / o ARE INTENTIONALLY NOT TRIGGERS
  // ==========================================================


  {
    name: "vincent",
    triggers: [
      "og vincent",
      "øg vincent",
      "vincent",
    ],
    index: 0,
    replies: [
      "vincent na naman",
      "vincent, tahimik ka muna",
      "ayan na si vincent",
      "'di valid opinion mo lalo't na ai abuser ka",
      "kunware maniniwala ako sa sinabi mo",
      "humulma ng katha under 2 mins hahahah aning moko baboy?",
      "sige, deep talk kami ng ai mo",
      "pake ko nga muna sa opinion mo?",
      "angas, 100 percent chatgpt effort",
      "copy paste mo ulit sa chatgpt",
      "tanggalin ko freedom of speech mo baboy",
      "aaaaaa pikon ka?",
      "talk to dola, gemini, grok, or chatgpt",
      "one bai one debate kayo ni ai mo",
      "pake ko, akala neto may leverage siya eh ai abuser naman",
      "vincent kailangan mo pa ba ng tutorial?",
      "may sinabi ba si vincent?",
    ],
  },

  {
    name: "cleydo",
    triggers: ["cleydo"],
    index: 0,
    replies: [
      "pst, cleydo na naman",
      "ayan na si cleydogs",
      "kalma muna",
      "e.d nga tayo, cleydo",
      "tatagos ka ba sa boss oma mo?",
      "hula mo sino ope sa ruby",
      "aning na sa ope",
      "mukha kang minudo",
      "deduce mo lahat ng available possibilities na autistic na may down syndrome si aselm, pero pag inapply mo yung empirical basis dito wala e, autistic na may down syndrome lalabas",
      "party acc to, wag ka maktol",
      "diko sinabi mag dabog ka",
      "copy paste ko na lang 'to",
      "may sinabi ba si cleydo?",
      "cleydo kailangan mo pa ba ng tutorial?",
      "tahimik ka muna, cleydo",
    ],
  },
];


// ============================================================
// BANAT REPLY DIVERSITY
// ============================================================
// Rap/cypher drops were intentionally removed. Banat now stays in its
// normal conversational voice and focuses on the full one-liner pool.
//
// The natural Banat pool is the single generic source. This keeps
// automatic Banat conversational instead of mixing in legacy one-liner pools.
// ============================================================

const BANAT_RECENT_LIMIT = Math.max(
  20,
  Math.min(60, Number(process.env.ECLIPSE_BANAT_RECENT_LIMIT || 36))
);

// Per-thread diversity memory used by pickDiverseBanatReply. Keep this
// separate from the persistent banat-memory module: it is only a short-lived
// in-process selection cache and is recreated safely on restart.
const banatContextState = new Map();
const BANAT_CONTEXT_LIMIT = Math.max(6, Math.min(20, BANAT_RECENT_LIMIT));

// Short-lived global Banat history used by the trigger/AI diversity guard.
// Keep this bounded; the per-thread Map below remains the primary selector memory.
const recentBanatReplies = [];

// ============================================================
// DIRECTED BANAT TARGET
// ============================================================
// A reply containing only "?" nominates the author of the replied-to
// message as a temporary preferred roast target. It does not force a reply;
// normal Banat context scoring still decides whether to speak.

const BANAT_DIRECTED_TARGET_TTL_MS = Math.max(
  60_000,
  Number(process.env.ECLIPSE_BANAT_TARGET_TTL_MS || 10 * 60 * 1000)
);

function setBanatDirectedTarget(threadId, targetId, setterId, { persistent = false } = {}) {
  const key = String(threadId || "").trim();
  const target = String(targetId || "").trim();
  const setter = String(setterId || "").trim();

  if (!key || !target) return false;

  const state = banatContextState.get(key) || {
    recentMessages: [],
    recentReplies: [],
    recentFamilies: [],
    speakers: [],
    topics: [],
    at: Date.now(),
  };

  state.directedTarget = {
    targetId: target,
    setBy: setter,
    at: Date.now(),
    persistent: Boolean(persistent),
    expiresAt: persistent ? null : Date.now() + BANAT_DIRECTED_TARGET_TTL_MS,
  };

  state.at = Date.now();
  banatContextState.set(key, state);
  return true;
}

function clearBanatDirectedTarget(threadId) {
  const key = String(threadId || "").trim();
  const state = banatContextState.get(key);
  if (!state?.directedTarget) return false;
  delete state.directedTarget;
  state.at = Date.now();
  banatContextState.set(key, state);
  return true;
}

const BANAT_EXCHANGE_TTL_MS = Math.max(
  60_000,
  Number(process.env.ECLIPSE_BANAT_EXCHANGE_TTL_MS || 6 * 60 * 1000)
);

const BANAT_EXCHANGE_MAX_MS = Math.max(
  BANAT_EXCHANGE_TTL_MS,
  Number(process.env.ECLIPSE_BANAT_EXCHANGE_MAX_MS || 12 * 60 * 1000)
);

function updateBanatExchangeState(threadId, {
  attackerId = "",
  targetId = "",
  kind = "conversation",
  confidence = 0,
} = {}) {
  const key = String(threadId || "").trim();
  const attacker = String(attackerId || "").trim();
  const target = String(targetId || "").trim();
  if (!key || !attacker) return null;

  const state = banatContextState.get(key) || {};
  const now = Date.now();
  const current = state.exchange;

  if (
    current &&
    current.attackerId === attacker &&
    current.targetId === target &&
    now < Number(current.maxExpiresAt || 0)
  ) {
    current.turns = Math.min(24, Number(current.turns || 0) + 1);
    current.lastActiveAt = now;
    current.expiresAt = now + BANAT_EXCHANGE_TTL_MS;
    current.confidence = Math.min(
      1,
      Math.max(Number(current.confidence || 0), Number(confidence) || 0)
    );
    current.kind = kind;
  } else {
    state.exchange = {
      attackerId: attacker,
      targetId: target || null,
      kind,
      turns: 1,
      confidence: Math.max(0, Math.min(1, Number(confidence) || 0)),
      startedAt: now,
      lastActiveAt: now,
      expiresAt: now + BANAT_EXCHANGE_TTL_MS,
      maxExpiresAt: now + BANAT_EXCHANGE_MAX_MS,
    };
  }

  state.at = now;
  banatContextState.set(key, state);
  return state.exchange;
}

function getBanatExchangeState(threadId) {
  const key = String(threadId || "").trim();
  const state = banatContextState.get(key);
  const exchange = state?.exchange;
  if (!exchange) return null;

  const now = Date.now();
  const expiresAt = Math.min(
    Number(exchange.expiresAt || 0),
    Number(exchange.maxExpiresAt || 0)
  );

  if (now >= expiresAt) {
    delete state.exchange;
    state.at = now;
    banatContextState.set(key, state);
    return null;
  }

  return {
    ...exchange,
    remainingMs: Math.max(0, expiresAt - now),
  };
}

function getBanatTurnPolicy(threadId, {
  senderId = "",
  botId = "",
  replySenderId = "",
  addressed = false,
  relevant = false,
} = {}) {
  const exchange = getBanatExchangeState(threadId);
  const sender = String(senderId || "").trim();
  const bot = String(botId || "").trim();
  const replyTo = String(replySenderId || "").trim();

  if (bot && replyTo === bot) {
    return { allow: true, reason: "reply-to-bot", exchange };
  }

  if (addressed) {
    return { allow: true, reason: "explicitly-addressed", exchange };
  }

  if (
    exchange &&
    sender === String(exchange.attackerId || "").trim() &&
    relevant
  ) {
    return { allow: true, reason: "active-exchange-turn", exchange };
  }

  // Avoid repeatedly inserting ECLIPSE into an unrelated multi-person burst.
  if (!relevant && !exchange) {
    return { allow: false, reason: "no-opening", exchange: null };
  }

  return {
    allow: Boolean(relevant),
    reason: relevant ? "context-opening" : "wait",
    exchange,
  };
}

const BANAT_CONVERSATION_TARGET_TTL_MS = Math.max(
  60_000,
  Number(process.env.ECLIPSE_BANAT_CONVERSATION_TARGET_TTL_MS || 2 * 60 * 1000)
);

function getBanatConversationTarget(threadId) {
  const key = String(threadId || "").trim();
  const state = banatContextState.get(key);
  const target = state?.conversationTarget;

  if (!target) return null;

  const now = Date.now();
  if (now >= Number(target.expiresAt || 0)) {
    delete state.conversationTarget;
    state.at = now;
    banatContextState.set(key, state);
    return null;
  }

  return {
    ...target,
    remainingMs: Math.max(0, Number(target.expiresAt || 0) - now),
  };
}

function setBanatConversationTarget(threadId, senderId, {
  reason = "conversation",
  confidence = 0,
  text = "",
} = {}) {
  const key = String(threadId || "").trim();
  const sender = String(senderId || "").trim();
  if (!key || !sender) return null;

  const state = banatContextState.get(key) || {};
  const now = Date.now();
  const current = state.conversationTarget;

  const history = current && current.senderId === sender
    ? [...(current.texts || []), String(text || "").trim()].filter(Boolean).slice(-6)
    : [String(text || "").trim()].filter(Boolean);

  state.conversationTarget = {
    senderId: sender,
    reason,
    confidence: Math.max(0, Math.min(1, Number(confidence) || 0)),
    texts: history,
    startedAt:
      current && current.senderId === sender
        ? Number(current.startedAt || now)
        : now,
    lastActiveAt: now,
    expiresAt: now + BANAT_CONVERSATION_TARGET_TTL_MS,
  };

  state.at = now;
  banatContextState.set(key, state);
  return state.conversationTarget;
}

function clearBanatConversationTarget(threadId, senderId = "") {
  const key = String(threadId || "").trim();
  const state = banatContextState.get(key);
  if (!state?.conversationTarget) return false;

  if (
    senderId &&
    String(state.conversationTarget.senderId || "").trim() !==
      String(senderId || "").trim()
  ) {
    return false;
  }

  delete state.conversationTarget;
  state.at = Date.now();
  banatContextState.set(key, state);
  return true;
}

function getBanatTopicOverlap(threadId, text) {
  const target = getBanatConversationTarget(threadId);
  if (!target) return 0;

  const tokenize = (value) =>
    new Set(
      String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length >= 4)
    );

  const incoming = tokenize(text);
  if (!incoming.size) return 0;

  const targetText = [
    ...(target.texts || []),
    ...((banatContextState.get(String(threadId || "").trim())?.topics || []).slice(-8)),
  ].join(" ");

  const targetWords = tokenize(targetText);
  if (!targetWords.size) return 0;

  let overlap = 0;
  for (const word of incoming) {
    if (targetWords.has(word)) overlap += 1;
  }

  return Math.min(1, overlap / Math.max(3, Math.min(8, incoming.size)));
}

const BANAT_INTERACTION_TTL_MS = Math.max(
  60_000,
  Number(process.env.ECLIPSE_BANAT_INTERACTION_TTL_MS || 12 * 60 * 1000)
);

function recordBanatInteraction(threadId, {
  senderId,
  addresseeId = null,
  relation = "conversation",
  confidence = 0,
} = {}) {
  const key = String(threadId || "").trim();
  const sender = String(senderId || "").trim();
  const addressee = String(addresseeId || "").trim();
  if (!key || !sender) return null;

  const state = banatContextState.get(key) || {
    recentMessages: [],
    recentReplies: [],
    recentFamilies: [],
    speakers: [],
    topics: [],
    at: Date.now(),
  };

  const now = Date.now();
  const graph = Array.isArray(state.interactions)
    ? state.interactions
    : [];

  graph.push({
    senderId: sender,
    addresseeId: addressee || null,
    relation,
    confidence: Math.max(0, Math.min(1, Number(confidence) || 0)),
    at: now,
  });

  state.interactions = graph
    .filter((edge) => now - Number(edge.at || 0) < BANAT_INTERACTION_TTL_MS)
    .slice(-40);

  state.at = now;
  banatContextState.set(key, state);

  return state.interactions[state.interactions.length - 1];
}

function getRecentBanatInteraction(threadId, senderId, addresseeId = null) {
  const key = String(threadId || "").trim();
  const sender = String(senderId || "").trim();
  const addressee = String(addresseeId || "").trim();
  const state = banatContextState.get(key);
  if (!state || !Array.isArray(state.interactions)) return null;

  const now = Date.now();
  return (
    state.interactions
      .filter((edge) =>
        now - Number(edge.at || 0) < BANAT_INTERACTION_TTL_MS &&
        String(edge.senderId || "") === sender &&
        (!addressee || String(edge.addresseeId || "") === addressee)
      )
      .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))[0] ||
    null
  );
}

const BANAT_DEFENSE_TTL_MS = Math.max(
  60_000,
  Number(process.env.ECLIPSE_BANAT_DEFENSE_TTL_MS || 8 * 60 * 1000)
);

const BANAT_DEFENSE_MAX_ENGAGEMENT_MS = Math.max(
  BANAT_DEFENSE_TTL_MS,
  Number(process.env.ECLIPSE_BANAT_DEFENSE_MAX_ENGAGEMENT_MS || 12 * 60 * 1000)
);

function updateJammyDefenseEngagement(threadId, attackerId, mode = "active") {
  const key = String(threadId || "").trim();
  const attacker = String(attackerId || "").trim();
  if (!key || !attacker) return false;

  const state = banatContextState.get(key) || {
    recentMessages: [],
    recentReplies: [],
    recentFamilies: [],
    speakers: [],
    topics: [],
    at: Date.now(),
  };

  const now = Date.now();
  const current = state.jammyDefense;

  if (
    current &&
    current.attackerId === attacker &&
    now < Number(current.maxExpiresAt || 0)
  ) {
    current.lastActiveAt = now;
    current.expiresAt = now + BANAT_DEFENSE_TTL_MS;
    current.mode = mode;
    current.turns = Math.min(
      20,
      Number(current.turns || 0) + 1
    );
    current.intensity = Math.min(
      1,
      Number(current.intensity || 0) + 0.08
    );
  } else {
    state.jammyDefense = {
      targetId: String(
        process.env.ECLIPSE_PRIMARY_USER_ID ||
          process.env.ECLIPSE_ADMIN_ID ||
          ""
      ).trim(),
      attackerId: attacker,
      startedAt: now,
      lastActiveAt: now,
      expiresAt: now + BANAT_DEFENSE_TTL_MS,
      maxExpiresAt: now + BANAT_DEFENSE_MAX_ENGAGEMENT_MS,
      mode,
      turns: 1,
      intensity: 0.35,
    };
  }

  state.at = now;
  banatContextState.set(key, state);
  return true;
}

function getJammyDefenseEngagement(threadId) {
  const key = String(threadId || "").trim();
  const state = banatContextState.get(key);
  const engagement = state?.jammyDefense;
  if (!engagement) return null;

  const now = Date.now();
  const expiresAt = Math.min(
    Number(engagement.expiresAt || 0),
    Number(engagement.maxExpiresAt || 0)
  );

  if (now >= expiresAt) {
    delete state.jammyDefense;
    state.at = now;
    banatContextState.set(key, state);
    return null;
  }

  return {
    ...engagement,
    remainingMs: Math.max(0, expiresAt - now),
  };
}

function getBanatDirectedTarget(threadId) {
  const key = String(threadId || "").trim();
  const state = banatContextState.get(key);

  if (!state?.directedTarget) return null;

  if (
    !state.directedTarget.persistent &&
    Date.now() >= Number(state.directedTarget.expiresAt || 0)
  ) {
    delete state.directedTarget;
    state.at = Date.now();
    banatContextState.set(key, state);
    return null;
  }

  return {
    ...state.directedTarget,
    remainingMs: Math.max(
      0,
      Number(state.directedTarget.expiresAt || 0) - Date.now()
    ),
  };
}

// ------------------------------------------------------------
// CONTEXT MEMORY
// ------------------------------------------------------------
// Keep the existing Banat selection state as the single in-memory context
// store. Do not create a second conversation-memory module.
//
// recentMessages = verbatim short-term turns
// speakers       = who has been participating
// topics         = repeated meaningful terms from the current burst
// This is deliberately bounded and expires with the existing thread state.

const BANAT_INCOMING_CONTEXT_LIMIT = Math.max(
  8,
  Math.min(24, Number(process.env.ECLIPSE_BANAT_INCOMING_CONTEXT_LIMIT || 14))
);

const BANAT_CONTEXT_TTL_MS = Math.max(
  60_000,
  Number(process.env.ECLIPSE_BANAT_CONTEXT_TTL_MS || 20 * 60 * 1000)
);

// Structured context stays inside the existing Banat state. This avoids
// creating a second memory module while giving the response engine speaker,
// intent, entity, callback and confidence signals.
const BANAT_CONTEXT_MAX_SPEAKERS = 12;
const BANAT_CONTEXT_MAX_CALLBACKS = 8;

const JAMMY_ATTACK_PATTERNS = Object.freeze([
  /\b(?:stupid|idiot|dumb|moron|loser|ugly|useless|trash|clown|pathetic|annoying|bobo|tanga|gago|gaga|tarantado|ulol|siraulo|engot|inutil|bwisit|leche|putangina|pakyu|fuck you|shut up|suck|hate you)\b/i,
  /\b(?:pangit|walang kwenta|walang silbi|mukhang|amoy|mamatay|kill yourself|kys)\b/i,
  /\b(?:ka|mo|iyo|sayo|you|ur|your)\b.{0,36}\b(?:tanga|bobo|gago|idiot|stupid|ugly|loser|trash|useless|pangit)\b/i,
]);

function classifyJammyAttack({
  text,
  senderId,
  replySenderId,
  jammyId,
  recentMessages = [],
}) {
  const value = String(text || "").trim();
  const sender = String(senderId || "").trim();
  const jammy = String(jammyId || "").trim();

  if (!value || !jammy || !sender || sender === jammy) {
    return {
      targeted: false,
      confidence: 0,
      reason: "not-applicable",
    };
  }

  const repliedToJammy =
    String(replySenderId || "").trim() === jammy;

  const namedJammy = /\bjammy\b/i.test(value);
  const lexicalAttack = JAMMY_ATTACK_PATTERNS.some((pattern) =>
    pattern.test(value)
  );

  const lastSpeakerWasJammy =
    Array.isArray(recentMessages) &&
    recentMessages.length > 0 &&
    String(
      recentMessages[recentMessages.length - 1]?.senderId || ""
    ).trim() === jammy;

  let confidence = 0;

  if (repliedToJammy) confidence += 0.48;
  if (namedJammy) confidence += 0.30;
  if (lexicalAttack) confidence += 0.28;
  if (lastSpeakerWasJammy) confidence += 0.16;

  // An attack without a clear Jammy addressee is deliberately kept below
  // the defense threshold unless reply context or the name makes the target
  // explicit. This avoids treating every generic insult in the GC as an
  // attack on Jammy.
  const targeted =
    confidence >= 0.50 &&
    (repliedToJammy || namedJammy || lastSpeakerWasJammy);

  return {
    targeted,
    confidence: Math.min(1, Number(confidence.toFixed(3))),
    reason: targeted
      ? repliedToJammy
        ? "reply-to-jammy"
        : namedJammy
          ? "named-jammy"
          : "jammy-recent-turn"
      : "ambiguous",
  };
}

function classifyBanatIntent(text) {
  const value = String(text || "").trim().toLowerCase();
  if (!value) return "unknown";
  if (/^(?:hi|hey|hello|yo|sup|good morning|good night)\b/.test(value)) return "greeting";
  if (/\\?$/.test(value) || /^(?:who|what|when|where|why|how|can|could|would|should|is|are|do|does|did|will|may)\b/.test(value)) return "question";
  if (/\b(?:i will|i'll|im gonna|i'm gonna|gonna|later|tomorrow|next week|soon)\b/.test(value)) return "plan";
  if (/\b(?:remember|earlier|before|yesterday|last time|again|na naman)\b/.test(value)) return "callback";
  if (/\b(?:haha+|lmao|lmfao|lol|😭|💀|🤣|😂)\b/u.test(value)) return "reaction";
  if (/\b(?:please|pls|help|can you|could you|send|give me|show me|tell me)\b/.test(value)) return "request";
  if (/\b(?:no|nah|wrong|cap|false|not true|disagree)\b/.test(value)) return "disagreement";
  if (/\b(?:yes|yeah|yep|true|real|valid|exactly|agree)\b/.test(value)) return "agreement";
  if (/\b(?:stupid|idiot|gago|tanga|bobo|cooked|clown)\b/.test(value)) return "roast";
  return "statement";
}

function extractBanatEntities(text, topics = []) {
  const value = String(text || "");
  const mentions = [...value.matchAll(/@([\p{L}\p{N}_.-]{2,32})/gu)]
    .map((match) => match[1])
    .slice(0, 4);

  const quoted = [...value.matchAll(/[“"]([^“”"\n]{2,80})[”"]/gu)]
    .map((match) => match[1].trim())
    .slice(0, 3);

  const entities = [];
  for (const item of [...mentions, ...quoted, ...(topics || []).slice(-4)]) {
    const normalized = String(item || "").trim();
    if (normalized && !entities.some((x) => x.toLowerCase() === normalized.toLowerCase())) {
      entities.push(normalized);
    }
  }

  return entities.slice(0, 8);
}

function extractBanatCallback(text, topics = []) {
  const value = String(text || "").trim();
  if (!value) return null;

  const planMatch = value.match(
    /\b(?:i(?:'m| am)?\s+)?(?:gonna|going to|will|need to|have to|plan to)\s+(.{3,100})$/i
  );

  const futureMatch = value.match(
    /\b(?:later|tomorrow|next week|soon)\b(?:.*)?/i
  );

  if (!planMatch && !futureMatch) return null;

  return {
    text: value.slice(0, 180),
    topics: [...new Set((topics || []).slice(-5))],
    at: Date.now(),
    confidence: planMatch ? 0.78 : 0.55,
  };
}

function updateBanatSpeakerProfile(state, senderId, text) {
  const id = String(senderId || "").trim();
  if (!id) return;

  if (!state.speakerProfiles || typeof state.speakerProfiles !== "object") {
    state.speakerProfiles = {};
  }

  const existing = state.speakerProfiles[id] || {
    messages: 0,
    totalChars: 0,
    totalWords: 0,
    emojiMessages: 0,
    capsMessages: 0,
    questionMessages: 0,
    intentCounts: {},
    topics: [],
    lastAt: 0,
  };

  const value = String(text || "").trim();
  const words = value ? value.split(/\s+/).filter(Boolean) : [];

  existing.messages += 1;
  existing.totalChars += value.length;
  existing.totalWords += words.length;
  if (/[\p{Extended_Pictographic}]/u.test(value)) existing.emojiMessages += 1;
  if (value === value.toUpperCase() && /[A-Z]/.test(value)) existing.capsMessages += 1;
  if (/\\?$/.test(value)) existing.questionMessages += 1;

  const intent = classifyBanatIntent(value);
  existing.intentCounts[intent] = (existing.intentCounts[intent] || 0) + 1;
  existing.topics = [
    ...(existing.topics || []),
    ...extractBanatTopics(value),
  ]
    .filter((topic, index, list) => list.indexOf(topic) === index)
    .slice(-8);

  existing.lastAt = Date.now();
  state.speakerProfiles[id] = existing;

  const ids = Object.keys(state.speakerProfiles);
  if (ids.length > BANAT_CONTEXT_MAX_SPEAKERS) {
    ids
      .sort((a, b) =>
        Number(state.speakerProfiles[a]?.lastAt || 0) -
        Number(state.speakerProfiles[b]?.lastAt || 0)
      )
      .slice(0, ids.length - BANAT_CONTEXT_MAX_SPEAKERS)
      .forEach((oldId) => delete state.speakerProfiles[oldId]);
  }
}

function calculateBanatContextConfidence(state, incomingText) {
  if (!state) return 0;

  const messages = Array.isArray(state.recentMessages) ? state.recentMessages : [];
  const topics = Array.isArray(state.topics) ? state.topics : [];
  const speakers = Array.isArray(state.speakers) ? state.speakers : [];
  const incomingTopics = extractBanatTopics(incomingText);

  const topicOverlap = incomingTopics.filter((topic) => topics.includes(topic)).length;
  const recentAge = messages.length
    ? Date.now() - Number(messages[messages.length - 1]?.at || Date.now())
    : Infinity;

  let score = 0.25;
  score += Math.min(0.25, messages.length * 0.035);
  score += Math.min(0.20, topicOverlap * 0.08);
  score += Math.min(0.15, speakers.length * 0.025);
  if (recentAge < 30_000) score += 0.15;
  else if (recentAge < 120_000) score += 0.08;

  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

const BANAT_CONTEXT_STOPWORDS = new Set([
  "the","and","that","this","with","from","your","you","are","was","were",
  "have","has","had","for","but","not","just","what","when","where","who",
  "why","how","can","could","would","should","about","then","than","they",
  "them","their","there","here","into","like","really","very","yeah","yes",
  "no","bro","pre","tol","naman","kasi","lang","yung","ng","na","pa","ako",
  "ikaw","mo","ko","si","sa","ang","at","of","to","in","on","is","it","im",
  "i","a","an","we","our","us","me","my"
]);

function extractBanatTopics(text) {
  const raw = String(text || "")
    .normalize("NFKC")
    .replace(/https?:\/\/\S+/g, " ");

  const tokens = raw
    .split(/[^\p{L}\p{N}'-]+/u)
    .map((token) => token.replace(/^['-]+|['-]+$/g, "").toLowerCase())
    .filter((token) =>
      token.length >= 4 &&
      token.length <= 32 &&
      !BANAT_CONTEXT_STOPWORDS.has(token) &&
      !/^\d+$/.test(token)
    );

  const counts = new Map();

  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([token]) => token);
}

function extractBanatEmotion(text) {
  const value = String(text || "").toLowerCase();
  if (/[😭😔😩]/u.test(value) || /\b(?:sad|tired|failed|fail|stress|stressed|pain|hurt|awful)\b/i.test(value)) {
    return "down";
  }
  if (/[😂🤣💀]/u.test(value) || /\b(?:haha+|lmao|funny|dead)\b/i.test(value)) {
    return "laughing";
  }
  if (/[😡🤬]/u.test(value) || /\b(?:angry|pissed|mad|fuck this|wtf)\b/i.test(value)) {
    return "heated";
  }
  if (/[😍🥹❤️❤]/u.test(value) || /\b(?:love|cute|miss|pretty|handsome)\b/i.test(value)) {
    return "warm";
  }
  if (/[!?]{2,}/.test(value) || /\b(?:what|why|how|wait|huh)\b/i.test(value)) {
    return "surprised";
  }
  return "neutral";
}

function rememberBanatIncoming(
  threadId,
  senderId,
  text,
  eventKey = "",
  replyTargetIdInput = ""
) {
  const key = String(threadId || "unknown");
  const value = String(text || "").trim();
  if (!value) return;

  const now = Date.now();
  const current = banatContextState.get(key) || {
    recentReplies: [],
    recentFamilies: [],
    recentMessages: [],
    speakers: [],
    topics: [],
    emotion: "neutral",
    intent: "unknown",
    entities: [],
    callbacks: [],
    speakerProfiles: {},
    contextConfidence: 0,
    updatedAt: now,
    recentEventKeys: [],
  };

  if (
    eventKey &&
    current.recentEventKeys?.includes(String(eventKey))
  ) {
    return;
  }

  if (!Array.isArray(current.recentEventKeys)) current.recentEventKeys = [];
  if (eventKey) {
    current.recentEventKeys.push(String(eventKey));
    current.recentEventKeys = current.recentEventKeys.slice(-32);
  }

  const resolvedReplyTargetId = String(replyTargetIdInput || "").trim();
  current.lastReplyTargetId = resolvedReplyTargetId;

  current.recentMessages = [
    ...(current.recentMessages || []),
    {
      senderId: String(senderId || "").trim(),
      text: value.slice(0, 500),
      at: now,
    },
  ].slice(-BANAT_INCOMING_CONTEXT_LIMIT);

  const speaker = String(senderId || "").trim();
  if (speaker) {
    current.speakers = [
      ...(current.speakers || []).filter((id) => id !== speaker),
      speaker,
    ].slice(-8);
  }

  const incomingTopics = extractBanatTopics(value);
  current.topics = [
    ...(current.topics || []),
    ...incomingTopics,
  ]
    .filter((topic, index, list) => list.indexOf(topic) === index)
    .slice(-16);

  current.emotion = extractBanatEmotion(value);
  current.intent = classifyBanatIntent(value);
  current.entities = extractBanatEntities(value, current.topics);

  // Keep an exchange state in the same context store. Reply metadata is the
  // strongest signal; explicit Jammy targeting is handled by the defense layer.
  if (
    resolvedReplyTargetId &&
    speaker &&
    resolvedReplyTargetId !== speaker
  ) {
    updateBanatExchangeState(key, {
      attackerId: speaker,
      targetId: resolvedReplyTargetId,
      kind: current.intent,
      confidence: 0.78,
    });
  }
  const callback = extractBanatCallback(value, current.topics);
  if (callback) {
    current.callbacks = [
      ...(current.callbacks || []),
      callback,
    ].slice(-BANAT_CONTEXT_MAX_CALLBACKS);
  }
  updateBanatSpeakerProfile(current, senderId, value);
  current.contextConfidence = calculateBanatContextConfidence(current, value);
  current.updatedAt = now;
  banatContextState.set(key, current);
}

function getBanatConversationContext(threadId) {
  const key = String(threadId || "unknown");
  const state = banatContextState.get(key);

  if (!state) return null;

  if (Date.now() - Number(state.updatedAt || 0) > BANAT_CONTEXT_TTL_MS) {
    banatContextState.delete(key);
    return null;
  }

  return state;
}

function rememberRecent(list, value, limit = BANAT_RECENT_LIMIT) {
  if (!Array.isArray(list)) return;
  const text = String(value || "").trim();
  if (!text) return;
  const index = list.indexOf(text);
  if (index !== -1) list.splice(index, 1);
  list.push(text);
  if (list.length > Math.max(1, Number(limit) || BANAT_RECENT_LIMIT)) {
    list.splice(0, list.length - Math.max(1, Number(limit) || BANAT_RECENT_LIMIT));
  }
}

function banatReplyFamily(reply) {
  const text = String(reply || "").toLowerCase().trim();
  if (!text) return "empty";
  if (text.includes("haha") || text.includes("😭") || text.includes("lol")) return "laugh";
  if (text.includes("?")) return "question";
  if (text.split(/\s+/).length <= 4) return "short";
  if (text.includes("bro") || text.includes("beh") || text.includes("pre") || text.includes("tol")) return "casual";
  return "general";
}

function banatContextPrompt(threadId) {
  const state = getBanatConversationContext(threadId);
  if (!state) return "";

  const lines = [];
  const recentMessages = Array.isArray(state.recentMessages)
    ? state.recentMessages.slice(-8)
    : [];

  if (recentMessages.length) {
    lines.push("RECENT GROUP CONVERSATION:");
    for (const item of recentMessages) {
      const speaker = item.senderId
        ? `speaker:${item.senderId}`
        : "speaker:unknown";
      lines.push(`- ${speaker}: ${String(item.text || "").slice(0, 300)}`);
    }
  }

  if (state.intent) lines.push("CURRENT MESSAGE INTENT: " + state.intent);
  if (state.emotion && state.emotion !== "neutral") {
    lines.push("CURRENT ENERGY: " + state.emotion);
  }
  if (Array.isArray(state.entities) && state.entities.length) {
    lines.push("ACTIVE ENTITIES / REFERENCES: " + state.entities.join(", "));
  }
  if (Array.isArray(state.topics) && state.topics.length) {
    lines.push("ACTIVE TOPICS: " + state.topics.slice(-10).join(", "));
  }

  const exchange = getBanatExchangeState(threadId);
  if (exchange) {
    lines.push(
      "ACTIVE EXCHANGE:",
      `- attacker: ${exchange.attackerId || "unknown"}`,
      `- target: ${exchange.targetId || "group"}`,
      `- phase: ${exchange.turns >= 5 ? "heated" : exchange.turns >= 2 ? "active" : "starting"}`,
      `- turns: ${exchange.turns}`,
      "Treat this as one continuing exchange when relevant; do not restart the conversation from zero."
    );
  }

  if (Array.isArray(state.callbacks) && state.callbacks.length) {
    const callbacks = state.callbacks.slice(-3);
    lines.push(
      "POSSIBLE CALLBACKS (only use if clearly relevant):",
      ...callbacks.map((item) => `- ${String(item.text || "").slice(0, 180)}`)
    );
  }

  const profiles = state.speakerProfiles || {};
  const profileLines = Object.entries(profiles)
    .sort((a, b) => Number(b[1]?.lastAt || 0) - Number(a[1]?.lastAt || 0))
    .slice(0, 4)
    .map(([id, profile]) => {
      const dominantIntent = Object.entries(profile.intentCounts || {})
        .sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown";
      const avgWords = profile.messages
        ? Math.round(profile.totalWords / profile.messages)
        : 0;
      return `- speaker:${id} | avgWords:${avgWords} | dominantIntent:${dominantIntent} | topics:${(profile.topics || []).slice(-4).join(", ")}`;
    });

  if (profileLines.length) {
    lines.push("SPEAKER PROFILES:", ...profileLines);
  }

  lines.push(
    "CONTEXT CONFIDENCE: " +
      Number(state.contextConfidence || 0).toFixed(2)
  );

  const threadRecent = state.recentReplies || [];
  const recentReplies = [...threadRecent, ...recentBanatReplies]
    .filter(Boolean)
    .slice(-6);

  if (recentReplies.length) {
    lines.push(
      "RECENT BOT REPLIES (avoid copying their wording):",
      ...recentReplies.map((reply, index) => `- ${index + 1}. ${reply}`)
    );
  }

  return lines.join("\n").slice(0, 6500);
}

function banatContextualPick(replies, threadId, incomingText) {
  return pickDiverseBanatReply(replies, threadId, incomingText);
}

function banatContextWeight(reply, incomingText, recentFamilies = []) {
  const text = String(reply || "").trim();
  if (!text) return 0.01;

  const decision = chooseSocialResponse(incomingText, text, {
    momentum: Math.max(1, Number(recentFamilies.length || 0) + 1),
    recentMessages: recentFamilies.length,
  });

  let weight = 1;
  const lower = text.toLowerCase();
  const family = banatReplyFamily(text);

  switch (decision.type) {
    case "reaction":
      if (family === "laugh" || family === "short") weight += 3.5;
      break;
    case "answer":
      if (/[?]/.test(text) || /\\b(?:because|kasi|actually|fair|real|yes|no)\\b/i.test(text)) weight += 2.2;
      break;
    case "agree":
      if (/\\b(?:real|valid|fair|same|exactly|agree|true|point|gets|tama)\\b/i.test(lower)) weight += 3;
      break;
    case "deflect":
      if (/\\b(?:anyway|moving on|next topic|idk|wala|never mind|nvm|okay so)\\b/i.test(lower)) weight += 2.8;
      break;
    case "callback":
      if (/\\b(?:again|na naman|here we go|consistent|remember|earlier|you)\\b/i.test(lower)) weight += 2.2;
      break;
    case "short":
      if (family === "short" || text.split(/\\s+/).length <= 7) weight += 2.5;
      break;
    case "react":
      if (family === "laugh" || /[!?😭💀🤣😂]/u.test(text)) weight += 2.5;
      break;
    default:
      break;
  }

  // Avoid repeating the same behavioral family back-to-back even when the
  // exact text is different. This is one of the main cues that makes a pool
  // feel less like a script and more like a conversation.
  if (recentFamilies.length && recentFamilies[recentFamilies.length - 1] === family) {
    weight *= 0.35;
  }

  return Math.max(0.05, weight);
}

function dedupeBanatReplies(replies) {
  const seen = new Set();
  const output = [];

  for (const reply of Array.isArray(replies) ? replies : []) {
    const text = String(reply || "").trim();
    const key = text
      .toLowerCase()
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim();

    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(text);
  }

  return output;
}

function pickDiverseBanatReply(replies, threadId, incomingText) {
  const pool = dedupeBanatReplies(replies);
  if (!pool.length) return null;

  const key = String(threadId || "unknown");
  const state = banatContextState.get(key) || {
    recentReplies: [],
    recentFamilies: [],
    updatedAt: Date.now(),
  };
  const recent = state.recentReplies || [];
  const recentFamilies = state.recentFamilies || [];

  // The shared shuffle bag owns exact reply rotation. Do not rebuild the
  // candidate pool from recent history: doing so would reset the bag and
  // allow the same replies to reappear before the full pool is consumed.
  const selected = pickFromBag(
    key,
    "banat-natural",
    pool,
    {
      avoidValues: recent.slice(-BANAT_CONTEXT_LIMIT),
      weight: (reply) => banatContextWeight(reply, incomingText, recentFamilies),
    }
  );

  if (!selected) return null;

  const nextState = banatContextState.get(key) || {
    recentReplies: [],
    recentFamilies: [],
  };
  nextState.recentReplies = [
    ...state.recentReplies.filter((reply) => reply !== selected),
    selected,
  ].slice(-BANAT_CONTEXT_LIMIT);
  nextState.recentFamilies = [
    ...(nextState.recentFamilies || []).filter((family) => family !== banatReplyFamily(selected)),
    banatReplyFamily(selected),
  ].slice(-6);
  nextState.updatedAt = Date.now();
  banatContextState.set(key, nextState);

  if (banatContextState.size > 1000) {
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [threadKey, threadState] of banatContextState) {
      if ((threadState.updatedAt || 0) < cutoff) {
        banatContextState.delete(threadKey);
      }
    }
  }

  return selected;
}

// ============================================================
// PUBLIC ROAST
// ============================================================




// ============================================================
// JAIDEN CLONES
// ============================================================

const jaidenGroupForClones = groups.find(
  (group) => group.name === "jaiden"
);

if (jaidenGroupForClones) {
  const clones = [
    ["jeo", ["jeø", "jeo"], "Jeø"],
    ["aeix", ["aeix"], "Aeix"],
    ["kikay", ["kikay"], "Kikay"],
    ["sylora", ["sylora"], "Sylora"],
    ["rishan", ["rishan"], "Rishan"],
    ["marcellus", ["marcellus"], "Marcellus"],
    ["theone", ["theone"], "Theone"],
  ];

  for (const [name, triggers, replacement] of clones) {
    groups.push({
      name,
      triggers,
      index: 0,
      replies: jaidenGroupForClones.replies.map((reply) =>
        String(reply).replace(
          /\bjaiden\b/gi,
          replacement
        )
      ),
    });
  }
}


// ============================================================
// SANTA BISAYA
// ============================================================

const santaBisayaGroup = {
  name: "santa-bisaya",

  triggers: [
    "santa bisaya",
    "santa-bisaya",
  ],

  index: 0,

  replies: groups
    .flatMap((group) =>
      Array.isArray(group.replies)
        ? group.replies
        : []
    )
    .map((reply) =>
      String(reply).replace(
        /\bjaiden\b/gi,
        "Santa Bisaya"
      )
    ),
};

groups.push(santaBisayaGroup);


// ============================================================
// NATURAL BANAT — HUMAN / TAGALOG / TAGLISH / CONYO
// ============================================================
// Context-flexible lines: they don't need a perfect keyword match.
// They are intentionally conversational, slightly messy, and varied
// so Banat sounds like somebody actually chatting rather than reading
// a catalogue of punchlines.
// ============================================================

const naturalBanatGroup = {
  name: "banat-natural",
  triggers: [],
  index: 0,
  replies: [
    "nah you’re actually insane",
    "grabe ka naman",
    "hindi ko alam sayo",
    "wala ka talagang preno no",
    "bakit ganyan ka",
    "ano bang trip mo today",
    "beh please 😭",
    "bro be serious",
    "hoy HAHAHAHA",
    "tama na please",
    "ikaw talaga",
    "ang lala mo",
    "wala na, ikaw na",
    "sige ikaw na tama",
    "gets ko naman pero 😭",
    "wait kasi may point ka",
    "hindi ko na ipagtatanggol yan",
    "sorry pero ang funny mo",
    "i'm crying 😭",
    "im actually dead",
    "nah i can't with you",
    "you’re so unserious",
    "why are you like this",
    "why would you even say that 😭",
    "bro just move on",
    "please be normal for five minutes",
    "okay calm down ka muna",
    "hinga muna tayo",
    "take it easy naman",
    "grabe yung confidence",
    "ang tapang mo naman",
    "saan galing yang confidence mo",
    "may resibo ka ba diyan",
    "source: trust me bro?",
    "vibes lang ba to",
    "feeling ko gawa-gawa mo yan",
    "parang hindi convincing mhie",
    "hindi ako sold sorry",
    "hmmmmm questionable",
    "medyo sus ah",
    "i'll let you have that",
    "sige pagbigyan kita",
    "okay fine 😭",
    "close enough",
    "gets, gets",
    "never mind HAHAHA",
    "di ko na alam sasabihin ko",
    "speechless ako sayo",
    "you know what, never mind",
    "i'm not even gonna argue",
    "ayoko na makipagtalo 😭",
    "pagod na ko sayo",
    "nakakapagod ka kausap minsan",
    "ang hirap mong seryosohin",
    "paano ba kita sasagutin",
    "what am i supposed to do with that",
    "anong gusto mong sabihin ko diyan",
    "can we not 😭",
    "please lang",
    "beh naman",
    "ate naman",
    "kuya naman",
    "girl be serious",
    "bai ano ba",
    "pre relax",
    "tol ano yan",
    "bro naman oh",
    "uy grabe",
    "hala ka",
    "no because what is this",
    "not you saying that",
    "you really said that with confidence huh",
    "ang lakas ng loob mo sabihin yan",
    "pero sige, go off",
    "go off i guess 😭",
    "okay pop off",
    "do your thing ig",
    "i'll pretend i didn't see that",
    "kunwari hindi ko nabasa",
    "babalewalain ko na lang yan",
    "sige di ko na papansinin",
    "wala akong energy today",
    "di ko na kaya HAHAHA",
    "i cannot deal with this rn",
    "not today please",
    "maybe tomorrow na lang",
    "mamaya na natin pag-usapan yan",
    "bukas na yang problema mo",
    "good luck na lang sayo",
    "praying for you honestly",
    "sending thoughts and prayers 😭",
    "godspeed bro",
    "kaya mo yan siguro",
    "i believe in you, unfortunately",
    "support kita from a safe distance",
    "nandito lang ako, unfortunately",
    "andito na naman tayo",
    "here we go again",
    "again?? 😭",
    "not this again",
    "ikaw na naman",
    "ayan na naman tayo",
    "same energy as always",
    "consistent ka talaga",
    "at least consistent",
    "never change bro",
    "please change bro",
    "character development when",
    "when ka ba matututo 😭",
    "okay character development muna",
    "growth era na tayo",
    "this is not the growth era",
    "ang chaotic mo today",
    "medyo chaotic tong conversation",
    "this convo is cooked",
    "luto na tayo dito",
    "wala na, cooked na",
    "finished na tayo",
    "it's so over 😭",
    "we're done for",
    "okay that's crazy",
    "that's actually crazy",
    "crazy work honestly",
    "grabe yung ginawa mo",
    "di ko expected yan",
    "i genuinely did not expect that",
    "you got me there",
    "okay that got me",
    "fair play",
    "i'll give you that one",
    "that was kinda good ngl",
    "lowkey that was good",
    "okay may points ka dito",
    "may points ka sakin for that",
    "fine, natawa ako",
    "okay natawa ako dun",
    "di ko dapat tinawanan pero sige",
    "sorry natawa ako 😭",
    "HAHAHAHA okay enough",
    "pls i'm trying to be serious",
    "hirap maging serious dito",
    "how am i supposed to take this seriously",
    "ang random mo talaga",
    "random as hell pero okay",
    "out of pocket mo dun ah",
    "medyo out of pocket",
    "that was out of nowhere",
    "saan nanggaling yun 😭",
    "biglang ganon",
    "wala man lang warning",
    "you could've warned me first",
    "next time warning naman",
    "okay lesson learned",
    "noted po 😭",
    "sige po, noted",
    "copy that boss",
    "okay boss",
    "yes boss HAHAHA",
    "whatever you say bro",
    "if you say so",
    "sure ka diyan?",
    "sure ka talaga?",
    "confident ka ah",
    "ang sure mo naman",
    "i respect the confidence",
    "i respect the commitment",
    "commitment sa maling desisyon 😭",
    "you really committed to that huh",
    "at least you stood by it",
    "i'll give you points for consistency",
    "consistent sa kalokohan",
    "never beating the allegations",
    "you’re beating the allegations somehow",
    "okay i'll keep that in mind",
    "noted, moving on",
    "anyway, how's your day",
    "bro we're just talking 😭",
    "relax lang, wala namang away",
    "chill lang tayo",
    "kalma ka lang",
    "easy lang",
    "wag ka masyadong invested 😭",
    "ang invested mo naman",
    "you care too much bro",
    "why are you so passionate about this",
    "grabe yung dedication",
    "dedicated talaga sa topic",
    "may thesis ba tayo dito",
    "parang defense ah",
    "defend mo pa yan HAHAHA",
    "sige explain mo pa",
    "i'm listening, somehow",
    "go, explain yourself",
    "bro is cooking something",
    "let him cook muna",
    "wait let him cook",
    "okay chef 😭",
    "medyo chef behavior",
    "cooking pero di ko sure ano",
    "ano niluluto mo diyan",
    "hindi ko alam kung matatawa ako",
    "i don't know whether to laugh or worry",
    "concerned ako ng slight",
    "slight concern lang",
    "medyo concerning not gonna lie",
    "that is concerning 😭",
    "okay that's enough internet for today",
    "close the app bro",
    "log off muna",
    "touch grass saglit",
    "drink water muna",
    "matulog ka na lang",
    "baka pagod ka lang",
    "maybe take a break muna",
    "we can revisit this later",
    "balikan natin pag may sense na",
    "pag-isipan mo muna yan",
    "think about it muna",
    "actually don't think about it",
    "wag na natin isipin yan 😭",
    "too late now",
    "well that happened",
    "it is what it is",
    "ganun talaga",
    "moving on tayo",
    "anyway 😭",
    "bro ano ba 😭",
    "beh i cannot 😭",
    "hoy wait lang",
    "teka parang ang lala",
    "grabe naman mhie",
    "mhie what are we doing",
    "okay wait, i'm processing",
    "wait i'm actually confused",
    "ano na namang ganap to",
    "bakit ka ganyan today",
    "you really woke up like this huh",
    "ang random mo talaga minsan",
    "i'm trying to understand you 😭",
    "give me a second HAHAHA",
    "wait, let me breathe",
    "okay deep breaths muna",
    "bro relax ka lang",
    "wag kang ganyan sakin",
    "please lang talaga",
    "beh i'm begging 😭",
    "hindi kita gets today",
    "gets kita, unfortunately",
    "okay i get the vision",
    "i see what you were trying to do",
    "i mean... technically",
    "technically may point",
    "may point ka, pero still",
    "okay valid, i'll admit it",
    "fine, i'll allow it",
    "sige na nga",
    "okay sige, ikaw na",
    "ikaw na talaga",
    "winner ka na diyan",
    "congrats i guess 😭",
    "happy ka na?",
    "okay satisfied ka na?",
    "there, happy?",
    "ayan, sinabi ko na",
    "okay enough na",
    "sobra na yan HAHAHA",
    "medyo sobra na yung confidence",
    "the confidence is crazy",
    "grabe yung self assurance",
    "ang lakas ng loob honestly",
    "i admire the confidence somehow",
    "i respect the audacity",
    "the audacity is insane",
    "may audacity ka talaga",
    "never lacking confidence huh",
    "wala kang takot no",
    "zero hesitation 😭",
    "not a single thought huh",
    "you just said it out loud",
    "and you chose to send that",
    "pinindot mo talaga send",
    "you had time to reconsider",
    "may chance ka pang umatras",
    "pero tinuloy mo pa rin",
    "committed ka talaga",
    "dedication is crazy",
    "consistent ka talaga sa ganyan",
    "at least may consistency",
    "consistency queen/king 😭",
    "character trait mo na ata yan",
    "signature move mo na yan",
    "classic you",
    "very on brand",
    "so on brand for you",
    "expected pero nakakagulat pa rin",
    "somehow i'm not surprised",
    "honestly? i'm not surprised",
    "i knew this was coming",
    "i had a feeling",
    "called it 😭",
    "knew it",
    "there it is",
    "ayan na nga",
    "see, eto yung sinasabi ko",
    "exactly my point",
    "this is what i mean",
    "we're back here again",
    "round two na naman",
    "episode 500 na tayo",
    "season finale na ba to",
    "may sequel pa talaga",
    "to be continued na naman",
    "same plot, different day",
    "same chaos, different day",
    "nothing ever changes 😭",
    "some things never change",
    "and here we are",
    "so this is where we're at",
    "okay this is happening",
    "well... we're here now",
    "can't go back now",
    "too late bro",
    "wala na, nasabi na",
    "sent na eh 😭",
    "damage has been done",
    "the damage is done",
    "we're past saving this",
    "wala na tayong magagawa",
    "move forward na lang tayo",
    "okay let's move on",
    "next topic please",
    "change subject pls",
    "can we talk about something else",
    "anyway, moving on",
    "okay enough about that",
    "let's pretend that didn't happen",
    "we're deleting that from memory",
    "i saw nothing",
    "wala akong nakita",
    "hindi ko yan nakita",
    "kunwari wala akong nabasa",
    "pretend natin hindi nangyari",
    "let's just leave it there",
    "we'll leave it at that",
    "no further questions",
    "i have no comment 😭",
    "comment ko sana pero wag na",
    "i was gonna say something but never mind",
    "actually never mind",
    "never mind na nga",
    "wag na lang",
    "sige wag na natin pag-usapan",
    "okay let's not unpack that",
    "i don't even wanna unpack that",
    "that's a conversation for another day",
    "mamaya na natin yan",
    "later na yan",
    "tomorrow problem na yan",
    "bukas na natin problemahin",
    "for future us na yan",
    "future me can deal with it",
    "not my problem today",
    "i'm off duty 😭",
    "wala akong energy for this",
    "low battery ako for this",
    "my brain is not available",
    "brain offline muna",
    "wala akong processing power",
    "i'm mentally buffering",
    "wait loading pa ako",
    "loading... sandali",
    "give me a sec",
    "one moment please 😭",
    "hold on",
    "sandali lang talaga",
    "teka kasi",
    "listen muna",
    "hear me out",
    "okay hear me out",
    "don't make me explain 😭",
    "i don't even know how to explain this",
    "paano ko ba ie-explain",
    "ano bang explanation dito",
    "may explanation ka ba",
    "defend yourself HAHAHA",
    "okay defend yourself",
    "sige explain mo",
    "go, i'm listening",
    "i'm listening somehow",
    "okay i'm seated",
    "go on then",
    "continue, i'm curious",
    "that's certainly a decision",
    "choice mo yan 😭",
    "you do you i guess",
    "support kita from afar",
    "supportive ako from a safe distance",
    "praying for you rn",
    "sending help mentally",
    "sending thoughts and prayers",
    "kaya mo yan hopefully",
    "i believe in you unfortunately",
    "i have faith, somehow",
    "malalampasan din natin to",
    "kakayanin natin siguro",
    "one day at a time 😭",
    "move on na tayo",
    "we live and learn",
    "lesson learned i guess",
    "noted for next time",
    "okay noted talaga",
    "copy boss",
    "yes boss 😭",
    "respectfully, no",
    "respectfully, bakit",
    "respectfully what is happening",
    "with all due respect 😭",
    "no offense pero",
    "i say this with love",
    "love you but what was that",
    "i say this affectionately: stop",
    "you know i love you but",
    "bro i say this with love",
    "please use your brain for me",
    "use your powers for good 😭",
    "save that energy",
    "where do you get this energy",
    "saan mo kinukuha energy mo",
    "ang dami mong energy",
    "you have too much free time",
    "who gave you this much time",
    "wala ka bang ginagawa today",
    "productive day sana pero eto tayo",
    "andito na naman tayo imbes na nagtatrabaho",
    "we could've been productive",
    "look what we've become",
    "this is our life now",
    "what a time to be alive",
    "internet was a mistake 😭",
    "why is this my problem now",
    "bakit ako kasama dito",
    "paano ako napunta dito",
    "how did we get here",
    "how did this become my problem",
    "i was minding my own business",
    "i was literally just here",
    "i came here peacefully 😭",
    "peace was never an option",
    "so much for a peaceful day",
    "there goes my peace",
    "goodbye peace of mind",
    "okay that's enough internet",
    "close the app muna",
    "log off ka muna",
    "matulog ka na please",
    "baka kailangan mo lang matulog",
    "maybe you're just tired",
    "baka pagod ka lang talaga",
    "take a break muna",
    "hinga ka muna",
    "breathe bro",
    "kalma lang tayo",
    "chill lang please",
    "relax lang naman",
    "wala namang emergency 😭",
    "it's not that serious",
    "hindi naman life or death",
    "wag masyadong invested",
    "you care a little too much",
    "parang may oral exam",
    "this is turning into a debate",
    "okay debate club na tayo",
    "we're doing a whole presentation now",
    "may powerpoint ka pa ba",
    "may sources ka ba 😭",
    "citation please",
    "source reveal when",
    "resibo muna",
    "pakita resibo",
    "may resibo ka ba talaga",
    "trust me bro is not a source",
    "source: vibes",
    "source: nakita ko somewhere",
    "okay that's very convincing... not",
    "hmm i'm not convinced",
    "medyo questionable",
    "questionable behavior honestly",
    "that's a little concerning",
    "slight concern",
    "i have concerns 😭",
    "concerned citizen ako",
    "as a concerned citizen",
    "i'm choosing to stay silent",
    "i will not be participating",
    "i'm staying out of this",
    "not getting involved sorry",
    "i'm not taking sides",
    "don't drag me into this",
    "wag mo ko idamay 😭",
    "ako na naman?",
    "bakit ako",
    "why me bro",
    "what did i do",
    "i wasn't even there",
    "innocent bystander ako",
    "nasa sidelines lang ako",
    "go ahead, i'm entertained",
    "popcorn muna tayo",
    "this is better than tv",
    "thank you for the entertainment",
    "at least we're entertained",
    "you can't make this up",
    "you genuinely can't make this up",
    "this writes itself",
    "i couldn't write this better",
    "this is cinema",
    "absolute cinema 😭",
    "not gonna lie, that was good",
    "i wasn't ready for that",
    "okay you win this round",
    "fine, you win",
    "sige panalo ka na",
    "i'll take the L",
    "ako na yung talo 😭",
    "okay that's on me",
    "can't even argue with that",
    "i can't defend myself there",
    "you have me there",
    "i'll concede",
    "fine, you got a point",
    "okay maybe you're right",
    "wait... you're right",
    "hate that you're right 😭",
    "i don't like that you're right",
    "annoyingly valid",
    "unfortunately valid",
    "sadly, that's true",
    "i hate to admit it",
    "i'll admit that much",
    "lowkey real",
    "no because you're right",
    "wait no, you have a point",
    "finally, something sensible",
    "okay we're getting somewhere",
    "we take those",
    "we'll take it",
    "good enough for me",
    "close enough i guess",
    "that'll do",
    "works for me",
    "okay i'm satisfied",
    "we can work with that",
    "acceptable 😭",
    "approved, reluctantly",
    "fine by me",
    "sige pwede na",
    "okay na yan",
    "ayos na yan",
    "goods na tayo",
    "okay goods",
    "all good bro",
    "we're good",
    "okay we're good",
    "no hard feelings",
    "peace tayo",
    "okay peace",
    "chill tayo",
    "wala tayong problema",
    "we're cool",
    "okay we're cool",
  ],
};

groups.push(naturalBanatGroup);

const publicRoastGroup = {
  name: "public",
  triggers: [],
  index: 0,
  replies: naturalBanatGroup.replies,
};

groups.push(publicRoastGroup);

// ============================================================
// TRIGGER MATCHING
// ============================================================

function matchesTrigger(text, trigger) {
  const normalizedText =
    normalizeText(text);

  const normalizedTrigger =
    normalizeText(trigger);

  if (
    !normalizedText ||
    !normalizedTrigger
  ) {
    return false;
  }

  const escaped =
    escapeRegExp(normalizedTrigger);

  // Proper Unicode boundaries.
  // Prevents:
  // bot -> matching "bottom"
  // sino -> matching "sinong"
  // laro -> matching "laro123"
  //
  // Still matches:
  // "bot!"
  // "hey bot"
  // "sino?"
  // "laro tayo"

  const regex = new RegExp(
    `(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`,
    "iu"
  );

  return regex.test(normalizedText);
}


// ============================================================
// TRIGGER / ID MATCHING
// ============================================================
async function resolveReplyTargetName(api,event){const r=event&&event.messageReply,id=r&&(r.senderID||r.senderId||r.sender_id);if(!id||!api||typeof api.getUserInfo!=="function")return null;try{const u=await new Promise((a,b)=>api.getUserInfo(String(id),(e,x)=>e?b(e):a(x)));return u&&u[String(id)]&&u[String(id)].name?String(u[String(id)].name).trim():null}catch(e){return null;}}


async function getTriggerReply(
  rawText,
  senderId,
  threadId,
  api,
  event,
  options = {}
) {
  if (!rawText) {
    return null;
  }

  const text =
    normalizeText(rawText);

  const normalizedSenderId =
    normalizeId(senderId);

  rememberBanatIncoming(
    threadId,
    normalizedSenderId,
    rawText,
    event?.messageID || event?.messageId || "",
    event?.messageReply?.senderID ||
      event?.messageReply?.senderId ||
      event?.replyToMessageIDSenderID ||
      ""
  );


  // Dashboard-targeted Jaiden mode is explicit and takes priority over
  // ordinary / and \ Banat pools. It does not require the incoming message
  // to contain the word "Jaiden"; the selected member's messages use this pool.
  if (options?.forceJaidenTarget === true) {
    // Dashboard-selected targeting uses its own template pool. Every entry
    // contains {{target}}, so replies don't depend on the word "Jaiden"
    // appearing in the template before substitution.
    return pickJaidenTargetReply(
      threadId,
      String(options?.targetName || "").trim() || "you"
    );
  }

  // ----------------------------------------------------------
  // EXPLICIT WORD / PHRASE TRIGGERS
  // ----------------------------------------------------------

  for (const group of groups) {
    if (
      !Array.isArray(group.triggers) ||
      group.triggers.length === 0
    ) {
      continue;
    }

    if (
      !Array.isArray(group.replies) ||
      group.replies.length === 0
    ) {
      continue;
    }

    const hit =
      group.triggers.some(
        (trigger) =>
          matchesTrigger(
            text,
            trigger
          )
      );

    if (hit) {
      const isFlirtyBanatGroup =
        group.name === "banat-natural";

      const fallbackReply = isFlirtyBanatGroup
        ? banatContextualPick(
            group.replies,
            threadId,
            rawText
          )
        : getNextReply(group);

      if (!fallbackReply) {
        return null;
      }

      if (isFlirtyBanatGroup) {
        rememberRecent(
          recentBanatReplies,
          fallbackReply,
          12
        );
      }

      let reply = fallbackReply;
      let replyTargetName = null;

      if (isFlirtyBanatGroup) {
        reply = enforceBanatAddressStyle(reply, senderId);
      }

      if (/\bjaiden\b/i.test(String(fallbackReply || ""))) {
        replyTargetName =
          String(options?.targetName || "").trim() ||
          await resolveReplyTargetName(api, event);

        if (replyTargetName) {
          reply = reply.replace(/\bjaiden\b/gi, replyTargetName);
        }
      }

      // Use the Jaiden pool verbatim so each entry can be exhausted once.
      if (group.name !== "jaiden") {
        // Groq adds variation to explicit trigger-word replies.
        // If Groq is unavailable, rate-limited, times out, or returns
        // anything unusable, the existing pool remains the fallback.
        try {
          const matchingTriggers = group.triggers.filter((trigger) =>
            matchesTrigger(text, trigger)
          );
  
          const matchedTrigger = pickTriggerVariant(
            threadId || normalizedSenderId || "global",
            group.name,
            group.triggers,
            {
              eligibleValues: matchingTriggers.length
                ? matchingTriggers
                : group.triggers,
            }
          );
  
          const aiReply = await generateTriggerReply({
            trigger: matchedTrigger,
            groupName: group.name,
            incomingText: rawText,
            fallback: reply,
            replyTargetName,
            conversationContext: banatContextPrompt(threadId),
          });
  
          if (typeof aiReply === "string" && aiReply.trim()) {
            reply = aiReply.trim().slice(0, 1200);
  
            if (isFlirtyBanatGroup) {
              reply = enforceBanatAddressStyle(reply, senderId);
            }
  
            if (replyTargetName) {
              reply = reply.replace(/\bjaiden\b/gi, replyTargetName);
            }
  
            // The generated reply is the actual reply the thread sees, so
            // remember it too; this prevents AI variation from bypassing
            // the Banat repetition guard.
            if (isFlirtyBanatGroup) {
              rememberBanatReply(threadId, reply, senderId);
            }
          }
        } catch (aiError) {
          console.warn(
            "[TRIGGERS] Groq unavailable; using generic trigger pool:",
            aiError?.status || aiError?.message || aiError
          );
        }
      }

      return reply;
    }
  }


  // ----------------------------------------------------------
  // MESSENGER ID TARGETS
  // ----------------------------------------------------------

  const roastTargets = {};

  const envMap = {
    jaiden: [
      "JAIDEN_ID",
      "JAYDEN_ID",
    ],

    sylora: ["SYLORA_ID"],
    marcellus: ["MARCELLUS_ID"],
    theone: ["THEONE_ID"],
    vincent: ["VINCENT_ID"],
    aselm: ["ASELM_ID"],
    jeo: ["JEO_ID"],
    aeix: ["AEIX_ID"],
    kikay: ["KIKAY_ID"],
    mizzy: ["MIZZY_ID"],
    "santa-bisaya": [
      "SANTA_BISAYA_ID",
    ],
    xeth: ["XETH_ID"],
  };

  for (
    const [groupName, envNames]
    of Object.entries(envMap)
  ) {
    for (const envName of envNames) {
      const configuredId =
        normalizeId(
          process.env[envName]
        );

      if (configuredId) {
        roastTargets[groupName] =
          configuredId;

        break;
      }
    }
  }


  // ----------------------------------------------------------
  // ADDITIONAL TARGETS
  //
  // ROAST_TARGET_IDS=
  // jaiden:123,vincent:456
  // ----------------------------------------------------------

  const additionalTargets =
    String(
      process.env.ROAST_TARGET_IDS ||
      ""
    );

  for (
    const entry
    of additionalTargets.split(",")
  ) {
    const separator =
      entry.indexOf(":");

    if (separator === -1) {
      continue;
    }

    const groupName =
      entry
        .slice(0, separator)
        .trim()
        .toLowerCase();

    const targetId =
      normalizeId(
        entry.slice(
          separator + 1
        )
      );

    if (
      groupName &&
      targetId
    ) {
      roastTargets[groupName] =
        targetId;
    }
  }


  // ----------------------------------------------------------
  // CHECK SENDER ID
  // ----------------------------------------------------------

  if (normalizedSenderId) {
    for (
      const [groupName, targetId]
      of Object.entries(
        roastTargets
      )
    ) {
      if (
        targetId !==
        normalizedSenderId
      ) {
        continue;
      }

      const targetGroup =
        groups.find(
          (group) =>
            group.name ===
            groupName
        );

      if (targetGroup) {
        const targetReply = pickBanatReply(
          normalizedSenderId,
          targetGroup.replies,
          []
        ) || getNextReply(targetGroup);

        if (targetReply) {
          rememberBanatReply(normalizedSenderId, targetReply);
        }

        return targetReply;
      }
    }
  }

  return null;
}


// ============================================================
// PUBLIC ROAST
// ============================================================

function getNextPublicReply() {
  const group =
    groups.find(
      (g) => g.name === "public"
    );

  return getNextReply(group);
}


// ============================================================
// BANAT ADDRESS STYLE
// ============================================================
// Alaiza may naturally be addressed as "baby". Other people must
// never receive "baby" as an affectionate relationship address.
// They can still get ordinary Banat teasing labels instead.
// ============================================================

const NON_PRIMARY_BANAT_ADDRESSES = [
  "baldie",
  "doggie",
  "cancer cell",
  "tukmol",
];

function enforceBanatAddressStyle(reply, senderId) {
  if (typeof reply !== "string" || !reply.trim()) {
    return reply;
  }

  if (isPrimaryUser(senderId)) {
    return reply;
  }

  const replacement =
    NON_PRIMARY_BANAT_ADDRESSES[
      Math.floor(Math.random() * NON_PRIMARY_BANAT_ADDRESSES.length)
    ];

  return reply.replace(/\bbaby\b/gi, replacement);
}


// ============================================================
// CONTEXT-AWARE BANAT SPEAK / SILENCE
// ============================================================
//
// Automatic Banat is intentionally not mention-gated. "/" enables the
// conversation mode; this scorer decides whether the current turn is worth
// entering. Direct replies/mentions are strongest, but natural group
// momentum can also make ECLIPSE speak without being named.

function scoreBanatAddressContext({
  rawText = "",
  senderId = "",
  threadId = "",
  event = null,
  botId = "",
} = {}) {
  const text = String(rawText || "").trim();
  const key = String(threadId || "unknown");
  const state = banatContextState.get(key);
  const replySenderId = String(
    event?.messageReply?.senderID ||
      event?.messageReply?.senderId ||
      event?.replyToMessageIDSenderID ||
      ""
  ).trim();

  const botIdentity = String(botId || "").trim();
  let score = 0.18;
  let reason = "ambient";

  if (!text) {
    return {
      shouldRespond: false,
      score: 0,
      reason: "empty",
      direct: false,
    };
  }

  // Protected users are still allowed to receive the admin-safe response.
  // This is a response-selection decision, not a roast-safety decision.
  const protectedSender =
    isAdmin(senderId) || isPrimaryUser(senderId);

  // A reply to ECLIPSE is the clearest conversational invitation.
  if (botIdentity && replySenderId === botIdentity) {
    score += 0.62;
    reason = "reply-to-bot";
  }

  // Explicit mentions remain optional. We don't require them for ordinary
  // Banat, but if the event exposes the bot in its mentions, raise priority.
  const mentionIds = event?.mentions && typeof event.mentions === "object"
    ? Object.keys(event.mentions).map(String)
    : [];

  if (botIdentity && mentionIds.includes(botIdentity)) {
    score += 0.58;
    reason = "mentioned";
  }

  const messages = Array.isArray(state?.recentMessages)
    ? state.recentMessages.slice(-8)
    : [];

  const now = Date.now();
  const recentBotReply = Array.isArray(state?.recentReplies)
    ? state.recentReplies.length > 0
    : false;

  if (recentBotReply && Number(state?.updatedAt || 0) > now - 90_000) {
    score += 0.20;
    if (reason === "ambient") reason = "conversation-active";
  }

  const directedTarget = getBanatDirectedTarget(key);

  if (
    directedTarget &&
    String(senderId || "").trim() ===
      String(directedTarget.targetId || "").trim()
  ) {
    score += 0.48;
    reason = "directed-target";
  }

  const conversationTarget = getBanatConversationTarget(key);
  const sameConversationTarget =
    conversationTarget &&
    String(senderId || "").trim() ===
      String(conversationTarget.senderId || "").trim();

  const topicOverlap = getBanatTopicOverlap(key, text);
  const explicitSwitchSignal =
    (botIdentity && replySenderId === botIdentity) ||
    (botIdentity && mentionIds.includes(botIdentity));

  // Once Banat chooses a person, other speakers are not allowed to steal
  // the turn merely by talking. They can take ownership only when they
  // clearly continue the same topic, explicitly address ECLIPSE, or provide
  // a strong contextual signal such as a Jammy defense exchange.
  if (conversationTarget && !sameConversationTarget) {
    if (explicitSwitchSignal) {
      score += 0.30;
      reason = "target-switch";
    } else if (topicOverlap >= 0.34) {
      score += 0.10;
      reason = "target-topic-switch";
    } else {
      score -= 0.34;
      if (reason === "ambient" || reason === "conversation-active") {
        reason = "other-speaker-wait";
      }
    }
  } else if (sameConversationTarget) {
    score += 0.20;
    if (reason === "ambient") reason = "target-continuation";
  }

  // Jammy is the protected primary user while Banat is active. A message
  // aimed at Jammy gets a strong conversational boost so Hev Abi can defend
  // or join the exchange without requiring a mention of the bot.
  const jammyId = String(
    process.env.ECLIPSE_PRIMARY_USER_ID ||
      process.env.ECLIPSE_ADMIN_ID ||
      ""
  ).trim();

  const jammyMentioned =
    /\bjammy\b/i.test(text) ||
    (jammyId && mentionIds.includes(jammyId));

  const replyToJammy =
    jammyId &&
    replySenderId === jammyId;

  const jammyReference =
    /\b(you|u|ur|your|mo|ka|iyo|sayo)\b/i.test(text) &&
    Array.isArray(messages) &&
    messages.length > 0 &&
    String(messages[messages.length - 1]?.senderId || "").trim() === jammyId;

  // Build a short-lived who-to-whom graph from explicit reply metadata.
  // This survives unrelated intervening messages better than last-speaker-only logic.
  if (senderId && (replySenderId || jammyMentioned)) {
    recordBanatInteraction(key, {
      senderId,
      addresseeId: replySenderId || (jammyMentioned ? jammyId : null),
      relation: replySenderId === jammyId
        ? "reply-to-jammy"
        : jammyMentioned
          ? "named-jammy"
          : "conversation",
      confidence: replySenderId === jammyId
        ? 0.98
        : jammyMentioned
          ? 0.86
          : 0.55,
    });
  }

  const jammyAttack = classifyJammyAttack({
    text,
    senderId,
    replySenderId,
    jammyId,
    recentMessages: messages,
  });

  if (jammyAttack.targeted) {
    // Clear target evidence gets a stronger boost than a generic mention.
    score += 0.52 + jammyAttack.confidence * 0.18;
    reason = "jammy-defense";

    if (senderId && senderId !== jammyId) {
      updateJammyDefenseEngagement(
        key,
        senderId,
        "jammy-targeted"
      );
    }
  } else if (jammyMentioned || replyToJammy || jammyReference) {
    // A normal reply to Jammy is still relevant, but does not automatically
    // enter defense mode unless the text also looks like an attack.
    score += 0.18;
    if (reason === "ambient") reason = "jammy-conversation";
  }

  const defenseEngagement = getJammyDefenseEngagement(key);

  const priorJammyInteraction = getRecentBanatInteraction(
    key,
    senderId,
    jammyId
  );

  if (
    priorJammyInteraction &&
    jammyAttack.targeted
  ) {
    score += 0.16;
    reason = "jammy-interaction-history";
  }

  if (
    defenseEngagement &&
    String(senderId || "").trim() ===
      String(defenseEngagement.attackerId || "").trim()
  ) {
    const continuation =
      jammyAttack.targeted ||
      replyToJammy ||
      replySenderId === botIdentity ||
      classifyBanatIntent(text) === "roast";

    if (continuation) {
      score += 0.34;
      reason = "active-jammy-defense";

      // A continuing attack refreshes the short idle TTL, capped by the
      // maximum engagement duration so the state cannot live forever.
      updateJammyDefenseEngagement(
        key,
        senderId,
        "attacker-continuing"
      );

      // Once an exchange is established, preserve the inferred
      // attacker -> Jammy edge even when the latest message is not a
      // direct reply and Jammy is no longer named.
      recordBanatInteraction(key, {
        senderId,
        addresseeId: jammyId,
        relation: "defense-continuation",
        confidence: jammyAttack.targeted ? 0.92 : 0.72,
      });
    }
  }

  const intent = classifyBanatIntent(text);
  const emotional = extractBanatEmotion(text);

  const turnPolicy = getBanatTurnPolicy(key, {
    senderId,
    botId: botIdentity,
    replySenderId,
    addressed:
      (botIdentity && replySenderId === botIdentity) ||
      (botIdentity && mentionIds.includes(botIdentity)),
    relevant:
      jammyAttack.targeted ||
      Boolean(defenseEngagement && String(senderId || "").trim() === String(defenseEngagement.attackerId || "").trim()) ||
      ["reaction", "agreement", "disagreement", "roast", "request"].includes(intent),
  });

  // Turn policy is advisory only. It must never become a hard gate:
  // Banat is allowed to proactively enter a relevant conversation even when
  // nobody directly addressed ECLIPSE. The actual one-person-at-a-time
  // restriction is enforced by the burst queue in index.js.
  if (!turnPolicy.allow && reason === "ambient") {
    reason = "proactive-conversation";
  }

  // Momentum makes an established exchange increasingly coherent without
  // making it permanent. The boost is capped so Banat cannot become trapped
  // in one argument.
  if (
    defenseEngagement &&
    String(senderId || "").trim() ===
      String(defenseEngagement.attackerId || "").trim()
  ) {
    const turns = Math.min(20, Number(defenseEngagement.turns || 1));
    const momentumBoost = Math.min(
      0.22,
      0.06 + turns * 0.008
    );
    score += momentumBoost;
    if (reason === "ambient") reason = "defense-momentum";
  }

  // These are conversational opportunities, not requirements.
  if (["reaction", "agreement", "disagreement", "roast", "request"].includes(intent)) {
    score += 0.12;
  }

  if (["laughing", "heated", "surprised"].includes(emotional)) {
    score += 0.08;
  }

  const speakers = [...new Set(
    messages
      .map((item) => String(item?.senderId || "").trim())
      .filter(Boolean)
  )];

  const last = messages[messages.length - 1];
  const lastSpeaker = String(last?.senderId || "").trim();

  // A continuing exchange gets a small boost, especially when the current
  // speaker is the same person who just continued the thought.
  if (lastSpeaker && lastSpeaker === String(senderId || "").trim()) {
    score += 0.14;
    if (reason === "ambient") reason = "speaker-continuation";
  }

  // Active multi-person conversations should not block ECLIPSE.
  // Only apply a very small momentum penalty when several members are
  // rapidly exchanging messages and nobody addressed ECLIPSE directly.
  // This keeps ECLIPSE able to naturally jump in when the content is relevant.
  // Multiple people talking is not a Banat blocker. Do not penalize
  // group-chat momentum here; the send queue separately guarantees that
  // only one person's turn can be answered at a time.

  // Keep admin/primary-user conversation participation responsive, but their
  // content is still routed through the safe reply pool in getRandomRoastReply.
  if (protectedSender) {
    score += 0.16;
    if (reason === "ambient") reason = "admin-conversation";
  }

  score = Math.max(0, Math.min(1, Number(score.toFixed(3))));

  const activeTarget = getBanatConversationTarget(key);
  const isOtherSpeaker =
    Boolean(activeTarget) &&
    String(senderId || "").trim() !==
      String(activeTarget.senderId || "").trim();

  const canSwitchTarget =
    isOtherSpeaker &&
    (
      reason === "target-switch" ||
      reason === "target-topic-switch" ||
      reason === "jammy-defense" ||
      reason === "active-jammy-defense" ||
      reason === "jammy-interaction-history"
    );

  return {
    // Banat stays proactive, but once a person owns the conversation,
    // unrelated speakers must wait. A strong contextual signal can transfer
    // ownership to the new speaker.
    shouldRespond:
      // The current conversation owner should not be filtered by the
      // address/relevance score. If they send one message or several,
      // Banat is allowed to engage. The queue handles batching/rate limits.
      (!isOtherSpeaker) ||
      score >= 0.52 ||
      reason === "reply-to-bot" ||
      reason === "mentioned",
    score,
    reason,
    direct:
      reason === "reply-to-bot" ||
      reason === "mentioned",
    conversationTargetId: activeTarget?.senderId || null,
    canSwitchTarget,
    topicOverlap,
  };
}

// ============================================================
// RANDOM GENERIC ROAST
// ============================================================

const ADMIN_SAFE_BANAT_REPLIES = [
  "bro what 😭",
  "ano ba yan 😭",
  "wait lang HAHAHA",
  "teka lang, what is this",
  "okay??? 😭",
  "saan mo nakuha yan",
  "wait actually",
  "hold on may point",
  "teka parang may sense",
  "okay gets ko na",
  "gets ko naman",
  "actually fair",
  "lowkey true",
  "real naman",
  "valid, pero ang funny",
  "okay noted yan",
  "noted with concern",
  "fair enough naman",
  "pwede na yan",
  "i see what you mean",
  "okay i hear you",
  "wait kasi",
  "wala na akong masabi",
  "speechless ako 😭",
  "okay so anyway",
  "anyway moving on",
  "sige next topic",
  "wait what",
  "hala wait",
  "teka lang",
  "sandali lang 😭",
  "okay i'm listening",
  "go, explain mo",
  "take your time, i guess",
  "interesting choice",
  "that's certainly a decision 😭",
  "choice mo yan",
  "if that's what you want",
  "whatever works for you",
  "sige if you're happy",
  "basta masaya ka",
  "okay as long as you're happy",
  "support kita",
  "good luck na lang talaga",
  "we'll survive this",
  "okay lang yan",
  "it happens",
  "ganun talaga minsan",
  "life goes on",
  "copy that",
  "noted po",
  "sige po",
  "okay po HAHAHA",
  "i'm just observing",
  "spectator lang ako dito",
  "carry on, i'll watch",
  "okay this is entertaining",
  "i'm seated for this",
  "grab the popcorn 😭",
  "free entertainment",
  "okay that's actually funny",
  "that got me ngl",
  "i'll give you that",
  "that was kinda good",
  "lowkey impressive",
  "okay you got me",
  "fair point actually",
  "okay that's valid",
  "valid point",
  "can't lie",
  "not even gonna lie",
  "real talk though",
  "honestly though",
  "actually though",
  "okay now we're talking",
  "there we go",
  "now that makes sense",
  "progress 😭",
  "small win",
  "my bad then",
  "fair, that's my fault",
  "okay i'll own that",
];

function getRandomRoastReply(threadId = null, incomingText = "", senderId = null) {
  const adminSender = isAdmin(senderId) || isPrimaryUser(senderId);

  // ECLIPSE admins get a reaction, never a roast. Everyone else uses the
  // normal new natural Banat pool.
  if (adminSender) {
    const reply = pickFromBag(
      String(threadId || senderId || "global"),
      "admin-safe-replies",
      ADMIN_SAFE_BANAT_REPLIES
    );

    const styledReply = enforceBanatAddressStyle(reply, senderId);
    rememberRecent(
      recentBanatReplies,
      styledReply,
      BANAT_RECENT_LIMIT
    );
    rememberBanatReply(String(threadId || "unknown"), styledReply, senderId);
    return styledReply;
  }

  const genericGroups = groups.filter(
    (group) => group.name === "banat-natural"
  );

  const replies = dedupeBanatReplies(
    genericGroups.flatMap((group) =>
      Array.isArray(group.replies) ? group.replies : []
    )
  );

  if (replies.length === 0) {
    return null;
  }

  const reply =
    pickDiverseBanatReply(replies, threadId, incomingText) ||
    pickBanatReply(
      String(threadId || "unknown"),
      replies,
      []
    );

  if (!reply) {
    return null;
  }

  const styledReply = enforceBanatAddressStyle(
    reply,
    senderId
  );

  rememberRecent(
    recentBanatReplies,
    styledReply,
    BANAT_RECENT_LIMIT
  );
  rememberBanatReply(String(threadId || "unknown"), styledReply, senderId);

  return styledReply;
}


// ============================================================
// CONTINUOUS CONVERSATION MODE
// ============================================================

async function getBanatConversationReply(
  rawText,
  senderId,
  threadId,
  api,
  event
) {
  const fallback = getRandomRoastReply(threadId, rawText, senderId);

  if (!fallback) {
    return null;
  }

  // Hard safety boundary: protected users may receive a safe reaction,
  // never an AI-generated roast. Do not let the conversation model bypass
  // the primary/admin protection used by the pool selector.
  if (isAdmin(senderId) || isPrimaryUser(senderId)) {
    return fallback;
  }

  // When Banat is active, protect Jammy when the conversation is clearly
  // directed at him. Keep this inside the existing conversation generator
  // instead of creating a second response pipeline.
  const state = banatContextState.get(String(threadId || "unknown"));
  const recentMessages = Array.isArray(state?.recentMessages)
    ? state.recentMessages.slice(-8)
    : [];
  const jammyId = String(
    process.env.ECLIPSE_PRIMARY_USER_ID ||
      process.env.ECLIPSE_ADMIN_ID ||
      ""
  ).trim();
  const replySenderId = String(
    event?.messageReply?.senderID ||
      event?.messageReply?.senderId ||
      event?.replyToMessageIDSenderID ||
      ""
  ).trim();

  const mentionsJammy =
    /\bjammy\b/i.test(String(rawText || "")) ||
    (jammyId &&
      event?.mentions &&
      typeof event.mentions === "object" &&
      Object.keys(event.mentions).map(String).includes(jammyId));

  const repliedToJammy =
    jammyId && replySenderId === jammyId;

  const lastWasJammy =
    jammyId &&
    recentMessages.length > 0 &&
    String(
      recentMessages[recentMessages.length - 1]?.senderId || ""
    ).trim() === jammyId;

  const activeDefense = getJammyDefenseEngagement(
    String(threadId || "unknown")
  );

  const isActiveAttacker =
    activeDefense &&
    String(senderId || "").trim() ===
      String(activeDefense.attackerId || "").trim();

  const jammyDefenseContext =
    mentionsJammy ||
    repliedToJammy ||
    (lastWasJammy &&
      /\b(you|u|ur|your|mo|ka|iyo|sayo)\b/i.test(
        String(rawText || "")
      )) ||
    isActiveAttacker;

  if (jammyDefenseContext) {
    const defenseFallbacks = [
      "wag mo idamay si Jammy, ikaw nga yung mukhang problema dito 😭",
      "kay Jammy ka talaga naghanap ng away? ang tapang mo naman",
      "leave Jammy alone, ikaw muna mag explain bakit ganyan ka",
      "si Jammy na naman? ikaw muna ayusin mo sarili mo bago ka mag roast",
      "easy ka lang kay Jammy, hindi mo yan kaya sa banatan",
      "wag kang masyadong confident, Jammy is just letting you talk 😭",
      "you really picked Jammy to roast? brave choice",
      "si Jammy target mo? sige, ako muna kausap mo",
      "hindi kita pinagbawalan mag roast, pero wag mo si Jammy idamay",
      "bro really woke up and chose Jammy 😭",
    ];

    const momentumFallbacks =
      activeDefense && Number(activeDefense.turns || 0) >= 3
        ? [
            "bro you're still on this? 😭",
            "you've been fighting Jammy for this long and still haven't landed one",
            "damn, this is becoming a full-time job for you",
            "you really kept this argument alive just to say that",
            "same argument, new sentence 😭",
            "you had all that time and THAT was your next line?",
          ]
        : [];

    const fallbackPool = [
      ...defenseFallbacks,
      ...momentumFallbacks,
    ];

    const recentDefenseReplies =
      banatContextState.get(String(threadId || "unknown"))?.recentReplies || [];
    const defenseFallback =
      pickFromBag(
        String(threadId || "unknown"),
        "banat-defense",
        fallbackPool,
        { avoidValues: recentDefenseReplies }
      ) || fallback;

    try {
      const aiDefense = await generateTriggerReply({
        trigger: "defend Jammy",
        groupName: "banat-defense",
        incomingText: rawText,
        fallback: defenseFallback,
        replyTargetName: "Jammy",
        conversationContext:
          banatContextPrompt(threadId) +
          (activeDefense
            ? "\n\nACTIVE JAMMY DEFENSE EXCHANGE:" +
              "\nAttacker: " +
              String(activeDefense.attackerId || "unknown") +
              "\nTurns: " +
              String(activeDefense.turns || 1) +
              "\nIntensity: " +
              String(Number(activeDefense.intensity || 0).toFixed(2)) +
              "\nContinue the current exchange naturally. Respond to the attacker's latest point; do not repeat a generic 'leave Jammy alone' line unless it actually fits." 
            : ""),
      });

      if (typeof aiDefense === "string" && aiDefense.trim()) {
        const candidate = aiDefense.trim().slice(0, 1200);
        const selected = isRecent(threadId, candidate)
          ? defenseFallback
          : candidate;
        rememberBanatReply(String(threadId || "unknown"), selected, senderId);
        return selected;
      }
    } catch (error) {
      console.warn(
        "[TRIGGERS] Jammy defense AI unavailable; using fallback:",
        error?.status || error?.message || error
      );
    }

    rememberBanatReply(String(threadId || "unknown"), defenseFallback, senderId);
    return defenseFallback;
  }

  let replyTargetName = null;

  try {
    replyTargetName = await resolveReplyTargetName(api, event);
  } catch (error) {
    replyTargetName = null;
  }

  let reply = fallback;

  try {
    const aiReply = await generateTriggerReply({
      trigger: "continuous conversation",
      groupName: "conversation",
      incomingText: rawText,
      fallback,
      replyTargetName,
      conversationContext: banatContextPrompt(threadId),
    });

    if (typeof aiReply === "string" && aiReply.trim()) {
      const candidate = aiReply.trim().slice(0, 1200);
      const styledCandidate = enforceBanatAddressStyle(candidate, senderId);
      const addressedCandidate = replyTargetName
        ? styledCandidate.replace(/\bjaiden\b/gi, replyTargetName)
        : styledCandidate;

      // The model can ignore context and repeat itself. Keep the pool-picked
      // fallback when the generated line matches recent text or its opening.
      if (!isRecent(threadId, addressedCandidate)) {
        reply = addressedCandidate;
      }
    }
  } catch (error) {
    console.warn(
      "[TRIGGERS] Continuous conversation AI unavailable; using contextual pool:",
      error?.status || error?.message || error
    );
  }

  rememberBanatReply(String(threadId || "unknown"), reply, senderId);

  const replyState = banatContextState.get(String(threadId || "unknown"));
  if (replyState) {
    replyState.recentReplies.push(reply);
    replyState.recentReplies = replyState.recentReplies.slice(-6);
    replyState.recentFamilies.push(banatReplyFamily(reply));
    replyState.recentFamilies = replyState.recentFamilies.slice(-4);
    replyState.at = Date.now();
    banatContextState.set(String(threadId || "unknown"), replyState);
  }

  return reply;
}


// ============================================================
// SEQUENTIAL REPLY
// ============================================================

function getNextReply(group) {
  if (
    !group ||
    !Array.isArray(group.replies) ||
    group.replies.length === 0
  ) {
    return null;
  }

  // Shuffle bag for Jaiden: every reply is used once before refilling.
  if (group.name === "jaiden") {
    if (!Array.isArray(group.replyBag) || group.replyBag.length === 0) {
      group.replyBag = group.replies.map((_, index) => index);
      for (let i = group.replyBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [group.replyBag[i], group.replyBag[j]] = [
          group.replyBag[j],
          group.replyBag[i],
        ];
      }
    }
    return group.replies[group.replyBag.pop()];
  }

  if (!Number.isInteger(group.index)) {
    group.index = 0;
  }
  const reply = group.replies[group.index % group.replies.length];
  group.index = (group.index + 1) % group.replies.length;
  return reply;
}


// ============================================================
// NORMALIZATION
// ============================================================

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}


function normalizeId(value) {
  return String(value || "")
    .trim()
    .replace(
      /^["']|["']$/g,
      ""
    );
}


// ============================================================
// ESCAPE REGEX
// ============================================================

function escapeRegExp(str) {
  return String(str).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  getTriggerReply,
  getRandomRoastReply,
  getNextPublicReply,
  getBanatConversationReply,
  scoreBanatAddressContext,
  setBanatDirectedTarget,
  getBanatDirectedTarget,
  clearBanatDirectedTarget,
  updateJammyDefenseEngagement,
  getJammyDefenseEngagement,
  classifyJammyAttack,
  recordBanatInteraction,
  getRecentBanatInteraction,
  updateBanatExchangeState,
  getBanatExchangeState,
  getBanatTurnPolicy,
  getBanatConversationTarget,
  setBanatConversationTarget,
  clearBanatConversationTarget,

  normalizeText,
  normalizeId,
  matchesTrigger,

  groups,
  publicRoastGroup,
};
