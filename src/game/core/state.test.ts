import { describe, expect, it } from "vitest";
import {
  applyAction,
  createInitialRuntimeState,
  getMovementPathPreview,
  getReachablePositions,
  previewNextEnemyAction,
} from "./state";
import type { BattleMapDefinition, Position, UnitDefinition } from "../types";

function createTestMap(units: UnitDefinition[]): BattleMapDefinition {
  return {
    id: "test-map",
    name: "Test Map",
    width: 7,
    height: 7,
    tiles: Array.from({ length: 7 }, () =>
      Array.from({ length: 7 }, () => ({ terrain: "plain" as const })),
    ),
    objectives: {
      type: "route",
    },
    classes: [
      { id: "lord", name: "Lord", tier: 1, movement: 5 },
      { id: "fighter", name: "Fighter", tier: 1, movement: 5 },
      { id: "archer", name: "Archer", tier: 1, movement: 5 },
      { id: "mage", name: "Mage", tier: 1, movement: 5 },
    ],
    weapons: [
      { id: "iron-sword", name: "Iron Sword", category: "sword", might: 5, minRange: 1, maxRange: 1, requiredRank: "E" },
      { id: "iron-bow", name: "Iron Bow", category: "bow", might: 6, minRange: 2, maxRange: 2, requiredRank: "E" },
      { id: "fire-tome", name: "Fire Tome", category: "magic", magicType: "fire", might: 5, minRange: 1, maxRange: 2, requiredRank: "E" },
    ],
    units,
  };
}

function createUnit(overrides: Partial<UnitDefinition> & Pick<UnitDefinition, "id" | "position" | "team">): UnitDefinition {
  return {
    id: overrides.id,
    name: overrides.id,
    classId: overrides.classId ?? "fighter",
    team: overrides.team,
    level: overrides.level ?? 1,
    tier: overrides.tier ?? 1,
    stats: overrides.stats ?? { maxHp: 20, attack: 6, defense: 4, speed: 5, movement: 5 },
    currentHp: overrides.currentHp ?? (overrides.stats?.maxHp ?? 20),
    position: overrides.position,
    inventory: overrides.inventory ?? ["iron-sword"],
    equippedWeaponId: overrides.equippedWeaponId ?? "iron-sword",
    personalSkillId: overrides.personalSkillId,
    classSkillId: overrides.classSkillId,
    behavior: overrides.behavior,
    isLeader: overrides.isLeader,
    isBoss: overrides.isBoss,
  };
}

function hasPosition(positions: Position[], target: Position) {
  return positions.some((position) => position.x === target.x && position.y === target.y);
}

describe("movement rules", () => {
  it("allows moving through allied units but not ending on them", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "player-lead",
          team: "player",
          position: { x: 1, y: 3 },
          stats: { maxHp: 20, attack: 6, defense: 4, speed: 5, movement: 4 },
        }),
        createUnit({
          id: "ally-blocker",
          team: "player",
          position: { x: 2, y: 3 },
        }),
      ]),
    );

    const reachable = getReachablePositions(runtime, "player-lead");

    expect(hasPosition(reachable, { x: 2, y: 3 })).toBe(false);
    expect(hasPosition(reachable, { x: 3, y: 3 })).toBe(true);
  });

  it("returns a shortest valid path when detouring around a blocker", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "player-lead",
          team: "player",
          position: { x: 1, y: 1 },
          stats: { maxHp: 20, attack: 6, defense: 4, speed: 5, movement: 5 },
        }),
        createUnit({
          id: "enemy-wall",
          team: "enemy",
          position: { x: 2, y: 2 },
        }),
      ]),
    );

    const path = getMovementPathPreview(runtime, "player-lead", { x: 4, y: 3 });

    expect(path[0]).toEqual({ x: 1, y: 1 });
    expect(path[path.length - 1]).toEqual({ x: 4, y: 3 });
    expect(path).not.toContainEqual({ x: 2, y: 2 });
    expect(path).toHaveLength(6);
  });

  it("prefers alternating axes when multiple shortest paths exist", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "player-lead",
          team: "player",
          position: { x: 1, y: 1 },
          stats: { maxHp: 20, attack: 6, defense: 4, speed: 5, movement: 5 },
        }),
      ]),
    );

    const path = getMovementPathPreview(runtime, "player-lead", { x: 4, y: 3 });

    expect(path).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 3, y: 3 },
      { x: 4, y: 3 },
    ]);
  });
});

describe("enemy decisions and phase progression", () => {
  it("prefers attacking a leader when multiple targets are available", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "player-lead",
          team: "player",
          position: { x: 2, y: 1 },
          isLeader: true,
        }),
        createUnit({
          id: "player-soldier",
          team: "player",
          position: { x: 3, y: 2 },
          currentHp: 1,
        }),
        createUnit({
          id: "enemy-fighter",
          team: "enemy",
          position: { x: 2, y: 2 },
          equippedWeaponId: "iron-sword",
        }),
      ]),
    );

    const enemyPhaseState = { ...runtime, phase: "enemy" as const };
    const result = previewNextEnemyAction(enemyPhaseState);
    const combatEvent = result.presentationEvents.find((event) => event.type === "combat");

    expect(combatEvent?.type).toBe("combat");
    if (combatEvent?.type !== "combat") {
      throw new Error("Expected enemy combat event");
    }
    expect(combatEvent.defenderId).toBe("player-lead");
  });

  it("moves an enemy closer to the nearest player when no attack is available", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "player-lead",
          team: "player",
          position: { x: 1, y: 1 },
        }),
        createUnit({
          id: "enemy-fighter",
          team: "enemy",
          position: { x: 5, y: 1 },
          stats: { maxHp: 20, attack: 6, defense: 4, speed: 5, movement: 2 },
          equippedWeaponId: "iron-sword",
        }),
      ]),
    );

    const enemyPhaseState = { ...runtime, phase: "enemy" as const };
    const result = previewNextEnemyAction(enemyPhaseState);
    const movedEnemy = result.nextState.units["enemy-fighter"];

    expect(movedEnemy.position).toEqual({ x: 3, y: 1 });
    expect(result.presentationEvents[0]).toMatchObject({
      type: "move",
      unitId: "enemy-fighter",
      from: { x: 5, y: 1 },
      to: { x: 3, y: 1 },
    });
  });

  it("advances to enemy phase after the last player unit acts and resets action flags", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "player-lead",
          team: "player",
          position: { x: 1, y: 1 },
        }),
        createUnit({
          id: "enemy-fighter",
          team: "enemy",
          position: { x: 5, y: 1 },
        }),
      ]),
    );

    const nextState = applyAction(runtime, { type: "waitUnit", unitId: "player-lead" });

    expect(nextState.phase).toBe("enemy");
    expect(nextState.turnNumber).toBe(1);
    expect(nextState.units["player-lead"].hasActed).toBe(false);
    expect(nextState.units["player-lead"].hasMoved).toBe(false);
    expect(nextState.selectedUnitId).toBeUndefined();
  });

  it("advances back to player phase and increments the turn after the last enemy acts", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "player-lead",
          team: "player",
          position: { x: 1, y: 1 },
        }),
        createUnit({
          id: "enemy-fighter",
          team: "enemy",
          position: { x: 2, y: 1 },
          currentHp: 1,
          equippedWeaponId: "iron-sword",
        }),
      ]),
    );

    const enemyPhaseState = { ...runtime, phase: "enemy" as const };
    const result = previewNextEnemyAction(enemyPhaseState);

    expect(result.nextState.phase).toBe("player");
    expect(result.nextState.turnNumber).toBe(2);
    expect(result.nextState.units["enemy-fighter"].hasActed).toBe(false);
    expect(result.nextState.units["enemy-fighter"].hasMoved).toBe(false);
  });
});
