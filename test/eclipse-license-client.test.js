"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLicenseClient } = require("../eclipse-license-client");

async function withEnvironment(values, callback) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  try { return await callback(); }
  finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function signedLease(privateKey, installationId, now = Date.now()) {
  const payload = {
    app: "mess-bot",
    installation_id: installationId,
    status: "approved",
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + 600
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return encoded + "." + crypto.sign(null, Buffer.from(encoded), privateKey).toString("base64url");
}

test("main bot client accepts a valid signed approval and persists its lease", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eclipse-main-license-"));
  const id = crypto.randomUUID();
  const pair = crypto.generateKeyPairSync("ed25519");
  const publicKey = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  try {
    await withEnvironment({
      ECLIPSE_LICENSE_ENFORCEMENT: "true",
      ECLIPSE_LICENSE_SERVER_URL: "https://owner.example",
      ECLIPSE_LICENSE_PUBLIC_KEY: publicKey,
      ECLIPSE_INSTALLATION_ID: id,
      ECLIPSE_SECURITY_DATA_DIR: root
    }, async () => {
      let sentBody;
      const client = createLicenseClient({
        fetch: async (_url, options) => {
          sentBody = JSON.parse(options.body);
          return { ok: true, json: async () => ({ status: "approved", token: signedLease(privateKey, id) }) };
        }
      });
      assert.equal(await client.initialize(), true);
      assert.equal(sentBody.app, "mess-bot");
      assert.equal(sentBody.installation_id, id);
      assert.equal(client.getStatus().status, "authorized");
      assert.ok(fs.existsSync(path.join(root, "license-lease")));
      client.stop();
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("main bot client blocks an installation that is pending approval", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eclipse-main-license-pending-"));
  const id = crypto.randomUUID();
  const pair = crypto.generateKeyPairSync("ed25519");
  const publicKey = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  try {
    await withEnvironment({
      ECLIPSE_LICENSE_ENFORCEMENT: "true",
      ECLIPSE_LICENSE_SERVER_URL: "https://owner.example",
      ECLIPSE_LICENSE_PUBLIC_KEY: publicKey,
      ECLIPSE_INSTALLATION_ID: id,
      ECLIPSE_SECURITY_DATA_DIR: root
    }, async () => {
      const client = createLicenseClient({
        fetch: async () => ({ ok: false, json: async () => ({ status: "pending" }) })
      });
      assert.equal(await client.initialize(), false);
      assert.equal(client.getStatus().authorized, false);
      assert.match(client.getStatus().last_error, /pending owner approval/);
      client.stop();
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("main bot client permits bounded offline startup from a cached signed lease", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eclipse-main-license-offline-"));
  const id = crypto.randomUUID();
  const pair = crypto.generateKeyPairSync("ed25519");
  const publicKey = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const now = Date.now();
  try {
    fs.writeFileSync(path.join(root, "license-lease"), signedLease(privateKey, id, now));
    await withEnvironment({
      ECLIPSE_LICENSE_ENFORCEMENT: "true",
      ECLIPSE_LICENSE_SERVER_URL: "https://owner.example",
      ECLIPSE_LICENSE_PUBLIC_KEY: publicKey,
      ECLIPSE_INSTALLATION_ID: id,
      ECLIPSE_SECURITY_DATA_DIR: root,
      ECLIPSE_LICENSE_OFFLINE_GRACE_MS: "86400000"
    }, async () => {
      const client = createLicenseClient({
        now: () => now + 11 * 60 * 1000,
        fetch: async () => { throw new Error("network unavailable"); }
      });
      assert.equal(await client.initialize(), true);
      assert.equal(client.getStatus().status, "offline-authorized");
      assert.ok(client.getStatus().offline_grace_until);
      client.stop();
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
