export type Team = "player" | "enemy" | "ally";

export type Phase = "player" | "enemy";

export type WeaponRank = "E" | "D" | "C" | "B" | "A" | "S";

export type WeaponCategory =
  | "sword"
  | "axe"
  | "lance"
  | "bow"
  | "magic"
  | "staff";

export type MagicType = "water" | "fire" | "earth" | "light" | "dark";

export type TerrainType = "plain" | "forest" | "fort";

export type ObjectiveType = "route" | "defeatBoss";

export type GameMode = "classic" | "casual";

export type UnitBehavior = "hold_position" | "aggressive" | "triggered_aggressive";

export type Position = {
  x: number;
  y: number;
};

export type Stats = {
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  movement: number;
};

export type UnitDefinition = {
  id: string;
  name: string;
  classId: string;
  team: Team;
  level: number;
  tier: 1 | 2;
  stats: Stats;
  currentHp: number;
  position: Position;
  inventory: string[];
  equippedWeaponId: string;
  personalSkillId?: string;
  classSkillId?: string;
  behavior?: UnitBehavior;
  isLeader?: boolean;
  isBoss?: boolean;
};

export type ClassDefinition = {
  id: string;
  name: string;
  tier: 1 | 2;
  movement: number;
};

export type WeaponDefinition = {
  id: string;
  name: string;
  category: WeaponCategory;
  magicType?: MagicType;
  might: number;
  minRange: 1 | 2;
  maxRange: 1 | 2;
  requiredRank: WeaponRank;
};

export type TileDefinition = {
  terrain: TerrainType;
};

export type BattleMapDefinition = {
  id: string;
  name: string;
  width: number;
  height: number;
  tiles: TileDefinition[][];
  objectives: {
    type: ObjectiveType;
  };
  units: UnitDefinition[];
  classes: ClassDefinition[];
  weapons: WeaponDefinition[];
};

export type UnitState = UnitDefinition & {
  hasActed: boolean;
  hasMoved: boolean;
  isDefeated: boolean;
};

export type RulesConfig = {
  gameMode: GameMode;
  undoLimit: number;
  minimumDamage: number;
  injuryThresholdRatio: number;
  injuryPenaltyPercent: number;
  speedBonusThresholds: Array<{
    speedDifference: number;
    bonusDamage: number;
  }>;
};

export type RuntimeGameState = {
  map: BattleMapDefinition;
  units: Record<string, UnitState>;
  phase: Phase;
  turnNumber: number;
  rules: RulesConfig;
  selectedUnitId?: string;
  actionHistory: RuntimeSnapshot[];
};

export type RuntimeSnapshot = Omit<RuntimeGameState, "actionHistory"> & {
  actionHistory: [];
};

export type GameAction =
  | { type: "selectUnit"; unitId?: string }
  | { type: "moveUnit"; unitId: string; destination: Position }
  | { type: "attackUnit"; attackerId: string; defenderId: string }
  | { type: "waitUnit"; unitId: string }
  | { type: "endPhase" };

export type CombatPreview = {
  attackerDamage: number;
  defenderDamage: number;
  defenderCanCounter: boolean;
};

export type PresentationEvent =
  | {
      type: "move";
      unitId: string;
      team: Team;
      from: Position;
      to: Position;
      path: Position[];
    }
  | {
      type: "pause";
      unitId: string;
      durationMs: number;
    }
  | {
      type: "combat";
      attackerId: string;
      defenderId: string;
      defenderCanCounter: boolean;
      attackerFromHp: number;
      attackerToHp: number;
      defenderFromHp: number;
      defenderToHp: number;
    };
