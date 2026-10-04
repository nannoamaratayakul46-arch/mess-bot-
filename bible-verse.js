"use strict";

const DROP_HOURS = [6, 14, 22];
const TIME_ZONE = process.env.ECLIPSE_BIBLE_TIME_ZONE || "Asia/Manila";
const SCHEDULER_INTERVAL_MS = 30_000;

const VERSES = [
  { id: "psalm-23-1", ref: "Psalm 23:1", text: "The LORD is my shepherd; I shall not want." },
  { id: "isaiah-41-10", ref: "Isaiah 41:10", text: "Fear thou not; for I am with thee: be not dismayed; for I am thy God." },
  { id: "joshua-1-9", ref: "Joshua 1:9", text: "Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest." },
  { id: "proverbs-3-5", ref: "Proverbs 3:5", text: "Trust in the LORD with all thine heart; and lean not unto thine own understanding." },
  { id: "proverbs-3-6", ref: "Proverbs 3:6", text: "In all thy ways acknowledge him, and he shall direct thy paths." },
  { id: "psalm-46-1", ref: "Psalm 46:1", text: "God is our refuge and strength, a very present help in trouble." },
  { id: "psalm-119-105", ref: "Psalm 119:105", text: "Thy word is a lamp unto my feet, and a light unto my path." },
  { id: "philippians-4-13", ref: "Philippians 4:13", text: "I can do all things through Christ which strengtheneth me." },
  { id: "philippians-4-6", ref: "Philippians 4:6", text: "Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God." },
  { id: "romans-8-28", ref: "Romans 8:28", text: "And we know that all things work together for good to them that love God." },
  { id: "romans-8-31", ref: "Romans 8:31", text: "If God be for us, who can be against us?" },
  { id: "jeremiah-29-11", ref: "Jeremiah 29:11", text: "For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end." },
  { id: "matthew-11-28", ref: "Matthew 11:28", text: "Come unto me, all ye that labour and are heavy laden, and I will give you rest." },
  { id: "matthew-6-34", ref: "Matthew 6:34", text: "Take therefore no thought for the morrow: for the morrow shall take thought for the things of itself." },
  { id: "john-14-27", ref: "John 14:27", text: "Peace I leave with you, my peace I give unto you: not as the world giveth, give I unto you." },
  { id: "john-16-33", ref: "John 16:33", text: "In the world ye shall have tribulation: but be of good cheer; I have overcome the world." },
  { id: "psalm-34-18", ref: "Psalm 34:18", text: "The LORD is nigh unto them that are of a broken heart; and saveth such as be of a contrite spirit." },
  { id: "psalm-37-4", ref: "Psalm 37:4", text: "Delight thyself also in the LORD; and he shall give thee the desires of thine heart." },
  { id: "psalm-55-22", ref: "Psalm 55:22", text: "Cast thy burden upon the LORD, and he shall sustain thee: he shall never suffer the righteous to be moved." },
  { id: "deuteronomy-31-8", ref: "Deuteronomy 31:8", text: "And the LORD, he it is that doth go before thee; he will be with thee, he will not fail thee, neither forsake thee: fear not, neither be dismayed." },
  { id: "numbers-6-24", ref: "Numbers 6:24", text: "The LORD bless thee, and keep thee." },
  { id: "numbers-6-25", ref: "Numbers 6:25", text: "The LORD make his face shine upon thee, and be gracious unto thee." },
  { id: "numbers-6-26", ref: "Numbers 6:26", text: "The LORD lift up his countenance upon thee, and give thee peace." },
  { id: "psalm-121-7", ref: "Psalm 121:7", text: "The LORD shall preserve thee from all evil: he shall preserve thy soul." },
  { id: "psalm-121-8", ref: "Psalm 121:8", text: "The LORD shall preserve thy going out and thy coming in from this time forth, and even for evermore." },
  { id: "1-corinthians-16-14", ref: "1 Corinthians 16:14", text: "Let all your things be done with charity." },
  { id: "galatians-6-9", ref: "Galatians 6:9", text: "And let us not be weary in well doing: for in due season we shall reap, if we faint not." },
  { id: "psalm-27-1", ref: "Psalm 27:1", text: "The LORD is my light and my salvation; whom shall I fear?" },
  { id: "psalm-56-3", ref: "Psalm 56:3", text: "What time I am afraid, I will trust in thee." },
  { id: "proverbs-16-3", ref: "Proverbs 16:3", text: "Commit thy works unto the LORD, and thy thoughts shall be established." },
  { id: "matthew-5-16", ref: "Matthew 5:16", text: "Let your light so shine before men, that they may see your good works, and glorify your Father which is in heaven." },
  { id: "colossians-3-23", ref: "Colossians 3:23", text: "And whatsoever ye do, do it heartily, as to the Lord, and not unto men." },
  { id: "2-timothy-1-7", ref: "2 Timothy 1:7", text: "For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind." },
];

let schedulerTimer = null;
let schedulerStarted = false;

function localParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const out = {};
  for (const part of parts) out[part.type] = part.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    second: Number(out.second),
  };
}

function slotKeyFor(date = new Date()) {
  const p = localParts(date);
  const slotHour = [...DROP_HOURS].reverse().find((hour) => p.hour >= hour);
  if (slotHour == null) return null;
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}T${String(slotHour).padStart(2, "0")}:00${TIME_ZONE}`;
}

function chooseVerse(recentIds = []) {
  const recent = new Set(recentIds.map(String));
  const available = VERSES.filter((verse) => !recent.has(verse.id));
  const pool = available.length ? available : VERSES;
  return pool[Math.floor(Math.random() * pool.length)];
}

function formatVerse(verse) {
  return [
    "╭─────────────── ୨୧ ───────────────╮",
    "        ✝️  VERSE OF THE DAY",
    "╰──────────────────────────────────╯",
    "",
    `“${verse.text}”`,
    "",
    `— ${verse.ref}`,
    "",
    "♡ E C L I P S E",
  ].join("\n");
}

function send(api, trafficSendMessage, threadID, message) {
  return new Promise((resolve) => {
    try {
      trafficSendMessage(api, message, threadID, (error) => {
        if (error) {
          console.error(`[BIBLE] Send failed for ${threadID}:`, error);
          resolve(false);
          return;
        }
        resolve(true);
      });
    } catch (error) {
      console.error(`[BIBLE] Send threw for ${threadID}:`, error);
      resolve(false);
    }
  });
}

async function runCurrentSlot(api, trafficSendMessage, force = false) {
  const slotKey = slotKeyFor();
  if (!slotKey) return { skipped: true, reason: "before-first-slot" };

  const existing = await db.getBibleVerseDrop(slotKey);
  if (existing && !force) {
    return { skipped: true, reason: "already-dropped", slotKey, verseId: existing.verse_id };
  }

  const recentIds = await db.getRecentBibleVerseIds(8);
  const verse = force
    ? chooseVerse(recentIds)
    : chooseVerse(recentIds);

  const claimed = await db.recordBibleVerseDrop(slotKey, verse.id);
  if (!claimed) {
    const saved = await db.getBibleVerseDrop(slotKey);
    return { skipped: true, reason: "already-claimed", slotKey, verseId: saved?.verse_id };
  }

  const threadIDs = await db.getBibleVerseEnabledThreadIds();
  let sent = 0;

  for (const threadID of threadIDs) {
    if (await send(api, trafficSendMessage, threadID, formatVerse(verse))) {
      sent++;
    }
  }

  console.log(`[BIBLE] Verse ${verse.ref} dispatched for slot ${slotKey}: ${sent}/${threadIDs.length} threads.`);
  return { slotKey, verse, sent, total: threadIDs.length };
}

async function handleVerseCommand(api, trafficSendMessage, event, rawText) {
  const threadID = String(event?.threadID || "").trim();
  const senderID = String(event?.senderID || "").trim();
  if (!threadID) return false;

  const match = String(rawText || "").trim().match(/^\/verse(?:\s+(.*))?$/i);
  if (!match) return false;

  const action = String(match[1] || "status").trim().toLowerCase();
  const admin = typeof db.isAdminForBible === "function"
    ? await db.isAdminForBible(senderID)
    : false;

  if (action === "status") {
    const enabled = await db.isBibleVerseEnabled(threadID);
    const next = getNextSlotDescription();
    await send(api, trafficSendMessage, threadID, [
      "╭────── 🎀  VERSE  🎀 ──────╮",
      "",
      `♡ automatic drops · ${enabled ? "ON" : "OFF"}`,
      "୨୧ schedule · 6 AM · 2 PM · 10 PM",
      `୨୧ timezone · ${TIME_ZONE}`,
      `୨୧ next · ${next}`,
      "",
      "╰────── ♡ ୨୧ 🎀 ୨୧ ♡ ──────╯",
    ].join("\n"));
    return true;
  }

  if (!admin && /^(?:on|off|now)$/i.test(action)) {
    await send(api, trafficSendMessage, threadID, "🔒 Admin only.");
    return true;
  }

  if (action === "on") {
    await db.setBibleVerseEnabled(threadID, true);
    await send(api, trafficSendMessage, threadID, "✝️ Bible verse drops are now ON for this GC.");
    return true;
  }

  if (action === "off") {
    await db.setBibleVerseEnabled(threadID, false);
    await send(api, trafficSendMessage, threadID, "✝️ Bible verse drops are now OFF for this GC.");
    return true;
  }

  if (action === "now") {
    const result = await runCurrentSlot(api, trafficSendMessage, true);
    await send(api, trafficSendMessage, threadID,
      result.verse
        ? `✝️ Dropped ${result.verse.ref} to ${result.sent}/${result.total} enabled GCs.`
        : "✝️ No verse was dropped right now."
    );
    return true;
  }

  await send(api, trafficSendMessage, threadID, "Usage: /verse status · /verse on · /verse off · /verse now");
  return true;
}

function getNextSlotDescription() {
  const now = new Date();
  const p = localParts(now);
  const candidates = DROP_HOURS.filter((hour) => hour > p.hour || (hour === p.hour && p.minute === 0 && p.second === 0));
  const nextHour = candidates[0] ?? DROP_HOURS[0];
  return `${String(nextHour).padStart(2, "0")}:00`;
}

function startBibleVerseScheduler(api, trafficSendMessage) {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const tick = async () => {
    try {
      await runCurrentSlot(api, trafficSendMessage);
    } catch (error) {
      console.error("[BIBLE] Scheduler tick failed:", error);
    }
  };

  void tick();
  schedulerTimer = setInterval(tick, SCHEDULER_INTERVAL_MS);
  if (schedulerTimer && typeof schedulerTimer.unref === "function") {
    schedulerTimer.unref();
  }

  console.log(`[BIBLE] Automatic verse scheduler started — 06:00 / 14:00 / 22:00 ${TIME_ZONE}.`);
}

function stopBibleVerseScheduler() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = null;
  schedulerStarted = false;
}

module.exports = {
  handleVerseCommand,
  startBibleVerseScheduler,
  stopBibleVerseScheduler,
  VERSES,
};
