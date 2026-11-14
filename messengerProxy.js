"use strict";

const axios = require("axios");
const { HttpsProxyAgent } = require("https-proxy-agent");

let verificationPromise = null;
let verifiedProxyUrl = null;

function getMessengerProxyUrl() {
  const raw = String(process.env.PROXY_URL || "").trim();
  if (!raw) throw new Error("PROXY_URL is required. Add your authenticated Philippine residential proxy URL to the Main Bot Render environment.");

  let parsed;
  try { parsed = new URL(raw); } catch {
    throw new Error("PROXY_URL is invalid. Expected http://username:password@host:port or https://username:password@host:port.");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || !parsed.port) {
    throw new Error("PROXY_URL must include an HTTP(S) scheme, hostname, and port.");
  }
  if (!parsed.username || !parsed.password) {
    throw new Error("PROXY_URL must include the residential proxy username and password.");
  }
  // Route common Node HTTP clients and child processes through the same exit IP.
  // ws3-fca also receives proxy explicitly for its HTTP + MQTT WebSocket transports.
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) {
    process.env[key] = raw;
  }
  process.env.NO_PROXY = "";
  process.env.no_proxy = "";
  return raw;
}

async function verifyMessengerProxy() {
  const proxyUrl = getMessengerProxyUrl();
  if (verificationPromise && verifiedProxyUrl === proxyUrl) return verificationPromise;

  verifiedProxyUrl = proxyUrl;
  verificationPromise = (async () => {
    const agent = new HttpsProxyAgent(proxyUrl);
    try {
      const response = await axios.get("https://ipinfo.io/json", {
        httpsAgent: agent,
        proxy: false,
        timeout: 15000,
        headers: { Accept: "application/json" },
      });
      const data = response.data || {};
      const country = String(data.country || "").toUpperCase();
      const city = String(data.city || "").trim();
      const ip = String(data.ip || "").trim();
      if (!country || !ip) throw new Error("IP location provider returned incomplete proxy details.");

      console.log("[PROXY] Verified outbound IP " + ip + " | " + (city || "Unknown city") + ", " + country);
      if (country !== "PH") {
        console.warn("[PROXY] WARNING: proxy exit country is not the Philippines. Messenger traffic will still use this proxy, but the requested PH location is not verified.");
      } else if (city.toLowerCase() !== "manila") {
        console.warn("[PROXY] WARNING: proxy exit is in the Philippines, but Geo-IP did not identify Manila (reported: " + (city || "unknown") + ").");
      } else {
        console.log("[PROXY] Philippine / Manila Geo-IP check passed. Geo-IP city data is approximate.");
      }
      return { ip, city, country };
    } catch (error) {
      verificationPromise = null;
      verifiedProxyUrl = null;
      throw new Error("Could not verify the configured residential proxy through ipinfo.io: " + String(error?.message || error).slice(0, 220));
    }
  })();
  return verificationPromise;
}

module.exports = { getMessengerProxyUrl, verifyMessengerProxy };
