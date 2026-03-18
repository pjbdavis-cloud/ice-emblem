import type { Team, UnitState } from "../../game/types";

export type UnitSpritePose = "idle" | "walk" | "attack" | "hurt" | "death";

export type UnitSpriteDefinition = {
  src: string;
  frameWidth?: number;
  frameHeight?: number;
  frameCount?: number;
  frameDurationMs?: number;
  frameOffsetX?: number;
  frameOffsetY?: number;
};

export type UnitSpriteSet = Partial<Record<UnitSpritePose, UnitSpriteDefinition>>;

export type UnitSpriteCollection = {
  byClassAndTeam: Partial<Record<string, Partial<Record<Team, UnitSpriteSet>>>>;
};

export type ResolvedUnitSprite = {
  pose: UnitSpritePose;
  definition?: UnitSpriteDefinition;
};

export type UnitSpriteResolver = (unit: UnitState, pose: UnitSpritePose) => ResolvedUnitSprite;
