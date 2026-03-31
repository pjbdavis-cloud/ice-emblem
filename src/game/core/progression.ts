import type { GrowthRates, RuntimeGameState, Stats } from "../types";
import { cloneRuntimeState } from "./runtime";
import { applyClassStatCaps, applyClassStatMinimums } from "./stats";

export type GrowthRolls = Partial<Record<keyof Stats, number>>;

export type LevelUpResult = {
  nextState: RuntimeGameState;
  statGains: Stats;
};

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

  unit.stats = applyClassStatMinimums(unit.stats, classDefinition);
  unit.currentHp = Math.min(unit.currentHp, unit.stats.maxHp);
  const statGains = calculateStatGains(classDefinition.growthRates, growthRolls);
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
