import type { ClassDefinition, Stats } from "../types";

export function applyClassStatMinimums(stats: Stats, classDefinition: ClassDefinition): Stats {
  return {
    maxHp: Math.max(stats.maxHp, classDefinition.baseStats.maxHp),
    strength: Math.max(stats.strength, classDefinition.baseStats.strength),
    skill: Math.max(stats.skill, classDefinition.baseStats.skill),
    magic: Math.max(stats.magic, classDefinition.baseStats.magic),
    intelligence: Math.max(stats.intelligence, classDefinition.baseStats.intelligence),
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
    magic: Math.min(stats.magic, classDefinition.statCaps.magic),
    intelligence: Math.min(stats.intelligence, classDefinition.statCaps.intelligence),
    defense: Math.min(stats.defense, classDefinition.statCaps.defense),
    resistance: Math.min(stats.resistance, classDefinition.statCaps.resistance),
    speed: Math.min(stats.speed, classDefinition.statCaps.speed),
  };
}
