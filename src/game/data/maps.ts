import type {
  BattleMapDefinition,
  CharacterDefinition,
  CharacterPlacement,
  ClassDefinition,
  TileDefinition,
  UnitDefinition,
  WeaponDefinition,
} from "../types";

type SharedMapData = Pick<BattleMapDefinition, "id" | "name" | "width" | "height" | "tiles" | "objectives">;

export function buildBattleMapDefinition({
  map,
  classes,
  weapons,
  characters,
  placements,
}: {
  map: SharedMapData;
  classes: ClassDefinition[];
  weapons: WeaponDefinition[];
  characters: CharacterDefinition[];
  placements: CharacterPlacement[];
}): BattleMapDefinition {
  return {
    ...map,
    classes,
    weapons,
    units: resolvePlacedCharacters(characters, placements),
  };
}

export function resolvePlacedCharacters(
  characters: CharacterDefinition[],
  placements: CharacterPlacement[],
): UnitDefinition[] {
  const charactersById = new Map(characters.map((character) => [character.id, character]));

  return placements.map((placement) => {
    const character = charactersById.get(placement.characterId);
    if (!character) {
      throw new Error(`Unknown character placement id: ${placement.characterId}`);
    }

    return {
      ...character,
      position: { ...placement.position },
      currentHp: placement.currentHp ?? character.currentHp,
      inventory: [...character.inventory],
      stats: { ...character.stats },
      growthBonuses: { ...(character.growthBonuses ?? {}) },
      weaponProficiencies: { ...character.weaponProficiencies },
      weaponProficiencyExperience: { ...(character.weaponProficiencyExperience ?? {}) },
    };
  });
}

export function createPlainTiles(width: number, height: number): TileDefinition[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({
      terrain: "plain" as const,
    })),
  );
}
