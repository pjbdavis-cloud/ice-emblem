import { canUnitStrikeTarget, getCombatPreview } from "../combat/preview";
import type {
  GameAction,
  Position,
  PresentationEvent,
  RuntimeGameState,
  UnitState,
} from "../types";
import {
  canUnitMoveTo,
  getAttackReachPreviewPositions,
  getManhattanDistance,
  getMovementPathPreview,
  getMovementPreviewPositions,
  getReachablePositions,
  getThreatenedPositions,
  getUnitMovement,
  getUnitAtPosition,
  isUnitInjured,
} from "./movement";
import {
  advancePhase,
  canUndo,
  cloneRuntimeState,
  commitState,
  createInitialRuntimeState,
  maybeAdvancePhase,
  undoLastAction,
} from "./runtime";
export { levelUpUnit } from "./progression";

const MOVE_TO_ATTACK_PAUSE_MS = 360;

export {
  advancePhase,
  canUndo,
  createInitialRuntimeState,
  getAttackReachPreviewPositions,
  getManhattanDistance,
  getMovementPathPreview,
  getMovementPreviewPositions,
  getReachablePositions,
  getThreatenedPositions,
  getUnitMovement,
  getUnitAtPosition,
  isUnitInjured,
  undoLastAction,
};

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
      return commitState(state, (draft) => advancePhase(draft));
    default:
      return state;
  }
}

export function processNextEnemyAction(state: RuntimeGameState): RuntimeGameState {
  return previewNextEnemyAction(state).nextState;
}

export function previewNextEnemyAction(
  state: RuntimeGameState,
): { nextState: RuntimeGameState; presentationEvents: PresentationEvent[] } {
  if (state.phase !== "enemy") {
    return { nextState: state, presentationEvents: [] };
  }

  const nextEnemy = Object.values(state.units)
    .filter((unit) => unit.team === "enemy" && !unit.isDefeated && !unit.hasActed)
    .sort((left, right) => left.id.localeCompare(right.id))[0];

  if (!nextEnemy) {
    return { nextState: advancePhase(state), presentationEvents: [] };
  }

  const result = executeEnemyTurnWithPresentation(state, nextEnemy.id);
  const nextState = result.nextState;
  const remainingEnemy = Object.values(nextState.units).some(
    (unit) => unit.team === "enemy" && !unit.isDefeated && !unit.hasActed,
  );

  return {
    nextState: remainingEnemy ? nextState : advancePhase(nextState),
    presentationEvents: result.presentationEvents,
  };
}

export function buildPlayerActionPresentation(
  previousState: RuntimeGameState,
  action: Extract<GameAction, { type: "attackUnit" | "waitUnit" }>,
  stagedDestination?: Position,
): { nextState: RuntimeGameState; presentationEvents: PresentationEvent[] } {
  const presentationEvents: PresentationEvent[] = [];
  let nextState = previousState;

  if (stagedDestination) {
    const unitId = action.type === "attackUnit" ? action.attackerId : action.unitId;
    const movedState = applyAction(nextState, {
      type: "moveUnit",
      unitId,
      destination: stagedDestination,
    });
    presentationEvents.push(...createMovePresentationEvents(nextState, movedState, unitId));
    nextState = movedState;
  }

  if (action.type === "attackUnit") {
    const attacker = nextState.units[action.attackerId];
    const defender = nextState.units[action.defenderId];
    if (attacker && defender && canUnitAttackTarget(nextState, attacker.id, defender.id)) {
      const preview = getCombatPreview(nextState, attacker.id, defender.id);
      if (preview.attackerDamage > 0) {
        presentationEvents.push({
          type: "combat",
          attackerId: attacker.id,
          defenderId: defender.id,
          defenderCanCounter: preview.defenderCanCounter,
          attackerFromHp: attacker.currentHp,
          attackerToHp: Math.max(0, attacker.currentHp - preview.defenderDamage),
          defenderFromHp: defender.currentHp,
          defenderToHp: Math.max(0, defender.currentHp - preview.attackerDamage),
        });
      }
    }
  }

  nextState = applyAction(nextState, action);
  return { nextState, presentationEvents };
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

function executeEnemyTurnWithPresentation(
  state: RuntimeGameState,
  enemyUnitId: string,
): { nextState: RuntimeGameState; presentationEvents: PresentationEvent[] } {
  const enemy = state.units[enemyUnitId];
  if (!enemy || enemy.isDefeated || enemy.hasActed) {
    return { nextState: state, presentationEvents: [] };
  }

  const attackOptions = getUnitAttackOptions(state, enemyUnitId);
  if (attackOptions.length > 0) {
    const bestAttack = attackOptions.sort(compareAttackOptions)[0];
    return resolveAttackWithPresentation(state, enemyUnitId, bestAttack.id, []);
  }

  const candidateDestinations = getReachablePositions(state, enemyUnitId);
  let bestState = state;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const destination of candidateDestinations) {
    const movedState = resolveMove(state, enemyUnitId, destination);
    const movedAttackOptions = getUnitAttackOptions(movedState, enemyUnitId);
    const moveEvents = createMovePresentationEvents(state, movedState, enemyUnitId);

    if (movedAttackOptions.length > 0) {
      const bestAttack = movedAttackOptions.sort(compareAttackOptions)[0];
      return resolveAttackWithPresentation(movedState, enemyUnitId, bestAttack.id, moveEvents);
    }

    const score = scorePosition(movedState, enemyUnitId);
    if (score > bestScore) {
      bestScore = score;
      bestState = movedState;
    }
  }

  return {
    nextState: resolveWait(bestState, enemyUnitId),
    presentationEvents: createMovePresentationEvents(state, bestState, enemyUnitId),
  };
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

function resolveAttackWithPresentation(
  state: RuntimeGameState,
  attackerId: string,
  defenderId: string,
  existingEvents: PresentationEvent[],
): { nextState: RuntimeGameState; presentationEvents: PresentationEvent[] } {
  const nextState = cloneRuntimeState(state);
  const attacker = nextState.units[attackerId];
  const defender = nextState.units[defenderId];

  if (!attacker || !defender || !canUnitAttackTarget(nextState, attackerId, defenderId)) {
    return { nextState, presentationEvents: existingEvents };
  }

  const attackerFromHp = attacker.currentHp;
  const defenderFromHp = defender.currentHp;
  const preview = getCombatPreview(nextState, attackerId, defenderId);
  if (preview.attackerDamage <= 0) {
    return { nextState, presentationEvents: existingEvents };
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
  return {
    nextState,
    presentationEvents: [
      ...withMoveAttackPause(existingEvents, attackerId),
      {
        type: "combat",
        attackerId,
        defenderId,
        defenderCanCounter: preview.defenderCanCounter,
        attackerFromHp,
        attackerToHp: attacker.currentHp,
        defenderFromHp,
        defenderToHp: defender.currentHp,
      },
    ],
  };
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

function createMovePresentationEvents(
  previousState: RuntimeGameState,
  nextState: RuntimeGameState,
  unitId: string,
): PresentationEvent[] {
  const previousUnit = previousState.units[unitId];
  const nextUnit = nextState.units[unitId];

  if (
    !previousUnit ||
    !nextUnit ||
    (previousUnit.position.x === nextUnit.position.x &&
      previousUnit.position.y === nextUnit.position.y)
  ) {
    return [];
  }

  return [
    {
      type: "move",
      unitId,
      team: nextUnit.team,
      from: previousUnit.position,
      to: nextUnit.position,
      path: getMovementPathPreview(previousState, unitId, nextUnit.position),
    },
  ];
}

function withMoveAttackPause(events: PresentationEvent[], unitId: string): PresentationEvent[] {
  const lastEvent = events[events.length - 1];
  if (lastEvent?.type !== "move" || lastEvent.unitId !== unitId) {
    return events;
  }

  return [
    ...events,
    {
      type: "pause",
      unitId,
      durationMs: MOVE_TO_ATTACK_PAUSE_MS,
    },
  ];
}
