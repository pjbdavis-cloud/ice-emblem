import { useEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { dispatchGameAction, replaceRuntimeState, resetDemoState, undoAction } from "../../app/slices/gameSlice";
import { getEquippedWeapon, getProjectedCombatPreview } from "../../game/combat/preview";
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
  const {
    clearThreatSelection,
    enemyThreatOutlineTiles,
    handleEnemyThreatLeftClick,
    handleEnemyThreatRightClick,
    selectAllThreats,
    selectedEnemyThreatIds,
    selectedEnemyThreatTiles,
  } = useEnemyThreatSelection(runtime, units);
  const pendingDefeatedUnitIds = useMemo(() => {
    if (!pendingRuntimeState) {
      return [];
    }

    return Object.values(pendingRuntimeState.units)
      .filter((unit) => unit.isDefeated)
      .map((unit) => unit.id);
  }, [pendingRuntimeState]);
  const hoveredUnit = hoveredTile ? getUnitAtPosition(units, hoveredTile) : undefined;
  const canShowHoveredActionPreview = Boolean(
    hoveredUnit &&
      (hoveredUnit.team === "enemy" || (!hoveredUnit.hasMoved && !hoveredUnit.hasActed)),
  );

  const movePreviewState = useMemo(() => {
    if (!selectedUnit || !stagedDestination) {
      return runtime;
    }

    return createPreviewState(runtime, selectedUnit.id, stagedDestination);
  }, [runtime, selectedUnit, stagedDestination]);

  const reachableTiles = useMemo(
    () =>
      selectedUnit && !stagedDestination && canUnitTakePlayerActions(selectedUnit, runtime)
        ? getReachablePositions(runtime, selectedUnit.id)
        : [],
    [runtime, selectedUnit, stagedDestination],
  );
  const selectedMovePreviewTiles = useMemo(
    () =>
      selectedUnit && !stagedDestination && canUnitTakePlayerActions(selectedUnit, runtime)
        ? getMovementPreviewPositions(runtime, selectedUnit.id)
        : [],
    [runtime, selectedUnit, stagedDestination],
  );
  const hoveredMovePreviewTiles = useMemo(
    () =>
      hoveredUnit && canShowHoveredActionPreview
        ? getMovementPreviewPositions(runtime, hoveredUnit.id)
        : [],
    [canShowHoveredActionPreview, hoveredUnit, runtime],
  );
  const hoveredAttackPreviewTiles = useMemo(
    () =>
      hoveredUnit && canShowHoveredActionPreview
        ? getAttackReachPreviewPositions(runtime, hoveredUnit.id)
        : [],
    [canShowHoveredActionPreview, hoveredUnit, runtime],
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

  const hoveredEnemyUnit =
    hoveredUnit && selectedUnit && hoveredUnit.team !== selectedUnit.team
      ? hoveredUnit
      : undefined;

  const hoveredAttackTarget =
      hoveredUnit && selectedUnit && hoveredUnit.team !== selectedUnit.team
        ? attackableTargets.find((unit) => unit.id === hoveredUnit.id)
        : undefined;

  const previewTarget = hoveredEnemyUnit;
  const previewState = stagedDestination ? movePreviewState : runtime;
  const combatPreview =
    selectedUnit && previewTarget
      ? getProjectedCombatPreview(previewState, selectedUnit.id, previewTarget.id)
      : undefined;
  const previewAttackerWeapon =
    selectedUnit ? getEquippedWeapon(previewState, selectedUnit) : undefined;
  const previewDefenderWeapon =
    previewTarget ? getEquippedWeapon(previewState, previewTarget) : undefined;
  const previewAttackerClass =
    selectedUnit
      ? runtime.map.classes.find((classData) => classData.id === selectedUnit.classId)
      : undefined;
  const previewDefenderClass =
    previewTarget
      ? runtime.map.classes.find((classData) => classData.id === previewTarget.classId)
      : undefined;
  const triangleRelation = getWeaponTriangleRelation(
    previewAttackerWeapon?.category,
    previewDefenderWeapon?.category,
  );
  const hoveredCombatPreview =
    selectedUnit && hoveredEnemyUnit
      ? getProjectedCombatPreview(previewState, selectedUnit.id, hoveredEnemyUnit.id)
      : undefined;
  const showingSelectedRanges = Boolean(selectedUnit);
  const attackerKoOutcome =
    combatPreview && previewTarget
      ? getCombatKoOutcome(
          combatPreview.attackerMinDamage,
          combatPreview.attackerMaxDamage,
          previewTarget.currentHp,
        )
      : undefined;
  const counterKoOutcome =
    combatPreview && selectedUnit && combatPreview.defenderPotentialCounter
      ? getCombatKoOutcome(
          combatPreview.defenderMinDamage,
          combatPreview.defenderMaxDamage,
          selectedUnit.currentHp,
        )
      : undefined;
  const moveHighlightTiles = showingSelectedRanges ? selectedMovePreviewTiles : hoveredMovePreviewTiles;
  const moveHighlightTeam = showingSelectedRanges ? selectedUnit?.team : hoveredUnit?.team;
  const selectedAttackPreviewTiles = useMemo(() => {
    if (!selectedUnit || !canUnitTakePlayerActions(selectedUnit, runtime)) {
      return [];
    }

    if (stagedDestination) {
      return getDirectAttackRangePositions(movePreviewState, selectedUnit.id);
    }

    return getAttackReachPreviewPositions(runtime, selectedUnit.id);
  }, [movePreviewState, runtime, selectedUnit, stagedDestination]);
  const attackHighlightTiles = useMemo(() => {
    if (pendingAction === "chooseAttackTarget") {
      return [];
    }

    const moveTiles = showingSelectedRanges ? selectedMovePreviewTiles : hoveredMovePreviewTiles;
    const attackTiles = showingSelectedRanges ? selectedAttackPreviewTiles : hoveredAttackPreviewTiles;
    const moveKeys = new Set(moveTiles.map((tile) => `${tile.x},${tile.y}`));

    return attackTiles.filter((tile) => !moveKeys.has(`${tile.x},${tile.y}`));
  }, [
    hoveredAttackPreviewTiles,
    hoveredMovePreviewTiles,
    pendingAction,
    selectedAttackPreviewTiles,
    selectedMovePreviewTiles,
    showingSelectedRanges,
  ]);
  const targetableEnemyTiles = useMemo(
    () =>
      pendingAction === "chooseAttackTarget"
        ? attackableTargets.map((unit) => ({ x: unit.position.x, y: unit.position.y }))
        : [],
    [attackableTargets, pendingAction],
  );
  const hoveredAttackTargetTile = hoveredAttackTarget
    ? { x: hoveredAttackTarget.position.x, y: hoveredAttackTarget.position.y }
    : undefined;

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
        queuePresentationEvents(result.presentationEvents, result.nextState, runtime);
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
            <a className="battle-link-button" href="/game-info">
              Game Info
            </a>
            <button
              type="button"
              disabled={isPlayerBannerBlocking || Object.keys(runtime.units).every((unitId) => runtime.units[unitId].team !== "enemy" || runtime.units[unitId].isDefeated)}
              onClick={selectAllThreats}
            >
              Select All Threat
            </button>
            <button
              type="button"
              disabled={isPlayerBannerBlocking || selectedEnemyThreatIds.length === 0}
              onClick={clearThreatSelection}
            >
              Select None Threat
            </button>
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
            <div className="map-board-stack">
              <div className="map-board-frame">
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
                  moveHighlightTiles={moveHighlightTiles}
                  moveHighlightTeam={moveHighlightTeam}
                  attackHighlightTiles={attackHighlightTiles}
                  isAttackTargeting={pendingAction === "chooseAttackTarget"}
                  targetableEnemyTiles={targetableEnemyTiles}
                  hoveredAttackTargetTile={hoveredAttackTargetTile}
                  selectedEnemyThreatTiles={selectedEnemyThreatTiles}
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
                  onTileRightClick={handleTileRightClick}
                  onTileHover={handleTileHover}
                />
                {selectedUnit && stagedDestination && isPreviewMoveReady && pendingAction === "chooseAttackTarget" ? (
                  <div className="map-targeting-banner">
                    <span>Select a target to attack.</span>
                    <button
                      type="button"
                      disabled={isPlayerBannerBlocking}
                      onClick={() => setPendingAction("chooseAction")}
                    >
                      Back
                    </button>
                  </div>
                ) : null}
                {selectedUnit && stagedDestination && isPreviewMoveReady && pendingAction === "chooseAction" ? (
                  <div
                    ref={actionMenuRef}
                  className="map-action-menu"
                  style={getActionMenuStyle(
                      stagedDestination,
                      runtime.map.width,
                      runtime.map.height,
                    )}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      clearStagedAction();
                    }}
                  >
                    <p className="map-action-title">
                      {selectedUnit.name} at {stagedDestination.x},{stagedDestination.y}
                    </p>
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
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <aside className="sidebar">
            <div className="info-panels">
              <section className={`card compact-card unit-card ${getUnitCardClassName(hoveredUnit?.team)}`}>
                <h2>Hover</h2>
                {hoveredUnit ? (
                  <UnitSummaryCard
                    runtime={runtime}
                    unit={hoveredUnit}
                      footer={
                        selectedUnit && hoveredCombatPreview
                          ? [
                              `Combat: ${selectedUnit.name} deals ${formatDamageRange(
                                hoveredCombatPreview.attackerMinDamage,
                                hoveredCombatPreview.attackerMaxDamage,
                              )}`,
                            `Counter: ${hoveredCombatPreview.defenderPotentialCounter
                                ? formatDamageRange(
                                    hoveredCombatPreview.defenderMinDamage,
                                    hoveredCombatPreview.defenderMaxDamage,
                                  )
                                : "None"}`,
                          ]
                        : undefined
                    }
                  />
                ) : hoveredTile ? (
                  <div className="unit-summary unit-summary-empty">
                    <p>Empty Tile</p>
                    <div className="unit-meta-list">
                      <p>Tile: {hoveredTile.x},{hoveredTile.y}</p>
                      <p>Status: Empty</p>
                      <p>Terrain: {runtime.map.tiles[hoveredTile.y][hoveredTile.x].terrain}</p>
                      <p>Move Range: {moveHighlightTiles.some((tile) => tile.x === hoveredTile.x && tile.y === hoveredTile.y) ? "Yes" : "No"}</p>
                      <p>Attack Reach: {attackHighlightTiles.some(
                        (tile) => tile.x === hoveredTile.x && tile.y === hoveredTile.y,
                      )
                        ? "Yes"
                        : "No"}</p>
                    </div>
                  </div>
                ) : (
                  <p>Move the mouse over the board to inspect a tile or unit.</p>
                )}
              </section>

              <section className={`card compact-card unit-card ${getUnitCardClassName(selectedUnit?.team)}`}>
                <h2>Selected</h2>
                {selectedUnit ? (
                  <UnitSummaryCard
                    runtime={runtime}
                    unit={selectedUnit}
                    footer={[
                      selectedUnit.hasMoved ? "Moved this turn" : "Ready to move",
                      selectedUnit.hasActed ? "Action spent" : "Action available",
                      stagedDestination && isPreviewMoveReady
                        ? `Staged at ${stagedDestination.x},${stagedDestination.y}`
                        : "Click a reachable tile to stage a move.",
                    ]}
                  />
                ) : (
                  <p>No unit selected.</p>
                )}
              </section>
            </div>

            <section className="card combat-preview-card">
              <h2>Combat Preview</h2>
              {selectedUnit && previewTarget && combatPreview ? (
                <>
                  <div className="combat-preview-layout">
                    <div className="combat-preview-unit combat-preview-unit-left">
                      <div className="combat-preview-header">
                        <p className="combat-preview-name">{selectedUnit.name}</p>
                        <p className="combat-preview-class">
                          {previewAttackerClass?.name ?? selectedUnit.classId}
                        </p>
                      </div>
                      <div className="combat-preview-stat">
                        {renderCombatPreviewHpBar(
                          selectedUnit.currentHp,
                          selectedUnit.stats.maxHp,
                          combatPreview.defenderPotentialCounter
                            ? {
                                minDamage: combatPreview.defenderMinDamage,
                                maxDamage: combatPreview.defenderMaxDamage,
                              }
                            : undefined,
                        )}
                      </div>
                      <p
                        className={`combat-preview-stat combat-preview-damage ${
                          attackerKoOutcome && attackerKoOutcome.tone !== "none"
                            ? "combat-preview-damage-lethal"
                            : ""
                        }`}
                      >
                        {formatDamageRange(
                          combatPreview.attackerMinDamage,
                          combatPreview.attackerMaxDamage,
                        )}
                      </p>
                      <div className="combat-preview-stat">
                        <span>{previewAttackerWeapon?.name ?? "None"}</span>
                        {renderTriangleIndicator(triangleRelation.attacker)}
                      </div>
                    </div>
                    <div className="combat-preview-center">
                      <span className="combat-preview-label">Character</span>
                      <span className="combat-preview-label">Hit Points</span>
                      <span className="combat-preview-label">Damage</span>
                      <span className="combat-preview-label">Weapon</span>
                    </div>
                    <div className="combat-preview-unit combat-preview-unit-right">
                      <div className="combat-preview-header">
                        <p className="combat-preview-name">{previewTarget.name}</p>
                        <p className="combat-preview-class">
                          {previewDefenderClass?.name ?? previewTarget.classId}
                        </p>
                      </div>
                      <div className="combat-preview-stat">
                        {renderCombatPreviewHpBar(
                          previewTarget.currentHp,
                          previewTarget.stats.maxHp,
                          {
                            minDamage: combatPreview.attackerMinDamage,
                            maxDamage: combatPreview.attackerMaxDamage,
                          },
                        )}
                      </div>
                      <p
                        className={`combat-preview-stat combat-preview-damage ${
                          counterKoOutcome && counterKoOutcome.tone !== "none"
                            ? "combat-preview-damage-lethal"
                            : ""
                        }`}
                      >
                        {combatPreview.defenderPotentialCounter
                          ? formatDamageRange(
                              combatPreview.defenderMinDamage,
                              combatPreview.defenderMaxDamage,
                            )
                          : "-"}
                      </p>
                      <div className="combat-preview-stat">
                        <span>{previewDefenderWeapon?.name ?? "None"}</span>
                        {renderTriangleIndicator(triangleRelation.defender)}
                      </div>
                    </div>
                  </div>
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

    if (clickedUnit?.team === "enemy") {
      handleEnemyThreatLeftClick(clickedUnit.id);
      return;
    }

    if (stagedDestination) {
      clearStagedAction();
      return;
    }

    if (clickedUnit && (clickedUnit.team === "player" || clickedUnit.team === "ally")) {
      if (selectedUnit?.id === clickedUnit.id) {
        if (!canUnitTakePlayerActions(clickedUnit, runtime)) {
          return;
        }
        setStagedDestination(clickedUnit.position);
        setPendingAction("chooseAction");
        setPreviewMove(undefined);
        setIsPreviewMoveReady(true);
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
      const previewPath = getPreviewMovePath(runtime, selectedUnit.id, position, hoveredMovePath);
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

  function handleTileRightClick(position?: Position) {
    if (isPlayerBannerBlocking || (Boolean(previewMove) && !isPreviewMoveReady)) {
      return;
    }

    if (!position) {
      handleCancel();
      return;
    }

    if (pendingAction === "chooseAttackTarget" || stagedDestination || selectedUnit) {
      handleCancel();
      return;
    }

    const clickedUnit = getUnitAtPosition(units, position);
    if (clickedUnit?.team === "enemy" && !clickedUnit.isDefeated) {
      handleEnemyThreatRightClick(clickedUnit.id);
      return;
    }

    handleCancel();
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
      queuePresentationEvents(presentationEvents, result.nextState, runtime);
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
        queuePresentationEvents(result.presentationEvents, result.nextState, runtime);
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
    nextState: RuntimeGameState,
    previousState: RuntimeGameState,
  ) {
    setPendingRuntimeState(nextState);
    setPresentationQueue(events);
    setGrayLockUnitIds(getGrayLockUnitIds(previousState, nextState));
  }

  function handlePresentationComplete() {
    if (pendingRuntimeState) {
      dispatch(replaceRuntimeState(pendingRuntimeState));
    }
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

function getActionMenuStyle(position: Position, width: number, height: number) {
  const xRatio = (position.x + 0.5) / width;
  const yRatio = (position.y + 0.5) / height;
  const leftPercent = clamp(xRatio * 100, 12, 88);
  const topPercent = clamp(yRatio * 100, 16, 84);

  let translateX = "-50%";
  if (xRatio <= 0.2) {
    translateX = "0%";
  } else if (xRatio >= 0.8) {
    translateX = "-100%";
  }

  let translateY = "-112%";
  if (yRatio <= 0.28) {
    translateY = "12%";
  } else if (yRatio >= 0.82) {
    translateY = "-100%";
  }

  return {
    left: `${leftPercent}%`,
    top: `${topPercent}%`,
    transform: `translate(${translateX}, ${translateY})`,
  };
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

  if (currentStack.length > 0 && fallbackPath.length < currentStack.length) {
    return fallbackPath;
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

function getPreviewMovePath(
  runtime: RuntimeGameState,
  unitId: string,
  destination: Position,
  hoveredMovePath: Position[],
): Position[] {
  const fallbackPath = getMovementPathPreview(runtime, unitId, destination);
  const unit = runtime.units[unitId];

  if (!unit || hoveredMovePath.length === 0) {
    return fallbackPath;
  }

  const startsAtUnit =
    hoveredMovePath[0].x === unit.position.x && hoveredMovePath[0].y === unit.position.y;
  const endsAtDestination =
    hoveredMovePath[hoveredMovePath.length - 1].x === destination.x &&
    hoveredMovePath[hoveredMovePath.length - 1].y === destination.y;

  if (
    startsAtUnit &&
    endsAtDestination &&
    isPathContiguous(hoveredMovePath) &&
    hoveredMovePath.length - 1 <= getUnitMovement(runtime, unit)
  ) {
    return hoveredMovePath;
  }

  return fallbackPath;
}

function arePositionsAdjacent(left: Position, right: Position): boolean {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y) === 1;
}

function positionsEqual(left: Position, right: Position): boolean {
  return left.x === right.x && left.y === right.y;
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

function canUnitTakePlayerActions(unit: UnitState, runtime: RuntimeGameState) {
  return unit.team === runtime.phase && !unit.hasMoved && !unit.hasActed && !unit.isDefeated;
}

function formatDamageRange(minDamage: number, maxDamage: number): string {
  return `${minDamage} — ${maxDamage}`;
}

function getCombatKoOutcome(minDamage: number, maxDamage: number, targetHp: number) {
  const outcome = getKoOutcome(minDamage, maxDamage, targetHp);

  if (outcome.tone === "guaranteed") {
    return { ...outcome, icon: "KO" };
  }

  if (outcome.tone === "possible") {
    return { ...outcome, icon: "?KO" };
  }

  return outcome;
}

function getWeaponTriangleRelation(
  attackerCategory?: string,
  defenderCategory?: string,
) {
  if (!attackerCategory || !defenderCategory) {
    return { attacker: "none", defender: "none" } as const;
  }

  const pair = `${attackerCategory}:${defenderCategory}`;
  const physicalWinningPairs = new Set(["sword:axe", "axe:lance", "lance:sword"]);
  const physicalLosingPairs = new Set(["axe:sword", "lance:axe", "sword:lance"]);
  const magicWinningPairs = new Set(["light_magic:dark_magic", "dark_magic:light_magic"]);

  if (physicalWinningPairs.has(pair) || magicWinningPairs.has(pair)) {
    return { attacker: "advantage", defender: "disadvantage" } as const;
  }

  if (physicalLosingPairs.has(pair)) {
    return { attacker: "disadvantage", defender: "advantage" } as const;
  }

  return { attacker: "even", defender: "even" } as const;
}

function renderTriangleIndicator(relation: "advantage" | "disadvantage" | "even" | "none") {
  if (relation === "advantage") {
    return <span className="triangle-indicator triangle-indicator-advantage">↑</span>;
  }

  if (relation === "disadvantage") {
    return <span className="triangle-indicator triangle-indicator-disadvantage">↓</span>;
  }

  return null;
}

function renderCombatPreviewHpBar(
  currentHp: number,
  maxHp: number,
  incomingDamage?: { minDamage: number; maxDamage: number },
) {
  const safeMaxHp = Math.max(1, maxHp);
  const clampedCurrentHp = clamp(currentHp, 0, safeMaxHp);
  const currentPercent = (clampedCurrentHp / safeMaxHp) * 100;
  const minDamage = incomingDamage ? clamp(incomingDamage.minDamage, 0, clampedCurrentHp) : 0;
  const maxDamage = incomingDamage ? clamp(incomingDamage.maxDamage, 0, clampedCurrentHp) : 0;
  const guaranteedRemainingHp = Math.max(0, clampedCurrentHp - maxDamage);
  const possibleRemainingHp = Math.max(guaranteedRemainingHp, clampedCurrentHp - minDamage);
  const guaranteedRemainingPercent = (guaranteedRemainingHp / safeMaxHp) * 100;
  const possibleRemainingPercent = (possibleRemainingHp / safeMaxHp) * 100;
  const uncertainWidth = Math.max(0, possibleRemainingPercent - guaranteedRemainingPercent);
  const guaranteedLostWidth = Math.max(0, currentPercent - possibleRemainingPercent);

  return (
    <div className="combat-preview-hpbar">
      <div className="combat-preview-hpbar-track">
        <div className="combat-preview-hpbar-fill" style={{ width: `${currentPercent}%` }} />
        {uncertainWidth > 0 ? (
          <div
            className="combat-preview-hpbar-uncertain"
            style={{
              left: `${guaranteedRemainingPercent}%`,
              width: `${uncertainWidth}%`,
            }}
          />
        ) : null}
        {guaranteedLostWidth > 0 ? (
          <div
            className="combat-preview-hpbar-guaranteed-loss"
            style={{
              left: `${possibleRemainingPercent}%`,
              width: `${guaranteedLostWidth}%`,
            }}
          />
        ) : null}
        <span className="combat-preview-hpbar-label">
          {clampedCurrentHp}/{safeMaxHp}
        </span>
      </div>
    </div>
  );
}

function getKoOutcome(minDamage: number, maxDamage: number, targetHp: number) {
  if (minDamage >= targetHp) {
    return { icon: "☠", label: "Guaranteed", tone: "guaranteed" as const };
  }

  if (maxDamage >= targetHp) {
    return { icon: "!", label: "Possible", tone: "possible" as const };
  }

  return { icon: "-", label: "No", tone: "none" as const };
}

function useEnemyThreatSelection(runtime: RuntimeGameState, units: UnitState[]) {
  const [selectedEnemyThreatIds, setSelectedEnemyThreatIds] = useState<string[]>([]);
  const enemyUnits = useMemo(
    () => units.filter((unit) => unit.team === "enemy" && !unit.isDefeated),
    [units],
  );

  useEffect(() => {
    setSelectedEnemyThreatIds((current) =>
      current.filter((unitId) => runtime.units[unitId] && !runtime.units[unitId].isDefeated && runtime.units[unitId].team === "enemy"),
    );
  }, [runtime.units]);

  const enemyThreatOutlineTiles = useMemo(() => {
    if (selectedEnemyThreatIds.length === 0) {
      return [];
    }

    return uniquePositions(
      units
        .filter((unit) => selectedEnemyThreatIds.includes(unit.id) && !unit.isDefeated)
        .flatMap((unit) => getThreatenedPositions(runtime, unit.id)),
    );
  }, [runtime, selectedEnemyThreatIds, units]);

  const selectedEnemyThreatTiles = useMemo(
    () =>
      enemyUnits
        .filter((unit) => selectedEnemyThreatIds.includes(unit.id))
        .map((unit) => ({ x: unit.position.x, y: unit.position.y })),
    [enemyUnits, selectedEnemyThreatIds],
  );

    return {
      clearThreatSelection: () => setSelectedEnemyThreatIds([]),
      enemyThreatOutlineTiles,
      handleEnemyThreatLeftClick: (unitId: string) =>
        setSelectedEnemyThreatIds((current) =>
          current.includes(unitId) ? current.filter((id) => id !== unitId) : [...current, unitId],
        ),
      handleEnemyThreatRightClick: (unitId: string) =>
        setSelectedEnemyThreatIds((current) =>
          current.includes(unitId) ? current.filter((id) => id !== unitId) : [...current, unitId],
        ),
      selectAllThreats: () => setSelectedEnemyThreatIds(enemyUnits.map((unit) => unit.id)),
      selectedEnemyThreatIds,
      selectedEnemyThreatTiles,
    };
  }

function UnitSummaryCard({
  footer,
  runtime,
  unit,
}: {
  footer?: string[];
  runtime: RuntimeGameState;
  unit: UnitState;
}) {
  const classDefinition = runtime.map.classes.find((classData) => classData.id === unit.classId);
  const inventory = unit.inventory
    .map((weaponId) => runtime.map.weapons.find((weapon) => weapon.id === weaponId))
    .filter((weapon): weapon is (typeof runtime.map.weapons)[number] => Boolean(weapon));
  const proficiencyEntries = Object.entries(unit.weaponProficiencies)
    .filter((entry) => Boolean(entry[1]))
    .sort(([left], [right]) => formatWeaponDiscipline(left).localeCompare(formatWeaponDiscipline(right)));

  return (
    <div className="unit-summary">
      <div className="unit-summary-header">
        <div>
          <p className="unit-summary-name">{unit.name}</p>
          <p className="unit-summary-class">{classDefinition?.name ?? unit.classId}</p>
        </div>
        <p className="unit-summary-hp">
          HP {unit.currentHp}/{unit.stats.maxHp}
        </p>
      </div>

      <div className="unit-meta-list">
        <p>Tile: {unit.position.x},{unit.position.y}</p>
        <p>Status: {formatTeamStatus(unit.team)}</p>
      </div>

      <div className="unit-stat-grid" aria-label={`${unit.name} stats`}>
        <p>STR {unit.stats.strength}</p>
        <p>SKL {unit.stats.skill}</p>
        <p>SPD {unit.stats.speed}</p>
        <p>DEF {unit.stats.defense}</p>
        <p>RES {unit.stats.resistance}</p>
        <p>LCK {unit.stats.luck}</p>
        <p>MOV {getUnitMovement(runtime, unit)}</p>
      </div>

      <div className="unit-detail-block">
        <p className="unit-detail-label">Proficiencies</p>
        <p className="unit-detail-value">
          {proficiencyEntries.length > 0
            ? proficiencyEntries.map(([discipline, rank]) => `${formatWeaponDiscipline(discipline)} ${rank}`).join(" | ")
            : "None"}
        </p>
      </div>

      <div className="unit-detail-block">
        <p className="unit-detail-label">Items</p>
        <p className="unit-detail-value">
          {inventory.length > 0
            ? inventory.flatMap((weapon, index) => [
                <span key={weapon.id} className="unit-item-entry">
                  <span>{weapon.name}</span>
                  {weapon.id === unit.equippedWeaponId ? (
                    <span className="inline-badge">Equipped</span>
                  ) : null}
                </span>,
                index < inventory.length - 1 ? <span key={`${weapon.id}-sep`}> | </span> : null,
              ])
            : "None"}
        </p>
      </div>

      {footer && footer.length > 0 ? (
        <div className="unit-footer-list">
          {footer.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatTeamStatus(team: UnitState["team"]) {
  if (team === "enemy") {
    return "Enemy";
  }
  if (team === "ally") {
    return "Ally";
  }
  return "Player";
}

function getUnitCardClassName(team?: UnitState["team"]) {
  if (team === "enemy") {
    return "unit-card-enemy";
  }
  if (team === "ally") {
    return "unit-card-ally";
  }
  if (team === "player") {
    return "unit-card-player";
  }
  return "unit-card-neutral";
}

function formatWeaponDiscipline(discipline: string) {
  switch (discipline) {
    case "elemental_magic":
      return "Elem";
    case "light_magic":
      return "Light";
    case "dark_magic":
      return "Dark";
    case "healing":
      return "Heal";
    case "sword":
      return "Sword";
    case "axe":
      return "Axe";
    case "lance":
      return "Lance";
    case "bow":
      return "Bow";
    default:
      return discipline;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getDirectAttackRangePositions(state: RuntimeGameState, unitId: string): Position[] {
  const unit = state.units[unitId];
  const weapon = unit ? getEquippedWeapon(state, unit) : undefined;
  if (!unit || !weapon || unit.isDefeated) {
    return [];
  }

  const positions: Position[] = [];
  for (let dx = -weapon.maxRange; dx <= weapon.maxRange; dx += 1) {
    for (let dy = -weapon.maxRange; dy <= weapon.maxRange; dy += 1) {
      const distance = Math.abs(dx) + Math.abs(dy);
      if (distance < weapon.minRange || distance > weapon.maxRange) {
        continue;
      }

      const position = { x: unit.position.x + dx, y: unit.position.y + dy };
      if (
        position.x < 0 ||
        position.y < 0 ||
        position.x >= state.map.width ||
        position.y >= state.map.height
      ) {
        continue;
      }

      positions.push(position);
    }
  }

  return positions;
}
