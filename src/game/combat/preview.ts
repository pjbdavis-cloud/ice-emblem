import { getManhattanDistance } from "../core/state";
import type { CombatPreview, RuntimeGameState, UnitState, WeaponDefinition } from "../types";

export function getCombatPreview(
  state: RuntimeGameState,
  attackerId: string,
  defenderId: string,
): CombatPreview {
  const attacker = state.units[attackerId];
  const defender = state.units[defenderId];

  if (!attacker || !defender) {
    return {
      attackerDamage: 0,
      defenderDamage: 0,
      defenderCanCounter: false,
    };
  }

  const attackerWeapon = getEquippedWeapon(state, attacker);
  const defenderWeapon = getEquippedWeapon(state, defender);
  const distance = getManhattanDistance(attacker.position, defender.position);

  const attackerCanHit = attackerWeapon ? isInRange(attackerWeapon, distance) : false;
  const attackerDamage =
    attackerCanHit && attackerWeapon
      ? calculateDamage(state, attacker, defender, attackerWeapon)
      : 0;
  const defenderSurvives = defender.currentHp - attackerDamage > 0;
  const defenderCanCounter =
    defenderSurvives && defenderWeapon ? isInRange(defenderWeapon, distance) : false;

  return {
    attackerDamage,
    defenderDamage:
      defenderCanCounter && defenderWeapon
        ? calculateDamage(state, defender, attacker, defenderWeapon)
        : 0,
    defenderCanCounter,
  };
}

export function canUnitStrikeTarget(
  state: RuntimeGameState,
  attacker: UnitState,
  defender: UnitState,
): boolean {
  const attackerWeapon = getEquippedWeapon(state, attacker);
  if (!attackerWeapon) {
    return false;
  }

  const distance = getManhattanDistance(attacker.position, defender.position);
  return isInRange(attackerWeapon, distance);
}

export function getEquippedWeapon(state: RuntimeGameState, unit: UnitState): WeaponDefinition | undefined {
  return state.map.weapons.find((weapon) => weapon.id === unit.equippedWeaponId);
}

function calculateDamage(
  state: RuntimeGameState,
  attacker: UnitState,
  defender: UnitState,
  weapon: WeaponDefinition,
): number {
  const speedBonus = getSpeedBonus(
    state,
    getEffectiveSpeed(state, attacker),
    getEffectiveSpeed(state, defender),
  );
  const triangleBonus = getTriangleBonus(defender, weapon, state);
  const isMagicAttack = isMagicDiscipline(weapon.category) || weapon.category === "healing";
  const offenseStat = isMagicAttack ? attacker.stats.magic : attacker.stats.skill;
  const defenseStat = getEffectiveDefense(state, defender, isMagicAttack);
  const injuryAdjustedAttack = applyInjuryPenalty(state, attacker, offenseStat);
  const injuryAdjustedDefense = applyInjuryPenalty(state, defender, defenseStat);

  return Math.max(
    state.rules.minimumDamage,
    injuryAdjustedAttack + weapon.might + triangleBonus + speedBonus - injuryAdjustedDefense,
  );
}

function isInRange(weapon: WeaponDefinition, distance: number): boolean {
  return distance >= weapon.minRange && distance <= weapon.maxRange;
}

function getSpeedBonus(state: RuntimeGameState, attackerSpeed: number, defenderSpeed: number): number {
  const difference = attackerSpeed - defenderSpeed;
  const match = state.rules.speedBonusThresholds.find(
    (threshold) => difference >= threshold.speedDifference,
  );

  return match?.bonusDamage ?? 0;
}

function getEffectiveSpeed(state: RuntimeGameState, unit: UnitState): number {
  return Math.max(0, unit.stats.speed - getWeaponBurdenPenalty(state, unit));
}

function getEffectiveDefense(
  state: RuntimeGameState,
  unit: UnitState,
  isMagicAttack: boolean,
): number {
  const defensiveStat = isMagicAttack ? unit.stats.resistance : unit.stats.defense;
  return Math.max(0, defensiveStat - getWeaponBurdenPenalty(state, unit));
}

function getWeaponBurdenPenalty(state: RuntimeGameState, unit: UnitState): number {
  const weapon = getEquippedWeapon(state, unit);
  if (!weapon) {
    return 0;
  }

  const mitigation = isMagicDiscipline(weapon.category) || weapon.category === "healing"
    ? unit.stats.intelligence
    : unit.stats.strength;

  return Math.max(0, weapon.weight - mitigation);
}

function getTriangleBonus(
  defender: UnitState,
  weapon: WeaponDefinition,
  state: RuntimeGameState,
): number {
  const defenderWeapon = getEquippedWeapon(state, defender);
  if (!defenderWeapon) {
    return 0;
  }

  if (isMagicDiscipline(weapon.category) && isMagicDiscipline(defenderWeapon.category)) {
    return getMagicTriangleBonus(weapon.category, defenderWeapon.category);
  }

  return getPhysicalTriangleBonus(weapon.category, defenderWeapon.category);
}

function getPhysicalTriangleBonus(
  attackerCategory: WeaponDefinition["category"],
  defenderCategory: WeaponDefinition["category"],
): number {
  const winningPairs = new Set(["sword:axe", "axe:lance", "lance:sword"]);
  const losingPairs = new Set(["axe:sword", "lance:axe", "sword:lance"]);
  const pair = `${attackerCategory}:${defenderCategory}`;

  if (winningPairs.has(pair)) {
    return 1;
  }

  if (losingPairs.has(pair)) {
    return -1;
  }

  return 0;
}

function getMagicTriangleBonus(
  attackerCategory: WeaponDefinition["category"],
  defenderCategory: WeaponDefinition["category"],
): number {
  const winningPairs = new Set([
    "light_magic:dark_magic",
    "dark_magic:light_magic",
  ]);
  const neutralPairs = new Set([
    "elemental_magic:elemental_magic",
    "elemental_magic:light_magic",
    "elemental_magic:dark_magic",
    "light_magic:elemental_magic",
    "dark_magic:elemental_magic",
  ]);

  const pair = `${attackerCategory}:${defenderCategory}`;

  if (winningPairs.has(pair)) {
    return 1;
  }

  if (neutralPairs.has(pair)) {
    return 0;
  }

  return 0;
}

function isMagicDiscipline(category: WeaponDefinition["category"]): boolean {
  return category === "elemental_magic" || category === "light_magic" || category === "dark_magic";
}

function applyInjuryPenalty(state: RuntimeGameState, unit: UnitState, statValue: number): number {
  if (unit.currentHp >= Math.ceil(unit.stats.maxHp * state.rules.injuryThresholdRatio)) {
    return statValue;
  }

  return Math.floor(statValue * (1 - state.rules.injuryPenaltyPercent));
}
