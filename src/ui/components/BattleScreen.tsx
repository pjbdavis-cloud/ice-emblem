import { useEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { dispatchGameAction, replaceRuntimeState, resetDemoState, undoAction } from "../../app/slices/gameSlice";
import { getCombatPreview } from "../../game/combat/preview";
import {
  buildPlayerActionPresentation,
  canUndo,
  getAttackReachPreviewPositions,
  getUnitMovement,
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
  const [previewMove, setPreviewMove] = useState<
    | {
        unitId: string;
        path: Position[];
        destination: Position;
      }
    | undefined
  >();
  const [isPreviewMoveReady, setIsPreviewMoveReady] = useState(false);
  const [presentationQueue, setPresentationQueue] = useState<PresentationEvent[]>([]);
  const [pendingRuntimeState, setPendingRuntimeState] = useState<RuntimeGameState | undefined>();
  const presentationLogRef = useRef<string[]>([]);
  const [grayLockUnitIds, setGrayLockUnitIds] = useState<string[]>([]);
  const [hoveredMovePath, setHoveredMovePath] = useState<Position[]>([]);
  const [phaseBanner, setPhaseBanner] = useState<{ phase: RuntimeGameState["phase"]; key: number }>({
    phase: runtime.phase,
    key: 0,
  });
  const [showPhaseBanner, setShowPhaseBanner] = useState(true);
  const [pendingPhaseBanner, setPendingPhaseBanner] = useState<RuntimeGameState["phase"] | undefined>();
  const actionMenuRef = useRef<HTMLDivElement>(null);
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
  const selectedMovePreviewTiles = useMemo(
    () => (selectedUnit && !stagedDestination ? getMovementPreviewPositions(runtime, selectedUnit.id) : []),
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

    const isReachable = selectedMovePreviewTiles.some(
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
    runtime,
    selectedMovePreviewTiles,
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
  const moveHighlightTiles = showingSelectedRanges ? selectedMovePreviewTiles : hoveredMovePreviewTiles;
  const moveHighlightTeam = showingSelectedRanges ? selectedUnit?.team : hoveredUnit?.team;
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

  useEffect(() => {
    if (!stagedDestination) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (actionMenuRef.current?.contains(target)) {
        return;
      }

      if (target.closest("[data-testid='battle-canvas']")) {
        return;
      }

      if (pendingAction === "chooseAttackTarget") {
        setPendingAction("chooseAction");
        return;
      }

      clearStagedAction();
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [pendingAction, stagedDestination]);

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
              selectedTile={stagedDestination ?? selectedUnit?.position}
              stagedTile={stagedDestination}
              moveHighlightTiles={moveHighlightTiles}
              moveHighlightTeam={moveHighlightTeam}
              attackHighlightTiles={attackHighlightTiles}
              hoveredMovePath={hoveredMovePath}
              enemyThreatOutlineTiles={enemyThreatOutlineTiles}
              previewMove={previewMove}
              presentationQueue={presentationQueue}
              grayLockUnitIds={grayLockUnitIds}
              pendingDefeatedUnitIds={pendingDefeatedUnitIds}
              onAnimationStateChange={setIsBoardAnimating}
              onPresentationComplete={handlePresentationComplete}
              onPreviewMoveComplete={() => setIsPreviewMoveReady(true)}
              onTileClick={handleTileClick}
              onTileHover={handleTileHover}
              onCancel={handleCancel}
            />
            {selectedUnit && stagedDestination && isPreviewMoveReady ? (
              <div
                ref={actionMenuRef}
                className="map-action-menu"
                style={getActionMenuStyle(
                  stagedDestination,
                  runtime.map.width,
                  runtime.map.height,
                )}
              >
                <p className="map-action-title">
                  {stagedDestination.x},{stagedDestination.y}
                </p>
                {pendingAction === "chooseAction" ? (
                  <>
                    <button
                      type="button"
                      disabled={isPlayerBannerBlocking || attackableTargets.length === 0}
                      onClick={() => setPendingAction("chooseAttackTarget")}
                    >
                      Attack
                    </button>
                    <button type="button" disabled>
                      Use Item
                    </button>
                    <button type="button" disabled={isPlayerBannerBlocking} onClick={handleWait}>
                      Wait
                    </button>
                  </>
                ) : (
                  <>
                    <p className="map-action-hint">Choose an enemy target.</p>
                    <button
                      type="button"
                      disabled={isPlayerBannerBlocking}
                      onClick={() => setPendingAction("chooseAction")}
                    >
                      Back
                    </button>
                  </>
                )}
              </div>
            ) : null}
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
                    <p>STR: {hoveredUnit.stats.strength}</p>
                    <p>SKL: {hoveredUnit.stats.skill}</p>
                    <p>MAG: {hoveredUnit.stats.magic}</p>
                    <p>INT: {hoveredUnit.stats.intelligence}</p>
                    <p>DEF: {hoveredUnit.stats.defense}</p>
                    <p>RES: {hoveredUnit.stats.resistance}</p>
                    <p>SPD: {hoveredUnit.stats.speed}</p>
                    <p>MOV: {getUnitMovement(runtime, hoveredUnit)}</p>
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
                    <p>STR: {selectedUnit.stats.strength}</p>
                    <p>SKL: {selectedUnit.stats.skill}</p>
                    <p>MAG: {selectedUnit.stats.magic}</p>
                    <p>INT: {selectedUnit.stats.intelligence}</p>
                    <p>DEF: {selectedUnit.stats.defense}</p>
                    <p>RES: {selectedUnit.stats.resistance}</p>
                    <p>SPD: {selectedUnit.stats.speed}</p>
                    <p>MOV: {getUnitMovement(runtime, selectedUnit)}</p>
                    <p>{selectedUnit.hasMoved ? "Moved this turn" : "Ready to move"}</p>
                    <p>{selectedUnit.hasActed ? "Action spent" : "Action available"}</p>
                    <p>
                      {stagedDestination && isPreviewMoveReady
                        ? `Staged at ${stagedDestination.x},${stagedDestination.y}`
                        : "Click a reachable tile to stage a move."}
                    </p>
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
          </aside>
        </div>
      </section>
    </main>
  );

  function handleTileClick(position: Position) {
    if (isPlayerBannerBlocking || (Boolean(previewMove) && !isPreviewMoveReady)) {
      return;
    }

    const clickedUnit = getUnitAtPosition(units, position);

    if (pendingAction === "chooseAttackTarget" && selectedUnit) {
      if (clickedUnit?.team !== selectedUnit.team) {
        handleAttack(clickedUnit?.id);
      } else {
        setPendingAction("chooseAction");
      }
      return;
    }

    if (stagedDestination) {
      clearStagedAction();
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
      const previewPath = getMovementPathPreview(runtime, selectedUnit.id, position);
      setStagedDestination(position);
      setPendingAction("chooseAction");
      setIsPreviewMoveReady(previewPath.length <= 1);
      setPreviewMove({
        unitId: selectedUnit.id,
        path: previewPath,
        destination: position,
      });
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
    const presentationEvents = shouldSkipPlayerMoveReplay()
      ? stripInitialMovePresentation(result.presentationEvents, selectedUnit.id)
      : result.presentationEvents;

    if (presentationEvents.length > 0) {
      queuePresentationEvents(presentationEvents, "Player", result.nextState, runtime);
    } else {
      dispatch(replaceRuntimeState(result.nextState));
      clearStagedAction();
    }
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

    if (shouldSkipPlayerMoveReplay()) {
      dispatch(replaceRuntimeState(result.nextState));
    } else {
      if (result.presentationEvents.length > 0) {
        queuePresentationEvents(result.presentationEvents, "Player", result.nextState, runtime);
      } else {
        dispatch(replaceRuntimeState(result.nextState));
      }
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
    setPreviewMove(undefined);
    setIsPreviewMoveReady(false);
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
    presentationLogRef.current = [
      `${source} queued ${events.length} event(s)`,
      ...events.map((event) => `${source}: ${formatPresentationEvent(event)}`),
      ...presentationLogRef.current,
    ].slice(0, 18);
  }

  function handlePresentationComplete() {
    if (pendingRuntimeState) {
      dispatch(replaceRuntimeState(pendingRuntimeState));
    }
    presentationLogRef.current = ["Queue complete", ...presentationLogRef.current].slice(0, 18);
    setGrayLockUnitIds([]);
    setPendingRuntimeState(undefined);
    setPresentationQueue([]);
    clearStagedAction();
  }

  function shouldSkipPlayerMoveReplay() {
    return Boolean(stagedDestination && previewMove && isPreviewMoveReady);
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

function getActionMenuStyle(position: Position, width: number, height: number) {
  return {
    left: `${((position.x + 0.5) / width) * 100}%`,
    top: `${((position.y + 0.5) / height) * 100}%`,
  };
}

function stripInitialMovePresentation(events: PresentationEvent[], unitId: string): PresentationEvent[] {
  if (events.length === 0) {
    return events;
  }

  let startIndex = 0;
  const firstEvent = events[startIndex];
  if (firstEvent?.type === "move" && firstEvent.unitId === unitId) {
    startIndex += 1;
  }
  const secondEvent = events[startIndex];
  if (secondEvent?.type === "pause" && secondEvent.unitId === unitId) {
    startIndex += 1;
  }

  return events.slice(startIndex);
}

function buildHoveredMovePath(
  runtime: RuntimeGameState,
  unitId: string,
  hoveredTile: Position,
  currentStack: Position[],
): Position[] {
  const unit = runtime.units[unitId];
  if (!unit) {
    return [];
  }

  const fallbackPath = getMovementPathPreview(runtime, unitId, hoveredTile);
  if (fallbackPath.length <= 1) {
    return fallbackPath;
  }

  if (currentStack.length > 0 && fallbackPath.length < currentStack.length) {
    return fallbackPath;
  }

  const origin = unit.position;
  const normalizedStack =
    currentStack.length > 0 &&
      positionsEqual(currentStack[0], origin) &&
      isPathContiguous(currentStack) &&
      currentStack.length - 1 <= getUnitMovement(runtime, unit)
      ? currentStack
      : [origin];
  const lastPosition = normalizedStack[normalizedStack.length - 1];

  if (positionsEqual(lastPosition, hoveredTile)) {
    return normalizedStack;
  }

  const existingIndex = normalizedStack.findIndex((position) => positionsEqual(position, hoveredTile));
  if (existingIndex >= 0) {
    return normalizedStack.slice(0, existingIndex + 1);
  }

  if (arePositionsAdjacent(lastPosition, hoveredTile)) {
    const extendedPath = [...normalizedStack, hoveredTile];
    if (extendedPath.length - 1 <= getUnitMovement(runtime, unit) && isPathEfficientEnough(extendedPath, fallbackPath)) {
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
