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
  ["buildAPI parser failures are diagnosed without retrying or rejecting the stored session", /isWs3FcaBuildApiParserFailure\(error\)/.test(read("index.js")) && /failure_kind: "ws3_fca_buildapi_parser"/.test(read("index.js")) && /automatic login retries are paused/.test(read("index.js"))],
  ["one MQTT listener installation remains", (read("index.js").match(/\bapi\.listenMqtt\s*\(/g) || []).length === 1],
  ["private send uses 3.5.2 MQTT argument order", /sendMessageMqtt\(\s*job\.message,\s*job\.threadID,\s*job\.replyToMessageID\s*\|\|\s*undefined\s*\)/.test(read("messengerSendRouting.js"))],
  ["group and standard sends pass reply ID and isSingleUser", /job\.replyToMessageID\s*\|\|\s*undefined,\s*isSingleUser/.test(read("messengerSendRouting.js"))],
  ["send Promise is bridged to the Traffic Governor callback", /Promise\.resolve\(result\)\.then\([\s\S]*finish\(null, info\)/.test(read("messengerSendRouting.js"))],
  ["standard reaction Promise is bridged to legacy callbacks", /rawApi\.setMessageReaction\(reaction, messageID\)/.test(read("index.js")) && /Promise\.resolve\(result\)\.then\(/.test(read("index.js"))],
  ["MQTT reaction adapter treats raw 3.5.2 publish as synchronous", /method\.call\(raw, reaction, String\(messageID\), String\(threadID\)\)/.test(read("messengerApiCompat.js")) && /acknowledged: false, transport: "mqtt"/.test(read("messengerApiCompat.js"))],
  ["editMessage queue accepts callback and Promise results", /result\.then\([\s\S]*done\(null, info\)/.test(read("index.js"))],
  ["typing indicator accepts Promise results", /api\.sendTypingIndicator\(Boolean\(active\), key, callback\)/.test(read("typingIndicator.js")) && /result\.then\(/.test(read("typingIndicator.js"))],
  ["Auto Welcome user lookup accepts Promise results", /api\.getUserInfo\(id,[\s\S]*result\.then\(/.test(read("autoWelcome.js"))],
  ["Games user lookup accepts Promise results", /api\.getUserInfo\(userID, finish\)[\s\S]*result\.then\(/.test(read("games.js"))],
  ["Reply trigger user lookup accepts Promise results", /api\.getUserInfo\(String\(id\),finish\)[\s\S]*result\.then\(/.test(read("triggers.js"))],
  ["thread-list adapter accepts Promise results", /api\.getThreadList\(1000, null, \[\], finish\)[\s\S]*result\.then\(/.test(read("messengerThreadList.js"))],
  ["moderation thread-info/list lookups accept Promise results", /api\.getThreadInfo\(threadID,[\s\S]*result\.then\(/.test(read("moderation.js")) && /api\.getThreadList\(1000, null, \[\], finish\)[\s\S]*result\.then\(/.test(read("moderation.js"))],
  ["group-admin verification lookup accepts callback and Promise APIs", /function invokeCallbackOrPromise\([\s\S]*result\.then\(value => finish\(null, value\)/.test(read("messengerApiCompat.js")) && /changeGroupAdminStatus\(api, "demote"/.test(read("antiSpam.js"))],
  ["no active runtime comments still describe 2.0.1 reaction signatures", !/ws3-fca@2\.0\.1|ws3-fca 2\.0\.1/.test(read("banat-human.js") + read("messengerSendRouting.js") + read("index.js"))],
  ["obsolete 2.0.1 source patch helper and fixture are removed", !fs.existsSync(path.join(root, "scripts/ws3-fca-error-patch.js")) && !fs.existsSync(path.join(root, "test/ws3-fca-error-patch.test.js")) && !read("package.json").includes("ws3-fca-error-patch.js")],
  ["shared compatibility helper exists and exports send/edit/reaction adapters", /function sendGroupMessage/.test(read("messengerApiCompat.js")) && /function editMessage/.test(read("messengerApiCompat.js")) && /function setMessageReactionMqtt/.test(read("messengerApiCompat.js"))],
  ["nickname guard restores photos through the shared 3.5.2 compatibility adapter", /changeGroupImage: changeGroupImageCompat/.test(read("nickname-guard.js")) && /return changeGroupImageCompat\(/.test(read("nickname-guard.js")) && !/api\.changeGroupImage\(/.test(read("nickname-guard.js"))],
  ["raw MQTT reaction adapter does not wait for a nonexistent Promise or callback", /setMessageReactionMqtt\(api,[\s\S]*?method\.call\(raw/.test(read("messengerApiCompat.js"))],
  ["application Node engine satisfies ws3-fca 3.5.2 Node >=22 requirement", pkg.engines?.node === ">=22.0.0"],
  ["group membership uses ws3-fca 3.5.2 gcmember adapter", /async function changeGroupMember/.test(read("messengerApiCompat.js")) && /changeGroupMember\(api, "remove"/.test(read("moderation.js")) && /changeGroupMember\(api, "add"/.test(read("antiSpam.js"))],
  ["gcmember adapter bounds stalled membership operations", /Promise\.race\([\s\S]*?raw\.gcmember\([\s\S]*?group membership request timed out/.test(read("messengerApiCompat.js"))],
  ["obsolete addUserToGroup/removeUserFromGroup calls are absent from active moderation paths", !/api\.(?:addUserToGroup|removeUserFromGroup)\s*\(/.test(read("antiSpam.js") + read("moderation.js") + read("dashboardModeration.js") + read("index.js"))],
  ["nickname guard does not call removed changeGroupImage API directly", /return changeGroupImageCompat\(/.test(read("nickname-guard.js")) && !/api\.changeGroupImage\s*\(/.test(read("nickname-guard.js"))],
  ["targeted laugh and PM Battles use the MQTT reaction compatibility adapter", /setMessageReactionMqtt\(api,/.test(read("groupProfileRoutes.js")) && /setMessageReactionMqtt\(api,/.test(read("pmBattles.js"))],
  ["raw 3.5.2 group send uses the standard Promise argument order", /\[message, String\(threadID\), replyToMessageID, false\]/.test(read("messengerApiCompat.js"))],
  ["Traffic Governor sends preserve its callback bridge", /\[message, String\(threadID\), finish, replyToMessageID, true\]/.test(read("messengerApiCompat.js"))],
  ["Burst and Roast uses shared send and reaction adapters", /sendGroupMessage\(api, text, threadID\)/.test(read("burstRoastSettings.js")) && /setMessageReaction\(api,/.test(read("burstRoastSettings.js"))],
  ["Games uses shared send, edit, and reaction adapters", /sendGroupMessage\(api, text, threadID/.test(read("games.js")) && /editMessengerMessage\(/.test(read("games.js")) && /setMessageReaction\(api,/.test(read("games.js"))],
  ["Auto Welcome and Live Chat use the shared send adapter", /sendGroupMessage\(api, payload, threadID\)/.test(read("autoWelcome.js")) && /sendGroupMessage\(api, text, id\)/.test(read("liveChat.js"))],
  ["Exams, slots, and investigations use the shared send adapter", /sendGroupMessage\(api, text, threadID\)/.test(read("exam-manager.js")) && /sendGroupMessage\(api, text, threadID\)/.test(read("slots.js")) && /sendGroupMessage\(api, text, String\(threadID\)/.test(read("investigations/index.js"))],
  ["Moderation, AntiSpam, and picture delivery use the shared send adapter", /sendGroupMessage\(api, message, threadID\)/.test(read("moderation.js")) && /sendGroupMessage\(api, text, threadID/.test(read("antiSpam.js")) && /sendGroupMessage\(api, outgoingMessage, threadID/.test(read("pictures.js"))],
  ["shared moderation removal checks ws3-fca gcmember, not removed removeUserFromGroup", /typeof api\?\.gcmember !== "function"/.test(read("moderation.js")) && !/api\.removeUserFromGroup\s*\(/.test(read("moderation.js"))],
  ["dashboard moderation and Raid Shield approvals require ws3-fca gcmember", /typeof api\.gcmember !== "function"/.test(read("dashboardModeration.js")) && /typeof api\.gcmember !== "function"/.test(read("antiSpam.js")) && !/api\.removeUserFromGroup\s*\(/.test(read("dashboardModeration.js") + read("antiSpam.js"))],
  ["group-admin role changes use gcrule and verify fresh adminIDs", /async function changeGroupAdminStatus/.test(read("messengerApiCompat.js")) && /raw\.gcrule\(rule, targetID, groupID\)/.test(read("messengerApiCompat.js")) && /isGroupAdmin\(info, targetID\)/.test(read("messengerApiCompat.js")) && /changeGroupAdminStatus\(api, "demote"/.test(read("antiSpam.js")) && /changeGroupAdminStatus\(api, "promote"/.test(read("antiSpam.js"))],
  ["dashboard-owned reactions use the ws3-fca MQTT compatibility adapter", /require\("\.\/messengerApiCompat"\)/.test(read("index.js")) && (read("index.js").match(/setMessageReactionMqtt\(api,/g) || []).length >= 2 && !/api\.setMessageReactionMqtt\s*\(/.test(read("index.js"))],
  ["dashboard group leave uses gcmember through the compatibility adapter", /changeGroupMember\(activeMessengerApi, "remove", currentUserID, threadID\)/.test(read("index.js")) && !/removeUserFromGroup/.test(read("index.js"))],
  ["Jaiden target nickname sync recognizes ws3-fca 3.5.2 nickname API", /typeof api\?\.nickname === "function" \|\| typeof api\?\.changeNickname === "function"/.test(read("index.js")) && /changeNicknameAsync\(api, nicknameValue, threadID, dashboardTargetId\)/.test(read("index.js"))],
  ["guarded MQTT callback reports publish acceptance without claiming acknowledgement", /acknowledged: false, transport: "mqtt"/.test(read("index.js")) && /callback\(null, published\)/.test(read("index.js"))],

];

let failed = 0;
for (const [label, passed] of checks) {
  console.log((passed ? "PASS " : "FAIL ") + label);
  if (!passed) failed++;
}
console.log(`ws3-fca compatibility audit: ${checks.length - failed}/${checks.length} checks passed.`);
if (failed) process.exitCode = 1;
