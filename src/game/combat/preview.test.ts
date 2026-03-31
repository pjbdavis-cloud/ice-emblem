import { describe, expect, it } from "vitest";
import { getCombatPreview } from "./preview";
import { createInitialRuntimeState } from "../core/state";
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
    id: "combat-test-map",
    name: "Combat Test Map",
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
        learnableDisciplines: ["sword", "axe"],
        baseStats: statLine(22, 7, 5, 3, 3, 1, 5),
        growthRates: statLine(80, 50, 35, 20, 30, 15, 35),
        statCaps: statLine(44, 22, 18, 22, 16, 10, 18),
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
        id: "light-raider",
        name: "Light Raider",
        tier: 1,
        movement: 5,
        learnableDisciplines: ["axe"],
        baseStats: statLine(18, 1, 4, 2, 4, 1, 6),
        growthRates: statLine(60, 20, 35, 20, 25, 10, 45),
        statCaps: statLine(36, 10, 16, 18, 14, 10, 20),
      },
    ],
    weapons: [
      { id: "iron-sword", name: "Iron Sword", category: "sword", might: 5, complexity: 1, minRange: 1, maxRange: 1, requiredRank: "E" },
      { id: "iron-bow", name: "Iron Bow", category: "bow", might: 6, complexity: 2, minRange: 2, maxRange: 2, requiredRank: "E" },
      { id: "fire-tome", name: "Fire Tome", category: "elemental_magic", might: 5, complexity: 2, minRange: 1, maxRange: 2, requiredRank: "E" },
      { id: "war-axe", name: "War Axe", category: "axe", might: 8, complexity: 4, minRange: 1, maxRange: 1, requiredRank: "E" },
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
    stats: overrides.stats ?? { maxHp: 20, strength: 6, skill: 6, luck: 4, defense: 4, resistance: 3, speed: 5 },
    currentHp: overrides.currentHp ?? (overrides.stats?.maxHp ?? 20),
    position: overrides.position,
    inventory: overrides.inventory ?? ["iron-sword"],
    equippedWeaponId: overrides.equippedWeaponId ?? "iron-sword",
    weaponProficiencies: overrides.weaponProficiencies ?? {
      sword: "E",
    },
    personalSkillId: overrides.personalSkillId,
    classSkillId: overrides.classSkillId,
    behavior: overrides.behavior,
    isLeader: overrides.isLeader,
    isBoss: overrides.isBoss,
  };
}

describe("combat preview", () => {
  it("prevents retaliation if the defender dies from the first hit", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "attacker",
          team: "player",
          position: { x: 1, y: 1 },
          stats: { maxHp: 20, strength: 10, skill: 10, luck: 4, defense: 4, resistance: 3, speed: 5 },
          equippedWeaponId: "iron-sword",
        }),
        createUnit({
          id: "defender",
          team: "enemy",
          position: { x: 2, y: 1 },
          stats: { maxHp: 12, strength: 7, skill: 7, luck: 2, defense: 1, resistance: 1, speed: 4 },
          currentHp: 4,
          equippedWeaponId: "iron-sword",
        }),
      ]),
    );

    const preview = getCombatPreview(runtime, "attacker", "defender");

    expect(preview.attackerMinDamage).toBeGreaterThanOrEqual(4);
    expect(preview.defenderCanCounter).toBe(false);
    expect(preview.defenderMinDamage).toBe(0);
    expect(preview.defenderMaxDamage).toBe(0);
  });

  it("applies injury penalties using the configured threshold", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "attacker",
          team: "player",
          position: { x: 1, y: 1 },
          stats: { maxHp: 20, strength: 10, skill: 10, luck: 4, defense: 4, resistance: 3, speed: 5 },
          currentHp: 9,
          equippedWeaponId: "iron-sword",
        }),
        createUnit({
          id: "defender",
          team: "enemy",
          position: { x: 2, y: 1 },
          stats: { maxHp: 20, strength: 7, skill: 7, luck: 3, defense: 4, resistance: 2, speed: 4 },
          currentHp: 20,
          equippedWeaponId: "iron-sword",
        }),
      ]),
    );

    const preview = getCombatPreview(runtime, "attacker", "defender");

    expect(preview.attackerMinDamage).toBe(14);
    expect(preview.attackerMaxDamage).toBe(17);
  });

  it("respects weapon range when determining whether a defender can counter", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "archer",
          team: "player",
          position: { x: 1, y: 1 },
          stats: { maxHp: 18, strength: 7, skill: 7, luck: 3, defense: 3, resistance: 2, speed: 5 },
          equippedWeaponId: "iron-bow",
        }),
        createUnit({
          id: "fighter",
          team: "enemy",
          position: { x: 3, y: 1 },
          stats: { maxHp: 20, strength: 7, skill: 7, luck: 3, defense: 4, resistance: 2, speed: 4 },
          equippedWeaponId: "iron-sword",
        }),
      ]),
    );

    const preview = getCombatPreview(runtime, "archer", "fighter");

    expect(preview.attackerMaxDamage).toBeGreaterThan(0);
    expect(preview.defenderCanCounter).toBe(false);
    expect(preview.defenderMaxDamage).toBe(0);
  });

  it("uses skill for the floor, speed for the ceiling, and complexity to tighten the range", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "sword-user",
          team: "player",
          position: { x: 1, y: 1 },
          stats: { maxHp: 20, strength: 8, skill: 8, luck: 5, defense: 6, resistance: 2, speed: 8 },
          equippedWeaponId: "iron-sword",
        }),
        createUnit({
          id: "axe-user",
          team: "enemy",
          classId: "light-raider",
          position: { x: 2, y: 1 },
          stats: { maxHp: 22, strength: 1, skill: 5, luck: 2, defense: 6, resistance: 1, speed: 6 },
          equippedWeaponId: "war-axe",
          inventory: ["war-axe"],
          weaponProficiencies: {
            axe: "E",
          },
        }),
      ]),
    );

    const preview = getCombatPreview(runtime, "sword-user", "axe-user");

    expect(preview.attackerMinDamage).toBe(11);
    expect(preview.attackerMaxDamage).toBe(14);
    expect(preview.defenderMinDamage).toBe(0);
    expect(preview.defenderMaxDamage).toBe(3);
  });
});
