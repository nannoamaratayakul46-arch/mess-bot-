"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const pkg = JSON.parse(read("package.json"));
const checks = [
  ["ws3-fca is pinned to 3.5.2", pkg.dependencies?.["ws3-fca"] === "3.5.2"],
  ["login uses the 3.5.2 appState credential object", /login\(\s*\{\s*appState:\s*loginInput\s*\}/.test(read("index.js"))],
  ["login Promise rejection is observed", /loginResult\.catch\(/.test(read("index.js"))],
  ["one MQTT listener installation remains", (read("index.js").match(/\bapi\.listenMqtt\s*\(/g) || []).length === 1],
  ["private send uses 3.5.2 MQTT argument order", /sendMessageMqtt\(\s*job\.message,\s*job\.threadID,\s*job\.replyToMessageID\s*\|\|\s*undefined\s*\)/.test(read("messengerSendRouting.js"))],
  ["group and standard sends pass reply ID and isSingleUser", /job\.replyToMessageID\s*\|\|\s*undefined,\s*isSingleUser/.test(read("messengerSendRouting.js"))],
  ["send Promise is bridged to the Traffic Governor callback", /Promise\.resolve\(result\)\.then\([\s\S]*finish\(null, info\)/.test(read("messengerSendRouting.js"))],
  ["standard reaction Promise is bridged to legacy callbacks", /rawApi\.setMessageReaction\(reaction, messageID\)/.test(read("index.js")) && /Promise\.resolve\(result\)\.then\(/.test(read("index.js"))],
  ["MQTT reaction Promise is bridged to legacy callbacks", /rawApi\.setMessageReactionMqtt\(reaction, messageID, threadID\)/.test(read("index.js"))],
  ["editMessage queue accepts callback and Promise results", /result\.then\([\s\S]*done\(null, info\)/.test(read("index.js"))],
  ["typing indicator accepts Promise results", /api\.sendTypingIndicator\(Boolean\(active\), key, callback\)/.test(read("typingIndicator.js")) && /result\.then\(/.test(read("typingIndicator.js"))],
  ["Auto Welcome user lookup accepts Promise results", /api\.getUserInfo\(id,[\s\S]*result\.then\(/.test(read("autoWelcome.js"))],
  ["Games user lookup accepts Promise results", /api\.getUserInfo\(userID, finish\)[\s\S]*result\.then\(/.test(read("games.js"))],
  ["Reply trigger user lookup accepts Promise results", /api\.getUserInfo\(String\(id\),finish\)[\s\S]*result\.then\(/.test(read("triggers.js"))],
  ["thread-list adapter accepts Promise results", /api\.getThreadList\(1000, null, \[\], finish\)[\s\S]*result\.then\(/.test(read("messengerThreadList.js"))],
  ["moderation thread-info/list lookups accept Promise results", /api\.getThreadInfo\(threadID,[\s\S]*result\.then\(/.test(read("moderation.js")) && /api\.getThreadList\(1000, null, \[\], finish\)[\s\S]*result\.then\(/.test(read("moderation.js"))],
  ["group membership fallback wrapper accepts Promise results", /function callbackCall\([\s\S]*result\.then\(data => finish\(null, data\)/.test(read("antiSpam.js"))],
  ["no active runtime comments still describe 2.0.1 reaction signatures", !/ws3-fca@2\.0\.1|ws3-fca 2\.0\.1/.test(read("banat-human.js") + read("messengerSendRouting.js") + read("index.js"))],
  ["obsolete 2.0.1 source patch helper and fixture are removed", !fs.existsSync(path.join(root, "scripts/ws3-fca-error-patch.js")) && !fs.existsSync(path.join(root, "test/ws3-fca-error-patch.test.js")) && !read("package.json").includes("ws3-fca-error-patch.js")],
  ["shared compatibility helper exists and exports send/edit/reaction adapters", /function sendGroupMessage/.test(read("messengerApiCompat.js")) && /function editMessage/.test(read("messengerApiCompat.js")) && /function setMessageReactionMqtt/.test(read("messengerApiCompat.js"))],
  ["raw 3.5.2 group send uses the standard Promise argument order", /\[message, String\(threadID\), replyToMessageID, false\]/.test(read("messengerApiCompat.js"))],
  ["Traffic Governor sends preserve its callback bridge", /\[message, String\(threadID\), finish, replyToMessageID, true\]/.test(read("messengerApiCompat.js"))],
  ["Burst and Roast uses shared send and reaction adapters", /sendGroupMessage\(api, text, threadID\)/.test(read("burstRoastSettings.js")) && /setMessageReaction\(api,/.test(read("burstRoastSettings.js"))],
  ["Games uses shared send, edit, and reaction adapters", /sendGroupMessage\(api, text, threadID/.test(read("games.js")) && /editMessengerMessage\(/.test(read("games.js")) && /setMessageReaction\(api,/.test(read("games.js"))],
  ["Auto Welcome and Live Chat use the shared send adapter", /sendGroupMessage\(api, payload, threadID\)/.test(read("autoWelcome.js")) && /sendGroupMessage\(api, text, id\)/.test(read("liveChat.js"))],
  ["Exams, slots, and investigations use the shared send adapter", /sendGroupMessage\(api, text, threadID\)/.test(read("exam-manager.js")) && /sendGroupMessage\(api, text, threadID\)/.test(read("slots.js")) && /sendGroupMessage\(api, text, String\(threadID\)/.test(read("investigations/index.js"))],
  ["Moderation, AntiSpam, and picture delivery use the shared send adapter", /sendGroupMessage\(api, message, threadID\)/.test(read("moderation.js")) && /sendGroupMessage\(api, text, threadID/.test(read("antiSpam.js")) && /sendGroupMessage\(api, outgoingMessage, threadID/.test(read("pictures.js"))],
];

let failed = 0;
for (const [label, passed] of checks) {
  console.log((passed ? "PASS " : "FAIL ") + label);
  if (!passed) failed++;
}
console.log(`ws3-fca compatibility audit: ${checks.length - failed}/${checks.length} checks passed.`);
if (failed) process.exitCode = 1;
