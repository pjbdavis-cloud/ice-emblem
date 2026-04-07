import { describe, expect, it } from "vitest";
import {
  applyAction,
  createInitialRuntimeState,
  getAttackReachPreviewPositions,
  getMovementPathPreview,
  getReachablePositions,
  previewNextEnemyAction,
} from "./state";
import type { BattleMapDefinition, Position, UnitDefinition } from "../types";

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
      {
        id: "prince",
        name: "Prince",
        tier: 1,
        movement: 5,
        learnableDisciplines: ["sword"],
        baseStats: statLine(20, 6, 6, 4, 5, 2, 7),
        growthRates: statLine(75, 35, 50, 40, 40, 25, 55),
        statCaps: statLine(40, 20, 20, 24, 18, 14, 22),
      },
      {
        id: "fighter",
        name: "Fighter",
        tier: 1,
        movement: 5,
        learnableDisciplines: ["sword", "axe"],
        baseStats: statLine(22, 7, 5, 3, 3, 1, 5),
        growthRates: statLine(80, 50, 35, 20, 30, 15, 35),
        statCaps: statLine(44, 22, 18, 22, 16, 10, 18),
      },
      {
        id: "slow-fighter",
        name: "Slow Fighter",
        tier: 1,
        movement: 2,
        learnableDisciplines: ["sword", "axe"],
        baseStats: statLine(22, 7, 5, 2, 3, 1, 3),
        growthRates: statLine(80, 50, 35, 20, 30, 15, 20),
        statCaps: statLine(44, 22, 18, 18, 16, 10, 14),
      },
      {
        id: "archer",
        name: "Archer",
        tier: 1,
        movement: 5,
        learnableDisciplines: ["bow"],
        baseStats: statLine(18, 5, 7, 5, 3, 2, 6),
        growthRates: statLine(65, 25, 55, 40, 25, 20, 50),
        statCaps: statLine(36, 18, 22, 24, 14, 12, 22),
      },
      {
        id: "mage",
        name: "Mage",
        tier: 1,
        movement: 5,
        learnableDisciplines: ["elemental_magic"],
        baseStats: statLine(17, 6, 1, 4, 2, 5, 5),
        growthRates: statLine(55, 60, 10, 35, 20, 45, 45),
        statCaps: statLine(34, 22, 10, 24, 12, 18, 20),
      },
      {
        id: "healer",
        name: "Healer",
        tier: 1,
        movement: 5,
        learnableDisciplines: ["staff"],
        baseStats: statLine(18, 5, 4, 5, 2, 6, 5),
        growthRates: statLine(60, 35, 30, 40, 15, 50, 35),
        statCaps: statLine(34, 18, 16, 24, 12, 20, 18),
      },
    ],
    weapons: [
      { id: "iron-sword", name: "Iron Sword", category: "sword", power: 5, complexity: 1, minRange: 1, maxRange: 1, requiredRank: "E" },
      { id: "iron-bow", name: "Iron Bow", category: "bow", power: 6, complexity: 2, minRange: 2, maxRange: 2, requiredRank: "E" },
      { id: "fire-tome", name: "Fire Tome", category: "elemental_magic", power: 5, complexity: 2, minRange: 1, maxRange: 2, requiredRank: "E" },
      { id: "mend", name: "Mend", category: "staff", power: 8, complexity: 1, minRange: 1, maxRange: 2, requiredRank: "E" },
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
    experience: overrides.experience ?? 0,
    tier: overrides.tier ?? 1,
    stats: overrides.stats ?? { maxHp: 20, strength: 6, skill: 6, luck: 4, defense: 4, resistance: 3, speed: 5 },
    currentHp: overrides.currentHp ?? (overrides.stats?.maxHp ?? 20),
    position: overrides.position,
    inventory: overrides.inventory ?? ["iron-sword"],
    equippedWeaponId: overrides.equippedWeaponId ?? "iron-sword",
    weaponProficiencies: overrides.weaponProficiencies ?? {
      sword: "E",
    },
    weaponProficiencyExperience: overrides.weaponProficiencyExperience ?? {},
    growthBonuses: overrides.growthBonuses ?? {},
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
  it("does not allow units to move through wall terrain", () => {
    const map = createTestMap([
      createUnit({
        id: "player-lead",
        team: "player",
        position: { x: 1, y: 1 },
        stats: { maxHp: 20, strength: 6, skill: 6, luck: 4, defense: 4, resistance: 3, speed: 5 },
      }),
    ]);
    map.tiles[1][2] = { terrain: "wall" };

    const runtime = createInitialRuntimeState(map);
    const reachable = getReachablePositions(runtime, "player-lead");

    expect(hasPosition(reachable, { x: 2, y: 1 })).toBe(false);
  });

  it("allows moving through allied units but not ending on them", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "player-lead",
          team: "player",
          position: { x: 1, y: 3 },
          stats: { maxHp: 20, strength: 6, skill: 6, luck: 4, defense: 4, resistance: 3, speed: 5 },
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
          stats: { maxHp: 20, strength: 6, skill: 6, luck: 4, defense: 4, resistance: 3, speed: 5 },
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
          stats: { maxHp: 20, strength: 6, skill: 6, luck: 4, defense: 4, resistance: 3, speed: 5 },
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

  it("includes allied occupied tiles in attack reach previews", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "player-archer",
          team: "player",
          classId: "archer",
          equippedWeaponId: "iron-bow",
          inventory: ["iron-bow"],
          weaponProficiencies: { bow: "E" },
          position: { x: 1, y: 1 },
        }),
        createUnit({
          id: "player-ally",
          team: "player",
          position: { x: 3, y: 1 },
        }),
      ]),
    );

    const attackReach = getAttackReachPreviewPositions(runtime, "player-archer");

    expect(hasPosition(attackReach, { x: 3, y: 1 })).toBe(true);
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
          classId: "slow-fighter",
          position: { x: 5, y: 1 },
          stats: { maxHp: 20, strength: 6, skill: 6, luck: 4, defense: 4, resistance: 2, speed: 5 },
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
        createUnit({
          id: "enemy-archer",
          team: "enemy",
          classId: "archer",
          position: { x: 5, y: 5 },
          equippedWeaponId: "iron-bow",
          inventory: ["iron-bow"],
          weaponProficiencies: { bow: "E" },
        }),
      ]),
    );

    const enemyPhaseState = {
      ...runtime,
      phase: "enemy" as const,
      units: {
        ...runtime.units,
        "enemy-archer": {
          ...runtime.units["enemy-archer"],
          hasActed: true,
          hasMoved: true,
        },
      },
    };
    const result = previewNextEnemyAction(enemyPhaseState);

    expect(result.nextState.phase).toBe("player");
    expect(result.nextState.turnNumber).toBe(2);
    expect(result.nextState.units["enemy-fighter"].hasActed).toBe(false);
    expect(result.nextState.units["enemy-fighter"].hasMoved).toBe(false);
  });
});

describe("victory and defeat rules", () => {
  it("wins the map when the last enemy is defeated on a route objective", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "player-lead",
          team: "player",
          position: { x: 1, y: 1 },
          isLeader: true,
        }),
        createUnit({
          id: "enemy-fighter",
          team: "enemy",
          position: { x: 2, y: 1 },
          currentHp: 1,
        }),
      ]),
    );

    const nextState = applyAction(runtime, {
      type: "attackUnit",
      attackerId: "player-lead",
      defenderId: "enemy-fighter",
    });

    expect(nextState.gameResult).toBe("victory");
    expect(nextState.selectedUnitId).toBeUndefined();
  });

  it("loses the map when the player's main unit is defeated", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "player-lead",
          team: "player",
          position: { x: 1, y: 1 },
          currentHp: 1,
          isLeader: true,
        }),
        createUnit({
          id: "enemy-fighter",
          team: "enemy",
          position: { x: 2, y: 1 },
          stats: { maxHp: 20, strength: 10, skill: 6, luck: 4, defense: 4, resistance: 3, speed: 5 },
        }),
      ]),
    );

    const enemyPhaseState = { ...runtime, phase: "enemy" as const };
    const nextState = applyAction(enemyPhaseState, {
      type: "attackUnit",
      attackerId: "enemy-fighter",
      defenderId: "player-lead",
    });

    expect(nextState.gameResult).toBe("defeat");
    expect(nextState.units["player-lead"].isDefeated).toBe(true);
  });

  it("blocks further actions after the map is over", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "player-lead",
          team: "player",
          position: { x: 1, y: 1 },
          isLeader: true,
        }),
      ]),
    );

    const completedState = {
      ...runtime,
      gameResult: "victory" as const,
    };

    const nextState = applyAction(completedState, {
      type: "selectUnit",
      unitId: "player-lead",
    });

    expect(nextState).toBe(completedState);
    expect(previewNextEnemyAction(completedState).nextState).toBe(completedState);
  });

  it("heals a damaged ally with a staff and grants staff experience", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "healer",
          team: "player",
          classId: "healer",
          position: { x: 1, y: 1 },
          stats: { maxHp: 18, strength: 5, skill: 4, luck: 5, defense: 2, resistance: 6, speed: 5 },
          inventory: ["mend"],
          equippedWeaponId: "mend",
          weaponProficiencies: { staff: "E" },
        }),
        createUnit({
          id: "ally",
          team: "player",
          position: { x: 2, y: 1 },
          currentHp: 10,
          stats: { maxHp: 20, strength: 6, skill: 6, luck: 4, defense: 4, resistance: 3, speed: 5 },
        }),
      ]),
    );

    const nextState = applyAction(runtime, {
      type: "healUnit",
      healerId: "healer",
      targetId: "ally",
    });

    expect(nextState.units.ally.currentHp).toBe(22);
    expect(nextState.units.healer.experience).toBe(20);
    expect(nextState.units.healer.weaponProficiencies.staff).toBe("E");
    expect(nextState.units.healer.weaponProficiencyExperience?.staff).toBe(20);
    expect(nextState.units.healer.hasMoved).toBe(true);
    expect(nextState.units.healer.hasActed).toBe(true);
  });
});
