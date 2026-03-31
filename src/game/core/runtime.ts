import type {
  BattleMapDefinition,
  RulesConfig,
  RuntimeGameState,
  RuntimeSnapshot,
  UnitState,
} from "../types";
import { applyClassStatMinimums } from "./stats";

const defaultRules: RulesConfig = {
  gameMode: "classic",
  undoLimit: 3,
  injuryThresholdRatio: 0.5,
  injuryPenaltyPercent: 0.1,
};

export function createInitialRuntimeState(map: BattleMapDefinition): RuntimeGameState {
  const units = Object.fromEntries(
    map.units.map((unit) => {
      const classDefinition = map.classes.find((classDef) => classDef.id === unit.classId);
      const stats = classDefinition ? applyClassStatMinimums(unit.stats, classDefinition) : unit.stats;
      const currentHp = Math.min(Math.max(unit.currentHp, 0), stats.maxHp);

      return [
        unit.id,
        {
          ...unit,
          stats,
          currentHp,
          hasActed: false,
          hasMoved: false,
          isDefeated: false,
        } satisfies UnitState,
      ];
    }),
  );

  return {
    map,
    units,
    phase: "player",
    turnNumber: 1,
    rules: defaultRules,
    selectedUnitId: undefined,
    actionHistory: [],
  };
}

export function canUndo(state: RuntimeGameState): boolean {
  return state.phase === "player" && state.actionHistory.length > 0;
}

export function undoLastAction(state: RuntimeGameState): RuntimeGameState {
  const previousSnapshot = state.actionHistory[state.actionHistory.length - 1];

  if (!previousSnapshot) {
    return state;
  }

  return {
    ...previousSnapshot,
    actionHistory: state.actionHistory.slice(0, -1),
  };
}

export function commitState(
  state: RuntimeGameState,
  updater: (draft: RuntimeGameState) => RuntimeGameState,
): RuntimeGameState {
  const snapshot = toSnapshot(state);
  const nextState = updater(cloneRuntimeState(state));

  return {
    ...nextState,
    actionHistory: [...state.actionHistory, snapshot].slice(-state.rules.undoLimit),
  };
}

export function cloneRuntimeState(state: RuntimeGameState): RuntimeGameState {
  return {
    ...state,
    map: {
      ...state.map,
      tiles: state.map.tiles.map((row) => row.map((tile) => ({ ...tile }))),
      units: state.map.units.map((unit) => ({
        ...unit,
        position: { ...unit.position },
        inventory: [...unit.inventory],
      })),
      classes: state.map.classes.map((classDef) => ({
        ...classDef,
        baseStats: { ...classDef.baseStats },
        growthRates: { ...classDef.growthRates },
        statCaps: { ...classDef.statCaps },
      })),
      weapons: state.map.weapons.map((weapon) => ({ ...weapon })),
    },
    units: Object.fromEntries(
      Object.entries(state.units).map(([id, unit]) => [
        id,
        {
          ...unit,
          position: { ...unit.position },
          inventory: [...unit.inventory],
        },
      ]),
    ),
    actionHistory: [...state.actionHistory],
  };
}

export function maybeAdvancePhase(state: RuntimeGameState): RuntimeGameState {
  const activeUnits = Object.values(state.units).filter(
    (unit) => unit.team === state.phase && !unit.isDefeated,
  );
  const allActed = activeUnits.every((unit) => unit.hasActed);

  return allActed ? advancePhase(state) : state;
}

export function advancePhase(state: RuntimeGameState): RuntimeGameState {
  const nextPhase = state.phase === "player" ? "enemy" : "player";
  const nextTurnNumber = nextPhase === "player" ? state.turnNumber + 1 : state.turnNumber;

  return {
    ...state,
    phase: nextPhase,
    turnNumber: nextTurnNumber,
    selectedUnitId: undefined,
    units: Object.fromEntries(
      Object.entries(state.units).map(([id, unit]) => [
        id,
        {
          ...unit,
          hasActed: false,
          hasMoved: false,
        },
      ]),
    ),
  };
}

function toSnapshot(state: RuntimeGameState): RuntimeSnapshot {
  return {
    ...cloneRuntimeState(state),
    actionHistory: [],
  };
}
