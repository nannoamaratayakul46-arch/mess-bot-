"use strict";

const fs = require("fs");
const path = require("path");

const root = __dirname;

function patchFile(fileName, patcher) {
  const filePath = path.join(root, fileName);

  try {
    const source = fs.readFileSync(filePath, "utf8");
    const patched = patcher(source);

    if (patched !== source) {
      fs.writeFileSync(filePath, patched, "utf8");
      console.log("[HOTFIX] Patched " + fileName);
    }
  } catch (error) {
    console.error("[HOTFIX] Failed to patch " + fileName + ":", error);
    throw error;
  }
}

patchFile("ai/index.js", (source) => {
  let out = source;

  out = out.replace(
    'such as "baby" is allowed',
    'such as \\"baby\\" is allowed'
  );

  out = out.replace(
    'call this person "baby" as',
    'call this person \\"baby\\" as'
  );

  out = out.replace(
    'terms such as "baldie", "doggie", "cancer cell", or "tukmol".',
    'terms such as \\"baldie\\", \\"doggie\\", \\"cancer cell\\", or \\"tukmol\\".'
  );

  return out;
});

patchFile("triggers.js", (source) => {
  let out = source;

  out = out.replace(
    '      return rap;',
    '      return enforceBanatAddressStyle(rap, senderId);'
  );

  out = out.replace(
    '        return targetReply;',
    '        return enforceBanatAddressStyle(targetReply, senderId);'
  );

  out = out.replace(
    'return reply.replace(/\\\\bbaby\\\\b/gi, replacement);',
    'return reply.replace(/\\bbaby\\b/gi, replacement);'
  );

  return out;
});

patchFile("index.js", (source) => {
  let out = source;

  out = out.replace(
    '  classifyBanatTarget,\n} = require("./banat-targeting");',
    '  classifyBanatTarget,\n  setBanatConversationMode,\n} = require("./banat-targeting");'
  );

  out = out.replace(
    '    if (!conversationActive) {\n      return false;\n    }',
    '    return false;'
  );

  out = out.replace(
    'const randomRoastReply = getRandomRoastReply(threadID, body);',
    'const randomRoastReply = getRandomRoastReply(threadID, body, senderId);'
  );

  const marker = 'const banatControlMatch';
  const markerIndex = out.indexOf(marker);

  if (markerIndex >= 0) {
    const start = out.indexOf('      if (!enabled) {', markerIndex);
    const end = out.indexOf('    } catch (error) {', start);

    if (start >= 0 && end >= 0) {
      const replacement = `      setBanatConversationMode(threadId, enabled, senderId);

      if (!enabled) {
        lastRandomRoastByThread.delete(threadId);
      }

      if (enabled) {
        // Activation uses the normal Banat pool instead of a generic mode message.
        // The owner remains immune to ECLIPSE insults, so owner activation is silent.
        if (!isOwner(senderId)) {
          const activationReply = getRandomRoastReply(
            threadID,
            "/",
            senderId
          );

          if (activationReply) {
            sendReplyWithTyping(
              api,
              activationReply,
              threadID
            );
          }
        }
      } else {
        sendReplyWithTyping(
          api,
          "bawi ka pag malakas ka na tanga",
          threadID
        );
      }

`;

      out = out.slice(0, start) + replacement + out.slice(end);
    }
  }

  return out;
});
