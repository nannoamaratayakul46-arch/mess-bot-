"use strict";

// ws3-fca 3.5.2 has a reorganized source tree and Promise-based APIs.
// Do not rewrite dependency internals at install time. Validate the exact
// package version and its public login export instead.
const fs = require("node:fs");
const path = require("node:path");

const packageRoot = path.join(__dirname, "..", "node_modules", "ws3-fca");
const packageJsonPath = path.join(packageRoot, "package.json");

if (!fs.existsSync(packageJsonPath)) {
  throw new Error("[postinstall] ws3-fca package.json was not found after installation.");
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
if (packageJson.version !== "3.5.2") {
  throw new Error(
    "[postinstall] Expected ws3-fca@3.5.2, received " +
    String(packageJson.version || "unknown") +
    ". The compatibility adapter is version-specific."
  );
}

const entry = path.resolve(packageRoot, packageJson.main || "index.js");
if (!entry.startsWith(packageRoot + path.sep) || !fs.existsSync(entry + ".js") && !fs.existsSync(entry)) {
  throw new Error("[postinstall] ws3-fca 3.5.2 main entry could not be resolved.");
}

const client = require(packageRoot);
if (!client || typeof client.login !== "function") {
  throw new Error("[postinstall] ws3-fca 3.5.2 does not expose the expected login() API.");
}

console.log("[postinstall] Verified ws3-fca@3.5.2 public API; no package source patches applied.");
