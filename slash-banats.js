const replies = Object.freeze([
  "puta, andito na God niyo, supaen niyo ttko",
  "asan na yung mga mahihinang tae? gagawin kong matigas na tubol yan",
  "hoy babaeng mukhang acne, sabi ko wag ka mag yabang dito",
  "kaninong ea to? kantutin ko",
  "Hev Abi is otw to save u, baby."
]);

function pickSlashBanat() {
  return replies[Math.floor(Math.random() * replies.length)];
}

pickSlashBanat.is = (text) => replies.includes(String(text || ""));
pickSlashBanat.replies = replies;

module.exports = pickSlashBanat;
