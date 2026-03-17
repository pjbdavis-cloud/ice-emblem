import { useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { dispatchGameAction, resetDemoState, undoAction } from "../../app/slices/gameSlice";
import { getCombatPreview } from "../../game/combat/preview";
import {
  canUndo,
  getReachablePositions,
  getUnitAttackOptions,
} from "../../game/core/state";
import type { Position, RuntimeGameState, UnitState } from "../../game/types";

type PendingAction = "none" | "chooseAction" | "chooseAttackTarget";

export function BattleScreen() {
  const dispatch = useAppDispatch();
  const runtime = useAppSelector((state) => state.game.runtime);

  const [hoveredTile, setHoveredTile] = useState<Position | undefined>();
  const [stagedDestination, setStagedDestination] = useState<Position | undefined>();
  const [pendingAction, setPendingAction] = useState<PendingAction>("none");

  const selectedUnit = runtime.selectedUnitId ? runtime.units[runtime.selectedUnitId] : undefined;
  const units = Object.values(runtime.units);
  const hoveredUnit = hoveredTile ? getUnitAtPosition(units, hoveredTile) : undefined;

  const movePreviewState = useMemo(() => {
    if (!selectedUnit || !stagedDestination) {
      return runtime;
    }

    return createPreviewState(runtime, selectedUnit.id, stagedDestination);
  }, [runtime, selectedUnit, stagedDestination]);

  const reachableTiles = useMemo(
    () => (selectedUnit && !stagedDestination ? getReachablePositions(runtime, selectedUnit.id) : []),
    [runtime, selectedUnit, stagedDestination],
  );

  const attackableTargets = useMemo(() => {
    if (!selectedUnit) {
      return [];
    }

    const sourceState = stagedDestination ? movePreviewState : runtime;
    return getUnitAttackOptions(sourceState, selectedUnit.id);
  }, [movePreviewState, runtime, selectedUnit, stagedDestination]);

  const hoveredAttackTarget =
    hoveredUnit && selectedUnit && hoveredUnit.team !== selectedUnit.team
      ? attackableTargets.find((unit) => unit.id === hoveredUnit.id)
      : undefined;

  const previewTarget = hoveredAttackTarget ?? attackableTargets[0];
  const previewState = stagedDestination ? movePreviewState : runtime;
  const combatPreview =
    selectedUnit && previewTarget
      ? getCombatPreview(previewState, selectedUnit.id, previewTarget.id)
      : undefined;

  const focusedUnit = hoveredUnit ?? selectedUnit;

  return (
    <main className="app-shell">
      <section className="battle-panel">
        <header className="battle-header">
          <div>
            <p className="eyebrow">Prototype</p>
            <h1>Fire Emblem Web</h1>
            <p className="phase-label">
              Turn {runtime.turnNumber} | {runtime.phase.toUpperCase()} PHASE
            </p>
          </div>
          <div className="battle-actions">
            <button type="button" disabled={!canUndo(runtime)} onClick={() => dispatch(undoAction())}>
              Undo
            </button>
            <button type="button" onClick={handleReset}>
              Reset
            </button>
            <button type="button" onClick={handleEndPhase}>
              End Phase
            </button>
          </div>
        </header>

        <div className="layout">
          <div className="map-card">
            <div
              className="battle-grid"
              style={{
                gridTemplateColumns: `repeat(${runtime.map.width}, minmax(0, 1fr))`,
              }}
            >
              {runtime.map.tiles.flatMap((row, y) =>
                row.map((tile, x) => {
                  const position = { x, y };
                  const unit = getUnitAtPosition(units, position);

                  return (
                    <button
                      key={`${x}-${y}`}
                      type="button"
                      className={getTileClassName(position, tile.terrain, unit)}
                      onClick={() => handleTileClick(position)}
                      onMouseEnter={() => setHoveredTile(position)}
                      onMouseLeave={() => setHoveredTile(undefined)}
                    >
                      <span className="tile-coordinates">
                        {x},{y}
                      </span>
                      {unit ? <span className={`unit-badge unit-${unit.team}`}>{unit.name[0]}</span> : null}
                    </button>
                  );
                }),
              )}
            </div>
          </div>

          <aside className="sidebar">
            <section className="card">
              <h2>{hoveredUnit ? "Hovered Unit" : "Selected Unit"}</h2>
              {focusedUnit ? (
                <>
                  <p>{focusedUnit.name}</p>
                  <p>
                    HP: {focusedUnit.currentHp}/{focusedUnit.stats.maxHp}
                  </p>
                  <p>ATK: {focusedUnit.stats.attack}</p>
                  <p>DEF: {focusedUnit.stats.defense}</p>
                  <p>SPD: {focusedUnit.stats.speed}</p>
                  <p>MOV: {focusedUnit.stats.movement}</p>
                  {focusedUnit.id === selectedUnit?.id ? (
                    <>
                      <p>{focusedUnit.hasMoved ? "Moved this turn" : "Ready to move"}</p>
                      <p>{focusedUnit.hasActed ? "Action spent" : "Action available"}</p>
                    </>
                  ) : null}
                  {focusedUnit.id === selectedUnit?.id ? (
                    <button
                      type="button"
                      disabled={focusedUnit.hasActed}
                      onClick={handleWait}
                    >
                      Wait
                    </button>
                  ) : null}
                </>
              ) : (
                <p>Hover or select a unit to inspect it.</p>
              )}
            </section>

            <section className="card">
              <h2>Combat Preview</h2>
              {selectedUnit && previewTarget && combatPreview ? (
                <>
                  <p>
                    {selectedUnit.name} vs {previewTarget.name}
                  </p>
                  <p>Damage dealt: {combatPreview.attackerDamage}</p>
                  <p>
                    Counter: {combatPreview.defenderCanCounter ? `${combatPreview.defenderDamage} damage` : "None"}
                  </p>
                  <button type="button" onClick={() => handleAttack(previewTarget.id)}>
                    Attack Target
                  </button>
                </>
              ) : (
                <p>Select a unit, stage a move, then hover an enemy to preview that fight.</p>
              )}
            </section>

            <section className="card">
              <h2>Command</h2>
              {selectedUnit && stagedDestination ? (
                <>
                  <p>
                    Move to {stagedDestination.x},{stagedDestination.y}
                  </p>
                  {pendingAction === "chooseAction" ? (
                    <div className="command-actions">
                      <button
                        type="button"
                        disabled={attackableTargets.length === 0}
                        onClick={() => setPendingAction("chooseAttackTarget")}
                      >
                        Attack
                      </button>
                      <button type="button" onClick={handleWait}>
                        Wait
                      </button>
                      <button type="button" onClick={clearStagedAction}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <p>Choose a red target, or go back and pick Wait.</p>
                      <div className="command-actions">
                        <button type="button" onClick={() => setPendingAction("chooseAction")}>
                          Back
                        </button>
                        <button type="button" onClick={clearStagedAction}>
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <p>Click a blue tile to stage a move. The unit will not move until you confirm Wait or Attack.</p>
              )}
            </section>
          </aside>
        </div>
      </section>
    </main>
  );

  function handleTileClick(position: Position) {
    const clickedUnit = getUnitAtPosition(units, position);

    if (pendingAction === "chooseAttackTarget" && selectedUnit && clickedUnit?.team !== selectedUnit.team) {
      handleAttack(clickedUnit?.id);
      return;
    }

    if (clickedUnit && clickedUnit.team === runtime.phase) {
      clearStagedAction();
      dispatch(dispatchGameAction({ type: "selectUnit", unitId: clickedUnit.id }));
      return;
    }

    if (!selectedUnit) {
      return;
    }

    const isReachable = reachableTiles.some(
      (tile) => tile.x === position.x && tile.y === position.y,
    );

    if (isReachable) {
      setStagedDestination(position);
      setPendingAction("chooseAction");
      return;
    }

    if (!clickedUnit) {
      clearStagedAction();
    }
  }

  function handleAttack(defenderId?: string) {
    if (!selectedUnit || !stagedDestination || !defenderId) {
      return;
    }

    dispatch(
      dispatchGameAction({
        type: "moveUnit",
        unitId: selectedUnit.id,
        destination: stagedDestination,
      }),
    );
    dispatch(
      dispatchGameAction({
        type: "attackUnit",
        attackerId: selectedUnit.id,
        defenderId,
      }),
    );
    clearStagedAction();
  }

  function handleWait() {
    if (!selectedUnit) {
      return;
    }

    if (stagedDestination) {
      dispatch(
        dispatchGameAction({
          type: "moveUnit",
          unitId: selectedUnit.id,
          destination: stagedDestination,
        }),
      );
    }

    dispatch(dispatchGameAction({ type: "waitUnit", unitId: selectedUnit.id }));
    clearStagedAction();
  }

  function handleReset() {
    clearStagedAction();
    dispatch(resetDemoState());
  }

  function handleEndPhase() {
    clearStagedAction();
    dispatch(dispatchGameAction({ type: "endPhase" }));
  }

  function clearStagedAction() {
    setStagedDestination(undefined);
    setPendingAction("none");
  }

  function getTileClassName(position: Position, terrain: string, unit?: UnitState): string {
    const isSelected =
      selectedUnit?.position.x === position.x && selectedUnit?.position.y === position.y;
    const isHovered = hoveredTile?.x === position.x && hoveredTile?.y === position.y;
    const isReachable = reachableTiles.some(
      (tile) => tile.x === position.x && tile.y === position.y,
    );
    const isStaged =
      stagedDestination?.x === position.x && stagedDestination?.y === position.y;
    const isAttackable = attackableTargets.some(
      (target) => target.position.x === position.x && target.position.y === position.y,
    );

    return [
      "tile",
      `tile-${terrain}`,
      isSelected ? "tile-selected" : "",
      isHovered ? "tile-hovered" : "",
      isReachable && !unit ? "tile-reachable" : "",
      isStaged ? "tile-staged" : "",
      isAttackable && unit?.team === "enemy" ? "tile-attackable" : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
}

function getUnitAtPosition(units: UnitState[], position: Position): UnitState | undefined {
  return units.find(
    (unit) =>
      !unit.isDefeated && unit.position.x === position.x && unit.position.y === position.y,
  );
}

function createPreviewState(
  runtime: RuntimeGameState,
  unitId: string,
  destination: Position,
): RuntimeGameState {
  const movedUnit = runtime.units[unitId];
  if (!movedUnit) {
    return runtime;
  }

  return {
    ...runtime,
    units: {
      ...runtime.units,
      [unitId]: {
        ...movedUnit,
        position: destination,
      },
    },
  };
}
