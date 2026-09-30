from pathlib import Path

# Dynamic reply-name fix.
p = Path('triggers.js')
s = p.read_text(encoding='utf-8')
s = s.replace(
'''function getTriggerReply(\n  rawText,\n  senderId\n) {''',
'''async function getTriggerReply(\n  rawText,\n  senderId,\n  threadId,\n  api,\n  event\n) {''', 1)

marker = '// TRIGGER / ID MATCHING\n// ============================================================\n'
helper = '''async function resolveReplyTargetName(api, event) {\n  const reply = event && event.messageReply;\n  const targetId = reply && (reply.senderID || reply.senderId || reply.sender_id);\n  if (!targetId || !api || typeof api.getUserInfo !== "function") return null;\n  try {\n    const users = await new Promise((resolve, reject) => {\n      api.getUserInfo(String(targetId), (err, result) => err ? reject(err) : resolve(result));\n    });\n    const user = users && users[String(targetId)];\n    return user && user.name ? String(user.name).trim() : null;\n  } catch (err) {\n    console.warn('[TRIGGERS] Failed to resolve reply target:', err && err.message ? err.message : err);\n    return null;\n  }\n}\n\n'''
if 'async function resolveReplyTargetName' not in s:
    if marker not in s: raise SystemExit('trigger marker not found')
    s = s.replace(marker, marker + helper, 1)

s = s.replace(
'''    if (hit) {\n      return getNextReply(group);\n    }''',
'''    if (hit) {\n      const reply = getNextReply(group);\n      if (String(reply).trim().toLowerCase() === "jaiden na naman") {\n        const targetName = await resolveReplyTargetName(api, event);\n        return targetName ? `${targetName} na naman` : reply;\n      }\n      return reply;\n    }''', 1)
p.write_text(s, encoding='utf-8')

# Pass the live API/event into the trigger resolver.
p = Path('index.js')
s = p.read_text(encoding='utf-8')
s = s.replace(
'''const triggerReply = await getTriggerReply(\n      body,\n      senderId,\n      threadId\n    );''',
'''const triggerReply = await getTriggerReply(\n      body,\n      senderId,\n      threadId,\n      api,\n      event\n    );''', 1)

# Random / command responses.
pool_marker = 'const lastRandomRoastByThread = new Map();\n'
pool = '''const SLASH_BANAT_REPLIES = Object.freeze([\n  "puta, andito na God niyo, supaen niyo ttko",\n  "asan na yung mga mahihinang tae? gagawin kong matigas na tubol yan",\n  "hoy babaeng mukhang acne, sabi ko wag ka mag yabang dito",\n  "kaninong ea to? kantutin ko",\n  "Hev Abi is otw to save u, baby.",\n  "Oh akala ko ba 'di ka pumapatol sa 'di gumagastos'\\nDi mo kaya pagka bastos ko\\nKahit 'di mo na sabihin alam ko ang gusto\\nPanatilihin nating lihim\\nKahit 'di na kahit pa ma-tuss oh