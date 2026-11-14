"use strict";

// ws3-fca 3.5.2 has Promise-based APIs. Validate the exact package version
// and patch only the verified fb_dtsg failure seam, failing closed on drift.
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

// Guard the exact failure seam: Facebook may serve a page without fb_dtsg.
const buildApiPath = path.join(packageRoot, "src", "core", "models", "buildAPI.js");
if (!fs.existsSync(buildApiPath)) {
  throw new Error("[postinstall] ws3-fca 3.5.2 buildAPI.js was not found; refusing an unverified patch.");
}
let buildApi = fs.readFileSync(buildApiPath, "utf8");
const patchMarker = "ECLIPSE_WS3_FCA_MISSING_DTSG_DIAGNOSTICS";
if (!buildApi.includes(patchMarker)) {
  const dtsgResultLine = /^([\t ]*)const dtsgResult = \{ fb_dtsg: dtsg, jazoest: .*Array\.from\(dtsg\).*;[\t ]*$/m;
  if (!dtsgResultLine.test(buildApi)) {
    throw new Error("[postinstall] ws3-fca buildAPI.js did not match the verified fb_dtsg extraction line; refusing to patch.");
  }
  buildApi = buildApi.replace(dtsgResultLine, (_line, indent) => `${indent}// ${patchMarker}
${indent}if (typeof dtsg !== "string" || !dtsg.trim()) {
${indent}  const responseHtml = String(html || "");
${indent}  const parserError = new Error("ws3-fca buildAPI could not find the Facebook fb_dtsg token.");
${indent}  parserError.code = "ECLIPSE_WS3_FCA_MISSING_DTSG";
${indent}  parserError.eclipseDiagnostics = {
${indent}    kind: "missing_fb_dtsg",
${indent}    htmlLength: responseHtml.length,
${indent}    netDataCount: Array.isArray(netData) ? netData.length : null,
${indent}    dtsgConfigFound: Boolean(dtsgData),
${indent}    checkpointMarker: /checkpoint|security.?check|challenge/i.test(responseHtml),
${indent}    twoFactorMarker: /two.?factor|approvals_code|approvals-code/i.test(responseHtml),
${indent}    loginMarker: /login_form|loginform|name=["']pass["']/i.test(responseHtml),
${indent}    accountDisabledMarker: /account disabled|suspended|temporarily blocked/i.test(responseHtml)
${indent}  };
${indent}  throw parserError;
${indent}}
${indent}const dtsgResult = { fb_dtsg: dtsg, jazoest: \`2\${Array.from(dtsg).reduce((a, b) => a + b.charCodeAt(0), '')}\` };`);
  fs.writeFileSync(buildApiPath, buildApi, "utf8");
  console.log("[postinstall] Applied guarded fb_dtsg diagnostics to ws3-fca@3.5.2.");
} else {
  console.log("[postinstall] Guarded fb_dtsg diagnostics already present in ws3-fca@3.5.2.");
}
console.log("[postinstall] Verified ws3-fca@3.5.2 public API and buildAPI compatibility patch.");
