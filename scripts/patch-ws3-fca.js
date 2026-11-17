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

// Validate the exact cookie-agent and proxy-agent exports before patching
// ws3-fca. Fail during install rather than at Messenger startup if APIs drift.
const axiosCookieJarSupportPath = require.resolve("axios-cookiejar-support", { paths: [packageRoot] });
const cookieAgentPath = require.resolve("http-cookie-agent/http", {
  paths: [path.dirname(axiosCookieJarSupportPath)],
});
const cookieAgentExports = require(cookieAgentPath);
const proxyAgentExports = require(require.resolve("https-proxy-agent", { paths: [process.cwd()] }));
if (
  typeof cookieAgentExports.HttpCookieAgent !== "function" ||
  typeof cookieAgentExports.HttpsCookieAgent !== "function" ||
  typeof cookieAgentExports.createCookieAgent !== "function" ||
  typeof proxyAgentExports.HttpsProxyAgent !== "function"
) {
  throw new Error("[postinstall] Required cookie-aware/proxy agent exports are incompatible; refusing to patch ws3-fca.");
}

// Guard the exact failure seam: Facebook may serve a page without fb_dtsg.
const buildApiPath = path.join(packageRoot, "src", "core", "models", "buildAPI.js");
if (!fs.existsSync(buildApiPath)) {
  throw new Error("[postinstall] ws3-fca 3.5.2 buildAPI.js was not found; refusing an unverified patch.");
}
let buildApi = fs.readFileSync(buildApiPath, "utf8");
const patchMarker = "ECLIPSE_WS3_FCA_MISSING_DTSG_DIAGNOSTICS_V3";
const previousPatchMarker = "ECLIPSE_WS3_FCA_MISSING_DTSG_DIAGNOSTICS_V2";
const legacyPatchMarker = "ECLIPSE_WS3_FCA_MISSING_DTSG_DIAGNOSTICS";
const guardedPatch = (indent) => `${indent}// ${patchMarker}
${indent}if (typeof dtsg !== "string" || !dtsg.trim()) {
${indent}  const responseHtml = String(html || "");
${indent}  const responseKind = /name=["'](?:approvals_code|verification_code)["']|id=["']approvals_code["']/i.test(responseHtml) ? "two_factor" : (/\\/checkpoint(?:\\/|\\?|["'])|<title[^>]*>[^<]*(?:checkpoint|security check|confirm your identity)/i.test(responseHtml) ? "checkpoint" : (/<input[^>]+name=["']pass["']/i.test(responseHtml) && /<input[^>]+name=["'](?:email|login|username)["']/i.test(responseHtml)) ? "login" : (/id=["']bluebarRoot|id=["']pagelet_timeline_main_column|data-pagelet=["']FeedUnit_/i.test(responseHtml) ? "authenticated_home" : "unclassified"));
${indent}  const parserError = new Error(responseKind === "login" ? "Facebook returned its login page; the supplied session was not accepted." : "ws3-fca buildAPI could not find the Facebook fb_dtsg token.");
${indent}  parserError.code = responseKind === "login" ? "ECLIPSE_WS3_FCA_LOGIN_REQUIRED" : "ECLIPSE_WS3_FCA_MISSING_DTSG";
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
${indent}    responseKind: responseKind,
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
  const legacyGuardedBlock = /^([\t ]*)\/\/ ECLIPSE_WS3_FCA_MISSING_DTSG_DIAGNOSTICS(?:_V2)?[\s\S]*?^\1const dtsgResult = \{ fb_dtsg: dtsg, jazoest: .*Array\.from\(dtsg\).*;[\t ]*$/m;
  if (buildApi.includes(previousPatchMarker) || buildApi.includes(legacyPatchMarker)) {
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

 
// Route ws3-fca HTTPS requests through a cookie-aware CONNECT proxy agent.
// Axios's built-in proxy option is deliberately disabled for this client so
// it cannot compete with the explicit HttpsProxyAgent transport.
const axiosPath = path.join(packageRoot, "src", "utils", "axios.js");
if (!fs.existsSync(axiosPath)) {
  throw new Error("[postinstall] ws3-fca 3.5.2 axios transport was not found; refusing an unverified proxy patch.");
}
let axiosSource = fs.readFileSync(axiosPath, "utf8");
const proxyPatchMarker = "ECLIPSE_WS3_FCA_COOKIE_AWARE_PROXY_V1";
if (!axiosSource.includes(proxyPatchMarker)) {
  const oldImport = 'const { wrapper } = require("axios-cookiejar-support");';
  const newImports = `const path = require("node:path");\nconst { HttpCookieAgent, HttpsCookieAgent, createCookieAgent } = require(require.resolve("http-cookie-agent/http", { paths: [path.dirname(require.resolve("axios-cookiejar-support"))] }));
const { HttpsProxyAgent } = require(require.resolve("https-proxy-agent", { paths: [process.cwd()] }));`;
  if (!axiosSource.includes(oldImport)) {
    throw new Error("[postinstall] ws3-fca axios transport import did not match the verified cookie-jar implementation.");
  }
  axiosSource = axiosSource.replace(oldImport, newImports);

  const oldClient = `const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));`;
  const newClient = `const jar = new CookieJar();
const HttpsProxyCookieAgent = createCookieAgent(HttpsProxyAgent);
const client = axios.create({
    httpAgent: new HttpCookieAgent({ cookies: { jar } }),
    httpsAgent: new HttpsCookieAgent({ cookies: { jar } }),
});`;
  if (!axiosSource.includes(oldClient)) {
    throw new Error("[postinstall] ws3-fca axios client initialization did not match the verified cookie-jar implementation.");
  }
  axiosSource = axiosSource.replace(oldClient, newClient);

  const setProxyPattern = /function setProxy\(proxyUrl\) \{[\s\S]*?^\}/m;
  const newSetProxy = `function setProxy(proxyUrl) {
    if (!proxyUrl) {
        // Direct transport is permitted only when the application loaded an
        // explicit, persisted owner setting before starting Messenger login.
        if (process.env.ECLIPSE_MESSENGER_PROXY_MODE !== "direct") {
            throw new Error("Messenger proxy is required; refusing an implicit direct-network fallback.");
        }
        client.defaults.httpAgent = new HttpCookieAgent({ cookies: { jar } });
        client.defaults.httpsAgent = new HttpsCookieAgent({ cookies: { jar } });
        proxyConfig = { proxy: false };
        return;
    }

    let parsedProxy;
    try {
        parsedProxy = new URL(proxyUrl);
    } catch {
        throw new Error("Invalid proxy URL. Please use a full HTTP(S) proxy URL.");
    }
    if (!["http:", "https:"].includes(parsedProxy.protocol) || !parsedProxy.hostname || !parsedProxy.port) {
        throw new Error("Invalid proxy URL. Please include an HTTP(S) scheme, hostname, and port.");
    }

    // Use the authenticated CONNECT tunnel for BOTH protocols. This keeps
    // accidental plain-HTTP Messenger requests inside the configured proxy.
    const proxyAgent = new HttpsProxyCookieAgent(proxyUrl, { cookies: { jar } });
    client.defaults.httpAgent = proxyAgent;
    client.defaults.httpsAgent = proxyAgent;
    proxyConfig = { proxy: false };
}`;
  const setProxyMatches = axiosSource.match(setProxyPattern) || [];
  if (setProxyMatches.length !== 1) {
    throw new Error("[postinstall] ws3-fca setProxy() implementation did not match the verified source; refusing to patch.");
  }
  axiosSource = axiosSource.replace(setProxyPattern, newSetProxy);
  axiosSource = axiosSource.replace(
    "module.exports = {",
    "// " + proxyPatchMarker + "\nmodule.exports = {"
  );
  if (!axiosSource.includes(proxyPatchMarker)) {
    throw new Error("[postinstall] Cookie-aware proxy patch marker could not be installed.");
  }
  fs.writeFileSync(axiosPath, axiosSource, "utf8");
  console.log("[postinstall] Applied cookie-aware HTTPS proxy transport to ws3-fca@3.5.2.");
} else {
  console.log("[postinstall] Cookie-aware HTTPS proxy transport already present in ws3-fca@3.5.2.");
}


if (axiosSource.includes(proxyPatchMarker) && axiosSource.includes("new HttpsProxyCookieAgent(parsedProxy")) {
  axiosSource = axiosSource.replace(
    "new HttpsProxyCookieAgent(parsedProxy, { cookies: { jar } })",
    "new HttpsProxyCookieAgent(proxyUrl, { cookies: { jar } })"
  );
  fs.writeFileSync(axiosPath, axiosSource, "utf8");
  console.log("[postinstall] Migrated cached cookie-aware proxy agent to use the proxy URL string.");
}



// Upgrade an already-patched node_modules cache as well as fresh installs.
// Render may reuse the generated axios.js containing the previous fail-closed
// guard, so the explicit direct-mode branch must be migrated idempotently.
const legacyDirectGuard = /if \(!proxyUrl\) \{\s*throw new Error\("Messenger proxy is required; refusing to restore direct HTTP or HTTPS transport\."\);\s*\}/;
if (axiosSource.includes(proxyPatchMarker) && legacyDirectGuard.test(axiosSource)) {
  axiosSource = axiosSource.replace(
    legacyDirectGuard,
    `if (!proxyUrl) {
        if (process.env.ECLIPSE_MESSENGER_PROXY_MODE !== "direct") {
            throw new Error("Messenger proxy is required; refusing an implicit direct-network fallback.");
        }
        client.defaults.httpAgent = new HttpCookieAgent({ cookies: { jar } });
        client.defaults.httpsAgent = new HttpsCookieAgent({ cookies: { jar } });
        proxyConfig = { proxy: false };
        return;
    }`
  );
  fs.writeFileSync(axiosPath, axiosSource, "utf8");
  console.log("[postinstall] Migrated cached ws3-fca transport for explicit direct mode.");
}

// ws3-fca@3.5.2 bundles https-proxy-agent@4 for MQTT. On the current
// Node runtime that nested agent can be incompatible with the WebSocket
// request path. Reuse the application's pinned root agent (5.x), which is
// already used by the HTTP transport, and fail closed if the source drifts.
const mqttPath = path.join(packageRoot, "src", "deltas", "apis", "mqtt", "listenMqtt.js");
if (!fs.existsSync(mqttPath)) {
  throw new Error("[postinstall] ws3-fca MQTT transport was not found; refusing an unverified proxy patch.");
}
let mqttSource = fs.readFileSync(mqttPath, "utf8");
if (!mqttSource.includes("ECLIPSE_WS3_FCA_MQTT_ROOT_PROXY_AGENT_V1")) {
  const oldAgentImport = 'const HttpsProxyAgent = require(\'https-proxy-agent\');';
  const newAgentImport = 'const { HttpsProxyAgent } = require(require.resolve("https-proxy-agent", { paths: [process.cwd()] }));';
  const oldAgentSetup = 'if (ctx.globalOptions.proxy) options.wsOptions.agent = new HttpsProxyAgent(ctx.globalOptions.proxy);';
  const newAgentSetup = `if (ctx.globalOptions.proxy) {
        const proxyUrl = new URL(ctx.globalOptions.proxy);
        if (!["http:", "https:"].includes(proxyUrl.protocol) || !proxyUrl.hostname || !proxyUrl.port) {
            throw new Error("Invalid HTTP(S) proxy URL for Messenger MQTT transport.");
        }
        options.wsOptions.agent = new HttpsProxyAgent(ctx.globalOptions.proxy);
    }`;
  if (!mqttSource.includes(oldAgentImport) || !mqttSource.includes(oldAgentSetup)) {
    throw new Error("[postinstall] ws3-fca MQTT proxy setup did not match the verified 3.5.2 source; refusing to patch.");
  }
  mqttSource = mqttSource.replace(oldAgentImport, newAgentImport);
  mqttSource = mqttSource.replace(oldAgentSetup, newAgentSetup);
  mqttSource = mqttSource.replace('const options = {', '// ECLIPSE_WS3_FCA_MQTT_ROOT_PROXY_AGENT_V1\n    const options = {');
  if (!mqttSource.includes("ECLIPSE_WS3_FCA_MQTT_ROOT_PROXY_AGENT_V1")) {
    throw new Error("[postinstall] MQTT proxy patch marker could not be installed.");
  }
  fs.writeFileSync(mqttPath, mqttSource, "utf8");
  console.log("[postinstall] Routed ws3-fca MQTT through the root HTTPS proxy agent.");
} else {
  console.log("[postinstall] Root HTTPS proxy agent already installed for ws3-fca MQTT.");
}

// Guard GraphQL batch entries before ws3-fca dereferences response.errors.
// Facebook may return an empty/malformed batch when the session is rejected;
// report that as an explicit upstream response error instead of a TypeError.
const threadInfoPath = path.join(packageRoot, "src", "deltas", "apis", "threads", "getThreadInfo.js");
if (!fs.existsSync(threadInfoPath)) {
  throw new Error("[postinstall] ws3-fca getThreadInfo.js was not found; refusing an unverified response guard.");
}
let threadInfoSource = fs.readFileSync(threadInfoPath, "utf8");
const threadInfoPatchMarker = "ECLIPSE_WS3_FCA_THREAD_INFO_RESPONSE_GUARD_V1";
if (!threadInfoSource.includes(threadInfoPatchMarker)) {
  const formatterStart = /(function\s+formatThreadGraphQLResponse\s*\(\s*data\s*\)\s*\{)/;
  if (!formatterStart.test(threadInfoSource)) {
    throw new Error("[postinstall] ws3-fca getThreadInfo formatter did not match the verified response seam; refusing to patch.");
  }
  threadInfoSource = threadInfoSource.replace(formatterStart, (match) => match +
    "\n  // " + threadInfoPatchMarker +
    "\n  if (!data || typeof data !== \"object\" || Array.isArray(data)) {" +
    "\n    const responseError = new Error(\"Facebook returned an empty or invalid GraphQL thread response.\");" +
    "\n    responseError.code = \"ECLIPSE_WS3_FCA_INVALID_THREAD_RESPONSE\";" +
    "\n    throw responseError;" +
    "\n  }");
  fs.writeFileSync(threadInfoPath, threadInfoSource, "utf8");
  console.log("[postinstall] Applied defensive GraphQL response guard to ws3-fca getThreadInfo.");
} else {
  console.log("[postinstall] Defensive GraphQL response guard already present in ws3-fca getThreadInfo.");
}

console.log("[postinstall] Verified ws3-fca@3.5.2 public API and buildAPI compatibility patch.");
