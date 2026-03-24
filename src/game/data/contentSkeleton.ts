import type { BattleMapDefinition, ClassDefinition, UnitDefinition, WeaponDefinition } from "../types";

// Copy and edit these examples as you add real game content by hand.

const statLine = (
  maxHp: number,
  strength: number,
  skill: number,
  magic: number,
  intelligence: number,
  defense: number,
  resistance: number,
  speed: number,
) => ({
  maxHp,
  strength,
  skill,
  magic,
  intelligence,
  defense,
  resistance,
  speed,
});

export const classSkeletons: ClassDefinition[] = [
  {
    id: "my-prince",
    name: "My Prince",
    tier: 1,
    movement: 5,
    learnableDisciplines: ["sword"],
    baseStats: statLine(20, 6, 6, 1, 2, 5, 2, 7),
    growthRates: statLine(75, 35, 50, 20, 20, 40, 25, 55),
    statCaps: statLine(40, 20, 20, 10, 10, 18, 14, 22),
  },
  {
    id: "my-enchanter",
    name: "My Enchanter",
    tier: 1,
    movement: 5,
    learnableDisciplines: ["light_magic", "dark_magic"],
    baseStats: statLine(18, 0, 4, 5, 7, 2, 6, 5),
    growthRates: statLine(60, 5, 35, 55, 60, 20, 55, 40),
    statCaps: statLine(35, 6, 16, 20, 24, 12, 20, 18),
  },
];

export const weaponSkeletons: WeaponDefinition[] = [
  {
    id: "training-sword",
    name: "Training Sword",
    category: "sword",
    might: 3,
    weight: 1,
    minRange: 1,
    maxRange: 1,
    requiredRank: "E",
  },
  {
    id: "short-bow",
    name: "Short Bow",
    category: "bow",
    might: 4,
    weight: 2,
    minRange: 1,
    maxRange: 2,
    requiredRank: "D",
  },
  {
    id: "glimmer",
    name: "Glimmer",
    category: "light_magic",
    might: 4,
    weight: 2,
    minRange: 1,
    maxRange: 2,
    requiredRank: "E",
  },
];

export const unitSkeletons: UnitDefinition[] = [
  {
    id: "player-template",
    name: "Template Hero",
    classId: "my-prince",
    team: "player",
    level: 1,
    tier: 1,
    stats: {
      maxHp: 21,
      strength: 7,
      skill: 7,
      magic: 1,
      intelligence: 3,
      defense: 5,
      resistance: 3,
      speed: 8,
    },
    currentHp: 21,
    position: { x: 0, y: 0 },
    inventory: ["training-sword"],
    equippedWeaponId: "training-sword",
    weaponProficiencies: {
      sword: "E",
    },
    personalSkillId: "steady-heart",
    classSkillId: "lead-the-charge",
    isLeader: true,
  },
  {
    id: "enemy-template",
    name: "Template Enemy",
    classId: "my-enchanter",
    team: "enemy",
    level: 2,
    tier: 1,
    stats: {
      maxHp: 19,
      strength: 2,
      skill: 4,
      magic: 6,
      intelligence: 8,
      defense: 2,
      resistance: 7,
      speed: 6,
    },
    currentHp: 19,
    position: { x: 4, y: 2 },
    inventory: ["glimmer"],
    equippedWeaponId: "glimmer",
    weaponProficiencies: {
      light_magic: "E",
    },
    behavior: "aggressive",
  },
];

export const mapSkeleton: BattleMapDefinition = {
  id: "new-map-template",
  name: "New Map Template",
  width: 10,
  height: 8,
  tiles: Array.from({ length: 8 }, () =>
    Array.from({ length: 10 }, () => ({
      terrain: "plain" as const,
    })),
  ),
  objectives: {
    type: "route",
  },
  classes: classSkeletons,
  weapons: weaponSkeletons,
  units: unitSkeletons,
};
