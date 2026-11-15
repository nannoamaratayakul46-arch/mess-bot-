"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const axios = require("axios");
const ws3PackageRoot = path.dirname(require.resolve("ws3-fca"));
const { CookieJar } = require(require.resolve("tough-cookie", { paths: [ws3PackageRoot] }));
const { HttpsProxyAgent } = require(require.resolve("https-proxy-agent", { paths: [process.cwd()] }));
const cookieJarSupportPath = require.resolve("axios-cookiejar-support", { paths: [ws3PackageRoot] });
const cookieAgentModule = require(require.resolve("http-cookie-agent/http", {
  paths: [path.dirname(cookieJarSupportPath)],
}));
const HttpsProxyCookieAgent = cookieAgentModule.createCookieAgent(HttpsProxyAgent);
const patchedAxiosSource = fs.readFileSync(path.join(ws3PackageRoot, "src", "utils", "axios.js"), "utf8");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

test("cookie-aware HTTPS proxy agent tunnels CONNECT and preserves session cookies", async (t) => {
  assert.match(patchedAxiosSource, /ECLIPSE_WS3_FCA_COOKIE_AWARE_PROXY_V1/);
  assert.match(patchedAxiosSource, /new HttpsProxyCookieAgent/);
  assert.match(patchedAxiosSource, /proxy: false/);

  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "eclipse-proxy-test-"));
  const keyPath = path.join(fixtureDir, "proxy-test-key.pem");
  const certPath = path.join(fixtureDir, "proxy-test-cert.pem");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", keyPath, "-out", certPath,
    "-subj", "/CN=localhost", "-days", "1",
  ], { stdio: "ignore" });
  t.after(() => fs.rmSync(fixtureDir, { recursive: true, force: true }));
  let observedCookie = "";
  let connectCount = 0;

  const targetServer = https.createServer({
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  }, (req, res) => {
    observedCookie = String(req.headers.cookie || "");
    res.setHeader("Set-Cookie", "roundtrip=stored; Path=/; Secure");
    res.end("proxy-cookie-agent-ok");
  });

  const targetPort = await listen(targetServer);
  const proxyServer = http.createServer();
  proxyServer.on("connect", (req, clientSocket, head) => {
    connectCount += 1;
    const match = /^([^:]+):(\d+)$/.exec(req.url || "");
    if (!match) {
      clientSocket.destroy();
      return;
    }

    const upstream = net.connect(Number(match[2]), "127.0.0.1", () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on("error", () => clientSocket.destroy());
    upstream.on("close", () => clientSocket.destroy());
    clientSocket.on("error", () => upstream.destroy());
    clientSocket.on("close", () => upstream.destroy());
  });

  const proxyPort = await listen(proxyServer);
  const targetUrl = `https://localhost:${targetPort}/session-probe`;
  const jar = new CookieJar();
  jar.setCookieSync("session_probe=present; Path=/; Secure", targetUrl);

  const agent = new HttpsProxyCookieAgent(`http://127.0.0.1:${proxyPort}`, {
    cookies: { jar },
    rejectUnauthorized: false,
  });
  const client = axios.create({
    httpsAgent: agent,
    proxy: false,
    timeout: 10000,
    maxRedirects: 0,
  });

  t.after(async () => {
    agent.destroy();
    proxyServer.closeAllConnections?.();
    targetServer.closeAllConnections?.();
    await Promise.all([close(proxyServer), close(targetServer)]);
  });

  const response = await client.get(targetUrl);
  assert.equal(response.data, "proxy-cookie-agent-ok");
  assert.equal(connectCount, 1, "HTTPS request must pass through the local CONNECT proxy");
  assert.match(observedCookie, /(?:^|;\s*)session_probe=present(?:;|$)/);
  assert.match(jar.getCookieStringSync(targetUrl), /(?:^|;\s*)roundtrip=stored(?:;|$)/);
});
