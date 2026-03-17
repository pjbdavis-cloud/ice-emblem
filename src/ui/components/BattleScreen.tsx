import { useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { dispatchGameAction, resetDemoState, undoAction } from "../../app/slices/gameSlice";
import { getCombatPreview } from "../../game/combat/preview";
import {
  canUndo,
  getAttackReachPreviewPositions,
  getMovementPreviewPositions,
  getReachablePositions,
  getThreatenedPositions,
  getUnitAttackOptions,
} from "../../game/core/state";
import type { Position, RuntimeGameState, UnitState } from "../../game/types";
import { BattleCanvas } from "./BattleCanvas";

type PendingAction = "none" | "chooseAction" | "chooseAttackTarget";

export function BattleScreen() {
  const dispatch = useAppDispatch();
  const runtime = useAppSelector((state) => state.game.runtime);

  const [hoveredTile, setHoveredTile] = useState<Position | undefined>();
  const [stagedDestination, setStagedDestination] = useState<Position | undefined>();
  const [pendingAction, setPendingAction] = useState<PendingAction>("none");
  const [showEnemyThreatOverlay, setShowEnemyThreatOverlay] = useState(true);

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
  const hoveredMovePreviewTiles = useMemo(
    () => (hoveredUnit ? getMovementPreviewPositions(runtime, hoveredUnit.id) : []),
    [hoveredUnit, runtime],
  );
  const hoveredAttackPreviewTiles = useMemo(
    () => (hoveredUnit ? getAttackReachPreviewPositions(runtime, hoveredUnit.id) : []),
    [hoveredUnit, runtime],
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
  const hoveredCombatPreview =
    selectedUnit && hoveredAttackTarget
      ? getCombatPreview(previewState, selectedUnit.id, hoveredAttackTarget.id)
      : undefined;
  const showingSelectedRanges = Boolean(selectedUnit);
  const moveHighlightTiles = showingSelectedRanges ? reachableTiles : hoveredMovePreviewTiles;
  const selectedAttackPreviewTiles = useMemo(() => {
    if (!selectedUnit) {
      return [];
    }

    const sourceState = stagedDestination ? movePreviewState : runtime;
    return getAttackReachPreviewPositions(sourceState, selectedUnit.id);
  }, [movePreviewState, runtime, selectedUnit, stagedDestination]);
  const attackHighlightTiles = showingSelectedRanges
    ? selectedAttackPreviewTiles
    : hoveredAttackPreviewTiles;
  const enemyThreatOutlineTiles = useMemo(() => {
    if (!showEnemyThreatOverlay) {
      return [];
    }

    return uniquePositions(
      units
        .filter((unit) => unit.team === "enemy" && !unit.isDefeated)
        .flatMap((unit) => getThreatenedPositions(runtime, unit.id)),
    );
  }, [runtime, showEnemyThreatOverlay, units]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        handleCancel();
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        setShowEnemyThreatOverlay((current) => !current);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pendingAction, selectedUnit, stagedDestination]);

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
            <BattleCanvas
              tiles={runtime.map.tiles}
              width={runtime.map.width}
              height={runtime.map.height}
              units={units}
              hoveredTile={hoveredTile}
              selectedTile={selectedUnit?.position}
              stagedTile={stagedDestination}
              moveHighlightTiles={moveHighlightTiles}
              attackHighlightTiles={attackHighlightTiles}
              enemyThreatOutlineTiles={enemyThreatOutlineTiles}
              onTileClick={handleTileClick}
              onTileHover={setHoveredTile}
              onCancel={handleCancel}
            />
          </div>

          <aside className="sidebar">
            <div className="info-panels">
              <section className="card compact-card">
                <h2>Hover</h2>
                {hoveredUnit ? (
                  <>
                    <p>{hoveredUnit.name}</p>
                    <p>
                      HP: {hoveredUnit.currentHp}/{hoveredUnit.stats.maxHp}
                    </p>
                    <p>ATK: {hoveredUnit.stats.attack}</p>
                    <p>DEF: {hoveredUnit.stats.defense}</p>
                    <p>SPD: {hoveredUnit.stats.speed}</p>
                    <p>MOV: {hoveredUnit.stats.movement}</p>
                    <p>
                      Tile: {hoveredUnit.position.x},{hoveredUnit.position.y}
                    </p>
                    <p>
                      Status: {hoveredUnit.team === "enemy" ? "Enemy" : hoveredUnit.team === "ally" ? "Ally" : "Player"}
                    </p>
                    {selectedUnit && hoveredCombatPreview ? (
                      <>
                        <p>
                          Combat: {selectedUnit.name} deals {hoveredCombatPreview.attackerDamage}
                        </p>
                        <p>
                          Counter: {hoveredCombatPreview.defenderCanCounter ? hoveredCombatPreview.defenderDamage : "None"}
                        </p>
                      </>
                    ) : null}
                  </>
                ) : hoveredTile ? (
                  <>
                    <p>Empty Tile</p>
                    <p>
                      Position: {hoveredTile.x},{hoveredTile.y}
                    </p>
                    <p>Terrain: {runtime.map.tiles[hoveredTile.y][hoveredTile.x].terrain}</p>
                    <p>
                      Move Range: {moveHighlightTiles.some((tile) => tile.x === hoveredTile.x && tile.y === hoveredTile.y) ? "Yes" : "No"}
                    </p>
                    <p>
                      Attack Reach: {attackHighlightTiles.some(
                        (tile) => tile.x === hoveredTile.x && tile.y === hoveredTile.y,
                      )
                        ? "Yes"
                        : "No"}
                    </p>
                  </>
                ) : (
                  <p>Move the mouse over the board to inspect a tile or unit.</p>
                )}
              </section>

              <section className="card compact-card">
                <h2>Selected</h2>
                {selectedUnit ? (
                  <>
                    <p>{selectedUnit.name}</p>
                    <p>
                      HP: {selectedUnit.currentHp}/{selectedUnit.stats.maxHp}
                    </p>
                    <p>ATK: {selectedUnit.stats.attack}</p>
                    <p>DEF: {selectedUnit.stats.defense}</p>
                    <p>SPD: {selectedUnit.stats.speed}</p>
                    <p>MOV: {selectedUnit.stats.movement}</p>
                    <p>{selectedUnit.hasMoved ? "Moved this turn" : "Ready to move"}</p>
                    <p>{selectedUnit.hasActed ? "Action spent" : "Action available"}</p>
                    <button
                      type="button"
                      disabled={selectedUnit.hasActed}
                      onClick={handleWait}
                    >
                      Wait
                    </button>
                  </>
                ) : (
                  <p>No unit selected.</p>
                )}
              </section>
            </div>

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
              <p>
                Enemy Threat: {showEnemyThreatOverlay ? "On" : "Off"} (press Space)
              </p>
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
    clearSelection();
    dispatch(resetDemoState());
  }

  function handleEndPhase() {
    clearStagedAction();
    clearSelection();
    dispatch(dispatchGameAction({ type: "endPhase" }));
  }

  function handleCancel() {
    if (pendingAction === "chooseAttackTarget") {
      setPendingAction("chooseAction");
      return;
    }

    if (stagedDestination || pendingAction === "chooseAction") {
      clearStagedAction();
      return;
    }

    if (selectedUnit) {
      clearSelection();
    }
  }

  function clearStagedAction() {
    setStagedDestination(undefined);
    setPendingAction("none");
  }

  function clearSelection() {
    dispatch(dispatchGameAction({ type: "selectUnit", unitId: undefined }));
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

function uniquePositions(positions: Position[]): Position[] {
  return Array.from(
    new Map(positions.map((position) => [`${position.x},${position.y}`, position])).values(),
  );
}
