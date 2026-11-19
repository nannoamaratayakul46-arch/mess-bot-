"use strict";

const axios = require("axios");
const { HttpsProxyAgent } = require("https-proxy-agent");
const messengerProxyUsage = require("./messengerProxyUsage");

let verificationPromise = null;
let verifiedProxyUrl = null;
let messengerProxyEnabled = true;

function setMessengerProxyEnabled(enabled) {
  messengerProxyEnabled = enabled !== false;
  verificationPromise = null;
  verifiedProxyUrl = null;
}

function isMessengerProxyEnabled() {
  return messengerProxyEnabled;
}

function getMessengerProxyUrl() {
  if (!messengerProxyEnabled) return null;
  const raw = String(process.env.PROXY_URL || "").trim();
  if (!raw) throw new Error("PROXY_URL is required for Messenger transport.");

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("PROXY_URL is invalid; expected an authenticated HTTP(S) proxy URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || !parsed.port) {
    throw new Error("PROXY_URL must include an HTTP(S) scheme, hostname, and port.");
  }
  if (!parsed.username || !parsed.password) {
    throw new Error("PROXY_URL must include proxy authentication credentials.");
  }

  return raw;
}

function safeError(error, proxyUrl) {
  return String(error?.code || error?.message || "request failed")
    .replaceAll(proxyUrl, "[redacted proxy URL]")
    .replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/gi, "http://[redacted]@")
    .slice(0, 120);
}

async function verifyMessengerProxy() {
  if (!messengerProxyEnabled) {
    return { mode: "direct", provider: null, ip: null, country: null, city: null };
  }
  const proxyUrl = getMessengerProxyUrl();
  if (verificationPromise && verifiedProxyUrl === proxyUrl) return verificationPromise;

  const agent = messengerProxyUsage.instrumentAgent(new HttpsProxyAgent(proxyUrl));
  const providers = [
    { name: "ipinfo.io", url: "https://ipinfo.io/json" },
    { name: "ipwho.is", url: "https://ipwho.is/" },
  ];

  const currentVerification = (async () => {
    const failures = [];
    for (const provider of providers) {
      try {
        const response = await axios.get(provider.url, {
          httpsAgent: agent,
          proxy: false,
          timeout: 15000,
          headers: { Accept: "application/json" },
        });
        const data = response.data || {};
        const ip = String(data.ip || "").trim();
        const country = String(data.country || data.country_code || "").trim().toUpperCase();
        const city = String(data.city || "").trim();
        if (!ip || !country || data.success === false) {
          throw new Error("incomplete geo-IP response");
        }

        console.log(
          "[PROXY] Geo-IP probe exit: " + ip + " | " + (city || "Unknown city") + ", " + country +
          ". This verifies the probe only; Messenger HTTP/MQTT routing must be confirmed separately."
        );
        if (country !== "PH") {
          console.warn("[PROXY] Proxy exit is not reported in the Philippines.");
        } else if (city.toLowerCase() !== "manila") {
          console.warn("[PROXY] Geo-IP did not identify Manila; reported city: " + (city || "unknown") + ".");
        }
        return { ip, country, city, provider: provider.name };
      } catch (error) {
        const reason = Number(error?.response?.status)
          ? "HTTP " + error.response.status
          : safeError(error, proxyUrl);
        failures.push(provider.name + ": " + reason);
        console.warn(
          "[PROXY] " + provider.name + " probe failed (" + reason + "); " +
          (provider === providers[providers.length - 1] ? "no fallback remains." : "trying fallback.")
        );
      }
    }
    throw new Error("Proxy egress verification failed: " + failures.join("; "));
  })();

  verifiedProxyUrl = proxyUrl;
  verificationPromise = currentVerification;
  try {
    return await currentVerification;
  } catch (error) {
    // Do not cache a rejected probe. A temporary provider/proxy outage must
    // not permanently prevent a later Messenger login attempt.
    if (verificationPromise === currentVerification) {
      verificationPromise = null;
      verifiedProxyUrl = null;
    }
    throw error;
  }
}

module.exports = { getMessengerProxyUrl, verifyMessengerProxy, setMessengerProxyEnabled, isMessengerProxyEnabled };
