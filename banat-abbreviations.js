"use strict";

/**
 * ECLIPSE Banat Abbreviation / Texting Dictionary
 * ================================================
 *
 * This is intentionally kept separate from index.js so the Banat
 * humanizer can grow without turning the main bot file into a
 * giant slang dictionary.
 *
 * The pool is matched against words/phrases that actually occur in
 * ECLIPSE's trigger/reply language. Replacements are probabilistic;
 * humanApplyShorthand() chooses at most ONE replacement per message.
 *
 * Categories:
 * - core: very common texting shorthand
 * - casual: informal/internet shorthand
 * - reaction: short reaction phrases
 * - slang: semantic chat-style substitutions (used sparingly)
 *
 * Do not turn every word into shorthand. The humanizer decides when
 * a replacement happens, so normal replies remain normal most of the time.
 */

const BANAT_SHORTHANDS = Object.freeze({
  // ----------------------------------------------------------
  // CORE / VERY COMMON
  // ----------------------------------------------------------

  "you are": ["u r"],
  "you’re": ["ur"],
  "you're": ["ur"],
  "you": ["u"],
  "your": ["ur"],
  "are": ["r"],
  "because": ["bc", "cuz"],
  "though": ["tho"],
  "right now": ["rn"],
  "probably": ["prob", "probs"],
  "something": ["smth"],
  "someone": ["s1"],
  "somebody": ["sb"],
  "about": ["abt"],
  "really": ["rly", "rlly"],
  "just": ["js", "jus"],
  "please": ["pls", "plz"],
  "people": ["ppl"],
  "message": ["msg"],
  "messages": ["msgs"],
  "tomorrow": ["tmr", "tmrw"],
  "tonight": ["tn"],
  "today": ["tdy"],
  "before": ["b4"],
  "without": ["w/o"],
  "with": ["w/"],
  "what": ["wat"],
  "why": ["y"],
  "okay": ["ok", "k"],
  "please": ["pls", "plz"],
  "thanks": ["thx", "ty"],
  "thank you": ["ty"],
  "no problem": ["np"],
  "of course": ["ofc"],
  "never mind": ["nvm"],
  "for real": ["fr"],
  "not gonna lie": ["ngl"],
  "to be honest": ["tbh"],
  "by the way": ["btw"],
  "I don't know": ["idk"],
  "i don't know": ["idk"],
  "I don't care": ["idc"],
  "i don't care": ["idc"],

  // ----------------------------------------------------------
  // COMMON INTERNET / CHAT
  // ----------------------------------------------------------

  "what are you doing": ["wyd"],
  "what do you mean": ["wdym"],
  "what about you": ["wbu"],
  "where are you": ["wya"],
  "where you at": ["wya"],
  "on my way": ["omw"],
  "hit me up": ["hmu"],
  "let me know": ["lmk"],
  "I know, right": ["ikr"],
  "i know, right": ["ikr"],
  "oh my god": ["omg"],
  "shaking my head": ["smh"],
  "I swear to god": ["istg"],
  "i swear to god": ["istg"],
  "on god": ["ong"],
  "if you know you know": ["iykyk"],
  "as soon as possible": ["asap"],
  "for your information": ["fyi"],
  "in my opinion": ["imo"],
  "in my humble opinion": ["imho"],
  "in real life": ["irl"],
  "too long didn't read": ["tldr"],
  "not gonna lie": ["ngl"],
  "just kidding": ["jk"],
  "just joking": ["jj"],
  "be right back": ["brb"],
  "got to go": ["gtg"],
  "gotta go": ["gtg"],
  "good game": ["gg"],
  "good luck": ["gl"],
  "have fun": ["hf"],
  "welcome back": ["wb"],
  "what's up": ["sup", "wsup"],
  "what is up": ["sup", "wsup"],

  // ----------------------------------------------------------
  // WORDS THAT FIT THE EXISTING BANAT REPLY LANGUAGE
  // ----------------------------------------------------------

  "baby": ["bby"],
  "babies": ["bbys"],
  "brother": ["bro"],
  "brothers": ["bros"],
  "sister": ["sis"],
  "sisters": ["sisses"],
  "friend": ["fr"],
  "friends": ["frs"],
  "favorite": ["fav"],
  "information": ["info"],
  "conversation": ["convo"],
  "conversations": ["convos"],
  "argument": ["arg"],
  "arguments": ["args"],
  "opinion": ["op"],
  "opinions": ["ops"],
  "question": ["q"],
  "questions": ["qs"],
  "reply": ["rply"],
  "replies": ["rplys"],
  "picture": ["pic"],
  "pictures": ["pics"],
  "video": ["vid"],
  "videos": ["vids"],
  "notification": ["notif"],
  "notifications": ["notifs"],
  "common sense": ["cs"],
  "confidence": ["conf"],
  "attention": ["attn"],
  "problem": ["prob"],
  "problems": ["probs"],
  "favorite notification": ["fav notif"],
  "little": ["lil"],
  "really": ["rly", "rlly"],
  "because": ["bc", "cuz"],
  "without": ["w/o"],
  "something": ["smth"],
  "nothing": ["nthn"],
  "anything": ["anythn"],
  "everything": ["evrythn"],
  "everyone": ["evryone", "every1"],
  "everybody": ["every1"],
  "someone": ["s1"],
  "anyone": ["any1"],
  "everyone": ["every1"],

  // ----------------------------------------------------------
  // REACTION / SHORT CHAT PHRASES
  // ----------------------------------------------------------

  "I don't care": ["idc"],
  "i don't care": ["idc"],
  "I don't know": ["idk"],
  "i don't know": ["idk"],
  "I know": ["ik"],
  "i know": ["ik"],
  "I think": ["imo", "i think"],
  "I swear": ["istg"],
  "for real": ["fr"],
  "really": ["rly", "rlly"],
  "right now": ["rn"],
  "of course": ["ofc"],
  "never mind": ["nvm"],
  "just kidding": ["jk"],
  "no way": ["naw", "no way"],
  "oh my god": ["omg"],
  "laughing": ["lol", "lmao"],
  "laugh": ["lol", "lmao"],
  "hahaha": ["haha", "lol", "lmao"],
  "hahahaha": ["haha", "lol", "lmao"],

  // ----------------------------------------------------------
  // LIGHT SLANG / INTERNET-NATIVE VARIANTS
  //
  // These are intentionally mixed into the same low-rate pool.
  // They are not meant to fire on every occurrence.
  // ----------------------------------------------------------

  "laughing at you": ["lmao at u"],
  "laughing at this": ["lmao at this"],
  "that is funny": ["thats funny lol"],
  "that's funny": ["thats funny lol"],
  "very funny": ["funny asl"],
  "what the fuck": ["wtf"],
  "what the hell": ["wth"],
  "shut up": ["stfu"],
  "be quiet": ["stfu"],
  "I can't": ["i cant 😭"],
  "i can't": ["i cant 😭"],
  "I am dead": ["im dead 😭"],
  "i am dead": ["im dead 😭"],
  "I am crying": ["im crying 😭"],
  "i am crying": ["im crying 😭"],

  // ----------------------------------------------------------
  // NUMBER / LETTER SHORTCUTS
  //
  // Kept intentionally small because these can look dated if
  // overused.
  // ----------------------------------------------------------

  "for you": ["4u"],
  "for me": ["4me"],
  "to you": ["2u"],
  "see you": ["c u"],
  "see ya": ["cya"],
  "later": ["l8r"],
});

module.exports = {
  BANAT_SHORTHANDS,
};
