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
const patchMarker = "ECLIPSE_WS3_FCA_MISSING_DTSG_DIAGNOSTICS_V2";
const legacyPatchMarker = "ECLIPSE_WS3_FCA_MISSING_DTSG_DIAGNOSTICS";
const guardedPatch = (indent) => `${indent}// ${patchMarker}
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
${indent}    accountDisabledMarker: /account disabled|suspended|temporarily blocked/i.test(responseHtml),
${indent}    twoFactorFormMarker: /name=["'](?:approvals_code|verification_code)["']|id=["']approvals_code["']/i.test(responseHtml),
${indent}    checkpointPathMarker: /\\/checkpoint(?:\\/|\\?|["'])/i.test(responseHtml),
${indent}    checkpointHeadingMarker: /<title[^>]*>[^<]*(?:checkpoint|security check|confirm your identity)/i.test(responseHtml),
${indent}    passwordFieldMarker: /<input[^>]+name=["']pass["']/i.test(responseHtml),
${indent}    loginIdentifierFieldMarker: /<input[^>]+name=["'](?:email|login|username)["']/i.test(responseHtml),
${indent}    authenticatedHomeMarker: /id=["']bluebarRoot|id=["']pagelet_timeline_main_column|data-pagelet=["']FeedUnit_/i.test(responseHtml),
${indent}    responseKind: /name=["'](?:approvals_code|verification_code)["']|id=["']approvals_code["']/i.test(responseHtml) ? "two_factor" : (/\\/checkpoint(?:\\/|\\?|["'])|<title[^>]*>[^<]*(?:checkpoint|security check|confirm your identity)/i.test(responseHtml) ? "checkpoint" : (/<input[^>]+name=["']pass["']/i.test(responseHtml) && /<input[^>]+name=["'](?:email|login|username)["']/i.test(responseHtml)) ? "login" : (/id=["']bluebarRoot|id=["']pagelet_timeline_main_column|data-pagelet=["']FeedUnit_/i.test(responseHtml) ? "authenticated_home" : "unclassified")),
${indent}    fbDtsgLiteralPresent: /fb_dtsg/i.test(responseHtml),
${indent}    dtsgValueType: typeof dtsg,
${indent}    dtsgDataType: dtsgData === null ? "null" : Array.isArray(dtsgData) ? "array" : typeof dtsgData,
${indent}    dtsgDataKeys: dtsgData && typeof dtsgData === "object" ? Object.keys(dtsgData).slice(0, 20) : [],
${indent}    dtsgDataKeyCount: dtsgData && typeof dtsgData === "object" ? Object.keys(dtsgData).length : null,
${indent}    dtsgDataHasToken: Boolean(dtsgData && typeof dtsgData === "object" && Object.prototype.hasOwnProperty.call(dtsgData, "token")),
${indent}    dtsgDataTokenType: dtsgData && typeof dtsgData === "object" && Object.prototype.hasOwnProperty.call(dtsgData, "token") ? typeof dtsgData.token : "missing",
${indent}    dtsgDataTokenLength: dtsgData && typeof dtsgData.token === "string" ? dtsgData.token.length : null,
${indent}    htmlDtsgInitialDataMarker: /DTSGInitialData/i.test(responseHtml),
${indent}    htmlGenericTokenMarker: /"token"\\s*:\\s*"/i.test(responseHtml),
${indent}    netDataRequireEntryCount: Array.isArray(netData) ? netData.reduce((count, item) => count + (item && Array.isArray(item.require) ? item.require.length : 0), 0) : null,
${indent}    dtsgRequireEntryCount: Array.isArray(netData) ? netData.reduce((count, item) => count + (item && Array.isArray(item.require) ? item.require.filter(req => Array.isArray(req) && typeof req[0] === "string" && /DTSG/i.test(req[0])).length : 0), 0) : null,
${indent}    netDataKeys: Array.isArray(netData) ? [...new Set(netData.slice(0, 5).flatMap(item => item && typeof item === "object" ? Object.keys(item) : []))].slice(0, 20) : []
${indent}  };
${indent}  throw parserError;
${indent}}
${indent}const dtsgResult = { fb_dtsg: dtsg, jazoest: \`2\${Array.from(dtsg).reduce((a, b) => a + b.charCodeAt(0), '')}\` };`;
if (!buildApi.includes(patchMarker)) {
  const originalDtsgLine = /^([\t ]*)const dtsgResult = \{ fb_dtsg: dtsg, jazoest: .*Array\.from\(dtsg\).*;[\t ]*$/m;
  const legacyGuardedBlock = /^([\t ]*)\/\/ ECLIPSE_WS3_FCA_MISSING_DTSG_DIAGNOSTICS[\s\S]*?^\1const dtsgResult = \{ fb_dtsg: dtsg, jazoest: .*Array\.from\(dtsg\).*;[\t ]*$/m;
  if (buildApi.includes(legacyPatchMarker)) {
    if (!legacyGuardedBlock.test(buildApi)) {
      throw new Error("[postinstall] Existing guarded fb_dtsg patch could not be safely upgraded; refusing to modify ws3-fca.");
    }
    buildApi = buildApi.replace(legacyGuardedBlock, (_line, indent) => guardedPatch(indent));
  } else {
    if (!originalDtsgLine.test(buildApi)) {
      throw new Error("[postinstall] ws3-fca buildAPI.js did not match the verified fb_dtsg extraction line; refusing to patch.");
    }
    buildApi = buildApi.replace(originalDtsgLine, (_line, indent) => guardedPatch(indent));
  }
  fs.writeFileSync(buildApiPath, buildApi, "utf8");
  console.log("[postinstall] Applied upgraded Facebook response diagnostics to ws3-fca@3.5.2.");
} else {
  console.log("[postinstall] Upgraded Facebook response diagnostics already present in ws3-fca@3.5.2.");
}
console.log("[postinstall] Verified ws3-fca@3.5.2 public API and buildAPI compatibility patch.");
