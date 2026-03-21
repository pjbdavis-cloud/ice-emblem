import { useEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { dispatchGameAction, replaceRuntimeState, resetDemoState, undoAction } from "../../app/slices/gameSlice";
import { getCombatPreview } from "../../game/combat/preview";
import {
  buildPlayerActionPresentation,
  canUndo,
  getAttackReachPreviewPositions,
  getMovementPathPreview,
  getMovementPreviewPositions,
  getReachablePositions,
  getThreatenedPositions,
  getUnitAttackOptions,
  previewNextEnemyAction,
} from "../../game/core/state";
import type { Position, RuntimeGameState, UnitState } from "../../game/types";
import { BattleCanvas } from "./BattleCanvas";
import type { PresentationEvent } from "../presentation/types";

type PendingAction = "none" | "chooseAction" | "chooseAttackTarget";

const ENEMY_PHASE_STEP_DELAY_MS = 600;
const PHASE_BANNER_DURATION_MS = 1600;

export function BattleScreen() {
  const dispatch = useAppDispatch();
  const runtime = useAppSelector((state) => state.game.runtime);

  const [hoveredTile, setHoveredTile] = useState<Position | undefined>();
  const [stagedDestination, setStagedDestination] = useState<Position | undefined>();
  const [pendingAction, setPendingAction] = useState<PendingAction>("none");
  const [showEnemyThreatOverlay, setShowEnemyThreatOverlay] = useState(true);
  const [isBoardAnimating, setIsBoardAnimating] = useState(false);
  const [presentationQueue, setPresentationQueue] = useState<PresentationEvent[]>([]);
  const [pendingRuntimeState, setPendingRuntimeState] = useState<RuntimeGameState | undefined>();
  const [presentationLog, setPresentationLog] = useState<string[]>([]);
  const [grayLockUnitIds, setGrayLockUnitIds] = useState<string[]>([]);
  const [hoveredMovePath, setHoveredMovePath] = useState<Position[]>([]);
  const [phaseBanner, setPhaseBanner] = useState<{ phase: RuntimeGameState["phase"]; key: number }>({
    phase: runtime.phase,
    key: 0,
  });
  const [showPhaseBanner, setShowPhaseBanner] = useState(true);
  const [pendingPhaseBanner, setPendingPhaseBanner] = useState<RuntimeGameState["phase"] | undefined>();
  const previousPhaseRef = useRef(runtime.phase);
  const isPlayerBannerBlocking = showPhaseBanner && phaseBanner.phase === "player";
  const [bannerInstance, setBannerInstance] = useState(0);

  const selectedUnit = runtime.selectedUnitId ? runtime.units[runtime.selectedUnitId] : undefined;
  const units = Object.values(runtime.units);
  const pendingDefeatedUnitIds = useMemo(() => {
    if (!pendingRuntimeState) {
      return [];
    }

    return Object.values(pendingRuntimeState.units)
      .filter((unit) => unit.isDefeated)
      .map((unit) => unit.id);
  }, [pendingRuntimeState]);
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
  useEffect(() => {
    if (
      !selectedUnit ||
      selectedUnit.team !== "player" ||
      stagedDestination ||
      !hoveredTile ||
      isBoardAnimating ||
      presentationQueue.length > 0
    ) {
      setHoveredMovePath([]);
      return;
    }

    const isReachable = reachableTiles.some(
      (tile) => tile.x === hoveredTile.x && tile.y === hoveredTile.y,
    );
    if (!isReachable) {
      setHoveredMovePath([]);
      return;
    }

    setHoveredMovePath((current) =>
      buildHoveredMovePath(runtime, selectedUnit.id, hoveredTile, current),
    );
  }, [
    hoveredTile,
    isBoardAnimating,
    presentationQueue.length,
    reachableTiles,
    runtime,
    selectedUnit,
    stagedDestination,
  ]);

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
      if (isPlayerBannerBlocking) {
        event.preventDefault();
        return;
      }

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
  }, [isPlayerBannerBlocking, pendingAction, selectedUnit, stagedDestination]);

  useEffect(() => {
    if (previousPhaseRef.current === runtime.phase) {
      return;
    }

    previousPhaseRef.current = runtime.phase;
    setPendingPhaseBanner(runtime.phase);
  }, [runtime.phase]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setShowPhaseBanner(false);
    }, PHASE_BANNER_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [bannerInstance]);

  useEffect(() => {
    if (!pendingPhaseBanner || isBoardAnimating || presentationQueue.length > 0) {
      return;
    }

    setPhaseBanner((current) => ({ phase: pendingPhaseBanner, key: current.key + 1 }));
    setShowPhaseBanner(true);
    setBannerInstance((current) => current + 1);
    setPendingPhaseBanner(undefined);
  }, [isBoardAnimating, pendingPhaseBanner, presentationQueue.length]);

  useEffect(() => {
    if (
      runtime.phase !== "enemy" ||
      isBoardAnimating ||
      presentationQueue.length > 0 ||
      pendingRuntimeState
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const result = previewNextEnemyAction(runtime);
      if (result.presentationEvents.length > 0) {
        queuePresentationEvents(result.presentationEvents, "Enemy", result.nextState, runtime);
      } else {
        dispatch(replaceRuntimeState(result.nextState));
      }
    }, ENEMY_PHASE_STEP_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [dispatch, isBoardAnimating, pendingRuntimeState, presentationQueue.length, runtime]);

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
            <button
              type="button"
              disabled={isPlayerBannerBlocking || !canUndo(runtime)}
              onClick={() => dispatch(undoAction())}
            >
              Undo
            </button>
            <button type="button" disabled={isPlayerBannerBlocking} onClick={handleReset}>
              Reset
            </button>
            <button type="button" disabled={isPlayerBannerBlocking} onClick={handleEndPhase}>
              End Phase
            </button>
          </div>
        </header>

        <div className="layout">
          <aside className="debug-sidebar">
            <section className="card debug-card">
              <h2>Presentation Log</h2>
              <p>
                Queue: {presentationQueue.length > 0 ? `${presentationQueue.length} event(s)` : "idle"}
              </p>
              {presentationQueue.length > 0 ? (
                <div className="debug-block">
                  <p className="debug-label">Pending</p>
                  <ol className="debug-list">
                    {presentationQueue.map((event, index) => (
                      <li key={`${index}-${formatPresentationEvent(event)}`}>{formatPresentationEvent(event)}</li>
                    ))}
                  </ol>
                </div>
              ) : (
                <p>No active presentation queue.</p>
              )}
              <div className="debug-block">
                <p className="debug-label">Recent</p>
                {presentationLog.length > 0 ? (
                  <ol className="debug-list">
                    {presentationLog.map((entry, index) => (
                      <li key={`${index}-${entry}`}>{entry}</li>
                    ))}
                  </ol>
                ) : (
                  <p>No presentation events logged yet.</p>
                )}
              </div>
            </section>
          </aside>

          <div className="map-card">
            {showPhaseBanner ? (
              <div
                key={`${phaseBanner.phase}-${phaseBanner.key}`}
                className={`phase-banner phase-banner-${phaseBanner.phase}`}
              >
                <span>{phaseBanner.phase === "player" ? "Player Phase" : "Enemy Phase"}</span>
              </div>
            ) : null}
            <BattleCanvas
              runtime={runtime}
              tiles={runtime.map.tiles}
              width={runtime.map.width}
              height={runtime.map.height}
              units={units}
              hoveredTile={hoveredTile}
              selectedTile={selectedUnit?.position}
              stagedTile={stagedDestination}
              moveHighlightTiles={moveHighlightTiles}
              attackHighlightTiles={attackHighlightTiles}
              hoveredMovePath={hoveredMovePath}
              enemyThreatOutlineTiles={enemyThreatOutlineTiles}
              presentationQueue={presentationQueue}
              grayLockUnitIds={grayLockUnitIds}
              pendingDefeatedUnitIds={pendingDefeatedUnitIds}
              onAnimationStateChange={setIsBoardAnimating}
              onPresentationComplete={handlePresentationComplete}
              onTileClick={handleTileClick}
              onTileHover={handleTileHover}
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
                      disabled={isPlayerBannerBlocking || selectedUnit.hasActed}
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
                  <button
                    type="button"
                    disabled={isPlayerBannerBlocking}
                    onClick={() => handleAttack(previewTarget.id)}
                  >
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
                        disabled={isPlayerBannerBlocking || attackableTargets.length === 0}
                        onClick={() => setPendingAction("chooseAttackTarget")}
                      >
                        Attack
                      </button>
                      <button type="button" disabled={isPlayerBannerBlocking} onClick={handleWait}>
                        Wait
                      </button>
                      <button type="button" disabled={isPlayerBannerBlocking} onClick={clearStagedAction}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <p>Choose a red target, or go back and pick Wait.</p>
                      <div className="command-actions">
                        <button
                          type="button"
                          disabled={isPlayerBannerBlocking}
                          onClick={() => setPendingAction("chooseAction")}
                        >
                          Back
                        </button>
                        <button type="button" disabled={isPlayerBannerBlocking} onClick={clearStagedAction}>
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
    if (isPlayerBannerBlocking) {
      return;
    }

    const clickedUnit = getUnitAtPosition(units, position);

    if (pendingAction === "chooseAttackTarget" && selectedUnit && clickedUnit?.team !== selectedUnit.team) {
      handleAttack(clickedUnit?.id);
      return;
    }

    if (clickedUnit && clickedUnit.team === runtime.phase) {
      if (selectedUnit?.id === clickedUnit.id) {
        clearStagedAction();
        clearSelection();
        return;
      }

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
    if (isPlayerBannerBlocking || !selectedUnit || !defenderId) {
      return;
    }

    const result = buildPlayerActionPresentation(
      runtime,
      {
        type: "attackUnit",
        attackerId: selectedUnit.id,
        defenderId,
      },
      stagedDestination,
    );
    if (result.presentationEvents.length > 0) {
      queuePresentationEvents(result.presentationEvents, "Player", result.nextState, runtime);
    } else {
      dispatch(replaceRuntimeState(result.nextState));
    }
    clearStagedAction();
  }

  function handleWait() {
    if (isPlayerBannerBlocking || !selectedUnit) {
      return;
    }

    const result = buildPlayerActionPresentation(
      runtime,
      { type: "waitUnit", unitId: selectedUnit.id },
      stagedDestination,
    );
    if (result.presentationEvents.length > 0) {
      queuePresentationEvents(result.presentationEvents, "Player", result.nextState, runtime);
    } else {
      dispatch(replaceRuntimeState(result.nextState));
    }
    clearStagedAction();
  }

  function handleReset() {
    if (isPlayerBannerBlocking) {
      return;
    }

    clearStagedAction();
    clearSelection();
    dispatch(resetDemoState());
  }

  function handleEndPhase() {
    if (isPlayerBannerBlocking) {
      return;
    }

    clearStagedAction();
    clearSelection();
    dispatch(dispatchGameAction({ type: "endPhase" }));
  }

  function handleCancel() {
    if (isPlayerBannerBlocking) {
      return;
    }

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

  function handleTileHover(position?: Position) {
    setHoveredTile((current) => {
      if (!current && !position) {
        return current;
      }

      if (
        current &&
        position &&
        current.x === position.x &&
        current.y === position.y
      ) {
        return current;
      }

      return position;
    });
  }

  function clearStagedAction() {
    setStagedDestination(undefined);
    setPendingAction("none");
  }

  function clearSelection() {
    dispatch(dispatchGameAction({ type: "selectUnit", unitId: undefined }));
  }

  function queuePresentationEvents(
    events: PresentationEvent[],
    source: "Player" | "Enemy",
    nextState: RuntimeGameState,
    previousState: RuntimeGameState,
  ) {
    setPendingRuntimeState(nextState);
    setPresentationQueue(events);
    setGrayLockUnitIds(getGrayLockUnitIds(previousState, nextState));
    setPresentationLog((current) =>
      [
        `${source} queued ${events.length} event(s)`,
        ...events.map((event) => `${source}: ${formatPresentationEvent(event)}`),
        ...current,
      ].slice(0, 18),
    );
  }

  function handlePresentationComplete() {
    if (pendingRuntimeState) {
      dispatch(replaceRuntimeState(pendingRuntimeState));
    }
    setPresentationLog((current) => ["Queue complete", ...current].slice(0, 18));
    setGrayLockUnitIds([]);
    setPendingRuntimeState(undefined);
    setPresentationQueue([]);
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

function buildHoveredMovePath(
  runtime: RuntimeGameState,
  unitId: string,
  hoveredTile: Position,
  currentPath: Position[],
): Position[] {
  const unit = runtime.units[unitId];
  if (!unit) {
    return [];
  }

  const fallbackPath = getMovementPathPreview(runtime, unitId, hoveredTile);
  if (fallbackPath.length <= 1) {
    return fallbackPath;
  }

  if (currentPath.length > 0 && fallbackPath.length < currentPath.length) {
    return fallbackPath;
  }

  const origin = unit.position;
  const normalizedCurrentPath =
    currentPath.length > 0 &&
    positionsEqual(currentPath[0], origin) &&
    isPathContiguous(currentPath) &&
    currentPath.length - 1 <= unit.stats.movement
      ? currentPath
      : [origin];
  const lastPosition = normalizedCurrentPath[normalizedCurrentPath.length - 1];

  if (positionsEqual(lastPosition, hoveredTile)) {
    return normalizedCurrentPath;
  }

  const existingIndex = normalizedCurrentPath.findIndex((position) => positionsEqual(position, hoveredTile));
  if (existingIndex >= 0) {
    return normalizedCurrentPath.slice(0, existingIndex + 1);
  }

  if (arePositionsAdjacent(lastPosition, hoveredTile)) {
    const extendedPath = [...normalizedCurrentPath, hoveredTile];
    if (extendedPath.length - 1 <= unit.stats.movement && isPathEfficientEnough(extendedPath, fallbackPath)) {
      return extendedPath;
    }
  }

  return fallbackPath;
}

function isPathContiguous(path: Position[]): boolean {
  for (let index = 1; index < path.length; index += 1) {
    if (!arePositionsAdjacent(path[index - 1], path[index])) {
      return false;
    }
  }

  return true;
}

function isPathEfficientEnough(path: Position[], fallbackPath: Position[]): boolean {
  return path.length <= fallbackPath.length + 2;
}

function arePositionsAdjacent(left: Position, right: Position): boolean {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y) === 1;
}

function positionsEqual(left: Position, right: Position): boolean {
  return left.x === right.x && left.y === right.y;
}

function formatPresentationEvent(event: PresentationEvent): string {
  if (event.type === "move") {
    return `${event.unitId} move ${event.from.x},${event.from.y} -> ${event.to.x},${event.to.y}`;
  }

  if (event.type === "pause") {
    return `${event.unitId} pause ${event.durationMs}ms`;
  }

  return `${event.attackerId} attacks ${event.defenderId} (${event.defenderFromHp} -> ${event.defenderToHp}${
    event.defenderCanCounter
      ? `, counter ${event.attackerFromHp} -> ${event.attackerToHp}`
      : ", no counter"
  })`;
}

function getGrayLockUnitIds(
  previousState: RuntimeGameState,
  nextState: RuntimeGameState,
): string[] {
  const lockedIds = new Set(
    Object.values(previousState.units)
      .filter((unit) => unit.hasActed)
      .map((unit) => unit.id),
  );

  if (previousState.phase !== nextState.phase) {
    for (const unit of Object.values(previousState.units)) {
      if (unit.team === previousState.phase && !unit.isDefeated) {
        lockedIds.add(unit.id);
      }
    }
  }

  return Array.from(lockedIds);
}
