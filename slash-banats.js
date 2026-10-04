"use strict";

const { groups } = require("./triggers");

function pickSlashBanat() {
  const group = groups.find((item) => item.name === "banat-natural");
  const replies = Array.isArray(group?.replies) ? group.replies : [];

  if (!replies.length) {
    return "okay, banat is on 😭";
  }

  return replies[Math.floor(Math.random() * replies.length)];
}

pickSlashBanat.is = (text) =>
  String(groups.find((item) => item.name === "banat-natural")?.replies || "")
    .includes(String(text || ""));

pickSlashBanat.replies =
  groups.find((item) => item.name === "banat-natural")?.replies || [];

module.exports = pickSlashBanat;
