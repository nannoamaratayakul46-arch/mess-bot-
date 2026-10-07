const { generateTriggerReply } = require("./ai/provider");
const { isPrimaryUser } = require("./ai/access");
const { rememberBanatReply, pickBanatReply } = require("./banat-memory");
const { pickFromBag, pickTriggerVariant } = require("./banat-randomizer");
const { chooseSocialResponse } = require("./banat-social");
const { isAdmin } = require("./permissions");

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
      "al-bai-no",
      "bai-gone",
      "bai-tamins",
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

function rememberBanatIncoming(threadId, senderId, text, eventKey = "") {
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

  if (Array.isArray(state.topics) && state.topics.length) {
    lines.push("ACTIVE TOPICS: " + state.topics.slice(-10).join(", "));
  }

  if (state.emotion && state.emotion !== "neutral") {
    lines.push("CURRENT ENERGY: " + state.emotion);
  }

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

  return lines.join("\n").slice(0, 4500);
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
    "bro what 😭",
    "ano ba yan 😭",
    "wait lang HAHAHA",
    "teka lang, what is this",
    "nah you’re actually insane",
    "grabe ka naman",
    "hindi ko alam sayo",
    "wala ka talagang preno no",
    "okay??? 😭",
    "saan mo nakuha yan",
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
    "okay gets ko na",
    "gets ko naman pero 😭",
    "wait kasi may point ka",
    "actually fair",
    "lowkey true",
    "real naman",
    "valid, pero ang funny",
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
    "okay noted yan",
    "noted with concern",
    "i'll let you have that",
    "sige pagbigyan kita",
    "okay fine 😭",
    "fair enough naman",
    "pwede na yan",
    "close enough",
    "i see what you mean",
    "gets, gets",
    "okay i hear you",
    "wait actually",
    "hold on may point",
    "teka parang may sense",
    "never mind HAHAHA",
    "wala na akong masabi",
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
    "okay so anyway",
    "anyway moving on",
    "sige next topic",
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
    "hala wait",
    "teka lang",
    "sandali lang 😭",
    "wait what",
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
    "okay i'm listening",
    "take your time, i guess",
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
    "okay lang yan",
    "life goes on",
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
    "wait kasi",
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
    "interesting choice",
    "that's certainly a decision",
    "choice mo yan 😭",
    "you do you i guess",
    "if that's what you want",
    "whatever works for you",
    "sige if you're happy",
    "basta masaya ka",
    "okay as long as you're happy",
    "support kita from afar",
    "supportive ako from a safe distance",
    "praying for you rn",
    "sending help mentally",
    "sending thoughts and prayers",
    "good luck na lang talaga",
    "kaya mo yan hopefully",
    "i believe in you unfortunately",
    "i have faith, somehow",
    "we'll survive this",
    "malalampasan din natin to",
    "kakayanin natin siguro",
    "one day at a time 😭",
    "okay lang yan",
    "it happens",
    "ganun talaga minsan",
    "life goes on",
    "move on na tayo",
    "we live and learn",
    "lesson learned i guess",
    "noted for next time",
    "okay noted talaga",
    "copy that",
    "copy boss",
    "yes boss 😭",
    "noted po",
    "sige po",
    "okay po HAHAHA",
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
    "touch grass saglit",
    "drink water muna",
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
    "ang invested mo naman",
    "you care a little too much",
    "why are you so passionate about this",
    "may thesis ba tayo dito",
    "parang defense ah",
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
    "i'm just observing",
    "spectator lang ako dito",
    "nasa sidelines lang ako",
    "carry on, i'll watch",
    "go ahead, i'm entertained",
    "okay this is entertaining",
    "i'm seated for this",
    "grab the popcorn 😭",
    "popcorn muna tayo",
    "this is better than tv",
    "free entertainment",
    "thank you for the entertainment",
    "at least we're entertained",
    "you can't make this up",
    "you genuinely can't make this up",
    "this writes itself",
    "i couldn't write this better",
    "this is cinema",
    "absolute cinema 😭",
    "okay that's actually funny",
    "that got me ngl",
    "fine, natawa ako",
    "okay you got me",
    "i'll give you that",
    "that was kinda good",
    "lowkey impressive",
    "not gonna lie, that was good",
    "i wasn't ready for that",
    "you got me there",
    "okay you win this round",
    "fine, you win",
    "sige panalo ka na",
    "i'll take the L",
    "ako na yung talo 😭",
    "okay that's on me",
    "my bad then",
    "fair, that's my fault",
    "okay i'll own that",
    "can't even argue with that",
    "i can't defend myself there",
    "fair point actually",
    "you have me there",
    "okay that's valid",
    "valid point",
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
    "can't lie",
    "not even gonna lie",
    "real talk though",
    "real naman",
    "lowkey real",
    "honestly though",
    "actually though",
    "no because you're right",
    "wait no, you have a point",
    "okay now we're talking",
    "finally, something sensible",
    "there we go",
    "now that makes sense",
    "okay we're getting somewhere",
    "progress 😭",
    "small win",
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
    "pwede na yan",
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
  event
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
    event?.messageID || event?.messageId || ""
  );


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

      if (
        String(fallbackReply).trim().toLowerCase() ===
        "jaiden na naman"
      ) {
        replyTargetName = await resolveReplyTargetName(api, event);

        if (replyTargetName) {
          reply = replyTargetName + " na naman";
        }
      }

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
      reply = aiReply.trim().slice(0, 1200);

      reply = enforceBanatAddressStyle(reply, senderId);

      if (replyTargetName) {
        reply = reply.replace(/\bjaiden\b/gi, replyTargetName);
      }
    }
  } catch (error) {
    console.warn(
      "[TRIGGERS] Continuous conversation AI unavailable; using contextual pool:",
      error?.status || error?.message || error
    );
  }

  rememberBanatReply(String(threadId || "unknown"), reply, senderId);

  const state = banatContextState.get(String(threadId || "unknown"));
  if (state) {
    state.recentReplies.push(reply);
    state.recentReplies = state.recentReplies.slice(-6);
    state.recentFamilies.push(banatReplyFamily(reply));
    state.recentFamilies = state.recentFamilies.slice(-4);
    state.at = Date.now();
    banatContextState.set(String(threadId || "unknown"), state);
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

  if (
    !Number.isInteger(group.index)
  ) {
    group.index = 0;
  }

  const reply =
    group.replies[
      group.index %
      group.replies.length
    ];

  group.index =
    (group.index + 1) %
    group.replies.length;

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

  normalizeText,
  normalizeId,
  matchesTrigger,

  groups,
  publicRoastGroup,
};