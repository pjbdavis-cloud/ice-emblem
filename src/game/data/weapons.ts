import type { WeaponDefinition } from "../types";

export const gameWeapons: WeaponDefinition[] = [
  { id: "iron-sword", name: "Iron Sword", category: "sword", power: 5, complexity: 1, minRange: 1, maxRange: 1, requiredRank: "E" },
  { id: "iron-lance", name: "Iron Lance", category: "lance", power: 6, complexity: 2, minRange: 1, maxRange: 1, requiredRank: "E" },
  { id: "iron-axe", name: "Iron Axe", category: "axe", power: 7, complexity: 3, minRange: 1, maxRange: 1, requiredRank: "E" },
  { id: "iron-bow", name: "Iron Bow", category: "bow", power: 6, complexity: 2, minRange: 2, maxRange: 2, requiredRank: "E" },
  { id: "fire-tome", name: "Fire Tome", category: "elemental_magic", power: 5, complexity: 2, minRange: 1, maxRange: 2, requiredRank: "E" },
  { id: "glimmer", name: "Glimmer", category: "light_magic", power: 4, complexity: 2, minRange: 1, maxRange: 2, requiredRank: "E" },
  { id: "umbra", name: "Umbra", category: "dark_magic", power: 5, complexity: 3, minRange: 1, maxRange: 2, requiredRank: "E" },
  { id: "mend", name: "Mend", category: "staff", power: 8, complexity: 1, minRange: 1, maxRange: 2, requiredRank: "E" },
];
