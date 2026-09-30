"use strict";

const Module = require("module");
const originalExtension = Module._extensions[".js"];

function installBroadcastFix(source) {
  let patched = source;

  if (!patched.includes("function broadcastToAllThreads(")) {
    return source;
  }

  // Preserve the original helpers, then place hardened replacements
  // before the original declarations. Function declarations are hoisted,
  // so the replacement wins without modifying the large index.js file.
  patched = patched.replace(
    "function getBroadcastImageAttachment(event) {",
    "function getBroadcastImageAttachmentOriginal(event) {"
  );

  patched = patched.replace(
    "async function stageBroadcastImage(attachment) {",
    "async function stageBroadcastImageOriginal(attachment) {"
  );

  const getMarker = "\nfunction getBroadcastImageAttachmentOriginal(event) {";
  const stageMarker = "\nasync function stageBroadcastImageOriginal(attachment) {";

  if (!patched.includes(getMarker) || !patched.includes(stageMarker)) {
    return source;
  }

  const getReplacement = `
function getBroadcastImageAttachment(event) {
  const candidates = [];

  const pushCandidate = (value) => {
    if (value && typeof value === "object") {
      candidates.push(value);
    }
  };

  const attachments = Array.isArray(event?.attachments)
    ? event.attachments
    : [];

  for (const attachment of attachments) {
    pushCandidate(attachment);

    if (Array.isArray(attachment?.attachments)) {
      for (const nested of attachment.attachments) {
        pushCandidate(nested);
      }
    }
  }

  pushCandidate(event?.attachment);
  pushCandidate(event?.message?.attachment);
  pushCandidate(event?.messageReply?.attachment);

  const hasUsableUrl = (attachment) => [
    attachment?.url,
    attachment?.payload?.url,
    attachment?.payload?.source,
    attachment?.source,
    attachment?.href,
    attachment?.downloadUrl,
    attachment?.download_url,
    attachment?.imageUrl,
    attachment?.image_url,
    attachment?.metadata?.url,
    attachment?.metadata?.source,
  ]
    .some((value) => typeof value === "string" && /^https?:\\/\\//i.test(value.trim()));

  const isImage = (attachment) => {
    if (!hasUsableUrl(attachment)) {
      return false;
    }

    const type = String(
      attachment?.type ||
      attachment?.mimeType ||
      attachment?.mime_type ||
      attachment?.payload?.type ||
      ""
    ).toLowerCase();

    return (
      !type ||
      type === "photo" ||
      type === "image" ||
      type === "picture" ||
      type === "animated_image"
    );
  };

  return candidates.find(isImage) || null;
}
`;

  const stageReplacement = `
async function stageBroadcastImage(attachment) {
  const candidates = [
    attachment?.url,
    attachment?.payload?.url,
    attachment?.payload?.source,
    attachment?.source,
    attachment?.href,
    attachment?.downloadUrl,
    attachment?.download_url,
    attachment?.imageUrl,
    attachment?.image_url,
    attachment?.metadata?.url,
    attachment?.metadata?.source,
  ];

  const imageUrl = candidates
    .map((value) => typeof value === "string" ? value.trim() : "")
    .find((value) => /^https?:\\/\\//i.test(value));

  if (!imageUrl) {
    console.warn("[BROADCAST] Image attachment has no usable URL.");
    return null;
  }

  const temporaryFile = path.join(
    os.tmpdir(),
    \`eclipse-broadcast-\${crypto.randomUUID()}.img\`
  );

  try {
    if (typeof fetch !== "function") {
      throw new Error("Global fetch is unavailable on this Node runtime.");
    }

    const response = await fetch(imageUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
      headers: {
        "User-Agent": "ECLIPSE Messenger Bot",
      },
    });

    if (!response.ok) {
      throw new Error(\`HTTP \${response.status} while downloading broadcast image.\`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) {
      throw new Error("Downloaded broadcast image is empty.");
    }

    await fsp.writeFile(temporaryFile, buffer);

    const stat = await fsp.stat(temporaryFile);
    if (!stat.isFile() || stat.size <= 0) {
      throw new Error("Broadcast image file was not written correctly.");
    }

    console.log(
      \`[BROADCAST] Staged image: \${Math.round(stat.size / 1024)} KB\`
    );

    return temporaryFile;
  } catch (error) {
    console.error("[BROADCAST] Failed to stage image:", error);

    try {
      await fsp.rm(temporaryFile, { force: true });
    } catch {}

    return null;
  }
}
`;

  patched = patched.replace(getMarker, `\n${getReplacement}${getMarker}`);
  patched = patched.replace(stageMarker, `\n${stageReplacement}${stageMarker}`);

  return patched;
}

Module._extensions[".js"] = function broadcastRuntimeExtension(mod, filename) {
  if (/index\\.js$/.test(filename)) {
    const fs = require("fs");
    const source = fs.readFileSync(filename, "utf8");
    return mod._compile(installBroadcastFix(source), filename);
  }

  return originalExtension(mod, filename);
};
