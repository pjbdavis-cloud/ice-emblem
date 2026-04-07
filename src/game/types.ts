export type Team = "player" | "enemy" | "ally";

export type Phase = "player" | "enemy";

export type WeaponRank = "E" | "D" | "C" | "B" | "A" | "S";

export type WeaponDiscipline =
  | "sword"
  | "axe"
  | "lance"
  | "bow"
  | "elemental_magic"
  | "light_magic"
  | "dark_magic"
  | "staff";

export type TerrainType = "plain" | "forest" | "fort" | "wall";

export type ObjectiveType = "route" | "defeatBoss";

export type GameMode = "classic" | "casual";
export type GameResult = "in_progress" | "victory" | "defeat";

export type UnitBehavior = "hold_position" | "aggressive" | "triggered_aggressive";

export type Position = {
  x: number;
  y: number;
};

export type Stats = {
  maxHp: number;
  strength: number;
  skill: number;
  luck: number;
  defense: number;
  resistance: number;
  speed: number;
};

export type GrowthRates = Record<keyof Stats, number>;
export type GrowthBonuses = Partial<Record<keyof Stats, number>>;
export type WeaponProficiencyExperience = Partial<Record<WeaponDiscipline, number>>;

export type UnitDefinition = {
  id: string;
  name: string;
  classId: string;
  team: Team;
  level: number;
  experience: number;
  tier: 1 | 2;
  stats: Stats;
  currentHp: number;
  position: Position;
  inventory: string[];
  equippedWeaponId: string;
  weaponProficiencies: Partial<Record<WeaponDiscipline, WeaponRank>>;
  weaponProficiencyExperience?: WeaponProficiencyExperience;
  growthBonuses?: GrowthBonuses;
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
  learnableDisciplines: WeaponDiscipline[];
  baseStats: Stats;
  growthRates: GrowthRates;
  statCaps: Stats;
};

export type WeaponDefinition = {
  id: string;
  name: string;
  category: WeaponDiscipline;
  power: number;
  complexity: number;
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
  injuryThresholdRatio: number;
  injuryPenaltyPercent: number;
};

export type RuntimeGameState = {
  map: BattleMapDefinition;
  units: Record<string, UnitState>;
  phase: Phase;
  turnNumber: number;
  rules: RulesConfig;
  gameResult: GameResult;
  mainUnitId?: string;
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
  | { type: "healUnit"; healerId: string; targetId: string }
  | { type: "waitUnit"; unitId: string }
  | { type: "endPhase" };

export type CombatPreview = {
  attackerMinDamage: number;
  attackerMaxDamage: number;
  defenderMinDamage: number;
  defenderMaxDamage: number;
  defenderCanCounter: boolean;
  defenderPotentialCounter: boolean;
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
