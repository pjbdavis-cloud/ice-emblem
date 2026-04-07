import { getManhattanDistance } from "../core/state";
import type { CombatPreview, RuntimeGameState, UnitState, WeaponDefinition } from "../types";

export type DamageRange = {
  min: number;
  max: number;
};

export function getCombatPreview(
  state: RuntimeGameState,
  attackerId: string,
  defenderId: string,
): CombatPreview {
  const attacker = state.units[attackerId];
  const defender = state.units[defenderId];

  if (!attacker || !defender) {
    return {
      attackerMinDamage: 0,
      attackerMaxDamage: 0,
      defenderMinDamage: 0,
      defenderMaxDamage: 0,
      defenderCanCounter: false,
      defenderPotentialCounter: false,
    };
  }

  const attackerWeapon = getEquippedWeapon(state, attacker);
  const defenderWeapon = getEquippedWeapon(state, defender);
  const distance = getManhattanDistance(attacker.position, defender.position);

  return getCombatPreviewAtDistance(state, attacker, defender, attackerWeapon, defenderWeapon, distance);
}

export function getProjectedCombatPreview(
  state: RuntimeGameState,
  attackerId: string,
  defenderId: string,
): CombatPreview {
  const attacker = state.units[attackerId];
  const defender = state.units[defenderId];

  if (!attacker || !defender) {
    return {
      attackerMinDamage: 0,
      attackerMaxDamage: 0,
      defenderMinDamage: 0,
      defenderMaxDamage: 0,
      defenderCanCounter: false,
      defenderPotentialCounter: false,
    };
  }

  const attackerWeapon = getEquippedWeapon(state, attacker);
  const defenderWeapon = getEquippedWeapon(state, defender);
  const projectedDistance = getProjectedDistance(attackerWeapon, defenderWeapon);

  return getCombatPreviewAtDistance(
    state,
    attacker,
    defender,
    attackerWeapon,
    defenderWeapon,
    projectedDistance,
  );
}

function getCombatPreviewAtDistance(
  state: RuntimeGameState,
  attacker: UnitState,
  defender: UnitState,
  attackerWeapon: WeaponDefinition | undefined,
  defenderWeapon: WeaponDefinition | undefined,
  distance: number,
): CombatPreview {

  const attackerCanHit = attackerWeapon ? isInRange(attackerWeapon, distance) : false;
  const attackerRange =
    attackerCanHit && attackerWeapon
      ? calculateDamageRange(state, attacker, defender, attackerWeapon)
      : { min: 0, max: 0 };
  const defenderPotentialCounter =
    attackerCanHit && defenderWeapon ? isInRange(defenderWeapon, distance) : false;
  const defenderSurvives = defender.currentHp - attackerRange.max > 0;
  const defenderCanCounter =
    defenderSurvives && defenderPotentialCounter;
  const defenderRange =
    defenderPotentialCounter && defenderWeapon
      ? calculateDamageRange(state, defender, attacker, defenderWeapon)
      : { min: 0, max: 0 };

  return {
    attackerMinDamage: attackerRange.min,
    attackerMaxDamage: attackerRange.max,
    defenderMinDamage: defenderRange.min,
    defenderMaxDamage: defenderRange.max,
    defenderCanCounter,
    defenderPotentialCounter,
  };
}

export function canUnitStrikeTarget(
  state: RuntimeGameState,
  attacker: UnitState,
  defender: UnitState,
): boolean {
  const attackerWeapon = getEquippedWeapon(state, attacker);
  if (!attackerWeapon || attackerWeapon.category === "staff") {
    return false;
  }

  const distance = getManhattanDistance(attacker.position, defender.position);
  return isInRange(attackerWeapon, distance);
}

export function getEquippedWeapon(state: RuntimeGameState, unit: UnitState): WeaponDefinition | undefined {
  return state.map.weapons.find((weapon) => weapon.id === unit.equippedWeaponId);
}

export function calculateDamageRange(
  state: RuntimeGameState,
  attacker: UnitState,
  defender: UnitState,
  weapon: WeaponDefinition,
): DamageRange {
  const triangleBonus = getTriangleBonus(defender, weapon, state);
  const isMagicAttack = isMagicDiscipline(weapon.category);
  const offenseStat = applyInjuryPenalty(state, attacker, attacker.stats.strength);
  const guardStat = applyInjuryPenalty(
    state,
    defender,
    isMagicAttack ? defender.stats.resistance : defender.stats.defense,
  );
  const effectiveGuardStat = guardStat + Math.floor(guardStat / 4);
  const baseDamage = offenseStat + weapon.power + triangleBonus - effectiveGuardStat - 2;
  let minDamage = Math.max(
    0,
    baseDamage + Math.floor(attacker.stats.skill * 0.75) - weapon.complexity,
  );
  const maxDamage = Math.max(
    minDamage,
    baseDamage + Math.floor(attacker.stats.speed * 0.75),
  );

  if (maxDamage >= 2 && maxDamage - minDamage < 2) {
    minDamage = Math.max(0, maxDamage - 2);
  }

  return {
    min: minDamage,
    max: maxDamage,
  };
}

export function rollDamageRange(range: DamageRange, randomValue = Math.random()): number {
  if (range.max <= range.min) {
    return range.min;
  }

  const bucketCount = range.max - range.min + 1;
  const normalized = Math.min(0.999999, Math.max(0, randomValue));
  return range.min + Math.floor(normalized * bucketCount);
}

function isInRange(weapon: WeaponDefinition, distance: number): boolean {
  return distance >= weapon.minRange && distance <= weapon.maxRange;
}

function getProjectedDistance(
  attackerWeapon: WeaponDefinition | undefined,
  defenderWeapon: WeaponDefinition | undefined,
): number {
  if (!attackerWeapon) {
    return 1;
  }

  if (!defenderWeapon) {
    return attackerWeapon.minRange;
  }

  const overlapStart = Math.max(attackerWeapon.minRange, defenderWeapon.minRange);
  const overlapEnd = Math.min(attackerWeapon.maxRange, defenderWeapon.maxRange);

  if (overlapStart <= overlapEnd) {
    return overlapStart;
  }

  return attackerWeapon.minRange;
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
  const pair = `${attackerCategory}:${defenderCategory}`;

  if (winningPairs.has(pair)) {
    return 1;
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
