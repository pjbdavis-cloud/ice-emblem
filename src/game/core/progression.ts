import type {
  GrowthRates,
  RuntimeGameState,
  Stats,
  UnitState,
  WeaponRank,
} from "../types";
import { cloneRuntimeState } from "./runtime";
import { applyClassStatCaps, applyClassStatMinimums } from "./stats";

export type GrowthRolls = Partial<Record<keyof Stats, number>>;

export type LevelUpResult = {
  nextState: RuntimeGameState;
  statGains: Stats;
};

const MAX_LEVEL = 20;
const SKIRMISH_EXPERIENCE = 20;
const DEFEAT_BONUS_EXPERIENCE = 60;
const SKIRMISH_PROFICIENCY = 20;
const DEFEAT_BONUS_PROFICIENCY = 60;
const WEAPON_RANK_ORDER: WeaponRank[] = ["E", "D", "C", "B", "A", "S"];

export function levelUpUnit(
  state: RuntimeGameState,
  unitId: string,
  growthRolls: GrowthRolls = {},
): LevelUpResult {
  const nextState = cloneRuntimeState(state);
  const unit = nextState.units[unitId];
  if (!unit) {
    return {
      nextState,
      statGains: zeroStats(),
    };
  }

  const classDefinition = nextState.map.classes.find((classDef) => classDef.id === unit.classId);
  if (!classDefinition) {
    return {
      nextState,
      statGains: zeroStats(),
    };
  }

  if (unit.level >= MAX_LEVEL) {
    unit.level = MAX_LEVEL;
    unit.experience = 0;
    return {
      nextState,
      statGains: zeroStats(),
    };
  }

  unit.stats = applyClassStatMinimums(unit.stats, classDefinition);
  unit.currentHp = Math.min(unit.currentHp, unit.stats.maxHp);
  const statGains = calculateStatGains(getUnitGrowthRates(unit, classDefinition.growthRates), growthRolls);
  unit.level += 1;
  const nextStats = applyClassStatCaps(addStats(unit.stats, statGains), classDefinition);
  const maxHpGain = nextStats.maxHp - unit.stats.maxHp;
  unit.stats = nextStats;
  unit.currentHp += maxHpGain;

  return {
    nextState,
    statGains,
  };
}

export function awardCombatRewards(
  state: RuntimeGameState,
  unitId: string,
  options: { defeatedTarget: boolean },
): RuntimeGameState {
  let nextState = cloneRuntimeState(state);
  let unit = nextState.units[unitId];
  if (!unit || unit.isDefeated || unit.team === "enemy") {
    return nextState;
  }

  applyExperienceGain(unit, options.defeatedTarget ? SKIRMISH_EXPERIENCE + DEFEAT_BONUS_EXPERIENCE : SKIRMISH_EXPERIENCE);
  applyWeaponProficiencyGain(unit, nextState, options.defeatedTarget ? SKIRMISH_PROFICIENCY + DEFEAT_BONUS_PROFICIENCY : SKIRMISH_PROFICIENCY);

  while (unit.level < MAX_LEVEL && unit.experience >= 100) {
    unit.experience -= 100;
    const levelUpResult = levelUpUnit(nextState, unitId);
    nextState = levelUpResult.nextState;
    unit = nextState.units[unitId];
    if (!unit) {
      return nextState;
    }
  }

  if (unit.level >= MAX_LEVEL) {
    unit.level = MAX_LEVEL;
    unit.experience = 0;
  }

  return nextState;
}

export function awardStaffUseRewards(
  state: RuntimeGameState,
  unitId: string,
): RuntimeGameState {
  let nextState = cloneRuntimeState(state);
  const unit = nextState.units[unitId];
  if (!unit || unit.isDefeated || unit.team === "enemy") {
    return nextState;
  }

  applyExperienceGain(unit, SKIRMISH_EXPERIENCE);
  applyWeaponProficiencyGain(unit, nextState, SKIRMISH_PROFICIENCY);

  let refreshedUnit = nextState.units[unitId];
  while (refreshedUnit && refreshedUnit.level < MAX_LEVEL && refreshedUnit.experience >= 100) {
    refreshedUnit.experience -= 100;
    const levelUpResult = levelUpUnit(nextState, unitId);
    nextState = levelUpResult.nextState;
    refreshedUnit = nextState.units[unitId];
  }

  if (refreshedUnit && refreshedUnit.level >= MAX_LEVEL) {
    refreshedUnit.level = MAX_LEVEL;
    refreshedUnit.experience = 0;
  }

  return nextState;
}

export function getUnitGrowthRates(unit: Pick<UnitState, "growthBonuses">, classGrowthRates: GrowthRates): GrowthRates {
  return {
    maxHp: classGrowthRates.maxHp + (unit.growthBonuses?.maxHp ?? 0),
    strength: classGrowthRates.strength + (unit.growthBonuses?.strength ?? 0),
    skill: classGrowthRates.skill + (unit.growthBonuses?.skill ?? 0),
    luck: classGrowthRates.luck + (unit.growthBonuses?.luck ?? 0),
    defense: classGrowthRates.defense + (unit.growthBonuses?.defense ?? 0),
    resistance: classGrowthRates.resistance + (unit.growthBonuses?.resistance ?? 0),
    speed: classGrowthRates.speed + (unit.growthBonuses?.speed ?? 0),
  };
}

function calculateStatGains(growthRates: GrowthRates, growthRolls: GrowthRolls): Stats {
  return {
    maxHp: resolveGrowthGain(growthRates.maxHp, growthRolls.maxHp),
    strength: resolveGrowthGain(growthRates.strength, growthRolls.strength),
    skill: resolveGrowthGain(growthRates.skill, growthRolls.skill),
    luck: resolveGrowthGain(growthRates.luck, growthRolls.luck),
    defense: resolveGrowthGain(growthRates.defense, growthRolls.defense),
    resistance: resolveGrowthGain(growthRates.resistance, growthRolls.resistance),
    speed: resolveGrowthGain(growthRates.speed, growthRolls.speed),
  };
}

function applyExperienceGain(unit: UnitState, amount: number) {
  if (unit.level >= MAX_LEVEL) {
    unit.experience = 0;
    return;
  }

  unit.experience += amount;
}

function applyWeaponProficiencyGain(unit: UnitState, state: RuntimeGameState, amount: number) {
  const weapon = state.map.weapons.find((candidate) => candidate.id === unit.equippedWeaponId);
  const discipline = weapon?.category;
  if (!discipline) {
    return;
  }

  const currentRank = unit.weaponProficiencies[discipline];
  if (!currentRank) {
    return;
  }

  const proficiencyExperience = unit.weaponProficiencyExperience ?? (unit.weaponProficiencyExperience = {});
  let currentExperience = proficiencyExperience[discipline] ?? 0;
  let rank = currentRank;

  if (rank === "S") {
    proficiencyExperience[discipline] = 0;
    return;
  }

  currentExperience += amount;

  while (currentExperience >= 100 && rank !== "S") {
    currentExperience -= 100;
    rank = getNextWeaponRank(rank);
    unit.weaponProficiencies[discipline] = rank;
  }

  proficiencyExperience[discipline] = rank === "S" ? 0 : currentExperience;
}

function getNextWeaponRank(rank: WeaponRank): WeaponRank {
  const currentIndex = WEAPON_RANK_ORDER.indexOf(rank);
  if (currentIndex < 0 || currentIndex === WEAPON_RANK_ORDER.length - 1) {
    return "S";
  }

  return WEAPON_RANK_ORDER[currentIndex + 1];
}

function resolveGrowthGain(growthRate: number, providedRoll?: number): number {
  const guaranteedGains = Math.floor(growthRate / 100);
  const remainder = growthRate % 100;
  const roll = providedRoll ?? Math.floor(Math.random() * 100);

  return guaranteedGains + (roll < remainder ? 1 : 0);
}

function addStats(left: Stats, right: Stats): Stats {
  return {
    maxHp: left.maxHp + right.maxHp,
    strength: left.strength + right.strength,
    skill: left.skill + right.skill,
    luck: left.luck + right.luck,
    defense: left.defense + right.defense,
    resistance: left.resistance + right.resistance,
    speed: left.speed + right.speed,
  };
}

function zeroStats(): Stats {
  return {
    maxHp: 0,
    strength: 0,
    skill: 0,
    luck: 0,
    defense: 0,
    resistance: 0,
    speed: 0,
  };
}
