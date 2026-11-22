"use strict";

async function resolveAddressFromHeaders(headers = {}) {
  const lat = Number(headers["x-eclipse-lat"]);
  const lon = Number(headers["x-eclipse-lon"]);
  const rawAccuracy = Number(headers["x-eclipse-geo-accuracy"]);
  const accuracyMeters =
    Number.isFinite(rawAccuracy) && rawAccuracy >= 0
      ? Math.round(rawAccuracy)
      : null;

  const hasValidCoords =
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180;

  if (!hasValidCoords) {
    return {
      latitude: null,
      longitude: null,
      accuracyMeters,
      address: null,
    };
  }

  const fallbackCoords = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("format", "jsonv2");

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "gmeetroom-backend/1.0 (https://gmeetroom.pntr.dev)",
      },
    });

    if (!response.ok) {
      return {
        latitude: lat,
        longitude: lon,
        accuracyMeters,
        address: fallbackCoords,
      };
    }

    const data = await response.json();
    const addr = data.address || {};
    const parts = [
      addr.road,
      addr.suburb || addr.neighbourhood || addr.village || addr.quarter,
      addr.city || addr.town || addr.municipality,
      addr.state || addr.region || addr.province,
      addr.country,
    ].filter(Boolean);

    return {
      latitude: lat,
      longitude: lon,
      accuracyMeters,
      address:
        parts.length > 0
          ? parts.join(", ")
          : data.display_name || fallbackCoords,
    };
  } catch {
    return {
      latitude: lat,
      longitude: lon,
      accuracyMeters,
      address: fallbackCoords,
    };
  }
}

module.exports = {
  resolveAddressFromHeaders,
};
