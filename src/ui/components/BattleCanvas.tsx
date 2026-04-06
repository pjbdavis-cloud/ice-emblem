import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getEquippedWeapon } from "../../game/combat/preview";
import type { Position, RuntimeGameState, Team, TileDefinition, UnitState } from "../../game/types";
import type { PresentationEvent } from "../presentation/types";

type BattleCanvasProps = {
  runtime: RuntimeGameState;
  tiles: TileDefinition[][];
  width: number;
  height: number;
  units: UnitState[];
  hoveredTile?: Position;
  selectedTile?: Position;
  stagedTile?: Position;
  moveHighlightTiles: Position[];
  moveHighlightTeam?: Team;
  attackHighlightTiles: Position[];
  isAttackTargeting: boolean;
  targetableEnemyTiles: Position[];
  hoveredAttackTargetTile?: Position;
  selectedEnemyThreatTiles: Position[];
  hoveredMovePath: Position[];
  enemyThreatOutlineTiles: Position[];
  previewMove?: {
    unitId: string;
    path: Position[];
    destination: Position;
  };
  presentationQueue: PresentationEvent[];
  grayLockUnitIds: string[];
  pendingDefeatedUnitIds: string[];
  isInteractionLocked?: boolean;
  onAnimationStateChange?: (isAnimating: boolean) => void;
  onPresentationComplete?: () => void;
  onPreviewMoveComplete?: () => void;
  onTileClick: (position: Position) => void;
  onTileRightClick: (position?: Position) => void;
  onTileHover: (position?: Position) => void;
};

type BoardMetrics = {
  viewportWidth: number;
  viewportHeight: number;
  boardWidth: number;
  boardHeight: number;
  visibleColumns: number;
  visibleRows: number;
  tileSize: number;
};

type VisualPosition = {
  x: number;
  y: number;
};

type ActivePresentation = {
  event: PresentationEvent;
  index: number;
  startedAt: number;
};

type ActivePreviewMove = {
  unitId: string;
  path: Position[];
  destination: Position;
  startedAt: number;
  completed: boolean;
};

type DisplayedUnitState = {
  position: VisualPosition;
  hp: number;
  hasActed: boolean;
  opacity: number;
  shouldRender: boolean;
};

const MAX_CANVAS_HEIGHT_OFFSET = 142;
const PLAYER_MOVE_ANIMATION_MS = 150;
const ENEMY_MOVE_ANIMATION_MS = 150;
const ATTACK_ANIMATION_MS = 1200;
const DEATH_ANIMATION_MS = 700;
const CAMERA_VIEWPORT_PRESETS = [
  { label: "15x20", rows: 15, columns: 20 },
  { label: "12x16", rows: 12, columns: 16 },
  { label: "9x12", rows: 9, columns: 12 },
] as const;

export function BattleCanvas(props: BattleCanvasProps) {
  const {
    runtime,
    tiles,
    width,
    height,
    units,
    hoveredTile,
    selectedTile,
    stagedTile,
    moveHighlightTiles,
    moveHighlightTeam,
    attackHighlightTiles,
    isAttackTargeting,
    targetableEnemyTiles,
    hoveredAttackTargetTile,
    selectedEnemyThreatTiles,
    hoveredMovePath,
    enemyThreatOutlineTiles,
    previewMove,
    presentationQueue,
    grayLockUnitIds,
    pendingDefeatedUnitIds,
    isInteractionLocked = false,
    onAnimationStateChange,
    onPresentationComplete,
    onPreviewMoveComplete,
    onTileClick,
    onTileRightClick,
    onTileHover,
  } = props;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | undefined>(undefined);
  const [viewportPresetIndex, setViewportPresetIndex] = useState(0);
  const [cameraOffsetTiles, setCameraOffsetTiles] = useState({ x: 0, y: 0 });
  const cameraOffsetRef = useRef({ x: 0, y: 0 });
  const [metrics, setMetrics] = useState<BoardMetrics>({
    viewportWidth: width * 64,
    viewportHeight: height * 64,
    boardWidth: width * 64,
    boardHeight: height * 64,
    visibleColumns: width,
    visibleRows: height,
    tileSize: 64,
  });
  const [activePresentation, setActivePresentation] = useState<ActivePresentation | undefined>();
  const [activePreviewMove, setActivePreviewMove] = useState<ActivePreviewMove | undefined>();
  const [animationClock, setAnimationClock] = useState(0);

  const moveHighlightSet = useMemo(
    () => new Set(moveHighlightTiles.map(toPositionKey)),
    [moveHighlightTiles],
  );
  const attackHighlightSet = useMemo(
    () => new Set(attackHighlightTiles.map(toPositionKey)),
    [attackHighlightTiles],
  );
  const targetableEnemySet = useMemo(
    () => new Set(targetableEnemyTiles.map(toPositionKey)),
    [targetableEnemyTiles],
  );
  const selectedEnemyThreatSet = useMemo(
    () => new Set(selectedEnemyThreatTiles.map(toPositionKey)),
    [selectedEnemyThreatTiles],
  );
  const enemyThreatOutlineSet = useMemo(
    () => new Set(enemyThreatOutlineTiles.map(toPositionKey)),
    [enemyThreatOutlineTiles],
  );
  const isZoomLocked =
    isInteractionLocked ||
    runtime.phase === "enemy" ||
    Boolean(activePresentation) ||
    Boolean(activePreviewMove && !activePreviewMove.completed);

  function drawCurrentFrame(cameraOffsetOverride?: { x: number; y: number }) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const targetWidth = Math.floor(metrics.viewportWidth * dpr);
    const targetHeight = Math.floor(metrics.viewportHeight * dpr);
    if (canvas.width !== targetWidth) {
      canvas.width = targetWidth;
    }
    if (canvas.height !== targetHeight) {
      canvas.height = targetHeight;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, metrics.viewportWidth, metrics.viewportHeight);

    drawBoard(context, {
      runtime,
      tiles,
      width,
      height,
      units,
      hoveredTile,
      selectedTile,
      stagedTile,
      moveHighlightSet,
      moveHighlightTeam,
      attackHighlightSet,
      isAttackTargeting,
      targetableEnemySet,
      hoveredAttackTargetTile,
      selectedEnemyThreatSet,
      hoveredMovePath,
      enemyThreatOutlineSet,
      activePreviewMove,
      metrics,
      activePresentation,
      presentationQueue,
      grayLockUnitIds,
      pendingDefeatedUnitIds,
      animationClock,
      cameraOffsetTiles: cameraOffsetOverride ?? cameraOffsetRef.current,
    });
  }

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    const updateMetrics = () => {
      const bounds = wrapper.getBoundingClientRect();
      const maxWidth = bounds.width;
      const maxHeight = Math.max(240, window.innerHeight - MAX_CANVAS_HEIGHT_OFFSET);
      const preset = CAMERA_VIEWPORT_PRESETS[viewportPresetIndex];
      const visibleColumns = Math.min(width, preset.columns);
      const visibleRows = Math.min(height, preset.rows);
      const tileSize = Math.max(28, Math.floor(Math.min(maxWidth / visibleColumns, maxHeight / visibleRows)));

      setMetrics({
        viewportWidth: tileSize * visibleColumns,
        viewportHeight: tileSize * visibleRows,
        boardWidth: tileSize * width,
        boardHeight: tileSize * height,
        visibleColumns,
        visibleRows,
        tileSize,
      });
    };

    updateMetrics();

    const resizeObserver = new ResizeObserver(updateMetrics);
    resizeObserver.observe(wrapper);
    window.addEventListener("resize", updateMetrics);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateMetrics);
    };
  }, [height, viewportPresetIndex, width]);

  useEffect(() => {
    setCameraOffsetTiles((current) => {
      const clamped = clampCameraOffsetTiles(current, metrics, width, height);
      cameraOffsetRef.current = clamped;
      if (clamped.x === current.x && clamped.y === current.y) {
        return current;
      }
      return clamped;
    });
  }, [height, metrics, width]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLElement &&
        (event.target.tagName === "INPUT" ||
          event.target.tagName === "TEXTAREA" ||
          event.target.isContentEditable)
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if ((key === "+" || key === "=") && !isZoomLocked) {
        event.preventDefault();
        changeViewportPreset(1);
        return;
      }

      if ((key === "-" || key === "_") && !isZoomLocked) {
        event.preventDefault();
        changeViewportPreset(-1);
        return;
      }

      if (isInteractionLocked) {
        return;
      }

      if (key === "arrowleft" || key === "a") {
        event.preventDefault();
        panCamera(-1, 0);
        return;
      }

      if (key === "arrowright" || key === "d") {
        event.preventDefault();
        panCamera(1, 0);
        return;
      }

      if (key === "arrowup" || key === "w") {
        event.preventDefault();
        panCamera(0, -1);
        return;
      }

      if (key === "arrowdown" || key === "s") {
        event.preventDefault();
        panCamera(0, 1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [height, isInteractionLocked, isZoomLocked, metrics, viewportPresetIndex, width]);

  useEffect(() => {
    if (presentationQueue.length === 0 || activePresentation) {
      return;
    }

    setActivePresentation({
      event: presentationQueue[0],
      index: 0,
      startedAt: performance.now(),
    });
    onAnimationStateChange?.(true);
  }, [activePresentation, onAnimationStateChange, presentationQueue]);

  useEffect(() => {
    if (!previewMove) {
      setActivePreviewMove(undefined);
      if (!activePresentation) {
        onAnimationStateChange?.(false);
      }
      return;
    }

    if (previewMove.path.length <= 1) {
      setActivePreviewMove(undefined);
      if (!activePresentation) {
        onAnimationStateChange?.(false);
      }
      onPreviewMoveComplete?.();
      return;
    }

    setActivePreviewMove((current) => {
      if (
        current &&
        current.unitId === previewMove.unitId &&
        current.destination.x === previewMove.destination.x &&
        current.destination.y === previewMove.destination.y
      ) {
        return current;
      }

      onAnimationStateChange?.(true);
      return {
        unitId: previewMove.unitId,
        path: previewMove.path,
        destination: previewMove.destination,
        startedAt: performance.now(),
        completed: false,
      };
    });
  }, [activePresentation, onAnimationStateChange, onPreviewMoveComplete, previewMove]);

  useEffect(() => {
    if (!activePresentation && (!activePreviewMove || activePreviewMove.completed)) {
      return;
    }

    const tick = () => {
      const now = performance.now();
      setAnimationClock(now);

      if (activePreviewMove && !activePreviewMove.completed) {
        const previewDuration = getPreviewMoveDuration(activePreviewMove.path);
        if (now - activePreviewMove.startedAt < previewDuration) {
          frameRef.current = window.requestAnimationFrame(tick);
          return;
        }

        setActivePreviewMove((current) =>
          current
            ? {
                ...current,
                completed: true,
              }
            : current,
        );
        onAnimationStateChange?.(false);
        onPreviewMoveComplete?.();
        return;
      }

      if (activePresentation) {
        const duration = getEventDuration(activePresentation.event);
        if (now - activePresentation.startedAt < duration) {
          frameRef.current = window.requestAnimationFrame(tick);
          return;
        }

        const nextIndex = activePresentation.index + 1;
        if (nextIndex < presentationQueue.length) {
          setActivePresentation({
            event: presentationQueue[nextIndex],
            index: nextIndex,
            startedAt: now,
          });
          return;
        }

        setActivePresentation(undefined);
        onAnimationStateChange?.(false);
        onPresentationComplete?.();
      }
    };

    frameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== undefined) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [
    activePresentation,
    activePreviewMove,
    onAnimationStateChange,
    onPresentationComplete,
    onPreviewMoveComplete,
    presentationQueue,
  ]);

  useLayoutEffect(() => {
    drawCurrentFrame();
  }, [
    activePresentation,
    animationClock,
    attackHighlightSet,
    hoveredMovePath,
    enemyThreatOutlineSet,
    activePreviewMove,
    grayLockUnitIds,
    pendingDefeatedUnitIds,
    height,
    hoveredTile,
    metrics,
    moveHighlightSet,
    moveHighlightTeam,
    presentationQueue,
    runtime,
    selectedTile,
    stagedTile,
    tiles,
    units,
    width,
    cameraOffsetTiles,
  ]);

  return (
    <div
      ref={wrapperRef}
      className={`battle-canvas-shell${isInteractionLocked ? " battle-canvas-shell-locked" : ""}`}
    >
      <canvas
        ref={canvasRef}
        data-testid="battle-canvas"
        className={`battle-canvas${isInteractionLocked ? " battle-canvas-locked" : ""}`}
        aria-label={runtime.mainUnitId ? "Battlefield with marked main unit" : "Battlefield"}
        style={{ width: metrics.viewportWidth, height: metrics.viewportHeight }}
        onClick={(event) => {
          if (isInteractionLocked) {
            return;
          }
          const position = getTileFromPointer(event, metrics, cameraOffsetTiles, width, height);
          if (position) {
            onTileClick(position);
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          if (isInteractionLocked) {
            return;
          }
          const position = getTileFromPointer(event, metrics, cameraOffsetTiles, width, height);
          onTileRightClick(position);
        }}
        onMouseLeave={() => onTileHover(undefined)}
        onMouseMove={(event) => {
          if (isInteractionLocked) {
            onTileHover(undefined);
            return;
          }
          const position = getTileFromPointer(event, metrics, cameraOffsetTiles, width, height);
          onTileHover(position);
        }}
        onWheel={(event) => {
          if (isZoomLocked) {
            return;
          }
          event.preventDefault();
          if (event.deltaY < 0) {
            changeViewportPreset(1);
            return;
          }

          if (event.deltaY > 0) {
            changeViewportPreset(-1);
          }
        }}
      />
      <div className="camera-controls" aria-label="Map camera controls">
        <button
          type="button"
          aria-label="Zoom out"
          disabled={isZoomLocked || viewportPresetIndex <= 0}
          onClick={() => changeViewportPreset(-1)}
        >
          -
        </button>
        <span className="camera-zoom-label">{CAMERA_VIEWPORT_PRESETS[viewportPresetIndex].label}</span>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={isZoomLocked || viewportPresetIndex >= CAMERA_VIEWPORT_PRESETS.length - 1}
          onClick={() => changeViewportPreset(1)}
        >
          +
        </button>
      </div>
      {cameraOffsetTiles.x > 0 ? <div className="camera-edge camera-edge-left" /> : null}
      {cameraOffsetTiles.x < getMaxCameraOffsetTiles(metrics, width, height).x ? (
        <div className="camera-edge camera-edge-right" />
      ) : null}
      {cameraOffsetTiles.y > 0 ? <div className="camera-edge camera-edge-top" /> : null}
      {cameraOffsetTiles.y < getMaxCameraOffsetTiles(metrics, width, height).y ? (
        <div className="camera-edge camera-edge-bottom" />
      ) : null}
    </div>
  );

  function panCamera(deltaX: number, deltaY: number) {
    const current = cameraOffsetRef.current;
    const next = clampCameraOffsetTiles(
      { x: current.x + deltaX, y: current.y + deltaY },
      metrics,
      width,
      height,
    );
    if (next.x === current.x && next.y === current.y) {
      return;
    }

    cameraOffsetRef.current = next;
    drawCurrentFrame(next);
    setCameraOffsetTiles((state) => {
      if (state.x === next.x && state.y === next.y) {
        return state;
      }
      return next;
    });
  }

  function changeViewportPreset(delta: number) {
    const nextIndex = clamp(viewportPresetIndex + delta, 0, CAMERA_VIEWPORT_PRESETS.length - 1);
    if (nextIndex === viewportPresetIndex) {
      return;
    }

    const focusPosition = selectedTile
      ? { x: selectedTile.x, y: selectedTile.y }
      : {
          x: cameraOffsetRef.current.x + metrics.visibleColumns / 2,
          y: cameraOffsetRef.current.y + metrics.visibleRows / 2,
        };
    const nextPreset = CAMERA_VIEWPORT_PRESETS[nextIndex];
    const nextVisibleColumns = Math.min(width, nextPreset.columns);
    const nextVisibleRows = Math.min(height, nextPreset.rows);
    const nextOffset = clampCameraOffsetTiles(
      {
        x: Math.round(focusPosition.x - nextVisibleColumns / 2),
        y: Math.round(focusPosition.y - nextVisibleRows / 2),
      },
      {
        ...metrics,
        visibleColumns: nextVisibleColumns,
        visibleRows: nextVisibleRows,
      },
      width,
      height,
    );

    cameraOffsetRef.current = nextOffset;
    setCameraOffsetTiles((current) => {
      if (current.x === nextOffset.x && current.y === nextOffset.y) {
        return current;
      }
      return nextOffset;
    });
    setViewportPresetIndex(nextIndex);
  }
}

function drawBoard(
  context: CanvasRenderingContext2D,
  input: {
    runtime: RuntimeGameState;
    tiles: TileDefinition[][];
    width: number;
    height: number;
    units: UnitState[];
    hoveredTile?: Position;
    selectedTile?: Position;
    stagedTile?: Position;
    moveHighlightSet: Set<string>;
    moveHighlightTeam?: Team;
    attackHighlightSet: Set<string>;
    isAttackTargeting: boolean;
    targetableEnemySet: Set<string>;
    hoveredAttackTargetTile?: Position;
    selectedEnemyThreatSet: Set<string>;
    hoveredMovePath: Position[];
    enemyThreatOutlineSet: Set<string>;
    activePreviewMove?: ActivePreviewMove;
    metrics: BoardMetrics;
    activePresentation?: ActivePresentation;
    presentationQueue: PresentationEvent[];
    grayLockUnitIds: string[];
    pendingDefeatedUnitIds: string[];
    animationClock: number;
    cameraOffsetTiles: { x: number; y: number };
  },
) {
  const {
    runtime,
    tiles,
    width,
    height,
    units,
    hoveredTile,
    selectedTile,
    stagedTile,
    moveHighlightSet,
    moveHighlightTeam,
    attackHighlightSet,
    isAttackTargeting,
    targetableEnemySet,
    hoveredAttackTargetTile,
    selectedEnemyThreatSet,
    hoveredMovePath,
    enemyThreatOutlineSet,
    activePreviewMove,
    metrics,
    activePresentation,
    presentationQueue,
    grayLockUnitIds,
    pendingDefeatedUnitIds,
    animationClock,
    cameraOffsetTiles,
  } = input;

  const boardOriginX =
    width <= metrics.visibleColumns
      ? (metrics.viewportWidth - metrics.boardWidth) / 2
      : -cameraOffsetTiles.x * metrics.tileSize;
  const boardOriginY =
    height <= metrics.visibleRows
      ? (metrics.viewportHeight - metrics.boardHeight) / 2
      : -cameraOffsetTiles.y * metrics.tileSize;

  context.save();
  context.translate(boardOriginX, boardOriginY);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tile = tiles[y][x];
      const key = toPositionKey({ x, y });
      const px = x * metrics.tileSize;
      const py = y * metrics.tileSize;

      context.fillStyle = getTerrainColor(tile.terrain);
      context.fillRect(px, py, metrics.tileSize, metrics.tileSize);

      context.strokeStyle = "rgba(255, 255, 255, 0.22)";
      context.lineWidth = 1;
      context.strokeRect(px + 0.5, py + 0.5, metrics.tileSize - 1, metrics.tileSize - 1);

      if (moveHighlightSet.has(key)) {
        context.fillStyle = getMoveHighlightColor(moveHighlightTeam);
        context.fillRect(px, py, metrics.tileSize, metrics.tileSize);
      }

      if (attackHighlightSet.has(key)) {
        context.fillStyle = "rgba(163, 35, 29, 0.2)";
        context.fillRect(px, py, metrics.tileSize, metrics.tileSize);
      }

      if (enemyThreatOutlineSet.has(key)) {
        context.fillStyle = "rgba(184, 32, 24, 0.08)";
        context.fillRect(px, py, metrics.tileSize, metrics.tileSize);
        drawThreatBoundary(context, { x, y }, enemyThreatOutlineSet, metrics.tileSize);
      }

      if (selectedTile && selectedTile.x === x && selectedTile.y === y) {
        context.strokeStyle = "#194d8d";
        context.lineWidth = 3;
        context.strokeRect(px + 1.5, py + 1.5, metrics.tileSize - 3, metrics.tileSize - 3);
      }

      if (stagedTile && stagedTile.x === x && stagedTile.y === y) {
        context.strokeStyle = "#d08a13";
        context.lineWidth = 3;
        context.strokeRect(px + 5.5, py + 5.5, metrics.tileSize - 11, metrics.tileSize - 11);
      }

      if (hoveredTile && hoveredTile.x === x && hoveredTile.y === y) {
        context.fillStyle = "rgba(255, 255, 255, 0.12)";
        context.fillRect(px, py, metrics.tileSize, metrics.tileSize);
        context.strokeStyle = "rgba(255, 255, 255, 0.45)";
        context.lineWidth = 2;
        context.strokeRect(px + 1, py + 1, metrics.tileSize - 2, metrics.tileSize - 2);
      }

      context.fillStyle = "rgba(58, 38, 15, 0.65)";
      context.font = `${Math.max(10, metrics.tileSize * 0.16)}px Trebuchet MS`;
      context.fillText(`${x},${y}`, px + 8, py + 18);
    }
  }

  if (hoveredMovePath.length > 1) {
    drawMovePathArrow(context, hoveredMovePath, metrics.tileSize);
  }

  for (const unit of units) {
    const isUnitInPresentation = presentationQueue.some((event) =>
      event.type === "move" || event.type === "pause"
        ? event.unitId === unit.id
        : event.attackerId === unit.id || event.defenderId === unit.id,
    ) || (
      activePresentation
        ? activePresentation.event.type === "move" || activePresentation.event.type === "pause"
          ? activePresentation.event.unitId === unit.id
          : activePresentation.event.attackerId === unit.id || activePresentation.event.defenderId === unit.id
        : false
    );

    if ((unit.isDefeated || unit.currentHp <= 0) && !isUnitInPresentation) {
      continue;
    }

    const displayedState = getDisplayedUnitState(
      unit,
      presentationQueue,
      grayLockUnitIds,
      pendingDefeatedUnitIds,
      activePresentation,
      activePreviewMove,
      animationClock,
    );
    if (!displayedState.shouldRender) {
      continue;
    }

    drawUnit(
      context,
      unit,
      runtime,
      metrics.tileSize,
      displayedState,
      activePresentation,
      animationClock,
      unit.id === runtime.mainUnitId,
      isAttackTargeting,
      selectedEnemyThreatSet.has(toPositionKey(unit.position)),
      targetableEnemySet.has(toPositionKey(unit.position)),
      Boolean(
        hoveredAttackTargetTile &&
        hoveredAttackTargetTile.x === unit.position.x &&
        hoveredAttackTargetTile.y === unit.position.y,
      ),
    );
  }

  context.restore();
}

function drawUnit(
  context: CanvasRenderingContext2D,
  unit: UnitState,
  runtime: RuntimeGameState,
  tileSize: number,
  displayedState: DisplayedUnitState,
  activePresentation: ActivePresentation | undefined,
  animationClock: number,
  isMainUnit: boolean,
  isAttackTargeting: boolean,
  isThreatSelectedEnemy: boolean,
  isTargetableEnemy: boolean,
  isHoveredAttackTarget: boolean,
) {
  const combatMotion = getCombatVisualState(unit.id, activePresentation, animationClock, tileSize);
  const centerX = displayedState.position.x * tileSize + tileSize / 2 + combatMotion.shakeX;
  const centerY = displayedState.position.y * tileSize + tileSize / 2 + combatMotion.jumpY;
  const radius = Math.max(12, tileSize * 0.22);
  const hpRatio = Math.max(0, Math.min(1, displayedState.hp / unit.stats.maxHp));
  const barWidth = Math.max(20, tileSize * 0.58);
  const barHeight = Math.max(4, tileSize * 0.08);
  const barX = centerX - barWidth / 2;
  const barY = centerY - radius - Math.max(10, tileSize * 0.18);

  context.save();
  const dimForInvalidTarget =
    isAttackTargeting && unit.team === "enemy" && !isTargetableEnemy ? 0.38 : 1;
  context.globalAlpha = displayedState.opacity * dimForInvalidTarget;

  context.fillStyle = "rgba(32, 20, 12, 0.65)";
  roundRect(context, barX, barY, barWidth, barHeight, barHeight / 2);
  context.fill();

  context.fillStyle = getHealthBarColor(unit, runtime, displayedState.hp);
  roundRect(context, barX, barY, barWidth * hpRatio, barHeight, barHeight / 2);
  context.fill();
  context.strokeStyle = "rgba(247, 235, 214, 0.92)";
  context.lineWidth = Math.max(1, tileSize * 0.025);
  roundRect(context, barX, barY, barWidth, barHeight, barHeight / 2);
  context.stroke();
  drawHealthBarTicks(context, unit.stats.maxHp, barX, barY, barWidth, barHeight);

  const unitFillColor = displayedState.hasActed ? "#7b7b7b" : getTeamColor(unit.team);
  const unitStrokeColor = displayedState.hasActed ? "rgba(222, 222, 222, 0.92)" : "rgba(255, 250, 240, 0.9)";
  const unitAccentColor = displayedState.hasActed ? "#f1f1f1" : "#fff8ed";
  const bodyWidth = Math.max(20, tileSize * 0.44);
  const bodyHeight = Math.max(18, tileSize * 0.36);
  const headRadius = Math.max(6, tileSize * 0.11);
  const bodyCenterY = centerY + tileSize * 0.06;
  const headCenterY = bodyCenterY - bodyHeight * 0.62;

  context.fillStyle = "rgba(18, 12, 8, 0.18)";
  context.beginPath();
  context.ellipse(
    centerX,
    bodyCenterY + bodyHeight * 0.62,
    bodyWidth * 0.44,
    bodyHeight * 0.16,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();

  context.fillStyle = unitFillColor;
  context.beginPath();
  context.ellipse(centerX, bodyCenterY, bodyWidth / 2, bodyHeight / 2, 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = unitStrokeColor;
  context.lineWidth = 2;
  context.stroke();

  if (isMainUnit) {
    const badgeRadius = Math.max(8, tileSize * 0.13);
    const badgeX = centerX + bodyWidth * 0.28;
    const badgeY = headCenterY - headRadius * 1.2;

    context.fillStyle = "rgba(255, 226, 117, 0.96)";
    context.beginPath();
    context.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "rgba(96, 60, 10, 0.92)";
    context.lineWidth = Math.max(1.5, tileSize * 0.03);
    context.stroke();

    context.fillStyle = "rgba(84, 50, 17, 0.96)";
    context.font = `700 ${Math.max(9, tileSize * 0.17)}px Trebuchet MS`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("M", badgeX, badgeY + 0.5);

    context.strokeStyle = "rgba(255, 221, 114, 0.9)";
    context.lineWidth = Math.max(2, tileSize * 0.045);
    context.beginPath();
    context.ellipse(
      centerX,
      bodyCenterY,
      bodyWidth * 0.8,
      bodyHeight * 0.88,
      0,
      0,
      Math.PI * 2,
    );
    context.stroke();
  }

  if (isTargetableEnemy) {
    context.strokeStyle = isHoveredAttackTarget ? "rgba(236, 56, 46, 0.98)" : "rgba(214, 46, 36, 0.85)";
    context.lineWidth = isHoveredAttackTarget ? Math.max(3, tileSize * 0.07) : Math.max(2, tileSize * 0.05);
    context.beginPath();
    context.ellipse(
      centerX,
      bodyCenterY,
      bodyWidth * 0.7,
      bodyHeight * 0.76,
      0,
      0,
      Math.PI * 2,
    );
    context.stroke();

    if (isHoveredAttackTarget) {
      context.strokeStyle = "rgba(255, 214, 209, 0.95)";
      context.lineWidth = Math.max(1.5, tileSize * 0.03);
      context.beginPath();
      context.ellipse(
        centerX,
        bodyCenterY,
        bodyWidth * 0.84,
        bodyHeight * 0.9,
        0,
        0,
        Math.PI * 2,
      );
      context.stroke();
    }
  }

  context.fillStyle = unitFillColor;
  context.beginPath();
  context.arc(centerX, headCenterY, headRadius, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = unitStrokeColor;
  context.lineWidth = 2;
  context.stroke();

  if (isThreatSelectedEnemy) {
    context.save();
    context.strokeStyle = "rgba(255, 206, 198, 0.96)";
    context.lineWidth = Math.max(2.5, tileSize * 0.05);
    context.setLineDash([Math.max(6, tileSize * 0.12), Math.max(4, tileSize * 0.08)]);
    context.strokeRect(
      displayedState.position.x * tileSize + 2,
      displayedState.position.y * tileSize + 2,
      tileSize - 4,
      tileSize - 4,
    );
    context.restore();
  }

  context.strokeStyle = unitAccentColor;
  context.lineWidth = Math.max(1.5, tileSize * 0.03);
  context.beginPath();
  drawUnitFamilyGlyph(context, runtime, unit, centerX, bodyCenterY, bodyWidth, bodyHeight);
  context.stroke();
  context.restore();
}

function drawUnitFamilyGlyph(
  context: CanvasRenderingContext2D,
  runtime: RuntimeGameState,
  unit: UnitState,
  centerX: number,
  bodyCenterY: number,
  bodyWidth: number,
  bodyHeight: number,
) {
  const equippedWeapon = getEquippedWeapon(runtime, unit);
  const category = equippedWeapon?.category;

  switch (category) {
    case "sword":
      context.moveTo(centerX, bodyCenterY - bodyHeight * 0.2);
      context.lineTo(centerX, bodyCenterY + bodyHeight * 0.22);
      context.moveTo(centerX - bodyWidth * 0.12, bodyCenterY - bodyHeight * 0.02);
      context.lineTo(centerX + bodyWidth * 0.12, bodyCenterY - bodyHeight * 0.02);
      context.moveTo(centerX, bodyCenterY + bodyHeight * 0.22);
      context.lineTo(centerX - bodyWidth * 0.08, bodyCenterY + bodyHeight * 0.34);
      context.moveTo(centerX, bodyCenterY + bodyHeight * 0.22);
      context.lineTo(centerX + bodyWidth * 0.08, bodyCenterY + bodyHeight * 0.34);
      break;
    case "axe":
      context.moveTo(centerX - bodyWidth * 0.05, bodyCenterY - bodyHeight * 0.22);
      context.lineTo(centerX + bodyWidth * 0.03, bodyCenterY + bodyHeight * 0.24);
      context.moveTo(centerX - bodyWidth * 0.04, bodyCenterY - bodyHeight * 0.16);
      context.lineTo(centerX + bodyWidth * 0.18, bodyCenterY - bodyHeight * 0.08);
      context.lineTo(centerX + bodyWidth * 0.14, bodyCenterY + bodyHeight * 0.06);
      context.lineTo(centerX - bodyWidth * 0.01, bodyCenterY + bodyHeight * 0.02);
      break;
    case "lance":
      context.moveTo(centerX, bodyCenterY + bodyHeight * 0.28);
      context.lineTo(centerX, bodyCenterY - bodyHeight * 0.18);
      context.moveTo(centerX, bodyCenterY - bodyHeight * 0.24);
      context.lineTo(centerX - bodyWidth * 0.08, bodyCenterY - bodyHeight * 0.08);
      context.lineTo(centerX + bodyWidth * 0.08, bodyCenterY - bodyHeight * 0.08);
      context.lineTo(centerX, bodyCenterY - bodyHeight * 0.24);
      break;
    case "bow":
      context.save();
      context.beginPath();
      context.ellipse(
        centerX - bodyWidth * 0.02,
        bodyCenterY,
        bodyWidth * 0.14,
        bodyHeight * 0.3,
        0,
        -Math.PI / 2,
        Math.PI / 2,
      );
      context.stroke();
      context.restore();
      context.moveTo(centerX + bodyWidth * 0.08, bodyCenterY - bodyHeight * 0.26);
      context.lineTo(centerX + bodyWidth * 0.08, bodyCenterY + bodyHeight * 0.26);
      context.moveTo(centerX - bodyWidth * 0.08, bodyCenterY - bodyHeight * 0.08);
      context.lineTo(centerX + bodyWidth * 0.08, bodyCenterY);
      context.lineTo(centerX - bodyWidth * 0.08, bodyCenterY + bodyHeight * 0.08);
      break;
    case "elemental_magic":
      context.moveTo(centerX, bodyCenterY - bodyHeight * 0.24);
      context.lineTo(centerX + bodyWidth * 0.08, bodyCenterY - bodyHeight * 0.04);
      context.lineTo(centerX + bodyWidth * 0.02, bodyCenterY - bodyHeight * 0.04);
      context.lineTo(centerX + bodyWidth * 0.12, bodyCenterY + bodyHeight * 0.2);
      context.lineTo(centerX - bodyWidth * 0.06, bodyCenterY + bodyHeight * 0.02);
      context.lineTo(centerX, bodyCenterY + bodyHeight * 0.02);
      context.lineTo(centerX - bodyWidth * 0.08, bodyCenterY - bodyHeight * 0.24);
      break;
    case "light_magic":
      context.moveTo(centerX, bodyCenterY - bodyHeight * 0.22);
      context.lineTo(centerX, bodyCenterY + bodyHeight * 0.18);
      context.moveTo(centerX - bodyWidth * 0.16, bodyCenterY);
      context.lineTo(centerX + bodyWidth * 0.16, bodyCenterY);
      context.moveTo(centerX - bodyWidth * 0.11, bodyCenterY - bodyHeight * 0.13);
      context.lineTo(centerX + bodyWidth * 0.11, bodyCenterY + bodyHeight * 0.13);
      context.moveTo(centerX + bodyWidth * 0.11, bodyCenterY - bodyHeight * 0.13);
      context.lineTo(centerX - bodyWidth * 0.11, bodyCenterY + bodyHeight * 0.13);
      break;
    case "dark_magic":
      context.moveTo(centerX - bodyWidth * 0.14, bodyCenterY + bodyHeight * 0.12);
      context.lineTo(centerX, bodyCenterY - bodyHeight * 0.22);
      context.lineTo(centerX + bodyWidth * 0.14, bodyCenterY + bodyHeight * 0.12);
      context.moveTo(centerX - bodyWidth * 0.08, bodyCenterY + bodyHeight * 0.14);
      context.lineTo(centerX + bodyWidth * 0.08, bodyCenterY + bodyHeight * 0.14);
      break;
    case "healing":
      context.moveTo(centerX, bodyCenterY - bodyHeight * 0.2);
      context.lineTo(centerX, bodyCenterY + bodyHeight * 0.2);
      context.moveTo(centerX - bodyWidth * 0.16, bodyCenterY);
      context.lineTo(centerX + bodyWidth * 0.16, bodyCenterY);
      break;
    default:
      context.moveTo(centerX, bodyCenterY - bodyHeight * 0.18);
      context.lineTo(centerX, bodyCenterY + bodyHeight * 0.28);
      context.moveTo(centerX - bodyWidth * 0.18, bodyCenterY);
      context.lineTo(centerX + bodyWidth * 0.18, bodyCenterY);
      context.moveTo(centerX, bodyCenterY + bodyHeight * 0.26);
      context.lineTo(centerX - bodyWidth * 0.14, bodyCenterY + bodyHeight * 0.56);
      context.moveTo(centerX, bodyCenterY + bodyHeight * 0.26);
      context.lineTo(centerX + bodyWidth * 0.14, bodyCenterY + bodyHeight * 0.56);
      break;
  }
}

function getDisplayedUnitState(
  unit: UnitState,
  presentationQueue: PresentationEvent[],
  grayLockUnitIds: string[],
  pendingDefeatedUnitIds: string[],
  activePresentation: ActivePresentation | undefined,
  activePreviewMove: ActivePreviewMove | undefined,
  animationClock: number,
): DisplayedUnitState {
  const activeIndex = activePresentation?.index ?? -1;
  const activeProgress =
    activePresentation
      ? Math.max(
          0,
          Math.min(1, (animationClock - activePresentation.startedAt) / getEventDuration(activePresentation.event)),
        )
      : 0;

  const moveEvents = presentationQueue
    .map((event, index) => ({ event, index }))
    .filter(
      (entry): entry is { event: Extract<PresentationEvent, { type: "move" }>; index: number } =>
        entry.event.type === "move" && entry.event.unitId === unit.id,
    );
  const combatEvents = presentationQueue
    .map((event, index) => ({ event, index }))
    .filter(
      (entry): entry is { event: Extract<PresentationEvent, { type: "combat" }>; index: number } =>
        entry.event.type === "combat" &&
        (entry.event.attackerId === unit.id || entry.event.defenderId === unit.id),
    );
  const hasUpcomingOrActivePresentation = presentationQueue.some((event, index) => {
    if (index < activeIndex) {
      return false;
    }

    if (event.type === "move" || event.type === "pause") {
      return event.unitId === unit.id;
    }

    return event.attackerId === unit.id || event.defenderId === unit.id;
  });

  let position: VisualPosition = { x: unit.position.x, y: unit.position.y };
  const activeMove = activePresentation?.event.type === "move" && activePresentation.event.unitId === unit.id
    ? activePresentation.event
    : undefined;
  const nextMove = moveEvents.find((entry) => entry.index >= activeIndex);
  const lastCompletedMove = [...moveEvents].reverse().find((entry) => entry.index < activeIndex);
  const previewMove =
    activePreviewMove && activePreviewMove.unitId === unit.id ? activePreviewMove : undefined;

  if (previewMove && !previewMove.completed) {
    const previewProgress = Math.max(
      0,
      Math.min(1, (animationClock - previewMove.startedAt) / getPreviewMoveDuration(previewMove.path)),
    );
    position = getPathPosition(previewMove.path, previewProgress);
  } else if (previewMove?.completed) {
    position = { x: previewMove.destination.x, y: previewMove.destination.y };
  } else if (activeMove) {
    position = getPathPosition(activeMove.path, activeProgress);
  } else if (nextMove && nextMove.index > activeIndex) {
    position = { x: nextMove.event.from.x, y: nextMove.event.from.y };
  } else if (lastCompletedMove) {
    position = { x: lastCompletedMove.event.to.x, y: lastCompletedMove.event.to.y };
  }

  let hp = unit.currentHp;
  const activeCombat =
    activePresentation?.event.type === "combat" &&
    (activePresentation.event.attackerId === unit.id || activePresentation.event.defenderId === unit.id)
      ? activePresentation.event
      : undefined;
  const nextCombat = combatEvents.find((entry) => entry.index >= activeIndex);
  const lastCompletedCombat = [...combatEvents].reverse().find((entry) => entry.index < activeIndex);

  if (activeCombat) {
    hp = getAnimatedCombatHp(unit.id, activeCombat, activeProgress);
  } else if (nextCombat && nextCombat.index > activeIndex) {
    hp = nextCombat.event.attackerId === unit.id ? nextCombat.event.attackerFromHp : nextCombat.event.defenderFromHp;
  } else if (lastCompletedCombat) {
    hp = lastCompletedCombat.event.attackerId === unit.id ? lastCompletedCombat.event.attackerToHp : lastCompletedCombat.event.defenderToHp;
  }

  let hasActed = unit.hasActed;
  if (hasUpcomingOrActivePresentation) {
    hasActed = false;
  } else if (grayLockUnitIds.includes(unit.id)) {
    hasActed = true;
  }

  let opacity = 1;
  if (activeCombat) {
    opacity = getCombatDeathOpacity(unit.id, activeCombat, activeProgress);
  }
  const isPendingDefeated = pendingDefeatedUnitIds.includes(unit.id);
  const isDefeatedNow = unit.isDefeated || isPendingDefeated || hp <= 0;
  const shouldRender =
    hasUpcomingOrActivePresentation ||
    (Boolean(activeCombat) && !isDefeatedNow) ||
    (Boolean(activeCombat) && isDefeatedNow && opacity > 0) ||
    (!isDefeatedNow && hp > 0);

  return {
    position,
    hp,
    hasActed,
    opacity,
    shouldRender,
  };
}

function getCombatVisualState(
  unitId: string,
  activePresentation: ActivePresentation | undefined,
  animationClock: number,
  tileSize: number,
) {
  if (!activePresentation || activePresentation.event.type !== "combat") {
    return { jumpY: 0, shakeX: 0 };
  }

  const event = activePresentation.event;
  const progress = Math.min(1, (animationClock - activePresentation.startedAt) / ATTACK_ANIMATION_MS);

  if (unitId === event.attackerId && progress <= 0.22) {
    const phase = progress / 0.22;
    return { jumpY: -Math.sin(phase * Math.PI) * tileSize * 0.16, shakeX: 0 };
  }

  if (unitId === event.defenderId && progress >= 0.22 && progress <= 0.45) {
    const phase = (progress - 0.22) / 0.23;
    return { jumpY: 0, shakeX: Math.sin(phase * Math.PI * 6) * tileSize * 0.05 };
  }

  if (unitId === event.defenderId && event.defenderCanCounter && progress >= 0.55 && progress <= 0.75) {
    const phase = (progress - 0.55) / 0.2;
    return { jumpY: -Math.sin(phase * Math.PI) * tileSize * 0.16, shakeX: 0 };
  }

  if (unitId === event.attackerId && event.defenderCanCounter && progress >= 0.75 && progress <= 0.9) {
    const phase = (progress - 0.75) / 0.15;
    return { jumpY: 0, shakeX: Math.sin(phase * Math.PI * 6) * tileSize * 0.05 };
  }

  return { jumpY: 0, shakeX: 0 };
}

function getAnimatedCombatHp(
  unitId: string,
  event: Extract<PresentationEvent, { type: "combat" }>,
  progress: number,
): number {
  if (unitId === event.defenderId) {
    if (progress < 0.24) {
      return event.defenderFromHp;
    }

    if (progress < 0.45) {
      const hpProgress = (progress - 0.24) / 0.21;
      return event.defenderFromHp + (event.defenderToHp - event.defenderFromHp) * hpProgress;
    }

    return event.defenderToHp;
  }

  if (unitId === event.attackerId) {
    if (!event.defenderCanCounter || progress < 0.77) {
      return event.attackerFromHp;
    }

    const hpProgress = Math.min(1, (progress - 0.77) / 0.13);
    return event.attackerFromHp + (event.attackerToHp - event.attackerFromHp) * hpProgress;
  }

  return 0;
}

function getHealthBarColor(
  unit: UnitState,
  runtime: RuntimeGameState,
  displayedHp: number,
): string {
  if (displayedHp < Math.ceil(unit.stats.maxHp * runtime.rules.injuryThresholdRatio)) {
    return "#d0a313";
  }

  return displayedHp > 0 ? "#4c9a58" : "#c53c2f";
}

function drawHealthBarTicks(
  context: CanvasRenderingContext2D,
  maxHp: number,
  barX: number,
  barY: number,
  barWidth: number,
  barHeight: number,
) {
  if (maxHp <= 1) {
    return;
  }

  context.save();
  context.strokeStyle = "rgba(32, 20, 12, 0.45)";
  context.lineWidth = 1;

  for (let currentHp = 1; currentHp < maxHp; currentHp += 1) {
    const tickX = barX + (barWidth * currentHp) / maxHp;
    context.beginPath();
    context.moveTo(tickX, barY + 1);
    context.lineTo(tickX, barY + barHeight - 1);
    context.stroke();
  }

  context.restore();
}

function getCombatDeathOpacity(
  unitId: string,
  event: Extract<PresentationEvent, { type: "combat" }>,
  progress: number,
): number {
  if (unitId === event.defenderId && event.defenderToHp <= 0) {
    const fadeStart = event.defenderCanCounter ? 0.56 : 0.46;
    return getDeathFadeOpacity(progress, fadeStart);
  }

  if (unitId === event.attackerId && event.attackerToHp <= 0) {
    return getDeathFadeOpacity(progress, 0.9);
  }

  return 1;
}

function getEventDuration(event: PresentationEvent): number {
  if (event.type === "move") {
    const stepCount = Math.max(1, event.path.length - 1);
    const msPerTile = event.team === "enemy" ? ENEMY_MOVE_ANIMATION_MS : PLAYER_MOVE_ANIMATION_MS;
    return stepCount * msPerTile;
  }

  if (event.type === "pause") {
    return event.durationMs;
  }

  return ATTACK_ANIMATION_MS + getCombatDeathTail(event);
}

function getPreviewMoveDuration(path: Position[]): number {
  const stepCount = Math.max(1, path.length - 1);
  return stepCount * PLAYER_MOVE_ANIMATION_MS;
}

function getCombatDeathTail(event: Extract<PresentationEvent, { type: "combat" }>): number {
  return event.defenderToHp <= 0 || event.attackerToHp <= 0 ? DEATH_ANIMATION_MS : 0;
}

function getTileFromPointer(
  event: React.MouseEvent<HTMLCanvasElement>,
  metrics: BoardMetrics,
  cameraOffsetTiles: { x: number; y: number },
  width: number,
  height: number,
): Position | undefined {
  const bounds = event.currentTarget.getBoundingClientRect();
  const scaleX = bounds.width / metrics.viewportWidth;
  const scaleY = bounds.height / metrics.viewportHeight;
  const displayedTileWidth = metrics.tileSize * scaleX;
  const displayedTileHeight = metrics.tileSize * scaleY;
  const displayedBoardWidth = metrics.boardWidth * scaleX;
  const displayedBoardHeight = metrics.boardHeight * scaleY;
  const boardOriginX =
    width <= metrics.visibleColumns
      ? (bounds.width - displayedBoardWidth) / 2
      : -cameraOffsetTiles.x * displayedTileWidth;
  const boardOriginY =
    height <= metrics.visibleRows
      ? (bounds.height - displayedBoardHeight) / 2
      : -cameraOffsetTiles.y * displayedTileHeight;
  const x = Math.floor((event.clientX - bounds.left - boardOriginX) / displayedTileWidth);
  const y = Math.floor((event.clientY - bounds.top - boardOriginY) / displayedTileHeight);

  if (x < 0 || y < 0 || x >= width || y >= height) {
    return undefined;
  }

  return { x, y };
}

function getMaxCameraOffsetTiles(metrics: BoardMetrics, width: number, height: number) {
  return {
    x: Math.max(0, width - metrics.visibleColumns),
    y: Math.max(0, height - metrics.visibleRows),
  };
}

function clampCameraOffsetTiles(
  offset: { x: number; y: number },
  metrics: BoardMetrics,
  width: number,
  height: number,
) {
  const maxOffset = getMaxCameraOffsetTiles(metrics, width, height);
  return {
    x: clamp(offset.x, 0, maxOffset.x),
    y: clamp(offset.y, 0, maxOffset.y),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toPositionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

function getTerrainColor(terrain: TileDefinition["terrain"]): string {
  switch (terrain) {
    case "forest":
      return "#92b175";
    case "fort":
      return "#b4865b";
    case "wall":
      return "#5f6b78";
    default:
      return "#d4bc82";
  }
}

function getMoveHighlightColor(team: Team | undefined): string {
  if (team === "enemy") {
    return "rgba(245, 180, 60, 0.28)";
  }

  return "rgba(37, 92, 176, 0.24)";
}

function getTeamColor(team: Team): string {
  switch (team) {
    case "enemy":
      return "#aa2c29";
    case "ally":
      return "#4b8b55";
    default:
      return "#2453a6";
  }
}

function drawThreatBoundary(
  context: CanvasRenderingContext2D,
  position: Position,
  threatSet: Set<string>,
  tileSize: number,
) {
  const { x, y } = position;
  const px = x * tileSize;
  const py = y * tileSize;
  const left = px;
  const right = px + tileSize;
  const top = py;
  const bottom = py + tileSize;

  context.strokeStyle = "rgba(184, 32, 24, 0.95)";
  context.lineWidth = 3;
  context.lineCap = "round";

  if (!threatSet.has(toPositionKey({ x, y: y - 1 }))) {
    drawLine(context, left, top, right, top);
  }

  if (!threatSet.has(toPositionKey({ x: x + 1, y }))) {
    drawLine(context, right, top, right, bottom);
  }

  if (!threatSet.has(toPositionKey({ x, y: y + 1 }))) {
    drawLine(context, right, bottom, left, bottom);
  }

  if (!threatSet.has(toPositionKey({ x: x - 1, y }))) {
    drawLine(context, left, bottom, left, top);
  }
}

function drawMovePathArrow(
  context: CanvasRenderingContext2D,
  path: Position[],
  tileSize: number,
) {
  if (path.length < 2) {
    return;
  }

  const points = path.map((position) => ({
    x: position.x * tileSize + tileSize / 2,
    y: position.y * tileSize + tileSize / 2,
  }));
  const end = points[points.length - 1];
  const previous = points[points.length - 2];
  const angle = Math.atan2(end.y - previous.y, end.x - previous.x);
  const lineEndInset = Math.max(10, tileSize * 0.18);
  const lineEnd = {
    x: end.x - Math.cos(angle) * lineEndInset,
    y: end.y - Math.sin(angle) * lineEndInset,
  };

  context.save();
  context.strokeStyle = "rgba(52, 122, 235, 0.92)";
  context.lineWidth = Math.max(6, tileSize * 0.16);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);

  for (let index = 1; index < points.length - 1; index += 1) {
    context.lineTo(points[index].x, points[index].y);
  }
  context.lineTo(lineEnd.x, lineEnd.y);

  context.stroke();

  context.strokeStyle = "rgba(214, 234, 255, 0.85)";
  context.lineWidth = Math.max(2.5, tileSize * 0.055);
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);

  for (let index = 1; index < points.length - 1; index += 1) {
    context.lineTo(points[index].x, points[index].y);
  }
  context.lineTo(lineEnd.x, lineEnd.y);

  context.stroke();

  const arrowLength = Math.max(14, tileSize * 0.34);
  const arrowWidth = Math.max(10, tileSize * 0.24);
  const tipX = end.x;
  const tipY = end.y;
  const backX = tipX - Math.cos(angle) * arrowLength;
  const backY = tipY - Math.sin(angle) * arrowLength;
  const normalX = -Math.sin(angle);
  const normalY = Math.cos(angle);
  const notchX = backX + Math.cos(angle) * (arrowLength * 0.2);
  const notchY = backY + Math.sin(angle) * (arrowLength * 0.2);

  context.fillStyle = "rgba(52, 122, 235, 0.98)";
  context.beginPath();
  context.moveTo(tipX, tipY);
  context.lineTo(backX + normalX * arrowWidth, backY + normalY * arrowWidth);
  context.lineTo(notchX, notchY);
  context.lineTo(backX - normalX * arrowWidth, backY - normalY * arrowWidth);
  context.closePath();
  context.fill();

  context.strokeStyle = "rgba(214, 234, 255, 0.78)";
  context.lineWidth = Math.max(2, tileSize * 0.04);
  context.beginPath();
  context.moveTo(tipX, tipY);
  context.lineTo(backX + normalX * arrowWidth, backY + normalY * arrowWidth);
  context.lineTo(notchX, notchY);
  context.lineTo(backX - normalX * arrowWidth, backY - normalY * arrowWidth);
  context.closePath();
  context.stroke();
  context.restore();
}

function drawLine(
  context: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
) {
  context.beginPath();
  context.moveTo(startX, startY);
  context.lineTo(endX, endY);
  context.stroke();
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}


function getDeathFadeOpacity(progress: number, fadeStart: number): number {
  if (progress <= fadeStart) {
    return 1;
  }

  const fadeProgress = Math.min(1, (progress - fadeStart) / (1 - fadeStart));
  const pulse = Math.abs(Math.cos(fadeProgress * Math.PI * 2.5));
  return Math.max(0, (1 - fadeProgress) * (0.25 + pulse * 0.75));
}

function getPathPosition(path: Position[], progress: number): VisualPosition {
  const safePath = path.filter((position): position is Position => Boolean(position));

  if (safePath.length === 0) {
    return { x: 0, y: 0 };
  }

  if (safePath.length === 1) {
    return safePath[0];
  }

  const segmentCount = safePath.length - 1;
  const scaledProgress = Math.max(0, Math.min(0.999999, progress)) * segmentCount;
  const segmentIndex = Math.min(segmentCount - 1, Math.floor(scaledProgress));
  const segmentProgress = scaledProgress - segmentIndex;
  const from = safePath[segmentIndex] ?? safePath[safePath.length - 1];
  const to = safePath[segmentIndex + 1] ?? from;

  return {
    x: from.x + (to.x - from.x) * segmentProgress,
    y: from.y + (to.y - from.y) * segmentProgress,
  };
}
