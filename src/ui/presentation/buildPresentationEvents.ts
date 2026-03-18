import type { RuntimeGameState } from "../../game/types";
import type { PresentationEvent } from "./types";

export function buildPresentationEvents(
  previousState: RuntimeGameState,
  nextState: RuntimeGameState,
): PresentationEvent[] {
  const events: PresentationEvent[] = [];
  const movedUnits = Object.values(nextState.units).filter((unit) => {
    const previous = previousState.units[unit.id];
    return (
      previous &&
      (previous.position.x !== unit.position.x || previous.position.y !== unit.position.y)
    );
  });

  for (const unit of movedUnits) {
    const previous = previousState.units[unit.id];
    if (!previous) {
      continue;
    }

    events.push({
      type: "move",
      unitId: unit.id,
      team: unit.team,
      from: previous.position,
      to: unit.position,
      path: [previous.position, unit.position],
    });
  }

  const attacker = Object.values(nextState.units).find((unit) => {
    const previous = previousState.units[unit.id];
    return previous && !previous.hasActed && unit.hasActed;
  });

  if (!attacker) {
    return events;
  }

  const hpChangedUnits = Object.values(nextState.units).filter((unit) => {
    const previous = previousState.units[unit.id];
    return previous && previous.currentHp !== unit.currentHp;
  });
  const defender = hpChangedUnits.find((unit) => unit.id !== attacker.id);

  if (!defender) {
    return events;
  }

  const previousAttacker = previousState.units[attacker.id];
  const previousDefender = previousState.units[defender.id];
  if (!previousAttacker || !previousDefender) {
    return events;
  }

  events.push({
    type: "combat",
    attackerId: attacker.id,
    defenderId: defender.id,
    defenderCanCounter: previousAttacker.currentHp !== attacker.currentHp,
    attackerFromHp: previousAttacker.currentHp,
    attackerToHp: attacker.currentHp,
    defenderFromHp: previousDefender.currentHp,
    defenderToHp: defender.currentHp,
  });

  return events;
}
