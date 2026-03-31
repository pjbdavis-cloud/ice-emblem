import type { BattleMapDefinition, ClassDefinition, UnitDefinition, WeaponDefinition } from "../types";

// Copy and edit these examples as you add real game content by hand.

const statLine = (
  maxHp: number,
  strength: number,
  skill: number,
  luck: number,
  defense: number,
  resistance: number,
  speed: number,
) => ({
  maxHp,
  strength,
  skill,
  luck,
  defense,
  resistance,
  speed,
});

export const classSkeletons: ClassDefinition[] = [
  {
    id: "my-journeyman",
    name: "My Journeyman",
    tier: 1,
    movement: 5,
    learnableDisciplines: ["sword"],
    baseStats: statLine(20, 5, 5, 5, 4, 2, 6),
    growthRates: statLine(70, 35, 35, 45, 30, 20, 45),
    statCaps: statLine(40, 18, 18, 22, 16, 12, 20),
  },
  {
    id: "my-pupil",
    name: "My Pupil",
    tier: 1,
    movement: 5,
    learnableDisciplines: ["elemental_magic"],
    baseStats: statLine(17, 6, 2, 5, 2, 5, 5),
    growthRates: statLine(55, 60, 20, 40, 20, 45, 45),
    statCaps: statLine(34, 22, 12, 26, 12, 18, 20),
  },
];

export const weaponSkeletons: WeaponDefinition[] = [
  {
    id: "training-sword",
    name: "Training Sword",
    category: "sword",
    might: 3,
    complexity: 1,
    minRange: 1,
    maxRange: 1,
    requiredRank: "E",
  },
  {
    id: "short-bow",
    name: "Short Bow",
    category: "bow",
    might: 4,
    complexity: 2,
    minRange: 1,
    maxRange: 2,
    requiredRank: "D",
  },
  {
    id: "ember",
    name: "Ember",
    category: "elemental_magic",
    might: 4,
    complexity: 2,
    minRange: 1,
    maxRange: 2,
    requiredRank: "E",
  },
];

export const unitSkeletons: UnitDefinition[] = [
  {
    id: "player-template",
    name: "Template Hero",
    classId: "my-journeyman",
    team: "player",
    level: 1,
    tier: 1,
    stats: {
      maxHp: 21,
      strength: 6,
      skill: 6,
      luck: 6,
      defense: 5,
      resistance: 3,
      speed: 7,
    },
    currentHp: 21,
    position: { x: 0, y: 0 },
    inventory: ["ember"],
    equippedWeaponId: "ember",
    weaponProficiencies: {
      elemental_magic: "E",
    },
    personalSkillId: "steady-heart",
    classSkillId: "lead-the-charge",
    isLeader: true,
  },
  {
    id: "enemy-template",
    name: "Template Enemy",
    classId: "my-pupil",
    team: "enemy",
    level: 2,
    tier: 1,
    stats: {
      maxHp: 18,
      strength: 7,
      skill: 2,
      luck: 5,
      defense: 2,
      resistance: 6,
      speed: 6,
    },
    currentHp: 18,
    position: { x: 4, y: 2 },
    inventory: ["training-sword"],
    equippedWeaponId: "training-sword",
    weaponProficiencies: {
      sword: "E",
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
