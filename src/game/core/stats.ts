import type { ClassDefinition, Stats } from "../types";

export function applyClassStatMinimums(stats: Stats, classDefinition: ClassDefinition): Stats {
  return {
    maxHp: Math.max(stats.maxHp, classDefinition.baseStats.maxHp),
    strength: Math.max(stats.strength, classDefinition.baseStats.strength),
    skill: Math.max(stats.skill, classDefinition.baseStats.skill),
    luck: Math.max(stats.luck, classDefinition.baseStats.luck),
    defense: Math.max(stats.defense, classDefinition.baseStats.defense),
    resistance: Math.max(stats.resistance, classDefinition.baseStats.resistance),
    speed: Math.max(stats.speed, classDefinition.baseStats.speed),
  };
}

export function applyClassStatCaps(stats: Stats, classDefinition: ClassDefinition): Stats {
  return {
    maxHp: Math.min(stats.maxHp, classDefinition.statCaps.maxHp),
    strength: Math.min(stats.strength, classDefinition.statCaps.strength),
    skill: Math.min(stats.skill, classDefinition.statCaps.skill),
    luck: Math.min(stats.luck, classDefinition.statCaps.luck),
    defense: Math.min(stats.defense, classDefinition.statCaps.defense),
    resistance: Math.min(stats.resistance, classDefinition.statCaps.resistance),
    speed: Math.min(stats.speed, classDefinition.statCaps.speed),
  };
}
