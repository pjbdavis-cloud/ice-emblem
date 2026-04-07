import type {
  BattleMapDefinition,
  CharacterDefinition,
  CharacterPlacement,
  ClassDefinition,
  UnitDefinition,
  WeaponDefinition,
} from "../types";
import { gameCharacters } from "./characters";
import { gameClasses } from "./classes";
import { buildBattleMapDefinition, createPlainTiles, resolvePlacedCharacters } from "./maps";
import { gameWeapons } from "./weapons";

// Copy and edit these examples as you add real game content by hand.

export const classSkeletons: ClassDefinition[] = gameClasses;

export const weaponSkeletons: WeaponDefinition[] = [
  {
    id: "training-sword",
    name: "Training Sword",
    category: "sword",
    power: 3,
    complexity: 1,
    minRange: 1,
    maxRange: 1,
    requiredRank: "E",
  },
  {
    id: "short-bow",
    name: "Short Bow",
    category: "bow",
    power: 4,
    complexity: 2,
    minRange: 1,
    maxRange: 2,
    requiredRank: "D",
  },
  {
    id: "ember",
    name: "Ember",
    category: "elemental_magic",
    power: 4,
    complexity: 2,
    minRange: 1,
    maxRange: 2,
    requiredRank: "E",
  },
];

export const characterSkeletons: CharacterDefinition[] = [
  {
    id: "player-template",
    name: "Template Hero",
    classId: "journeyman",
    team: "player",
    level: 1,
    experience: 0,
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
    inventory: ["training-sword"],
    equippedWeaponId: "training-sword",
    weaponProficiencies: {
      sword: "E",
    },
    growthBonuses: {
      strength: 5,
      speed: 10,
    },
    personalSkillId: "steady-heart",
    classSkillId: "lead-the-charge",
    isLeader: true,
  },
  {
    id: "enemy-template",
    name: "Template Enemy",
    classId: "pupil",
    team: "enemy",
    level: 2,
    experience: 0,
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
    inventory: ["ember"],
    equippedWeaponId: "ember",
    weaponProficiencies: {
      elemental_magic: "E",
    },
    growthBonuses: {
      maxHp: 5,
      strength: 10,
    },
    behavior: "aggressive",
  },
];

export const unitSkeletons: UnitDefinition[] = resolvePlacedCharacters(characterSkeletons, [
  { characterId: "player-template", position: { x: 0, y: 0 } },
  { characterId: "enemy-template", position: { x: 4, y: 2 } },
]);

export const gameCharacterSkeletons: CharacterDefinition[] = gameCharacters;
export const gameWeaponSkeletons: WeaponDefinition[] = gameWeapons;

const mapCharacterPlacements: CharacterPlacement[] = [
  { characterId: "player-template", position: { x: 0, y: 0 } },
  { characterId: "enemy-template", position: { x: 4, y: 2 } },
];

export const mapSkeleton: BattleMapDefinition = buildBattleMapDefinition({
  map: {
    id: "new-map-template",
    name: "New Map Template",
    width: 10,
    height: 8,
    tiles: createPlainTiles(10, 8),
    objectives: {
      type: "route",
    },
  },
  classes: classSkeletons,
  weapons: weaponSkeletons,
  characters: characterSkeletons,
  placements: mapCharacterPlacements,
});
