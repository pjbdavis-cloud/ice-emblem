import { canUnitStrikeTarget, getCombatPreview, getEquippedWeapon } from "../combat/preview";
import type {
  BattleMapDefinition,
  GameAction,
  Position,
  RuntimeGameState,
  RuntimeSnapshot,
  RulesConfig,
  UnitState,
} from "../types";

const defaultRules: RulesConfig = {
  gameMode: "classic",
  undoLimit: 3,
  minimumDamage: 0,
  injuryThresholdRatio: 0.5,
  injuryPenaltyPercent: 0.1,
  speedBonusThresholds: [
    { speedDifference: 8, bonusDamage: 3 },
    { speedDifference: 5, bonusDamage: 2 },
    { speedDifference: 3, bonusDamage: 1 },
  ],
};

export function createInitialRuntimeState(map: BattleMapDefinition): RuntimeGameState {
  const units = Object.fromEntries(
    map.units.map((unit) => [
      unit.id,
      {
        ...unit,
        hasActed: false,
        hasMoved: false,
        isDefeated: false,
      } satisfies UnitState,
    ]),
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

export function applyAction(state: RuntimeGameState, action: GameAction): RuntimeGameState {
  switch (action.type) {
    case "selectUnit":
      if (action.unitId) {
        const unit = state.units[action.unitId];
        if (!unit || unit.team !== state.phase || unit.hasActed || unit.isDefeated) {
          return {
            ...state,
            selectedUnitId: undefined,
          };
        }
      }

      return {
        ...state,
        selectedUnitId: action.unitId,
      };
    case "moveUnit":
      return commitState(state, (draft) => {
        const unit = draft.units[action.unitId];
        if (
          !unit ||
          unit.team !== draft.phase ||
          unit.hasActed ||
          unit.hasMoved ||
          unit.isDefeated ||
          !canUnitMoveTo(draft, action.unitId, action.destination)
        ) {
          return draft;
        }

        unit.position = action.destination;
        unit.hasMoved = true;
        draft.selectedUnitId = action.unitId;
        return draft;
      });
    case "attackUnit":
      return commitState(state, (draft) => {
        const attacker = draft.units[action.attackerId];
        const defender = draft.units[action.defenderId];

        if (
          !attacker ||
          !defender ||
          attacker.team !== draft.phase ||
          defender.team === draft.phase ||
          attacker.hasActed ||
          attacker.isDefeated ||
          defender.isDefeated ||
          !canUnitAttackTarget(draft, action.attackerId, action.defenderId)
        ) {
          return draft;
        }

        const preview = getCombatPreview(draft, action.attackerId, action.defenderId);
        if (preview.attackerDamage <= 0) {
          return draft;
        }

        defender.currentHp = Math.max(0, defender.currentHp - preview.attackerDamage);
        if (defender.currentHp === 0) {
          defender.isDefeated = true;
        }

        if (preview.defenderCanCounter) {
          attacker.currentHp = Math.max(0, attacker.currentHp - preview.defenderDamage);
          if (attacker.currentHp === 0) {
            attacker.isDefeated = true;
          }
        }

        attacker.hasMoved = true;
        attacker.hasActed = true;
        draft.selectedUnitId = undefined;
        return maybeAdvancePhase(draft);
      });
    case "waitUnit":
      return commitState(state, (draft) => {
        const unit = draft.units[action.unitId];
        if (!unit || unit.team !== draft.phase || unit.hasActed || unit.isDefeated) {
          return draft;
        }

        unit.hasMoved = true;
        unit.hasActed = true;
        draft.selectedUnitId = undefined;
        return maybeAdvancePhase(draft);
      });
    case "endPhase":
      return commitState(state, (draft) => resolvePhaseTransition(draft));
    default:
      return state;
  }
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

function commitState(
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

function toSnapshot(state: RuntimeGameState): RuntimeSnapshot {
  return {
    ...cloneRuntimeState(state),
    actionHistory: [],
  };
}

function cloneRuntimeState(state: RuntimeGameState): RuntimeGameState {
  return {
    ...state,
    map: {
      ...state.map,
      tiles: state.map.tiles.map((row) => row.map((tile) => ({ ...tile }))),
      units: state.map.units.map((unit) => ({ ...unit, position: { ...unit.position }, inventory: [...unit.inventory] })),
      classes: state.map.classes.map((classDef) => ({ ...classDef })),
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

function maybeAdvancePhase(state: RuntimeGameState): RuntimeGameState {
  const activeUnits = Object.values(state.units).filter(
    (unit) => unit.team === state.phase && !unit.isDefeated,
  );
  const allActed = activeUnits.every((unit) => unit.hasActed);

  return allActed ? resolvePhaseTransition(state) : state;
}

function advancePhase(state: RuntimeGameState): RuntimeGameState {
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
        unit.team === nextPhase
          ? {
              ...unit,
              hasActed: false,
              hasMoved: false,
            }
          : unit,
      ]),
    ),
  };
}

function resolvePhaseTransition(state: RuntimeGameState): RuntimeGameState {
  const advancedState = advancePhase(state);
  return advancedState.phase === "enemy" ? resolveEnemyPhase(advancedState) : advancedState;
}

function resolveEnemyPhase(state: RuntimeGameState): RuntimeGameState {
  let currentState = cloneRuntimeState(state);
  currentState.actionHistory = state.actionHistory;

  const enemyUnits = Object.values(currentState.units)
    .filter((unit) => unit.team === "enemy" && !unit.isDefeated)
    .sort((left, right) => left.id.localeCompare(right.id));

  for (const enemyUnit of enemyUnits) {
    const activeEnemy = currentState.units[enemyUnit.id];
    if (!activeEnemy || activeEnemy.hasActed || activeEnemy.isDefeated) {
      continue;
    }

    currentState = executeEnemyTurn(currentState, activeEnemy.id);
  }

  return advancePhase(currentState);
}

function executeEnemyTurn(state: RuntimeGameState, enemyUnitId: string): RuntimeGameState {
  const enemy = state.units[enemyUnitId];
  if (!enemy || enemy.isDefeated || enemy.hasActed) {
    return state;
  }

  const attackOptions = getUnitAttackOptions(state, enemyUnitId);
  if (attackOptions.length > 0) {
    const bestAttack = attackOptions.sort(compareAttackOptions)[0];
    return resolveAttack(state, enemyUnitId, bestAttack.id);
  }

  const candidateDestinations = getReachablePositions(state, enemyUnitId);
  let bestState = state;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const destination of candidateDestinations) {
    const movedState = resolveMove(state, enemyUnitId, destination);
    const movedAttackOptions = getUnitAttackOptions(movedState, enemyUnitId);

    if (movedAttackOptions.length > 0) {
      const bestAttack = movedAttackOptions.sort(compareAttackOptions)[0];
      return resolveAttack(movedState, enemyUnitId, bestAttack.id);
    }

    const score = scorePosition(movedState, enemyUnitId);
    if (score > bestScore) {
      bestScore = score;
      bestState = movedState;
    }
  }

  return resolveWait(bestState, enemyUnitId);
}

function compareAttackOptions(left: UnitState, right: UnitState): number {
  if (left.isLeader !== right.isLeader) {
    return Number(right.isLeader) - Number(left.isLeader);
  }

  return left.currentHp - right.currentHp;
}

function scorePosition(state: RuntimeGameState, enemyUnitId: string): number {
  const enemy = state.units[enemyUnitId];
  if (!enemy) {
    return Number.NEGATIVE_INFINITY;
  }

  const playerUnits = Object.values(state.units).filter(
    (unit) => unit.team === "player" && !unit.isDefeated,
  );

  if (playerUnits.length === 0) {
    return 0;
  }

  const nearestDistance = Math.min(
    ...playerUnits.map((unit) => getManhattanDistance(enemy.position, unit.position)),
  );

  return -nearestDistance;
}

function resolveMove(state: RuntimeGameState, unitId: string, destination: Position): RuntimeGameState {
  const nextState = cloneRuntimeState(state);
  const unit = nextState.units[unitId];
  if (!unit || !canUnitMoveTo(nextState, unitId, destination)) {
    return nextState;
  }

  unit.position = destination;
  unit.hasMoved = true;
  nextState.selectedUnitId = unitId;
  return nextState;
}

function resolveAttack(state: RuntimeGameState, attackerId: string, defenderId: string): RuntimeGameState {
  const nextState = cloneRuntimeState(state);
  const attacker = nextState.units[attackerId];
  const defender = nextState.units[defenderId];

  if (!attacker || !defender || !canUnitAttackTarget(nextState, attackerId, defenderId)) {
    return nextState;
  }

  const preview = getCombatPreview(nextState, attackerId, defenderId);
  if (preview.attackerDamage <= 0) {
    return nextState;
  }

  defender.currentHp = Math.max(0, defender.currentHp - preview.attackerDamage);
  if (defender.currentHp === 0) {
    defender.isDefeated = true;
  }

  if (preview.defenderCanCounter) {
    attacker.currentHp = Math.max(0, attacker.currentHp - preview.defenderDamage);
    if (attacker.currentHp === 0) {
      attacker.isDefeated = true;
    }
  }

  attacker.hasMoved = true;
  attacker.hasActed = true;
  nextState.selectedUnitId = undefined;
  return nextState;
}

function resolveWait(state: RuntimeGameState, unitId: string): RuntimeGameState {
  const nextState = cloneRuntimeState(state);
  const unit = nextState.units[unitId];
  if (!unit || unit.hasActed || unit.isDefeated) {
    return nextState;
  }

  unit.hasMoved = true;
  unit.hasActed = true;
  nextState.selectedUnitId = undefined;
  return nextState;
}

export function getReachablePositions(state: RuntimeGameState, unitId: string): Position[] {
  const unit = state.units[unitId];
  if (!unit || unit.isDefeated || unit.hasActed || unit.hasMoved) {
    return [];
  }

  return getMovementPreviewPositions(state, unitId);
}

export function getMovementPreviewPositions(state: RuntimeGameState, unitId: string): Position[] {
  const unit = state.units[unitId];
  if (!unit || unit.isDefeated) {
    return [];
  }

  const visited = new Map<string, number>();
  const reachable = new Map<string, Position>();
  const queue: Array<{ position: Position; steps: number }> = [
    { position: unit.position, steps: 0 },
  ];

  visited.set(toPositionKey(unit.position), 0);
  reachable.set(toPositionKey(unit.position), unit.position);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    for (const neighbor of getAdjacentPositions(current.position)) {
      if (!isPositionInBounds(state, neighbor)) {
        continue;
      }

      const nextSteps = current.steps + 1;
      if (nextSteps > unit.stats.movement) {
        continue;
      }

      const key = toPositionKey(neighbor);
      const previousSteps = visited.get(key);
      if (previousSteps !== undefined && previousSteps <= nextSteps) {
        continue;
      }

      visited.set(key, nextSteps);

      const occupant = getUnitAtPosition(state, neighbor);
      if (occupant) {
        if (occupant.team === unit.team) {
          reachable.set(key, neighbor);
        }
        continue;
      }

      reachable.set(key, neighbor);
      queue.push({ position: neighbor, steps: nextSteps });
    }
  }

  return Array.from(reachable.values()).sort(sortPositions);
}

export function getAttackReachPreviewPositions(state: RuntimeGameState, unitId: string): Position[] {
  const unit = state.units[unitId];
  const weapon = unit ? getEquippedWeapon(state, unit) : undefined;
  if (!unit || !weapon || unit.isDefeated) {
    return [];
  }

  const movePositions = getMovementPreviewPositions(state, unitId);
  const attackPositions = new Map<string, Position>();
  const blockedPositions = new Set<string>([
    toPositionKey(unit.position),
    ...movePositions.map(toPositionKey),
  ]);
  const origins = [unit.position, ...movePositions];

  for (const origin of origins) {
    for (let dx = -weapon.maxRange; dx <= weapon.maxRange; dx += 1) {
      for (let dy = -weapon.maxRange; dy <= weapon.maxRange; dy += 1) {
        const distance = Math.abs(dx) + Math.abs(dy);
        if (distance < weapon.minRange || distance > weapon.maxRange) {
          continue;
        }

        const position = { x: origin.x + dx, y: origin.y + dy };
        if (!isPositionInBounds(state, position)) {
          continue;
        }

        const occupant = getUnitAtPosition(state, position);
        if (occupant && occupant.team === unit.team) {
          continue;
        }

        const key = toPositionKey(position);
        if (blockedPositions.has(key)) {
          continue;
        }

        attackPositions.set(key, position);
      }
    }
  }

  return Array.from(attackPositions.values()).sort(sortPositions);
}

export function getThreatenedPositions(state: RuntimeGameState, unitId: string): Position[] {
  const unit = state.units[unitId];
  const weapon = unit ? getEquippedWeapon(state, unit) : undefined;
  if (!unit || !weapon || unit.isDefeated) {
    return [];
  }

  const movePositions = getMovementPreviewPositions(state, unitId);
  const threatenedPositions = new Map<string, Position>();
  const origins = [unit.position, ...movePositions];

  for (const origin of origins) {
    for (let dx = -weapon.maxRange; dx <= weapon.maxRange; dx += 1) {
      for (let dy = -weapon.maxRange; dy <= weapon.maxRange; dy += 1) {
        const distance = Math.abs(dx) + Math.abs(dy);
        if (distance < weapon.minRange || distance > weapon.maxRange) {
          continue;
        }

        const position = { x: origin.x + dx, y: origin.y + dy };
        if (!isPositionInBounds(state, position)) {
          continue;
        }

        threatenedPositions.set(toPositionKey(position), position);
      }
    }
  }

  return Array.from(threatenedPositions.values()).sort(sortPositions);
}

export function canUnitMoveTo(state: RuntimeGameState, unitId: string, destination: Position): boolean {
  const unit = state.units[unitId];
  if (!unit || unit.isDefeated || unit.hasActed || unit.hasMoved) {
    return false;
  }

  return getReachablePositions(state, unitId).some(
    (position) => position.x === destination.x && position.y === destination.y,
  );
}

export function getUnitAttackOptions(state: RuntimeGameState, unitId: string): UnitState[] {
  const unit = state.units[unitId];
  if (!unit || unit.isDefeated || unit.hasActed) {
    return [];
  }

  return Object.values(state.units)
    .filter((candidate) => candidate.team !== unit.team && !candidate.isDefeated)
    .filter((candidate) => canUnitAttackTarget(state, unitId, candidate.id));
}

export function canUnitAttackTarget(
  state: RuntimeGameState,
  attackerId: string,
  defenderId: string,
): boolean {
  const attacker = state.units[attackerId];
  const defender = state.units[defenderId];
  if (
    !attacker ||
    !defender ||
    attacker.isDefeated ||
    defender.isDefeated ||
    attacker.hasActed ||
    attacker.team === defender.team
  ) {
    return false;
  }

  return canUnitStrikeTarget(state, attacker, defender);
}

export function getUnitAtPosition(state: RuntimeGameState, position: Position): UnitState | undefined {
  return Object.values(state.units).find(
    (unit) =>
      !unit.isDefeated && unit.position.x === position.x && unit.position.y === position.y,
  );
}

function getAdjacentPositions(position: Position): Position[] {
  return [
    { x: position.x + 1, y: position.y },
    { x: position.x - 1, y: position.y },
    { x: position.x, y: position.y + 1 },
    { x: position.x, y: position.y - 1 },
  ];
}

function isPositionInBounds(state: RuntimeGameState, position: Position): boolean {
  return (
    position.x >= 0 &&
    position.y >= 0 &&
    position.x < state.map.width &&
    position.y < state.map.height
  );
}

function toPositionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

function sortPositions(left: Position, right: Position): number {
  return left.y - right.y || left.x - right.x;
}

export function getManhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
