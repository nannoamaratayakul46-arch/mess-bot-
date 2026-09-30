"use strict";

const db = require("./db");

const MAX_BET = 10_000_000;
const XP_REWARD = 45;

const SYMBOLS = [
  { symbol: "🍒", weight: 34, triple: 5 },
  { symbol: "🍋", weight: 27, triple: 7 },
  { symbol: "🍊", weight: 19, triple: 9 },
  { symbol: "🍉", weight: 11, triple: 12 },
  { symbol: "⭐", weight: 7, triple: 18 },
  { symbol: "💎", weight: 2, triple: 30 },
];

const TOTAL_WEIGHT = SYMBOLS.reduce((sum, item) => sum + item.weight, 0);

const PAYLINES = [
  [[0, 0], [0, 1], [0, 2]],
  [[1, 0], [1, 1], [1, 2]],
  [[2, 0], [2, 1], [2, 2]],
  [[0, 0], [1, 1], [2, 2]],
  [[2, 0], [1, 1], [0, 2]],
];

const active = new Set();

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function parseBet(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/,/g, "");

  if (/^(all[- ]?in|max)$/.test(normalized)) {
    return "ALL_IN";
  }

  const bet = Number(normalized);
  return Number.isInteger(bet) && bet >= 1 && bet <= MAX_BET
    ? bet
    : NaN;
}

async function resolveBet(threadID, userID, value) {
  if (value === "ALL_IN") {
    const user = await db.getUser(threadID, userID);
    const balance = Math.floor(Number(user?.balance) || 0);
    return balance >= 1 ? balance : NaN;
  }

  return value;
}

function weightedSymbol() {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const item of SYMBOLS) {
    roll -= item.weight;
    if (roll < 0) return item.symbol;
  }
  return SYMBOLS[0].symbol;
}

function makeGrid() {
  return Array.from({ length: 3 }, () => [
    weightedSymbol(),
    weightedSymbol(),
    weightedSymbol(),
  ]);
}

function symbolConfig(symbol) {
  return SYMBOLS.find((item) => item.symbol === symbol) || SYMBOLS[0];
}

function evaluate(grid) {
  const wins = [];

  for (const line of PAYLINES) {
    const symbols = line.map(([row, col]) => grid[row][col]);
    if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
      wins.push({
        symbol: symbols[0],
        multiplier: symbolConfig(symbols[0]).triple,
      });
    }
  }

  if (wins.length) {
    return {
      won: true,
      multiplier: wins.reduce((sum, win) => sum + win.multiplier, 0),
      wins,
    };
  }

  const counts = new Map();
  for (const symbol of grid.flat()) {
    counts.set(symbol, (counts.get(symbol) || 0) + 1);
  }

  // Two-of-a-kind is only a near-miss now.
  // Paying for pairs made the machine heavily player-favorable and
  // allowed repeated spins to create an effectively endless bankroll.
  return { won: false, multiplier: 0, wins: [] };
}

function renderGrid(grid, winningSymbols) {
  return grid
    .map((row) =>
      row
        .map((symbol) => winningSymbols.has(symbol) ? `[${symbol}]` : symbol)
        .join("  │  ")
    )
    .join("\n");
}

function sendMessage(api, threadID, text) {
  return new Promise((resolve) => {
    try {
      api.sendMessage(text, threadID, (error, info) => {
        if (error) console.error("[slots] send:", error);
        resolve(info || null);
      });
    } catch (error) {
      console.error("[slots] send:", error);
      resolve(null);
    }
  });
}

async function getBalanceText(threadID, userID) {
  const user = await db.getUser(threadID, userID);
  return `♡ ${formatNumber(user?.balance ?? 0)} coins   ·   ✧ ${formatNumber(user?.xp ?? 0)} XP`;
}

function header() {
  return "╭────────── ✧ SLOTS ✧ ──────────╮";
}

async function handleSlots(api, event, args = []) {
  const threadID = String(event.threadID);
  const userID = String(event.senderID);
  const key = `${threadID}:${userID}`;

  if (active.has(key)) {
    await sendMessage(api, threadID, "♡ your reels are already spinning.");
    return true;
  }

  const parsedBet = parseBet(args[0]);
  const bet = await resolveBet(threadID, userID, parsedBet);
  if (!Number.isInteger(bet)) {
    await sendMessage(
      api,
      threadID,
      `♡ usage · !slots <bet>\nminimum · 1\nmaximum · ${formatNumber(MAX_BET)} coins\nor · all in / allin / max`
    );
    return true;
  }

  active.add(key);

  try {
    const grid = makeGrid();
    const result = evaluate(grid);

    try {
      await db.spendBalance(threadID, userID, bet, `Slots bet: ${bet}`);
    } catch (error) {
      await sendMessage(
        api,
        threadID,
        `${header()}\n\n୨୧ WAGER REJECTED\n\n${error.message || "not enough wallet coins."}`
      );
      return true;
    }

    await sendMessage(
      api,
      threadID,
      `${header()}\n\nbet · ${formatNumber(bet)} coins\n\n🍒  │  🍋  │  ⭐\n🍋  │  ⭐  │  🍒\n⭐  │  🍒  │  🍋\n\nspinning... ♡`
    );

    let payout = 0;

    if (result.won) {
      payout = bet * result.multiplier;
      await db.addBalance(threadID, userID, payout);
      await db.addXP(threadID, userID, XP_REWARD);
    } else {
      await db.addXP(threadID, userID, -Math.floor(XP_REWARD * 0.5));
    }

    const winningSymbols = new Set(result.wins.map((win) => win.symbol));
    const balance = await getBalanceText(threadID, userID);
    const profit = payout - bet;

    const final = result.won
      ? `${header()}\n\nbet · ${formatNumber(bet)} coins\n\n${renderGrid(grid, winningSymbols)}\n\n♡ WIN · ${result.multiplier}×\n♡ payout · +${formatNumber(payout)}\n✧ profit · +${formatNumber(profit)}\n\n${balance}`
      : `${header()}\n\nbet · ${formatNumber(bet)} coins\n\n${renderGrid(grid, winningSymbols)}\n\n୨୧ NO MATCH\n♡ lost · -${formatNumber(bet)}\n✧ XP · -${Math.floor(XP_REWARD * 0.5)}\n\n${balance}`;

    await sendMessage(api, threadID, final);
    return true;
  } catch (error) {
    console.error("[slots] spin:", error);
    await sendMessage(api, threadID, "♡ the reels couldn't finish. your wager was protected.");
    return true;
  } finally {
    active.delete(key);
  }
}

module.exports = { handleSlots };
