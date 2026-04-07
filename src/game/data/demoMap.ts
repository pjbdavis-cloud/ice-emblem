import type { BattleMapDefinition, CharacterPlacement, TileDefinition } from "../types";
import { gameCharacters } from "./characters";
import { gameClasses } from "./classes";
import { buildBattleMapDefinition } from "./maps";
import { gameWeapons } from "./weapons";

const plainRow = (width: number): TileDefinition[] =>
  Array.from({ length: width }, () => ({
    terrain: "plain",
  }));

function createDemoTiles(width: number, height: number): TileDefinition[][] {
  const tiles = Array.from({ length: height }, () => plainRow(width));
  const wallPositions = [
    { x: 7, y: 1 },
    { x: 7, y: 2 },
    { x: 7, y: 4 },
    { x: 7, y: 5 },
    { x: 10, y: 6 },
    { x: 11, y: 6 },
    { x: 12, y: 6 },
    { x: 4, y: 2 },
    { x: 4, y: 3 },
    { x: 15, y: 3 },
    { x: 16, y: 3 },
    { x: 17, y: 3 },
    { x: 15, y: 9 },
    { x: 16, y: 9 },
    { x: 17, y: 9 },
    { x: 13, y: 11 },
    { x: 13, y: 12 },
    { x: 13, y: 13 },
  ];

  for (const { x, y } of wallPositions) {
    tiles[y][x] = { terrain: "wall" };
  }

  return tiles;
}

const demoCharacterPlacements: CharacterPlacement[] = [
  { characterId: "player-lord", position: { x: 1, y: 4 } },
  { characterId: "player-archer", position: { x: 2, y: 5 } },
  { characterId: "player-mercenary", position: { x: 0, y: 6 } },
  { characterId: "player-fighter", position: { x: 1, y: 7 } },
  { characterId: "player-soldier", position: { x: 3, y: 6 } },
  { characterId: "player-mage", position: { x: 4, y: 7 } },
  { characterId: "player-enchanter", position: { x: 5, y: 8 } },
  { characterId: "player-healer", position: { x: 2, y: 8 } },
  { characterId: "enemy-fighter", position: { x: 5, y: 1 } },
  { characterId: "enemy-mage", position: { x: 6, y: 2 } },
  { characterId: "enemy-mercenary", position: { x: 10, y: 2 } },
  { characterId: "enemy-soldier", position: { x: 9, y: 4 } },
  { characterId: "enemy-archer", position: { x: 12, y: 3 } },
];

export const demoMap: BattleMapDefinition = buildBattleMapDefinition({
  map: {
  id: "demo-skirmish",
  name: "Demo Route Skirmish",
  width: 20,
  height: 15,
  tiles: createDemoTiles(20, 15),
  objectives: {
    type: "route",
  },
  },
  classes: gameClasses,
  weapons: gameWeapons,
  characters: gameCharacters,
  placements: demoCharacterPlacements,
});
