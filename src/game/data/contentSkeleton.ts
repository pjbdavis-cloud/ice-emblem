import type { BattleMapDefinition, ClassDefinition, UnitDefinition, WeaponDefinition } from "../types";

// Copy and edit these examples as you add real game content by hand.

export const classSkeletons: ClassDefinition[] = [
  {
    id: "my-lord",
    name: "My Lord",
    tier: 1,
    movement: 5,
  },
  {
    id: "my-cavalier",
    name: "My Cavalier",
    tier: 1,
    movement: 7,
  },
];

export const weaponSkeletons: WeaponDefinition[] = [
  {
    id: "training-sword",
    name: "Training Sword",
    category: "sword",
    might: 3,
    minRange: 1,
    maxRange: 1,
    requiredRank: "E",
  },
  {
    id: "short-bow",
    name: "Short Bow",
    category: "bow",
    might: 4,
    minRange: 1,
    maxRange: 2,
    requiredRank: "D",
  },
];

export const unitSkeletons: UnitDefinition[] = [
  {
    id: "player-template",
    name: "Template Hero",
    classId: "my-lord",
    team: "player",
    level: 1,
    tier: 1,
    stats: {
      maxHp: 20,
      attack: 5,
      defense: 4,
      speed: 6,
      movement: 5,
    },
    currentHp: 20,
    position: { x: 0, y: 0 },
    inventory: ["training-sword"],
    equippedWeaponId: "training-sword",
    personalSkillId: "steady-heart",
    classSkillId: "lead-the-charge",
    isLeader: true,
  },
  {
    id: "enemy-template",
    name: "Template Enemy",
    classId: "my-cavalier",
    team: "enemy",
    level: 2,
    tier: 1,
    stats: {
      maxHp: 22,
      attack: 6,
      defense: 3,
      speed: 5,
      movement: 7,
    },
    currentHp: 22,
    position: { x: 4, y: 2 },
    inventory: ["training-sword"],
    equippedWeaponId: "training-sword",
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
