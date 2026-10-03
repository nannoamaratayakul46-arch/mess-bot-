"use strict";

/**
 * Build ECLIPSE's local English vocabulary snapshot from dwyl/english-words.
 *
 * Source:
 *   https://github.com/dwyl/english-words
 *
 * Run:
 *   npm run sync:english
 *
 * The runtime does not contact GitHub. This script is the one-time/update
 * importer that turns the upstream 4 MB word list into a compact JSON array.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const SOURCE_URL =
  "https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt";

const OUTPUT_DIR = path.join(__dirname, "..", "data", "english");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "words.json");
const META_FILE = path.join(OUTPUT_DIR, "source.json");

const MIN_LENGTH = 2;
const MAX_LENGTH = 24;

function download(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          "User-Agent": "ECLIPSE-english-vocabulary-sync",
          Accept: "text/plain",
        },
      },
      (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          response.resume();
          return resolve(download(response.headers.location));
        }

        if (response.statusCode !== 200) {
          response.resume();
          return reject(
            new Error("Upstream returned HTTP " + response.statusCode)
          );
        }

        const chunks = [];
        response.setEncoding("utf8");

        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(chunks.join("")));
        response.on("error", reject);
      }
    );

    request.setTimeout(120000, () => {
      request.destroy(new Error("Download timed out after 120s"));
    });

    request.on("error", reject);
  });
}

async function main() {
  console.log("[ENGLISH] Downloading dwyl/english-words...");

  const body = await download(SOURCE_URL);

  const words = [...new Set(
    body
      .split(/\r?\n/)
      .map((word) => word.trim().toLowerCase())
      .filter(
        (word) =>
          word.length >= MIN_LENGTH &&
          word.length <= MAX_LENGTH &&
          /^[a-z]+$/.test(word)
      )
  )];

  words.sort();

  if (words.length < 100000) {
    throw new Error(
      "Unexpectedly small vocabulary: " + words.length + " words"
    );
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(words),
    "utf8"
  );

  fs.writeFileSync(
    META_FILE,
    JSON.stringify(
      {
        source: "dwyl/english-words",
        sourceFile: "words_alpha.txt",
        sourceUrl: SOURCE_URL,
        generatedAt: new Date().toISOString(),
        wordCount: words.length,
        minLength: MIN_LENGTH,
        maxLength: MAX_LENGTH,
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log("[ENGLISH] Wrote " + words.length + " words.");
  console.log("[ENGLISH] Output: " + OUTPUT_FILE);
}

main().catch((error) => {
  console.error("[ENGLISH] Sync failed:", error.message);
  process.exitCode = 1;
});
