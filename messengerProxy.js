"use strict";

const axios = require("axios");
const { HttpsProxyAgent } = require("https-proxy-agent");

let verificationPromise = null;
let verifiedProxyUrl = null;

function getMessengerProxyUrl() {
  const raw = String(process.env.PROXY_URL || "").trim();
  if (!raw) throw new Error("PROXY_URL is required. Add the authenticated residential proxy URL to the Main Bot Render environment.");

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

function normalizeGeoResult(provider, data) {
  if (!data || typeof data !== "object" || data.success === false) {
    throw new Error("provider returned an unsuccessful response");
  }

  const ip = String(data.ip || "").trim();
  const country = String(data.country || data.country_code || "").trim().toUpperCase();
  const city = String(data.city || "").trim();
  if (!ip || !country) throw new Error("provider returned incomplete IP location details");
  return { ip, city, country, provider };
}

async function requestGeo(provider, agent) {
  const response = await axios.get(provider.url, {
    httpsAgent: agent,
    proxy: false,
    timeout: 15000,
    headers: { Accept: "application/json" },
  });
  return normalizeGeoResult(provider.name, response.data);
}

async function verifyMessengerProxy() {
  const proxyUrl = getMessengerProxyUrl();
  if (verificationPromise && verifiedProxyUrl === proxyUrl) return verificationPromise;

  verifiedProxyUrl = proxyUrl;
  const agent = new HttpsProxyAgent(proxyUrl);
  const providers = [
    { name: "ipinfo.io", url: "https://ipinfo.io/json" },
    { name: "ipwho.is", url: "https://ipwho.is/" },
  ];

  // Cache both success and failure for this process/proxy. This guarantees a
  // single verification sequence per process and prevents dashboard actions
  // from hammering geo-IP providers after a failure.
  verificationPromise = (async () => {
    const failures = [];
    for (const provider of providers) {
      try {
        const result = await requestGeo(provider, agent);
        console.log("[PROXY] Verified outbound IP " + result.ip + " | " +
          (result.city || "Unknown city") + ", " + result.country +
          " via " + result.provider);

        if (result.country !== "PH") {
          console.warn("[PROXY] WARNING: proxy exit country is not the Philippines. Messenger traffic remains routed through the configured proxy.");
        } else if (result.city.toLowerCase() !== "manila") {
          console.warn("[PROXY] WARNING: proxy exit is in the Philippines, but Geo-IP did not identify Manila (reported: " + (result.city || "unknown") + ").");
        } else {
          console.log("[PROXY] Philippine / Manila Geo-IP check passed. Geo-IP city data is approximate.");
        }
        return result;
      } catch (error) {
        const status = Number(error?.response?.status);
        const reason = status ? "HTTP " + status : String(error?.code || error?.message || "request failed").slice(0, 100);
        failures.push(provider.name + ": " + reason);
        console.warn("[PROXY] Geo-IP provider " + provider.name + " failed (" + reason + "); " +
          (provider === providers[providers.length - 1] ? "no fallback provider remains." : "trying fallback provider."));
      }
    }
    throw new Error("Could not verify the configured residential proxy. " + failures.join("; "));
  })();

  return verificationPromise;
}

module.exports = { getMessengerProxyUrl, verifyMessengerProxy };
