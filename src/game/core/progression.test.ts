import { describe, expect, it } from "vitest";
import { awardCombatRewards, getUnitGrowthRates, levelUpUnit } from "./progression";
import { createInitialRuntimeState } from "./state";
import type { BattleMapDefinition, UnitDefinition } from "../types";

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
    id: "progression-test-map",
    name: "Progression Test Map",
    width: 5,
    height: 5,
    tiles: Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => ({ terrain: "plain" as const })),
    ),
    objectives: {
      type: "route",
    },
    classes: [
      {
        id: "fighter",
        name: "Fighter",
        tier: 1,
        movement: 5,
        learnableDisciplines: ["axe"],
        baseStats: statLine(22, 7, 5, 3, 3, 1, 5),
        growthRates: statLine(100, 45, 35, 30, 15, 5, 120),
        statCaps: statLine(24, 8, 12, 8, 5, 3, 7),
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
    ],
    weapons: [
      { id: "iron-axe", name: "Iron Axe", category: "axe", power: 7, complexity: 3, minRange: 1, maxRange: 1, requiredRank: "E" },
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
    stats: overrides.stats ?? statLine(22, 7, 5, 3, 3, 1, 5),
    currentHp: overrides.currentHp ?? (overrides.stats?.maxHp ?? 22),
    position: overrides.position,
    inventory: overrides.inventory ?? ["iron-axe"],
    equippedWeaponId: overrides.equippedWeaponId ?? "iron-axe",
    weaponProficiencies: overrides.weaponProficiencies ?? {
      axe: "E",
    },
    weaponProficiencyExperience: overrides.weaponProficiencyExperience ?? {},
    growthBonuses: overrides.growthBonuses ?? {},
  };
}

describe("levelUpUnit", () => {
  it("brings under-base unit stats up to the class minimum before applying growths", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "fighter",
          team: "player",
          position: { x: 1, y: 1 },
          stats: statLine(18, 4, 2, 1, 1, 0, 3),
          currentHp: 18,
        }),
      ]),
    );

    expect(runtime.units.fighter.stats).toEqual(statLine(22, 7, 5, 3, 3, 1, 5));
    expect(runtime.units.fighter.currentHp).toBe(18);
  });

  it("applies class growth rates to unit stats deterministically", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "fighter",
          team: "player",
          position: { x: 1, y: 1 },
          stats: statLine(22, 7, 5, 3, 3, 1, 5),
          currentHp: 18,
        }),
      ]),
    );

    const result = levelUpUnit(runtime, "fighter", {
      maxHp: 88,
      strength: 20,
      skill: 10,
      luck: 50,
      defense: 50,
      resistance: 90,
      speed: 70,
    });

    expect(result.statGains).toEqual(statLine(1, 1, 1, 0, 0, 0, 1));
    expect(result.nextState.units.fighter.level).toBe(2);
    expect(result.nextState.units.fighter.stats).toEqual(statLine(23, 8, 6, 3, 3, 1, 6));
    expect(result.nextState.units.fighter.currentHp).toBe(19);
  });

  it("supports growth rates above 100 percent", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "fighter",
          team: "player",
          position: { x: 1, y: 1 },
        }),
      ]),
    );

    const result = levelUpUnit(runtime, "fighter", {
      speed: 10,
    });

    expect(result.statGains.speed).toBe(2);
    expect(result.nextState.units.fighter.stats.speed).toBe(7);
  });

  it("stops stat growth at the class cap", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "fighter",
          team: "player",
          position: { x: 1, y: 1 },
          stats: statLine(23, 8, 11, 7, 4, 1, 7),
          currentHp: 23,
        }),
      ]),
    );

    const result = levelUpUnit(runtime, "fighter", {
      maxHp: 0,
      strength: 0,
      skill: 0,
      luck: 0,
      defense: 0,
      resistance: 0,
      speed: 0,
    });

    expect(result.nextState.units.fighter.stats).toEqual(statLine(24, 8, 12, 8, 5, 2, 7));
    expect(result.nextState.units.fighter.currentHp).toBe(24);
  });

  it("returns unchanged stats when the unit class is missing", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "mystery",
          classId: "missing-class",
          team: "player",
          position: { x: 1, y: 1 },
        }),
      ]),
    );

    const result = levelUpUnit(runtime, "mystery", {
      maxHp: 0,
      strength: 0,
      skill: 0,
      luck: 0,
      defense: 0,
      resistance: 0,
      speed: 0,
    });

    expect(result.statGains).toEqual(statLine(0, 0, 0, 0, 0, 0, 0));
    expect(result.nextState.units.mystery.level).toBe(1);
    expect(result.nextState.units.mystery.stats).toEqual(statLine(22, 7, 5, 3, 3, 1, 5));
  });

  it("adds unit growth bonuses on top of class growth rates", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "fighter",
          team: "player",
          position: { x: 1, y: 1 },
          growthBonuses: {
            maxHp: 5,
            strength: 10,
            skill: 20,
            luck: 5,
            resistance: 10,
          },
        }),
      ]),
    );

    expect(getUnitGrowthRates(runtime.units.fighter, runtime.map.classes[0].growthRates)).toEqual(
      statLine(105, 55, 55, 35, 15, 15, 120),
    );
  });

  it("awards skirmish experience and weapon proficiency progress after combat", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "fighter",
          team: "player",
          position: { x: 1, y: 1 },
        }),
      ]),
    );

    const result = awardCombatRewards(runtime, "fighter", { defeatedTarget: false });

    expect(result.units.fighter.experience).toBe(20);
    expect(result.units.fighter.level).toBe(1);
    expect(result.units.fighter.weaponProficiencyExperience?.axe ?? 0).toBe(20);
    expect(result.units.fighter.weaponProficiencies.axe).toBe("E");
  });

  it("levels up when combat rewards reach 100 experience and carries overflow", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "fighter",
          team: "player",
          position: { x: 1, y: 1 },
          experience: 90,
        }),
      ]),
    );

    const result = awardCombatRewards(runtime, "fighter", { defeatedTarget: false });

    expect(result.units.fighter.level).toBe(2);
    expect(result.units.fighter.experience).toBe(10);
    expect(result.units.fighter.weaponProficiencyExperience?.axe ?? 0).toBe(20);
  });

  it("awards extra experience and proficiency for a defeat and promotes weapon rank at 100", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "fighter",
          team: "player",
          position: { x: 1, y: 1 },
          weaponProficiencyExperience: { axe: 90 },
        }),
      ]),
    );

    const result = awardCombatRewards(runtime, "fighter", { defeatedTarget: true });

    expect(result.units.fighter.experience).toBe(80);
    expect(result.units.fighter.weaponProficiencies.axe).toBe("D");
    expect(result.units.fighter.weaponProficiencyExperience?.axe ?? 0).toBe(70);
  });

  it("stops gaining experience at level 20", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "fighter",
          team: "player",
          position: { x: 1, y: 1 },
          level: 20,
          experience: 80,
          weaponProficiencyExperience: { axe: 40 },
        }),
      ]),
    );

    const result = awardCombatRewards(runtime, "fighter", { defeatedTarget: true });

    expect(result.units.fighter.level).toBe(20);
    expect(result.units.fighter.experience).toBe(0);
    expect(result.units.fighter.weaponProficiencies.axe).toBe("D");
    expect(result.units.fighter.weaponProficiencyExperience?.axe ?? 0).toBe(20);
  });

  it("does not award experience or weapon proficiency progress to enemies", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "enemy-fighter",
          team: "enemy",
          position: { x: 1, y: 1 },
          experience: 40,
          weaponProficiencyExperience: { axe: 30 },
        }),
      ]),
    );

    const result = awardCombatRewards(runtime, "enemy-fighter", { defeatedTarget: true });

    expect(result.units["enemy-fighter"].level).toBe(1);
    expect(result.units["enemy-fighter"].experience).toBe(40);
    expect(result.units["enemy-fighter"].weaponProficiencies.axe).toBe("E");
    expect(result.units["enemy-fighter"].weaponProficiencyExperience?.axe ?? 0).toBe(30);
  });
});
