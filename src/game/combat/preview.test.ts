import { describe, expect, it } from "vitest";
import { getCombatPreview } from "./preview";
import { createInitialRuntimeState } from "../core/state";
import type { BattleMapDefinition, UnitDefinition } from "../types";

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

describe("combat preview", () => {
  it("prevents retaliation if the defender dies from the first hit", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "attacker",
          team: "player",
          position: { x: 1, y: 1 },
          stats: { maxHp: 20, attack: 10, defense: 4, speed: 5, movement: 5 },
          equippedWeaponId: "iron-sword",
        }),
        createUnit({
          id: "defender",
          team: "enemy",
          position: { x: 2, y: 1 },
          stats: { maxHp: 12, attack: 7, defense: 1, speed: 4, movement: 5 },
          currentHp: 4,
          equippedWeaponId: "iron-sword",
        }),
      ]),
    );

    const preview = getCombatPreview(runtime, "attacker", "defender");

    expect(preview.attackerDamage).toBeGreaterThanOrEqual(4);
    expect(preview.defenderCanCounter).toBe(false);
    expect(preview.defenderDamage).toBe(0);
  });

  it("applies injury penalties using the configured threshold", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "attacker",
          team: "player",
          position: { x: 1, y: 1 },
          stats: { maxHp: 20, attack: 10, defense: 4, speed: 5, movement: 5 },
          currentHp: 9,
          equippedWeaponId: "iron-sword",
        }),
        createUnit({
          id: "defender",
          team: "enemy",
          position: { x: 2, y: 1 },
          stats: { maxHp: 20, attack: 7, defense: 4, speed: 4, movement: 5 },
          currentHp: 20,
          equippedWeaponId: "iron-sword",
        }),
      ]),
    );

    const preview = getCombatPreview(runtime, "attacker", "defender");

    expect(preview.attackerDamage).toBe(10);
  });

  it("respects weapon range when determining whether a defender can counter", () => {
    const runtime = createInitialRuntimeState(
      createTestMap([
        createUnit({
          id: "archer",
          team: "player",
          position: { x: 1, y: 1 },
          stats: { maxHp: 18, attack: 7, defense: 3, speed: 5, movement: 5 },
          equippedWeaponId: "iron-bow",
        }),
        createUnit({
          id: "fighter",
          team: "enemy",
          position: { x: 3, y: 1 },
          stats: { maxHp: 20, attack: 7, defense: 4, speed: 4, movement: 5 },
          equippedWeaponId: "iron-sword",
        }),
      ]),
    );

    const preview = getCombatPreview(runtime, "archer", "fighter");

    expect(preview.attackerDamage).toBeGreaterThan(0);
    expect(preview.defenderCanCounter).toBe(false);
    expect(preview.defenderDamage).toBe(0);
  });
});
