const replies = Object.freeze([
  "puta, andito na God niyo, supaen niyo ttko",
  "asan na yung mga mahihinang tae? gagawin kong matigas na tubol yan",
  "hoy babaeng mukhang acne, sabi ko wag ka mag yabang dito",
  "kaninong ea to? kantutin ko",
  "Hev Abi is otw to save u, baby."
]);

module.exports = function pickSlashBanat() {
  return replies[Math.floor(Math.random() * replies.length)];
};
