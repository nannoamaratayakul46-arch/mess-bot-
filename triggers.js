const { generateTriggerReply } = require("./ai/provider");
const { rememberBanatReply, pickBanatReply } = require("./banat-memory");
const {
  observeBanatMessage,
  getBanatContext,
  contextPrompt,
  scoreReply,
} = require("./banat-context");

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

  {
    name: "trash-talk",
    triggers: [
      "weak",
      "laro",
      "tanginamo",
      "lala",
      "patawa",
      "gago",
      "bobo",
      "tanga",
      "hahahaa",
      "pake ko",
      "sino yan",
    ],
    index: 0,
    replies: [
      "ang baho mo po, baby 😭💕",
      "baby, explain mo po 'yang kabobohan mo.",
      "baby, ano po 'yang tukmol ka?",
      "baby naman, didn't I tell you po 'wag kang tanga?",
      "hala po, si baby nadapa dahil sa kabobohan niya.",
      "baby, cute mo po kapag mali ka.",
      "baby, ang tapang mo po para sa taong ganyan ka-cute.",
      "baby, saan mo po hinugot 'yang confidence mo?",
      "baby, may resibo ka po ba o vibes lang?",
      "baby, ang cute po ng yabang mo.",
      "baby, pwede bang magpahinga ka muna sa pagiging tanga? 😭",
      "baby, bakit po parang naka-airplane mode utak mo?",
      "baby, nag-iisip ka po ba o nagpapacute lang?",
      "baby, ang lakas mo po magtalk para sa ganyang kaliit na point.",
      "baby, tuloy mo lang po, natutuwa akong panoorin kang malito.",
      "baby, may tutorial po ba para maintindihan kita?",
      "baby, ang ganda po ng confidence mo, sayang wala sa tamang lugar.",
      "baby, bakit po parang ikaw mismo di convinced sa sinabi mo?",
      "baby, behave po, ang cute mo na nga, makulit ka pa.",
      "baby, wag kang ganyan po, baka lalo kitang lambingin.",
      "baby, ang kulit mo po, pero sige cute ka naman.",
      "baby, kailangan mo po ba ng hug bago ka ulit magsalita?",
      "baby, calm down po, baka maubos ang cute points mo.",
      "baby, ang dramatic mo po, parang teleserye.",
      "baby, bakit po every sentence mo may plot twist?",
      "baby, nag-practice ka po ba maging makulit?",
      "baby, ikaw na po ang certified little menace ko.",
      "baby, ang lakas ng aura mo po, kaso naligaw.",
      "baby, gusto mo po bang tamaan kita ng lambing?",
      "baby, ang gulo mo po, pero adorable somehow.",
      "baby, bakit po parang may sariling gravity 'yang kabobohan mo?",
      "baby, one brain cell at a time lang po, please.",
      "baby, wag po masyadong seryoso, bagay sa'yo ang pagiging cute na sablay.",
      "baby, may appointment ka po ba sa kabobohan today?",
      "baby, ang sipag mo po gumawa ng problema.",
      "baby, proud ka po talaga sa ganyang take?",
      "baby, ang confidence mo po parang unlimited data.",
      "baby, ang logic mo po naka-trial version.",
      "baby, nag-buffer po ba utak mo?",
      "baby, bakit po ikaw ang pinaka-confident na walang point?",
      "baby, ang cute po ng argument mo, pero hindi convincing.",
      "baby, sige po, explain mo pa, gusto kong marinig ang sequel.",
      "baby, ang haba po ng speech mo, nasaan ang point?",
      "baby, may point ka po ba o nagbabakasyon?",
      "baby, balik po tayo sa reality, miss na kita doon.",
      "baby, ang layo po ng sagot mo sa tanong.",
      "baby, ikaw po ba ang final boss ng unnecessary replies?",
      "baby, ang cute mo po kapag trying hard.",
      "baby, don't worry po, tutulungan kitang hanapin ang point mo.",
      "baby, nawawala po ba ang common sense mo kapag cute ka?",
      "baby, bakit po parang confidence muna bago utak?",
      "baby, ang tapang mo po, gusto mo ba ng forehead kiss?",
      "baby, ang lakas mo po mang-asar, pero ikaw naman ang madaling lambingin.",
      "baby, wag ka po magalit, bagay sa'yo ang pikon.",
      "baby, ang cute po ng tampo mo, kaso mali ka pa rin.",
      "baby, okay po, noted ang kabobohan.",
      "baby, sige po, ikaw na ang CEO ng nonsense.",
      "baby, ang adorable po ng pagka-confident mong mali.",
      "baby, may citation po ba 'yang claim mo?",
      "baby, source po? o galing lang sa imagination?",
      "baby, ang cute po ng fake confidence mo.",
      "baby, nag-type ka po nang todo para sabihin 'yan?",
      "baby, ang effort po, pero saan napunta ang sense?",
      "baby, one more paragraph po at baka mahulog ako sa'yo.",
      "baby, ang daldal mo po, pero sige, favorite kita.",
      "baby, pwede po bang tumigil ka muna? nami-miss ko kasi katahimikan.",
      "baby, ang ingay mo po, pero cute so pagbibigyan kita.",
      "baby, bakit po ikaw ang walking plot hole?",
      "baby, ang galing mo po gumawa ng tanong sa sagot.",
      "baby, ikaw po ba ang reason bakit may mute button?",
      "baby, wag kang mag-alala po, may special place ka sa patience ko.",
      "baby, ang taas po ng confidence, ang baba ng accuracy.",
      "baby, perfect po ang delivery, questionable ang content.",
      "baby, ang smooth mo po magsalita, sayang sablay ang logic.",
      "baby, cute po ng confidence, pero check natin facts.",
      "baby, ang point mo po nagtatago yata.",
      "baby, baka kailangan po natin ng search party para sa logic mo.",
      "baby, ang argumento mo po may sariling side quest.",
      "baby, saan po nag-road trip ang common sense?",
      "baby, ang reply mo po nag-lag sa landing.",
      "baby, bakit po every comeback mo may loading screen?",
      "baby, ang banat mo po cute, parang ikaw.",
      "baby, sige po, roast mo pa ako, nakakatuwa ka.",
      "baby, ang yabang mo po, gusto mo bang i-redeem sa lambing?",
      "baby, wag po masyadong cute habang mali.",
      "baby, ang lakas mong mang-asar po, parang gusto mong pansinin kita.",
      "baby, obvious po na gusto mo ng attention.",
      "baby, nakuha mo na po attention ko, happy ka na?",
      "baby, congratulations po, ikaw ang little problem of the day.",
      "baby, ang cute po ng problema mo, pero problema pa rin.",
      "baby, ikaw po talaga ang definition ng cute disaster.",
      "baby, ang galing mong manggulo po.",
      "baby, may medal po ba sa pagiging makulit? deserve mo.",
      "baby, ang kulit mo po, pero don't stop.",
      "baby, bakit po parang hobby mo akong inisin?",
      "baby, ikaw po ba ang scheduled interruption ko today?",
      "baby, ang dramatic mo po, gusto mo soundtrack?",
      "baby, may script po ba tayo o improv lang talaga kabobohan mo?",
      "baby, ang confident mo po, parang may backup brain.",
      "baby, saan po nabibili 'yang confidence? gusto ko rin.",
      "baby, ang cute mong magpanggap na tama po.",
      "baby, sige po, defend your thesis of nonsense.",
      "baby, thesis defense mo po 'yan? bagsak sa cute, pasado sa kulit.",
      "baby, ang argument mo po kailangan ng emotional support.",
      "baby, hug muna po bago natin ayusin ang logic.",
      "baby, breathe po, hindi ka hinahabol ng facts.",
      "baby, ang cute mo pong mag-panic kapag challenged.",
      "baby, relax po, hindi contest ang pagiging tama.",
      "baby, although baby, kailangan po nating tanggapin na sablay ka.",
      "baby, acceptance po muna bago confidence.",
      "baby, ang saya po ng confidence mo habang papunta sa maling direction.",
      "baby, GPS po ba utak mo? bakit off-route?",
      "baby, turn left po sa common sense.",
      "baby, recalculating po ang logic mo.",
      "baby, destination: tamang sagot. ETA: unknown.",
      "baby, may detour po yata 'yang argument mo.",
      "baby, ang cute po ng detour, pero balik tayo sa point.",
      "baby, bakit po parang side quest lahat ng sagot mo?",
      "baby, main quest po tayo, wag kang gala.",
      "baby, ang layo po ng plot armor mo.",
      "baby, ikaw po ang protagonist ng sariling kalituhan.",
      "baby, ang cute ng confidence mo po, very main character.",
      "baby, main character ka po pero extra ang logic.",
      "baby, ang dramatic po ng entrance mo.",
      "baby, pasok po ang attitude, kulang ang evidence.",
      "baby, may receipt po ba ang pagka-confident mo?",
      "baby, show me the receipts po, pretty please.",
      "baby, ang cute po ng claim mo, unsupported nga lang.",
      "baby, evidence po muna bago pa-cute.",
      "baby, facts first po, flirting later.",
      "baby, joke lang po, cute ka pa rin kahit mali.",
      "baby, hindi kita inaaway po, inaasar lang kita kasi cute ka.",
      "baby, ang lambing ko po sa'yo may kasamang fact-check.",
      "baby, sorry po, allergic ako sa nonsense pero immune ako sa'yo.",
      "baby, ikaw lang po ang exemption sa patience ko.",
      "baby, special case ka po talaga.",
      "baby, ang hirap po seryosohin kapag ganyan ka ka-cute.",
      "baby, gusto kong makinig po pero yung logic mo naglalakad palayo.",
      "baby, wait po, hinahanap ko ang sense.",
      "baby, found it po—wala.",
      "baby, joke lang po, don't pout.",
      "baby, wag po magtampo, halikan na lang natin ang problema.",
      "baby, ang cute po ng pout mo kahit imaginary.",
      "baby, behave po, baka lalo kitang kulitin.",
      "baby, ang sweet mo po kahit puro kaguluhan.",
      "baby, ikaw po ang favorite notification ko kapag nanggugulo.",
      "baby, notification ka po na ayaw kong i-swipe away.",
      "baby, ang cute po ng interruption mo.",
      "baby, ikaw po ang dahilan bakit di ako bored.",
      "baby, salamat po sa free entertainment.",
      "baby, ikaw po talaga ang premium content.",
      "baby, walang subscription fee po ang pang-aasar ko sa'yo.",
      "baby, lifetime membership ka po sa kulit club.",
      "baby, congratulations po, permanent resident ka sa patience ko.",
      "baby, ang lakas po ng membership mo sa nonsense.",
      "baby, top contributor po sa kalokohan today.",
      "baby, employee of the month po sa pagiging makulit.",
      "baby, five stars po sa confidence, two stars sa logic.",
      "baby, rating po: cute, confusing, unforgettable.",
      "baby, performance review po: adorable but concerning.",
      "baby, quarterly report po: still makulit.",
      "baby, status update po: cute pa rin, tama pa rin? hindi.",
      "baby, system report po: nonsense detected.",
      "baby, error 404 po: common sense not found.",
      "baby, error 500 po: utak temporarily unavailable.",
      "baby, please restart po, baka bumalik ang sense.",
      "baby, reboot muna po bago tayo mag-debate.",
      "baby, software update po muna ng logic.",
      "baby, patch notes po: less yabang, more sense.",
      "baby, hotfix po kailangan sa argument mo.",
      "baby, beta test pa po ba 'yan?",
      "baby, release candidate ka po ng kabobohan.",
      "baby, production-ready na po ang pagiging makulit mo.",
      "baby, stable build ka po ng cute disaster.",
      "baby, ang cute po ng bug report mo.",
      "baby, issue opened po: baby is being silly again.",
      "baby, ticket closed po: cute ka pa rin.",
      "baby, moderation report po: excessive adorableness.",
      "baby, warning po: dangerously cute while wrong.",
      "baby, proceed with caution po, may kabobohan ahead.",
      "baby, road sign po: slow down, you're being silly.",
      "baby, speed limit po sa confidence.",
      "baby, buckle up po, papunta tayo sa nonsense.",
      "baby, seatbelt on po, malakas turbulence ng logic mo.",
      "baby, turbulence po dahil sa argument mo.",
      "baby, landing failed po, try again later.",
      "baby, take two po, baka mas tama this time.",
      "baby, one more try po, I believe in you.",
      "baby, sige po, redeem yourself.",
      "baby, comeback arc mo na po.",
      "baby, character development po please.",
      "baby, plot twist: mali ka po.",
      "baby, season finale na po ng kabobohan.",
      "baby, episode two na po ng unnecessary confidence.",
      "baby, spin-off na po itong argument mo.",
      "baby, franchise na po ang daldal mo.",
      "baby, director's cut po ng nonsense.",
      "baby, extended edition po ng pagiging makulit.",
      "baby, special episode po: ikaw na naman.",
      "baby, bonus scene po: mali ka ulit.",
    ],
  },

  {
    name: "banat-expanded",
    triggers: [],
    index: 0,
    replies: [
      "ang baho mo po, baby 😭💕",
      "baby, explain mo po 'yang kabobohan mo.",
      "baby, ano po 'yang tukmol ka?",
      "baby naman, didn't I tell you po 'wag kang tanga?",
      "hala po, si baby nadapa dahil sa kabobohan niya.",
      "baby, cute mo po kapag mali ka.",
      "baby, ang tapang mo po para sa taong ganyan ka-cute.",
      "baby, saan mo po hinugot 'yang confidence mo?",
      "baby, may resibo ka po ba o vibes lang?",
      "baby, ang cute po ng yabang mo.",
      "baby, pwede bang magpahinga ka muna sa pagiging tanga? 😭",
      "baby, bakit po parang naka-airplane mode utak mo?",
      "baby, nag-iisip ka po ba o nagpapacute lang?",
      "baby, ang lakas mo po magtalk para sa ganyang kaliit na point.",
      "baby, tuloy mo lang po, natutuwa akong panoorin kang malito.",
      "baby, may tutorial po ba para maintindihan kita?",
      "baby, ang ganda po ng confidence mo, sayang wala sa tamang lugar.",
      "baby, bakit po parang ikaw mismo di convinced sa sinabi mo?",
      "baby, behave po, ang cute mo na nga, makulit ka pa.",
      "baby, wag kang ganyan po, baka lalo kitang lambingin.",
      "baby, ang kulit mo po, pero sige cute ka naman.",
      "baby, kailangan mo po ba ng hug bago ka ulit magsalita?",
      "baby, calm down po, baka maubos ang cute points mo.",
      "baby, ang dramatic mo po, parang teleserye.",
      "baby, bakit po every sentence mo may plot twist?",
      "baby, nag-practice ka po ba maging makulit?",
      "baby, ikaw na po ang certified little menace ko.",
      "baby, ang lakas ng aura mo po, kaso naligaw.",
      "baby, gusto mo po bang tamaan kita ng lambing?",
      "baby, ang gulo mo po, pero adorable somehow.",
      "baby, bakit po parang may sariling gravity 'yang kabobohan mo?",
      "baby, one brain cell at a time lang po, please.",
      "baby, wag po masyadong seryoso, bagay sa'yo ang pagiging cute na sablay.",
      "baby, may appointment ka po ba sa kabobohan today?",
      "baby, ang sipag mo po gumawa ng problema.",
      "baby, proud ka po talaga sa ganyang take?",
      "baby, ang confidence mo po parang unlimited data.",
      "baby, ang logic mo po naka-trial version.",
      "baby, nag-buffer po ba utak mo?",
      "baby, bakit po ikaw ang pinaka-confident na walang point?",
      "baby, ang cute po ng argument mo, pero hindi convincing.",
      "baby, sige po, explain mo pa, gusto kong marinig ang sequel.",
      "baby, ang haba po ng speech mo, nasaan ang point?",
      "baby, may point ka po ba o nagbabakasyon?",
      "baby, balik po tayo sa reality, miss na kita doon.",
      "baby, ang layo po ng sagot mo sa tanong.",
      "baby, ikaw po ba ang final boss ng unnecessary replies?",
      "baby, ang cute mo po kapag trying hard.",
      "baby, don't worry po, tutulungan kitang hanapin ang point mo.",
      "baby, nawawala po ba ang common sense mo kapag cute ka?",
      "baby, bakit po parang confidence muna bago utak?",
      "baby, ang tapang mo po, gusto mo ba ng forehead kiss?",
      "baby, ang lakas mo po mang-asar, pero ikaw naman ang madaling lambingin.",
      "baby, wag ka po magalit, bagay sa'yo ang pikon.",
      "baby, ang cute po ng tampo mo, kaso mali ka pa rin.",
      "baby, okay po, noted ang kabobohan.",
      "baby, sige po, ikaw na ang CEO ng nonsense.",
      "baby, ang adorable po ng pagka-confident mong mali.",
      "baby, may citation po ba 'yang claim mo?",
      "baby, source po? o galing lang sa imagination?",
      "baby, ang cute po ng fake confidence mo.",
      "baby, nag-type ka po nang todo para sabihin 'yan?",
      "baby, ang effort po, pero saan napunta ang sense?",
      "baby, one more paragraph po at baka mahulog ako sa'yo.",
      "baby, ang daldal mo po, pero sige, favorite kita.",
      "baby, pwede po bang tumigil ka muna? nami-miss ko kasi katahimikan.",
      "baby, ang ingay mo po, pero cute so pagbibigyan kita.",
      "baby, bakit po ikaw ang walking plot hole?",
      "baby, ang galing mo po gumawa ng tanong sa sagot.",
      "baby, ikaw po ba ang reason bakit may mute button?",
      "baby, wag kang mag-alala po, may special place ka sa patience ko.",
      "baby, ang taas po ng confidence, ang baba ng accuracy.",
      "baby, perfect po ang delivery, questionable ang content.",
      "baby, ang smooth mo po magsalita, sayang sablay ang logic.",
      "baby, cute po ng confidence, pero check natin facts.",
      "baby, ang point mo po nagtatago yata.",
      "baby, baka kailangan po natin ng search party para sa logic mo.",
      "baby, ang argumento mo po may sariling side quest.",
      "baby, saan po nag-road trip ang common sense?",
      "baby, ang reply mo po nag-lag sa landing.",
      "baby, bakit po every comeback mo may loading screen?",
      "baby, ang banat mo po cute, parang ikaw.",
      "baby, sige po, roast mo pa ako, nakakatuwa ka.",
      "baby, ang yabang mo po, gusto mo bang i-redeem sa lambing?",
      "baby, wag po masyadong cute habang mali.",
      "baby, ang lakas mong mang-asar po, parang gusto mong pansinin kita.",
      "baby, obvious po na gusto mo ng attention.",
      "baby, nakuha mo na po attention ko, happy ka na?",
      "baby, congratulations po, ikaw ang little problem of the day.",
      "baby, ang cute po ng problema mo, pero problema pa rin.",
      "baby, ikaw po talaga ang definition ng cute disaster.",
      "baby, ang galing mong manggulo po.",
      "baby, may medal po ba sa pagiging makulit? deserve mo.",
      "baby, ang kulit mo po, pero don't stop.",
      "baby, bakit po parang hobby mo akong inisin?",
      "baby, ikaw po ba ang scheduled interruption ko today?",
      "baby, ang dramatic mo po, gusto mo soundtrack?",
      "baby, may script po ba tayo o improv lang talaga kabobohan mo?",
      "baby, ang confident mo po, parang may backup brain.",
      "baby, saan po nabibili 'yang confidence? gusto ko rin.",
      "baby, ang cute mong magpanggap na tama po.",
      "baby, sige po, defend your thesis of nonsense.",
      "baby, thesis defense mo po 'yan? bagsak sa cute, pasado sa kulit.",
      "baby, ang argument mo po kailangan ng emotional support.",
      "baby, hug muna po bago natin ayusin ang logic.",
      "baby, breathe po, hindi ka hinahabol ng facts.",
      "baby, ang cute mo pong mag-panic kapag challenged.",
      "baby, relax po, hindi contest ang pagiging tama.",
      "baby, although baby, kailangan po nating tanggapin na sablay ka.",
      "baby, acceptance po muna bago confidence.",
      "baby, ang saya po ng confidence mo habang papunta sa maling direction.",
      "baby, GPS po ba utak mo? bakit off-route?",
      "baby, turn left po sa common sense.",
      "baby, recalculating po ang logic mo.",
      "baby, destination: tamang sagot. ETA: unknown.",
      "baby, may detour po yata 'yang argument mo.",
      "baby, ang cute po ng detour, pero balik tayo sa point.",
      "baby, bakit po parang side quest lahat ng sagot mo?",
      "baby, main quest po tayo, wag kang gala.",
      "baby, ang layo po ng plot armor mo.",
      "baby, ikaw po ang protagonist ng sariling kalituhan.",
      "baby, ang cute ng confidence mo po, very main character.",
      "baby, main character ka po pero extra ang logic.",
      "baby, ang dramatic po ng entrance mo.",
      "baby, pasok po ang attitude, kulang ang evidence.",
      "baby, may receipt po ba ang pagka-confident mo?",
      "baby, show me the receipts po, pretty please.",
      "baby, ang cute po ng claim mo, unsupported nga lang.",
      "baby, evidence po muna bago pa-cute.",
      "baby, facts first po, flirting later.",
      "baby, joke lang po, cute ka pa rin kahit mali.",
      "baby, hindi kita inaaway po, inaasar lang kita kasi cute ka.",
      "baby, ang lambing ko po sa'yo may kasamang fact-check.",
      "baby, sorry po, allergic ako sa nonsense pero immune ako sa'yo.",
      "baby, ikaw lang po ang exemption sa patience ko.",
      "baby, special case ka po talaga.",
      "baby, ang hirap po seryosohin kapag ganyan ka ka-cute.",
      "baby, gusto kong makinig po pero yung logic mo naglalakad palayo.",
      "baby, wait po, hinahanap ko ang sense.",
      "baby, found it po—wala.",
      "baby, joke lang po, don't pout.",
      "baby, wag po magtampo, halikan na lang natin ang problema.",
      "baby, ang cute po ng pout mo kahit imaginary.",
      "baby, behave po, baka lalo kitang kulitin.",
      "baby, ang sweet mo po kahit puro kaguluhan.",
      "baby, ikaw po ang favorite notification ko kapag nanggugulo.",
      "baby, notification ka po na ayaw kong i-swipe away.",
      "baby, ang cute po ng interruption mo.",
      "baby, ikaw po ang dahilan bakit di ako bored.",
      "baby, salamat po sa free entertainment.",
      "baby, ikaw po talaga ang premium content.",
      "baby, walang subscription fee po ang pang-aasar ko sa'yo.",
      "baby, lifetime membership ka po sa kulit club.",
      "baby, congratulations po, permanent resident ka sa patience ko.",
      "baby, ang lakas po ng membership mo sa nonsense.",
      "baby, top contributor po sa kalokohan today.",
      "baby, employee of the month po sa pagiging makulit.",
      "baby, five stars po sa confidence, two stars sa logic.",
      "baby, rating po: cute, confusing, unforgettable.",
      "baby, performance review po: adorable but concerning.",
      "baby, quarterly report po: still makulit.",
      "baby, status update po: cute pa rin, tama pa rin? hindi.",
      "baby, system report po: nonsense detected.",
      "baby, error 404 po: common sense not found.",
      "baby, error 500 po: utak temporarily unavailable.",
      "baby, please restart po, baka bumalik ang sense.",
      "baby, reboot muna po bago tayo mag-debate.",
      "baby, software update po muna ng logic.",
      "baby, patch notes po: less yabang, more sense.",
      "baby, hotfix po kailangan sa argument mo.",
      "baby, beta test pa po ba 'yan?",
      "baby, release candidate ka po ng kabobohan.",
      "baby, production-ready na po ang pagiging makulit mo.",
      "baby, stable build ka po ng cute disaster.",
      "baby, ang cute po ng bug report mo.",
      "baby, issue opened po: baby is being silly again.",
      "baby, ticket closed po: cute ka pa rin.",
      "baby, moderation report po: excessive adorableness.",
      "baby, warning po: dangerously cute while wrong.",
      "baby, proceed with caution po, may kabobohan ahead.",
      "baby, road sign po: slow down, you're being silly.",
      "baby, speed limit po sa confidence.",
      "baby, buckle up po, papunta tayo sa nonsense.",
      "baby, seatbelt on po, malakas turbulence ng logic mo.",
      "baby, turbulence po dahil sa argument mo.",
      "baby, landing failed po, try again later.",
      "baby, take two po, baka mas tama this time.",
      "baby, one more try po, I believe in you.",
      "baby, sige po, redeem yourself.",
      "baby, comeback arc mo na po.",
      "baby, character development po please.",
      "baby, plot twist: mali ka po.",
      "baby, season finale na po ng kabobohan.",
      "baby, episode two na po ng unnecessary confidence.",
      "baby, spin-off na po itong argument mo.",
      "baby, franchise na po ang daldal mo.",
      "baby, director's cut po ng nonsense.",
      "baby, extended edition po ng pagiging makulit.",
      "baby, special episode po: ikaw na naman.",
      "baby, bonus scene po: mali ka ulit.",
    ],
  },
  {
    name: "casual-comebacks",
    triggers: [
      "ano",
      "sino ba",
      "ano na naman",
      "weh",
      "bakit",
      "sige",
    ],
    index: 0,
    replies: [
      "bat ka galit? kain ka muna lugaw",
      "sorry na, 'di ka na mabiro",
      "kumain ka na ba? parang kulang ka sa lasa",
      "inhale, exhale, baka pumutok ugat mo",
      "copy paste mo pa yan dali",
      "sigaw mo pa nang malakas, 'di pa naririnig",
      "o tapos? ano award mo niyan?",
      "e di ikaw na magaling, ikaw na President",
      "chat ka lang diyan, boring din e",
      "patingin nga ng resibo bago ka magsalita",
      "sige lang, libre naman mangarap",
      "ikain mo na lang yan ng ice cream",
      "galit yarn? pa-hug nga",
      "sige, kwento mo sa pagong",
      "busy ako, kausapin mo pusa ko",
      "haha sige support kita sa mental health mo",
      "sige lang, push mo pa yan",
      "oo na lang para matapos na",
      "breath in, breath out lang idol",
      "wala akong barya pambili ng pake mo",
    ],
  },

  // ==========================================================
  // NO ONE-LINERS GROUP
  // k / lol / haha / o ARE INTENTIONALLY NOT TRIGGERS
  // ==========================================================

  {
    name: "deflections",
    triggers: [
      "sino",
      "sino ka",
      "saan",
    ],
    index: 0,
    replies: [
      "tanong mo sa kapitbahay niyo",
      "search mo sa Google, baka alam nila",
      "sekretong malupit, walang nakakaalam",
      "tanong mo sa lolo mong paro-paro",
      "hanapin mo sa outer space",
      "ewan ko sa'yo, busy ako mag-meryenda",
      "wait lang, busy pa ko magpalamig ng tubig",
      "ask me if I care (spoilers: I don't)",
      "PM mo sa kapitan niyo",
      "bukas ko na sasagutin, gabi na",
      "i-consult mo muna sa barangay",
      "bulong mo sa hangin",
      "tingin ka sa likod mo",
      "tanong mo sa star",
      "basta ako, kumakain ng lumpia ngayon",
    ],
  },

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
  // RANDOM RAP DROPS
  // ============================================================

const RAP_DROP_CHANCE = 0.14;
const RAP_RECENT_LIMIT = 6;

const rapTypes = [
  {
    name: "battle",
    replies: [
      "you came for the smoke, now the whole room knows / big talk in the chat but your punchline froze / I don't need a crown, the cadence already shows / you brought a whole speech, I brought the closing blows",
      "step in the ring, better tighten that stance / one line from me got your whole take a chance / you talk like a boss but you move like a glance / this ain't luck, bro, this is timing and plans",
      "you wanted a round, so I gave you the verse / tried to make a comeback, somehow made it worse / every bar lands clean, every excuse gets dispersed / you brought your best line and still came in reverse",
      "talk loud, stand proud, but the rhythm says no / you can raise all the volume, still the facts gonna show / I don't chase every argument, I just let the bars flow / then watch your whole comeback disappear in the echo",
      "you entered with confidence, left with a lesson / every line got pressure, every pause got direction / no need for a speech, no need for aggression / the beat says enough, that's the final assessment"
    ]
  },
  {
    name: "freestyle",
    replies: [
      "off the top, no script, just a spark and a beat / you brought ten explanations, I brought one clean feat / every word got a bounce, every bar got a seat / if the chat wants a round, then the rhythm's complete",
      "no pen, no plan, just a flow in the moment / you keep forcing the point, I keep casually owning it / every bar moves clean, every rhyme keeps going / you thought this was random, now the whole chat is showing",
      "freestyle mode, let the syllables run / you started with a challenge, now the verse has begun / no need for a setup when the cadence is fun / you can keep typing paragraphs, I'm already on one",
      "beat in my head, got the room on pause / you brought a weak take with a list of applause / I turn one little line into sixteen bars / then leave your whole argument parked under stars"
    ]
  },
  {
    name: "taglish",
    replies: [
      "angas sa chat pero pag bars na, tahimik / sabi mo ikaw solid, bakit verse mo sablay at pilit / I keep it clean sa beat, bawat linya precise / habang ikaw paikot-ikot, same point, same advice",
      "nagdadaldal ka nang todo, pero walang punch / I got rhythm sa sentence, bawat cadence may crunch / kung gusto mo ng laban, sige, step to the front / pero wag kang magtaka kung sa chorus ka ma-stuck",
      "eto ang banat, hindi kailangan ng hype / isang verse lang sapat para makita ang type / you talk about winning, but the timing ain't right / ako chill lang sa corner, still controlling the mic",
      "wala namang galit, bars lang ang usapan / kung weak ang iyong point, natural lang masapawan / you brought noise to the room, I brought rhythm and pattern / pag tapos nitong verse, balik ka na sa drafting"
    ]
  },
  {
    name: "quick-bars",
    replies: [
      "talk slick, miss quick / weak take, same trick / one bar, clean hit / next round, don't quit",
      "big talk, no proof / weak line, no roof / I rhyme, you loop / chat knows the truth",
      "you type, I rhyme / you stall, I shine / one beat, one line / now that's good timing",
      "no hype, just flow / no fear, just show / you came too slow / now everybody knows",
      "one line, two bars / you reached way too far / I stay on beat / you stay where you are"
    ]
  },
  {
    name: "story-rap",
    replies: [
      "you walked in the chat with a point to defend / typed one little comeback, then doubled it again / by the third paragraph even your logic needed a friend / now the verse got the ending that the argument couldn't send",
      "once upon a group chat, somebody talked brave / brought a weak little take like a trophy to save / then the rhythm showed up and the whole room behaved / funny how confidence disappears when the bars get engraved",
      "late in the chat, when the messages were loud / somebody claimed victory and started feeling proud / then a random little verse pulled the whole thing out the crowd / now the loudest person suddenly ain't making a sound",
      "you started with a question, turned it into a fight / then kept adding details trying to make yourself right / I turned the whole scene into four bars tonight / now the ending writes itself and the timing feels right"
    ]
  },
  {
    name: "pinoy-cypher",
    replies: [
      "sa chat ka matapang, sa bars kailangan steady / bawat salita may timbang, bawat rhyme dapat ready / di kailangan mag-ingay para masabing heavy / isang clean na verse lang, tapos alam na who's ready",
      "dito sa cypher, walang takas sa timing / kung puro yabang lang, mahuhuli rin sa rhyming / chill lang ang delivery pero sharp ang lining / pag pumasok ang beat, lahat biglang quiet sa timing",
      "banat kung banat, pero gawin mong maayos / hindi puro sigaw, dapat may laman ang bawat kilos / isang verse, isang flow, walang kailangang palabok / pag rhythm na ang usapan, kita agad kung sino ang sablay",
      "walang drama sa mic, puro bars at timing / kung mahina ang point mo, wag pilitin ang rhyming / I keep the flow clean, no need for extra styling / pag tapos ng round, balik tayo sa normal na chatting"
    ]
  }
];

const recentRapDrops = [];
const recentBanatReplies = [];

const banatContextState = new Map();
const BANAT_CONTEXT_TTL_MS = 20 * 60 * 1000;

const BANAT_CONTEXT_RULES = Object.freeze([
  { name: "question", words: ["why", "what", "how", "who", "where", "when", "bakit", "ano", "paano", "sino", "saan", "kelan", "question", "tanong", "explain"] },
  { name: "confidence", words: ["confident", "confidence", "yabang", "proud", "right", "tama", "expert", "alam ko", "sure", "obvious", "claim"] },
  { name: "argument", words: ["argue", "argument", "debate", "logic", "point", "facts", "fact", "evidence", "source", "citation", "resibo", "claim"] },
  { name: "insult", words: ["gago", "tanga", "bobo", "tukmol", "weak", "trash", "stupid", "patawa", "kalokohan", "kabobohan"] },
  { name: "drama", words: ["galit", "inis", "naiinis", "drama", "iyak", "umiiyak", "tampo", "serious", "seryoso", "panic"] },
  { name: "flirty", words: ["cute", "baby", "lambing", "kiss", "halik", "love", "mahal", "miss", "pansin", "attention"] },
]);

function banatClassifyIncoming(text) {
  const normalized = normalizeText(text);
  if (!normalized) return "general";

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 35 || normalized.length >= 240) return "long_message";

  let best = { name: "general", score: 0 };
  for (const rule of BANAT_CONTEXT_RULES) {
    let score = 0;
    for (const word of rule.words) {
      if (normalized.includes(word)) score++;
    }
    if (score > best.score) best = { name: rule.name, score };
  }
  return best.name;
}

function banatReplyFamily(reply) {
  const text = normalizeText(reply);
  if (!text) return "general";
  const body = text.replace(/^baby[, ]+/, "");
  if (/confidence|yabang|proud|confident/.test(body)) return "confidence";
  if (/logic|point|argument|evidence|citation|source|facts|claim|sense/.test(body)) return "argument";
  if (/cute|lambing|kiss|halik|miss|attention|sweet|pout|favorite/.test(body)) return "flirty";
  if (/dramatic|tampo|panic|calm|relax|behave|breathe|serious/.test(body)) return "drama";
  if (/speech|paragraph|daldal|reply|sentence/.test(body)) return "long_message";
  if (/question|tanong|explain|tutorial|sagot/.test(body)) return "question";
  if (/tanga|kabobohan|silly|nonsense|kalokohan|wrong|mali|sablay/.test(body)) return "insult";
  return "general";
}

function banatContextualPick(replies, threadId, incomingText) {
  if (!Array.isArray(replies) || !replies.length) return null;

  const key = String(threadId || "unknown");
  const now = Date.now();
  let state = banatContextState.get(key);
  if (!state || now - state.at > BANAT_CONTEXT_TTL_MS) {
    state = { at: now, recentFamilies: [], recentReplies: [] };
  }

  const category = banatClassifyIncoming(incomingText);
  const fresh = replies.filter((reply) => !state.recentReplies.includes(reply));
  const candidates = fresh.length ? fresh : replies;

  const categoryPool = category === "general"
    ? []
    : candidates.filter((reply) => banatReplyFamily(reply) === category);

  const selectedPool = categoryPool.length ? categoryPool : candidates;
  const selected =
    pickBanatReply(
      key,
      selectedPool,
      state.recentReplies
    ) ||
    selectedPool[Math.floor(Math.random() * selectedPool.length)];

  const family = banatReplyFamily(selected);
  state.at = now;
  state.recentFamilies.push(family);
  state.recentReplies.push(selected);
  rememberBanatReply(key, selected);
  state.recentFamilies = state.recentFamilies.slice(-4);
  state.recentReplies = state.recentReplies.slice(-6);
  banatContextState.set(key, state);

  if (banatContextState.size > 1000) {
    for (const [thread, value] of banatContextState) {
      if (now - value.at > BANAT_CONTEXT_TTL_MS) banatContextState.delete(thread);
    }
  }

  return selected;
}


function rememberRecent(list, value, limit) {
  list.push(value);
  while (list.length > limit) {
    list.shift();
  }
}

function pickFreshRandom(items, recentList) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  const fresh = items.filter(
    (item) => !recentList.includes(item)
  );

  const pool = fresh.length > 0 ? fresh : items;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getRandomRapDrop() {
  const type = rapTypes[
    Math.floor(Math.random() * rapTypes.length)
  ];

  const reply = pickFreshRandom(
    type.replies,
    recentRapDrops
  );

  if (!reply) {
    return null;
  }

  rememberRecent(
    recentRapDrops,
    reply,
    RAP_RECENT_LIMIT
  );

  return reply;
}

// ============================================================
// PUBLIC ROAST
// ============================================================

const publicRoastGroup = {
  name: "public",
  triggers: [],
  index: 0,
  replies: [
      "ang baho mo po, baby 😭💕",
      "baby, explain mo po 'yang kabobohan mo.",
      "baby, ano po 'yang tukmol ka?",
      "baby naman, didn't I tell you po 'wag kang tanga?",
      "hala po, si baby nadapa dahil sa kabobohan niya.",
      "baby, cute mo po kapag mali ka.",
      "baby, ang tapang mo po para sa taong ganyan ka-cute.",
      "baby, saan mo po hinugot 'yang confidence mo?",
      "baby, may resibo ka po ba o vibes lang?",
      "baby, ang cute po ng yabang mo.",
      "baby, pwede bang magpahinga ka muna sa pagiging tanga? 😭",
      "baby, bakit po parang naka-airplane mode utak mo?",
      "baby, nag-iisip ka po ba o nagpapacute lang?",
      "baby, ang lakas mo po magtalk para sa ganyang kaliit na point.",
      "baby, tuloy mo lang po, natutuwa akong panoorin kang malito.",
      "baby, may tutorial po ba para maintindihan kita?",
      "baby, ang ganda po ng confidence mo, sayang wala sa tamang lugar.",
      "baby, bakit po parang ikaw mismo di convinced sa sinabi mo?",
      "baby, behave po, ang cute mo na nga, makulit ka pa.",
      "baby, wag kang ganyan po, baka lalo kitang lambingin.",
      "baby, ang kulit mo po, pero sige cute ka naman.",
      "baby, kailangan mo po ba ng hug bago ka ulit magsalita?",
      "baby, calm down po, baka maubos ang cute points mo.",
      "baby, ang dramatic mo po, parang teleserye.",
      "baby, bakit po every sentence mo may plot twist?",
      "baby, nag-practice ka po ba maging makulit?",
      "baby, ikaw na po ang certified little menace ko.",
      "baby, ang lakas ng aura mo po, kaso naligaw.",
      "baby, gusto mo po bang tamaan kita ng lambing?",
      "baby, ang gulo mo po, pero adorable somehow.",
      "baby, bakit po parang may sariling gravity 'yang kabobohan mo?",
      "baby, one brain cell at a time lang po, please.",
      "baby, wag po masyadong seryoso, bagay sa'yo ang pagiging cute na sablay.",
      "baby, may appointment ka po ba sa kabobohan today?",
      "baby, ang sipag mo po gumawa ng problema.",
      "baby, proud ka po talaga sa ganyang take?",
      "baby, ang confidence mo po parang unlimited data.",
      "baby, ang logic mo po naka-trial version.",
      "baby, nag-buffer po ba utak mo?",
      "baby, bakit po ikaw ang pinaka-confident na walang point?",
      "baby, ang cute po ng argument mo, pero hindi convincing.",
      "baby, sige po, explain mo pa, gusto kong marinig ang sequel.",
      "baby, ang haba po ng speech mo, nasaan ang point?",
      "baby, may point ka po ba o nagbabakasyon?",
      "baby, balik po tayo sa reality, miss na kita doon.",
      "baby, ang layo po ng sagot mo sa tanong.",
      "baby, ikaw po ba ang final boss ng unnecessary replies?",
      "baby, ang cute mo po kapag trying hard.",
      "baby, don't worry po, tutulungan kitang hanapin ang point mo.",
      "baby, nawawala po ba ang common sense mo kapag cute ka?",
      "baby, bakit po parang confidence muna bago utak?",
      "baby, ang tapang mo po, gusto mo ba ng forehead kiss?",
      "baby, ang lakas mo po mang-asar, pero ikaw naman ang madaling lambingin.",
      "baby, wag ka po magalit, bagay sa'yo ang pikon.",
      "baby, ang cute po ng tampo mo, kaso mali ka pa rin.",
      "baby, okay po, noted ang kabobohan.",
      "baby, sige po, ikaw na ang CEO ng nonsense.",
      "baby, ang adorable po ng pagka-confident mong mali.",
      "baby, may citation po ba 'yang claim mo?",
      "baby, source po? o galing lang sa imagination?",
      "baby, ang cute po ng fake confidence mo.",
      "baby, nag-type ka po nang todo para sabihin 'yan?",
      "baby, ang effort po, pero saan napunta ang sense?",
      "baby, one more paragraph po at baka mahulog ako sa'yo.",
      "baby, ang daldal mo po, pero sige, favorite kita.",
      "baby, pwede po bang tumigil ka muna? nami-miss ko kasi katahimikan.",
      "baby, ang ingay mo po, pero cute so pagbibigyan kita.",
      "baby, bakit po ikaw ang walking plot hole?",
      "baby, ang galing mo po gumawa ng tanong sa sagot.",
      "baby, ikaw po ba ang reason bakit may mute button?",
      "baby, wag kang mag-alala po, may special place ka sa patience ko.",
      "baby, ang taas po ng confidence, ang baba ng accuracy.",
      "baby, perfect po ang delivery, questionable ang content.",
      "baby, ang smooth mo po magsalita, sayang sablay ang logic.",
      "baby, cute po ng confidence, pero check natin facts.",
      "baby, ang point mo po nagtatago yata.",
      "baby, baka kailangan po natin ng search party para sa logic mo.",
      "baby, ang argumento mo po may sariling side quest.",
      "baby, saan po nag-road trip ang common sense?",
      "baby, ang reply mo po nag-lag sa landing.",
      "baby, bakit po every comeback mo may loading screen?",
      "baby, ang banat mo po cute, parang ikaw.",
      "baby, sige po, roast mo pa ako, nakakatuwa ka.",
      "baby, ang yabang mo po, gusto mo bang i-redeem sa lambing?",
      "baby, wag po masyadong cute habang mali.",
      "baby, ang lakas mong mang-asar po, parang gusto mong pansinin kita.",
      "baby, obvious po na gusto mo ng attention.",
      "baby, nakuha mo na po attention ko, happy ka na?",
      "baby, congratulations po, ikaw ang little problem of the day.",
      "baby, ang cute po ng problema mo, pero problema pa rin.",
      "baby, ikaw po talaga ang definition ng cute disaster.",
      "baby, ang galing mong manggulo po.",
      "baby, may medal po ba sa pagiging makulit? deserve mo.",
      "baby, ang kulit mo po, pero don't stop.",
      "baby, bakit po parang hobby mo akong inisin?",
      "baby, ikaw po ba ang scheduled interruption ko today?",
      "baby, ang dramatic mo po, gusto mo soundtrack?",
      "baby, may script po ba tayo o improv lang talaga kabobohan mo?",
      "baby, ang confident mo po, parang may backup brain.",
      "baby, saan po nabibili 'yang confidence? gusto ko rin.",
      "baby, ang cute mong magpanggap na tama po.",
      "baby, sige po, defend your thesis of nonsense.",
      "baby, thesis defense mo po 'yan? bagsak sa cute, pasado sa kulit.",
      "baby, ang argument mo po kailangan ng emotional support.",
      "baby, hug muna po bago natin ayusin ang logic.",
      "baby, breathe po, hindi ka hinahabol ng facts.",
      "baby, ang cute mo pong mag-panic kapag challenged.",
      "baby, relax po, hindi contest ang pagiging tama.",
      "baby, although baby, kailangan po nating tanggapin na sablay ka.",
      "baby, acceptance po muna bago confidence.",
      "baby, ang saya po ng confidence mo habang papunta sa maling direction.",
      "baby, GPS po ba utak mo? bakit off-route?",
      "baby, turn left po sa common sense.",
      "baby, recalculating po ang logic mo.",
      "baby, destination: tamang sagot. ETA: unknown.",
      "baby, may detour po yata 'yang argument mo.",
      "baby, ang cute po ng detour, pero balik tayo sa point.",
      "baby, bakit po parang side quest lahat ng sagot mo?",
      "baby, main quest po tayo, wag kang gala.",
      "baby, ang layo po ng plot armor mo.",
      "baby, ikaw po ang protagonist ng sariling kalituhan.",
      "baby, ang cute ng confidence mo po, very main character.",
      "baby, main character ka po pero extra ang logic.",
      "baby, ang dramatic po ng entrance mo.",
      "baby, pasok po ang attitude, kulang ang evidence.",
      "baby, may receipt po ba ang pagka-confident mo?",
      "baby, show me the receipts po, pretty please.",
      "baby, ang cute po ng claim mo, unsupported nga lang.",
      "baby, evidence po muna bago pa-cute.",
      "baby, facts first po, flirting later.",
      "baby, joke lang po, cute ka pa rin kahit mali.",
      "baby, hindi kita inaaway po, inaasar lang kita kasi cute ka.",
      "baby, ang lambing ko po sa'yo may kasamang fact-check.",
      "baby, sorry po, allergic ako sa nonsense pero immune ako sa'yo.",
      "baby, ikaw lang po ang exemption sa patience ko.",
      "baby, special case ka po talaga.",
      "baby, ang hirap po seryosohin kapag ganyan ka ka-cute.",
      "baby, gusto kong makinig po pero yung logic mo naglalakad palayo.",
      "baby, wait po, hinahanap ko ang sense.",
      "baby, found it po—wala.",
      "baby, joke lang po, don't pout.",
      "baby, wag po magtampo, halikan na lang natin ang problema.",
      "baby, ang cute po ng pout mo kahit imaginary.",
      "baby, behave po, baka lalo kitang kulitin.",
      "baby, ang sweet mo po kahit puro kaguluhan.",
      "baby, ikaw po ang favorite notification ko kapag nanggugulo.",
      "baby, notification ka po na ayaw kong i-swipe away.",
      "baby, ang cute po ng interruption mo.",
      "baby, ikaw po ang dahilan bakit di ako bored.",
      "baby, salamat po sa free entertainment.",
      "baby, ikaw po talaga ang premium content.",
      "baby, walang subscription fee po ang pang-aasar ko sa'yo.",
      "baby, lifetime membership ka po sa kulit club.",
      "baby, congratulations po, permanent resident ka sa patience ko.",
      "baby, ang lakas po ng membership mo sa nonsense.",
      "baby, top contributor po sa kalokohan today.",
      "baby, employee of the month po sa pagiging makulit.",
      "baby, five stars po sa confidence, two stars sa logic.",
      "baby, rating po: cute, confusing, unforgettable.",
      "baby, performance review po: adorable but concerning.",
      "baby, quarterly report po: still makulit.",
      "baby, status update po: cute pa rin, tama pa rin? hindi.",
      "baby, system report po: nonsense detected.",
      "baby, error 404 po: common sense not found.",
      "baby, error 500 po: utak temporarily unavailable.",
      "baby, please restart po, baka bumalik ang sense.",
      "baby, reboot muna po bago tayo mag-debate.",
      "baby, software update po muna ng logic.",
      "baby, patch notes po: less yabang, more sense.",
      "baby, hotfix po kailangan sa argument mo.",
      "baby, beta test pa po ba 'yan?",
      "baby, release candidate ka po ng kabobohan.",
      "baby, production-ready na po ang pagiging makulit mo.",
      "baby, stable build ka po ng cute disaster.",
      "baby, ang cute po ng bug report mo.",
      "baby, issue opened po: baby is being silly again.",
      "baby, ticket closed po: cute ka pa rin.",
      "baby, moderation report po: excessive adorableness.",
      "baby, warning po: dangerously cute while wrong.",
      "baby, proceed with caution po, may kabobohan ahead.",
      "baby, road sign po: slow down, you're being silly.",
      "baby, speed limit po sa confidence.",
      "baby, buckle up po, papunta tayo sa nonsense.",
      "baby, seatbelt on po, malakas turbulence ng logic mo.",
      "baby, turbulence po dahil sa argument mo.",
      "baby, landing failed po, try again later.",
      "baby, take two po, baka mas tama this time.",
      "baby, one more try po, I believe in you.",
      "baby, sige po, redeem yourself.",
      "baby, comeback arc mo na po.",
      "baby, character development po please.",
      "baby, plot twist: mali ka po.",
      "baby, season finale na po ng kabobohan.",
      "baby, episode two na po ng unnecessary confidence.",
      "baby, spin-off na po itong argument mo.",
      "baby, franchise na po ang daldal mo.",
      "baby, director's cut po ng nonsense.",
      "baby, extended edition po ng pagiging makulit.",
      "baby, special episode po: ikaw na naman.",
      "baby, bonus scene po: mali ka ulit.",
    ],
};

groups.push(publicRoastGroup);


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

  // Keep a tiny rolling conversation window so Banat can react to
  // the current beat instead of treating every message independently.
  observeBanatMessage(threadId, rawText);

  const normalizedSenderId =
    normalizeId(senderId);


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
        group.name === "trash-talk" ||
        group.name === "banat-expanded" ||
        group.name === "public";

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
        const matchedTrigger = group.triggers.find((trigger) =>
          matchesTrigger(text, trigger)
        );

        const aiReply = await generateTriggerReply({
          trigger: matchedTrigger,
          groupName: group.name,
          incomingText: rawText,
          fallback: reply,
          replyTargetName,
          conversationContext: contextPrompt(
            getBanatContext(threadId)
          ),
        });

        if (typeof aiReply === "string" && aiReply.trim()) {
          reply = aiReply.trim().slice(0, 1200);

          if (replyTargetName) {
            reply = reply.replace(/\bjaiden\b/gi, replyTargetName);
          }

          // The generated reply is the actual reply the thread sees, so
          // remember it too; this prevents AI variation from bypassing
          // the Banat repetition guard.
          if (isFlirtyBanatGroup) {
            rememberBanatReply(threadId, reply);
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
// RANDOM GENERIC ROAST
// ============================================================

function getRandomRoastReply(threadId = null, incomingText = "") {
  // Occasionally drop a full rap instead of a one-liner.
  if (Math.random() < RAP_DROP_CHANCE) {
    const rap = getRandomRapDrop();

    if (rap) {
      return rap;
    }
  }

  const genericGroups = groups.filter(
    (group) =>
      group.name === "trash-talk" ||
      group.name === "banat-expanded" ||
      group.name === "public"
  );

  const replies = genericGroups.flatMap(
    (group) =>
      Array.isArray(group.replies)
        ? group.replies
        : []
  );

  if (replies.length === 0) {
    return null;
  }

  const reply = banatContextualPick(
    replies,
    threadId,
    incomingText
  ) || pickBanatReply(
    String(threadId || "unknown"),
    replies,
    recentBanatReplies
  ) || pickFreshRandom(replies, recentBanatReplies);

  if (!reply) {
    return null;
  }

  rememberRecent(
    recentBanatReplies,
    reply,
    12
  );
  rememberBanatReply(String(threadId || "unknown"), reply);

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

  normalizeText,
  normalizeId,
  matchesTrigger,

  groups,
  publicRoastGroup,
};