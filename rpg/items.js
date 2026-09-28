const ITEMS = {
  minor_potion: { id: "minor_potion", name: "Minor Healing Potion", emoji: "🧪", type: "consumable", category: "Consumables", rarity: "Common", value: 100, effect: { hp: 35 }, description: "Restores 35 HP during combat or exploration.", purchasable: true },
  health_potion: { id: "health_potion", name: "Health Potion", emoji: "❤️", type: "consumable", category: "Consumables", rarity: "Common", value: 100, effect: { hp: 50 }, description: "Restores 50 HP.", purchasable: true },
  greater_health_potion: { id: "greater_health_potion", name: "Greater Health Potion", emoji: "💖", type: "consumable", category: "Consumables", rarity: "Uncommon", value: 300, effect: { hp: 125 }, description: "Restores 125 HP.", purchasable: true },
  mana_potion: { id: "mana_potion", name: "Mana Potion", emoji: "🔷", type: "consumable", category: "Consumables", rarity: "Common", value: 120, effect: { mp: 30 }, description: "Restores 30 MP.", purchasable: true },
  greater_mana_potion: { id: "greater_mana_potion", name: "Greater Mana Potion", emoji: "💠", type: "consumable", category: "Consumables", rarity: "Uncommon", value: 320, effect: { mp: 90 }, description: "Restores 90 MP.", purchasable: true },
  iron_sword: { id: "iron_sword", name: "Iron Sword", emoji: "⚔️", type: "weapon", category: "Equipment", rarity: "Common", value: 250, stats: { strength: 5 }, description: "A dependable starter weapon.", purchasable: true },
  ranger_bow: { id: "ranger_bow", name: "Ranger Bow", emoji: "🏹", type: "weapon", category: "Equipment", rarity: "Uncommon", value: 600, stats: { agility: 7, luck: 2 }, description: "A light bow built for accurate shots.", purchasable: true },
  apprentice_robe: { id: "apprentice_robe", name: "Apprentice Robe", emoji: "🧥", type: "armor", category: "Equipment", rarity: "Common", value: 300, stats: { intelligence: 5, maxMp: 15 }, description: "A simple robe with a little arcane protection.", purchasable: true },
  moonleaf: { id: "moonleaf", name: "Moonleaf", emoji: "🌿", type: "material", category: "Materials", rarity: "Uncommon", value: 40, description: "A cool herb used in crafting.", purchasable: true },
  iron: { id: "iron", name: "Iron", emoji: "⛓️", type: "material", category: "Materials", rarity: "Common", value: 25, description: "Refined metal for weapons and buildings.", purchasable: true },
  void_crystal: { id: "void_crystal", name: "Void Crystal", emoji: "💎", type: "material", category: "Materials", rarity: "Epic", value: 500, description: "A dangerous crystal from the Abyss.", purchasable: true },
  ancient_iron: { id: "ancient_iron", name: "Ancient Iron", emoji: "⛓️", type: "material", category: "Materials", rarity: "Rare", value: 250, description: "Old-world iron used for legendary forging.", purchasable: false },
  celestial_core: { id: "celestial_core", name: "Celestial Core", emoji: "☀️", type: "material", category: "Materials", rarity: "Legendary", value: 1500, description: "A radiant core from celestial encounters.", purchasable: false },
  dragonsteel: { id: "dragonsteel", name: "Dragonsteel", emoji: "🔥", type: "material", category: "Materials", rarity: "Legendary", value: 1800, description: "Metal tempered in dragonfire.", purchasable: false },
  dragon_heart: { id: "dragon_heart", name: "Dragon Heart", emoji: "❤️‍🔥", type: "material", category: "Materials", rarity: "Mythic", value: 3000, description: "The condensed heart of a world dragon.", purchasable: false },
  celestial_shard: { id: "celestial_shard", name: "Celestial Shard", emoji: "✨", type: "material", category: "Materials", rarity: "Celestial", value: 4000, description: "A shard of condensed celestial power.", purchasable: false },
  forest_egg: { id: "forest_egg", name: "Forest Egg", emoji: "🥚", type: "material", category: "Companion Eggs", rarity: "Uncommon", value: 500, description: "An egg that may hatch into a forest companion.", purchasable: false },
  frost_egg: { id: "frost_egg", name: "Frost Egg", emoji: "🥚", type: "material", category: "Companion Eggs", rarity: "Rare", value: 1000, description: "An egg carrying a frost companion.", purchasable: false },
  dragon_egg: { id: "dragon_egg", name: "Dragon Egg", emoji: "🥚", type: "material", category: "Companion Eggs", rarity: "Legendary", value: 3000, description: "A dragon companion egg.", purchasable: false },
  celestial_egg: { id: "celestial_egg", name: "Celestial Egg", emoji: "🥚", type: "material", category: "Companion Eggs", rarity: "Celestial", value: 5000, description: "A celestial companion egg.", purchasable: false },
  void_egg: { id: "void_egg", name: "Void Egg", emoji: "🥚", type: "material", category: "Companion Eggs", rarity: "Mythic", value: 8000, description: "A void companion egg.", purchasable: false },
};

function getItem(itemId) { return ITEMS[String(itemId || "").trim().toLowerCase()] || null; }
function getShopItems() { return Object.values(ITEMS).filter((item) => item.purchasable !== false); }
module.exports = { ITEMS, getItem, getShopItems };