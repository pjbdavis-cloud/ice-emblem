import { getEquippedWeapon } from "../combat/preview";
import type { Position, RuntimeGameState, UnitState } from "../types";

export function getReachablePositions(state: RuntimeGameState, unitId: string): Position[] {
  const unit = state.units[unitId];
  if (!unit || unit.isDefeated || unit.hasActed || unit.hasMoved) {
    return [];
  }

  return getMovementPreviewPositions(state, unitId).filter((position) => {
    if (position.x === unit.position.x && position.y === unit.position.y) {
      return false;
    }

    const occupant = getUnitAtPosition(state, position);
    return !occupant;
  });
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
          queue.push({ position: neighbor, steps: nextSteps });
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

export function isUnitInjured(state: RuntimeGameState, unit: UnitState): boolean {
  return unit.currentHp < Math.ceil(unit.stats.maxHp * state.rules.injuryThresholdRatio);
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

export function getUnitAtPosition(state: RuntimeGameState, position: Position): UnitState | undefined {
  return Object.values(state.units).find(
    (unit) =>
      !unit.isDefeated && unit.position.x === position.x && unit.position.y === position.y,
  );
}

export function getMovementPathPreview(
  state: RuntimeGameState,
  unitId: string,
  destination: Position,
): Position[] {
  const unit = state.units[unitId];
  if (!unit) {
    return [destination];
  }

  const startKey = toPositionKey(unit.position);
  const destinationKey = toPositionKey(destination);
  const queue: Position[] = [destination];
  const visited = new Set<string>([destinationKey]);
  const distanceByKey = new Map<string, number>([[destinationKey, 0]]);
  const positionsByKey = new Map<string, Position>([[destinationKey, destination]]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const currentKey = toPositionKey(current);
    if (currentKey === startKey) {
      break;
    }

    for (const neighbor of getAdjacentPositions(current)) {
      if (!isPositionInBounds(state, neighbor)) {
        continue;
      }

      const neighborKey = toPositionKey(neighbor);
      if (visited.has(neighborKey)) {
        continue;
      }

      if (
        neighborKey !== startKey &&
        neighborKey !== destinationKey &&
        !canUnitTraversePosition(state, unit, neighbor)
      ) {
        continue;
      }

      visited.add(neighborKey);
      distanceByKey.set(neighborKey, (distanceByKey.get(currentKey) ?? 0) + 1);
      positionsByKey.set(neighborKey, neighbor);
      queue.push(neighbor);
    }
  }

  if (!visited.has(startKey)) {
    return [unit.position, destination];
  }

  const path: Position[] = [unit.position];
  let current = unit.position;
  let lastAxis: "x" | "y" | undefined;

  while (toPositionKey(current) !== destinationKey) {
    const currentDistance = distanceByKey.get(toPositionKey(current));
    if (currentDistance === undefined) {
      return [unit.position, destination];
    }

    const candidates = getAdjacentPositions(current)
      .filter((neighbor) => {
        const neighborDistance = distanceByKey.get(toPositionKey(neighbor));
        return neighborDistance !== undefined && neighborDistance === currentDistance - 1;
      })
      .sort((left, right) =>
        comparePathCandidates(left, right, destination, current, lastAxis),
      );

    const next = candidates[0];
    if (!next) {
      return [unit.position, destination];
    }

    path.push(next);
    lastAxis = getMovementAxis(current, next);
    current = next;
  }

  return path;
}

export function getManhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
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

function canUnitTraversePosition(
  state: RuntimeGameState,
  unit: UnitState,
  position: Position,
): boolean {
  const occupant = getUnitAtPosition(state, position);
  return !occupant || occupant.team === unit.team;
}

function comparePathCandidates(
  left: Position,
  right: Position,
  destination: Position,
  current: Position,
  lastAxis: "x" | "y" | undefined,
): number {
  const leftAxis = getMovementAxis(current, left);
  const rightAxis = getMovementAxis(current, right);
  const leftSameAxisPenalty = leftAxis === lastAxis ? 1 : 0;
  const rightSameAxisPenalty = rightAxis === lastAxis ? 1 : 0;

  if (leftSameAxisPenalty !== rightSameAxisPenalty) {
    return leftSameAxisPenalty - rightSameAxisPenalty;
  }

  const leftRemainingBalance = Math.abs(destination.x - left.x) - Math.abs(destination.y - left.y);
  const rightRemainingBalance = Math.abs(destination.x - right.x) - Math.abs(destination.y - right.y);
  const leftBalanceScore = Math.abs(leftRemainingBalance);
  const rightBalanceScore = Math.abs(rightRemainingBalance);

  if (leftBalanceScore !== rightBalanceScore) {
    return leftBalanceScore - rightBalanceScore;
  }

  const leftProgress = Math.abs(destination.x - current.x) + Math.abs(destination.y - current.y)
    - (Math.abs(destination.x - left.x) + Math.abs(destination.y - left.y));
  const rightProgress = Math.abs(destination.x - current.x) + Math.abs(destination.y - current.y)
    - (Math.abs(destination.x - right.x) + Math.abs(destination.y - right.y));

  if (leftProgress !== rightProgress) {
    return rightProgress - leftProgress;
  }

  if (left.y !== right.y) {
    return left.y - right.y;
  }

  return left.x - right.x;
}

function getMovementAxis(from: Position, to: Position): "x" | "y" {
  return from.x !== to.x ? "x" : "y";
}

function toPositionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

function sortPositions(left: Position, right: Position): number {
  return left.y - right.y || left.x - right.x;
}
