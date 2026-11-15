"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const axios = require("axios");
const { CookieJar } = require("tough-cookie");
const { HttpsProxyAgent } = require(require.resolve("https-proxy-agent", { paths: [process.cwd()] }));
const ws3PackageRoot = path.resolve(path.dirname(require.resolve("ws3-fca")), "..");
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
  fs.writeFileSync(path.join(fixtureDir, "proxy-test-key.pem"), Buffer.from("LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1JSUV2Z0lCQURBTkJna3Foa2lHOXcwQkFRRUZBQVNDQktnd2dnU2tBZ0VBQW9JQkFRRGJUa0N2clIrdk13ZGwKR1ZHa3NjdSthL05IUEVGNnpBSHZiM1FFcXMrUE85eU9NRHZxL0x3c094M1RDc3hDTzErbU9mOXdQNkt4YUxiYgp1bk9FUm1qanRYR2gwU2FuZGtDL0loTmRYUE14Z0xmSUE3OHBNby9nakhFVzliWnlzOEovbkwwNFVkMTgwOGRyCmp3NkpzVFNvY1RSSzhFZTRvK3YraityYks5cis2MFNFdTJPNTZPZi9wSjF6emdZWm5NRVYzNjVtcmw3STBCUC8Ka2RaUkh5dFdWWXRKeG5HMnNRdGRJZmpqbUZMMm5FN3p4RnljUE1tQWZaMHg1Tm1Obk1vRGhUdVNCQlVpOEFnawoxR2owQ202N01LTjF2ZHJyNGozVXRaSmV3dTFHaWdDQjRoaFQyOWFyZXF4bG5MSFFxbHdRU0tIdFdBdm1vSCswCnlqZFR3ZHFoQWdNQkFBRUNnZ0VBRENmVDVBeHo5d2JWWThPNTFmMERpd3RCWnVUWlZvSWNFY3ZGekpsUTdYQzgKVHZ2Mi95TzZhN2I2cnpnTHFvcGRnZDM0YjU0QVBSMWIrQUd1Yytnbkx4VkMvWGxBTXVmTzlBa3BtUE1WTThBNQo3NUhmWDJwdHRaWElrZ2h4cVAxQ2FMaVd6Tk1qQ1phTnRVT0VHLzVkUmtlSURVTk5XQzB5UTlIRy9OMXMzN2dFCml0Rk1XYW1OQi9sL0lUcXlQbGhweDZLa1pRR3ZHb2NlbVBRUlJhZk1DT293VnN6YVN4RVpzbEtCakY1bFQ1ZHQKMi95bkdzSWxkYU5rTFpnYm1lcEFLNTkxdVNnMG15TUUwcE5xZzhBdmdkemY2SXlna3ZOb2R4c1lLWG0rZnRaNApJYnhqaC9SSWFXMUhNOWcvcGorZzZWTWNRa2x3UlN4U21qVVBDL1FwZFFLQmdRRCtLdFBUYUQ2NDQvOFk2My80CldEd3FDUmhObXgybFpjSkMxVUx0bnEzdlFOS3lPZ3U5bHR5NjNCTnExMDlFZjhjOWwvV1N2dGRUNkpLSGhRc1gKWFpFbDh1cFp1RlhodDFrQldoSmlnbzNYWGs4K05lNzVsMkZjTmpENXBma1NwQVZCU3FBdEJvRkc1dWRxNFZBbwplQW9BWHJnSGo3SkZpUXh2OFcrbWdVaWVmd0tCZ1FEYzR4TE9vdU9PUGU0Ykw0TW9YRGQrdDZYbXBGQlBxVXIwCnU5WTE2cXp3cEg2YUFQcWI0eE9oM1I3WjdQKzdSRkFsWEFtMHZaNVMvWVZOVjdxOGZrd29WR0UvMmFkM3ZYWEEKQnBiSmVzTnNPTHRYRWQ1U0tEVS8wSFhKT1BLakRYb05mMjdXMFMwbWtpbE1Ha3BOSkdiQkQ4MXRnRFY0aVBiUApxa0gxMVc4MjN3S0JnQVl1a0h4aDJyU3dodkhhT0lDWDFNN0k3ZGhsWDNFNGFtTXB3TGo2MVF3dXJYRThURERPClRJd1c4am4xQnE2SjFSVEFiMjZrU2FSMjBhbU9LTmptbzdNaWwyU2JRU3QrUkNIdVNPZ3dlTGEyU29NZTJMTWwKWlc3U3VwbzMyVGtFMkVQZ1Jza1JrVzlpQ2xybEpBZjM4M1pTMTNNSG9iUmpRdlF1RVNNaG5keU5Bb0dCQUwvNgptOTM4dE1wc0NRYVh4T2JQUDJ4ak1VM0VnZ2k2bXVzYVZwT0Y0OGxETHNXckZDVm90eWQzaDlqZ28yT2ZmQWo4CmRYTWhXdm5HWHBWYUtuS3BVb2U2enNzdjROMnhUU1lZay9XSlBWQlIvb0V1aG92aFptYVFSODhjTDhhSGNBMUwKTklxQVF6M0N5eUhadDdwVWFQcGpRYWhxUmc3OCs0YUI4OUkyTHZNQkFvR0JBT1NUdHRhbTN0NnZPS3ozdUVOeQppSkhTU1NtWGxrTlE2UWc4UDBPY1BQOGNUUnhDYWticnViRnhQcUNPVHFnajl5czF5YWhJMkhicTZscUpXYXc3Ck9UblZlRHhzMWJCNVRObElNaU9KRm11R01PTjlERGk5bzZUN2RFUUhScHQ1cHYxNW41bzljeE1ON3NBczdudHkKak9uZjhSQm5CU0NaSi93S3lPdlZhRStjCi0tLS0tRU5EIFBSSVZBVEUgS0VZLS0tLS0K", "base64"));
  fs.writeFileSync(path.join(fixtureDir, "proxy-test-cert.pem"), fs.readFileSync(path.join(__dirname, "fixtures", "proxy-test-cert.pem")));
  t.after(() => fs.rmSync(fixtureDir, { recursive: true, force: true }));
  let observedCookie = "";
  let connectCount = 0;

  const targetServer = https.createServer({
    key: fs.readFileSync(path.join(fixtureDir, "proxy-test-key.pem")),
    cert: fs.readFileSync(path.join(fixtureDir, "proxy-test-cert.pem")),
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
