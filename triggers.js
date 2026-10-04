const { generateTriggerReply } = require("./ai/provider");
const { isPrimaryUser } = require("./ai/access");
const { rememberBanatReply, pickBanatReply } = require("./banat-memory");

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
// BANAT REPLY DIVERSITY
// ============================================================
// Rap/cypher drops were intentionally removed. Banat now stays in its
// normal conversational voice and focuses on the full one-liner pool.
//
// The pool is de-duplicated before selection because "trash-talk" and
// "banat-expanded" contain overlapping material. That was making a large
// list behave like a much smaller list in practice.
// ============================================================

const BANAT_RECENT_LIMIT = Math.max(
  20,
  Math.min(60, Number(process.env.ECLIPSE_BANAT_RECENT_LIMIT || 36))
);

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
  const recent = banatContextState.get(key)?.recentReplies || [];

  // Prefer replies that are not only unseen, but also materially longer or
  // structurally different from the last few responses. This makes the bot
  // actually explore the large pool instead of living in its shortest,
  // safest-looking answers.
  const unseen = pool.filter((reply) => !recent.includes(reply));
  const source = unseen.length ? unseen : pool;

  const recentWords = recent
    .slice(-6)
    .map((reply) => new Set(String(reply).toLowerCase().split(/\s+/).filter(Boolean)));

  const scored = source.map((reply) => {
    const words = String(reply).split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const normalized = String(reply).toLowerCase();
    let score = Math.min(12, wordCount / 4);

    // Penalize replies that share too much vocabulary with recent replies.
    for (const prior of recentWords) {
      const overlap = words.reduce(
        (count, word) => count + (prior.has(word.toLowerCase()) ? 1 : 0),
        0
      );
      score -= Math.min(4, overlap * 0.35);
    }

    // Small boost for substantial replies; do not make every answer huge.
    if (wordCount >= 10) score += 1.5;
    if (wordCount >= 18) score += 1;
    if (wordCount <= 3) score -= 1.5;

    // Tiny randomness prevents a deterministic "longest first" cycle.
    score += Math.random() * 2.5;

    return { reply, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Choose from the top band rather than always taking #1.
  const band = scored.slice(0, Math.min(7, scored.length));
  return band[Math.floor(Math.random() * band.length)].reply;
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
        const matchedTrigger = group.triggers.find((trigger) =>
          matchesTrigger(text, trigger)
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

function getRandomRoastReply(threadId = null, incomingText = "", senderId = null) {
  const genericGroups = groups.filter(
    (group) =>
      group.name === "trash-talk" ||
      group.name === "banat-expanded" ||
      group.name === "public"
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
  rememberBanatReply(String(threadId || "unknown"), styledReply);

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

  rememberBanatReply(String(threadId || "unknown"), reply);

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