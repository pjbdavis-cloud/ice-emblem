import type { Team, UnitState } from "../../game/types";
import type {
  ResolvedUnitSprite,
  UnitSpriteCollection,
  UnitSpritePose,
  UnitSpriteResolver,
  UnitSpriteSet,
} from "./types";

function createDefaultSpriteSet(classId: string, team: Team): UnitSpriteSet {
  return {
    idle: {
      src: `/sprites/units/${classId}/${team}-idle.png`,
      frameCount: 3,
      frameDurationMs: 240,
      frameWidth: 32,
      frameHeight: 32,
    },
    walk: {
      src: `/sprites/units/${classId}/${team}-walk.png`,
      frameCount: 4,
      frameDurationMs: 120,
      frameWidth: 32,
      frameHeight: 32,
    },
    attack: {
      src: `/sprites/units/${classId}/${team}-attack.png`,
      frameCount: 3,
      frameDurationMs: 110,
      frameWidth: 32,
      frameHeight: 32,
    },
    hurt: {
      src: `/sprites/units/${classId}/${team}-hurt.png`,
      frameCount: 2,
      frameDurationMs: 140,
      frameWidth: 32,
      frameHeight: 32,
    },
    death: {
      src: `/sprites/units/${classId}/${team}-death.png`,
      frameCount: 4,
      frameDurationMs: 120,
      frameWidth: 32,
      frameHeight: 32,
    },
  };
}

const defaultClasses = ["lord", "fighter", "archer", "mage"];
const teams: Team[] = ["player", "enemy", "ally"];

const byClassAndTeam = Object.fromEntries(
  defaultClasses.map((classId) => [
    classId,
    Object.fromEntries(teams.map((team) => [team, createDefaultSpriteSet(classId, team)])),
  ]),
) as UnitSpriteCollection["byClassAndTeam"];

if (byClassAndTeam.lord?.player?.idle) {
  byClassAndTeam.lord.player.idle = {
    ...byClassAndTeam.lord.player.idle,
    frameDurationMs: 180,
  };
}

export const unitSpriteCollection: UnitSpriteCollection = {
  byClassAndTeam,
};

export const resolveUnitSprite: UnitSpriteResolver = (
  unit: UnitState,
  pose: UnitSpritePose,
): ResolvedUnitSprite => {
  const classSprites = unitSpriteCollection.byClassAndTeam[unit.classId];
  const teamSprites = classSprites?.[unit.team];
  const fallbackTeamSprites = classSprites?.player;
  const definition =
    teamSprites?.[pose] ??
    teamSprites?.idle ??
    fallbackTeamSprites?.[pose] ??
    fallbackTeamSprites?.idle;

  return { pose, definition };
};
