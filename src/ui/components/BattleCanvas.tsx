import { useEffect, useMemo, useRef, useState } from "react";
import type { Position, RuntimeGameState, Team, TileDefinition, UnitState } from "../../game/types";
import type { PresentationEvent } from "../presentation/types";
import { resolveUnitSprite } from "../sprites/unitSprites";
import { useSpriteImages } from "../sprites/useSpriteImages";
import type { UnitSpriteDefinition, UnitSpritePose } from "../sprites/types";

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
  attackHighlightTiles: Position[];
  hoveredMovePath: Position[];
  enemyThreatOutlineTiles: Position[];
  presentationQueue: PresentationEvent[];
  grayLockUnitIds: string[];
  pendingDefeatedUnitIds: string[];
  onAnimationStateChange?: (isAnimating: boolean) => void;
  onPresentationComplete?: () => void;
  onTileClick: (position: Position) => void;
  onTileHover: (position?: Position) => void;
  onCancel: () => void;
};

type BoardMetrics = {
  width: number;
  height: number;
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

type DisplayedUnitState = {
  position: VisualPosition;
  hp: number;
  hasActed: boolean;
  opacity: number;
  shouldRender: boolean;
  spritePose: UnitSpritePose;
};

const MAX_CANVAS_HEIGHT_OFFSET = 142;
const PLAYER_MOVE_ANIMATION_MS = 800;
const ENEMY_MOVE_ANIMATION_MS = 800;
const ATTACK_ANIMATION_MS = 1200;
const DEATH_ANIMATION_MS = 700;

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
    attackHighlightTiles,
    hoveredMovePath,
    enemyThreatOutlineTiles,
    presentationQueue,
    grayLockUnitIds,
    pendingDefeatedUnitIds,
    onAnimationStateChange,
    onPresentationComplete,
    onTileClick,
    onTileHover,
    onCancel,
  } = props;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | undefined>(undefined);
  const [metrics, setMetrics] = useState<BoardMetrics>({
    width: width * 64,
    height: height * 64,
    tileSize: 64,
  });
  const [activePresentation, setActivePresentation] = useState<ActivePresentation | undefined>();
  const [animationClock, setAnimationClock] = useState(0);

  const moveHighlightSet = useMemo(
    () => new Set(moveHighlightTiles.map(toPositionKey)),
    [moveHighlightTiles],
  );
  const attackHighlightSet = useMemo(
    () => new Set(attackHighlightTiles.map(toPositionKey)),
    [attackHighlightTiles],
  );
  const enemyThreatOutlineSet = useMemo(
    () => new Set(enemyThreatOutlineTiles.map(toPositionKey)),
    [enemyThreatOutlineTiles],
  );
  const spriteDefinitions = useMemo(
    () =>
      units.flatMap((unit) => {
        const poses: UnitSpritePose[] = ["idle", "walk", "attack", "hurt", "death"];
        return poses.map((pose) => resolveUnitSprite(unit, pose).definition);
      }),
    [units],
  );
  const spriteImages = useSpriteImages(spriteDefinitions);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    const updateMetrics = () => {
      const bounds = wrapper.getBoundingClientRect();
      const maxWidth = bounds.width;
      const maxHeight = Math.max(240, window.innerHeight - MAX_CANVAS_HEIGHT_OFFSET);
      const tileSize = Math.floor(Math.min(maxWidth / width, maxHeight / height));
      const safeTileSize = Math.max(28, tileSize);

      setMetrics({
        width: safeTileSize * width,
        height: safeTileSize * height,
        tileSize: safeTileSize,
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
  }, [height, width]);

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
    if (!activePresentation) {
      return;
    }

    const duration = getEventDuration(activePresentation.event);

    const tick = () => {
      const now = performance.now();
      setAnimationClock(now);

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
    };

    frameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== undefined) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [activePresentation, onAnimationStateChange, onPresentationComplete, presentationQueue]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(metrics.width * dpr);
    canvas.height = Math.floor(metrics.height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, metrics.width, metrics.height);

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
      attackHighlightSet,
      hoveredMovePath,
      enemyThreatOutlineSet,
      metrics,
      activePresentation,
      presentationQueue,
      grayLockUnitIds,
      pendingDefeatedUnitIds,
      animationClock,
      spriteImages,
    });
  }, [
    activePresentation,
    animationClock,
    attackHighlightSet,
    hoveredMovePath,
    enemyThreatOutlineSet,
    grayLockUnitIds,
    pendingDefeatedUnitIds,
    spriteImages,
    height,
    hoveredTile,
    metrics,
    moveHighlightSet,
    presentationQueue,
    runtime,
    selectedTile,
    stagedTile,
    tiles,
    units,
    width,
  ]);

  return (
    <div ref={wrapperRef} className="battle-canvas-shell">
      <canvas
        ref={canvasRef}
        data-testid="battle-canvas"
        className="battle-canvas"
        style={{ width: metrics.width, height: metrics.height }}
        onClick={(event) => {
          const position = getTileFromPointer(event, metrics.tileSize, width, height);
          if (position) {
            onTileClick(position);
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          onCancel();
        }}
        onMouseLeave={() => onTileHover(undefined)}
        onMouseMove={(event) => {
          const position = getTileFromPointer(event, metrics.tileSize, width, height);
          onTileHover(position);
        }}
      />
    </div>
  );
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
    attackHighlightSet: Set<string>;
    hoveredMovePath: Position[];
    enemyThreatOutlineSet: Set<string>;
    metrics: BoardMetrics;
    activePresentation?: ActivePresentation;
    presentationQueue: PresentationEvent[];
    grayLockUnitIds: string[];
    pendingDefeatedUnitIds: string[];
    animationClock: number;
    spriteImages: Record<string, HTMLImageElement>;
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
    attackHighlightSet,
    hoveredMovePath,
    enemyThreatOutlineSet,
    metrics,
    activePresentation,
    presentationQueue,
    grayLockUnitIds,
    pendingDefeatedUnitIds,
    animationClock,
    spriteImages,
  } = input;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tile = tiles[y][x];
      const key = toPositionKey({ x, y });
      const px = x * metrics.tileSize;
      const py = y * metrics.tileSize;

      context.fillStyle = getTerrainColor(tile.terrain);
      roundRect(context, px + 2, py + 2, metrics.tileSize - 4, metrics.tileSize - 4, 12);
      context.fill();

      context.strokeStyle = "rgba(63, 43, 12, 0.16)";
      context.lineWidth = 1;
      roundRect(context, px + 2, py + 2, metrics.tileSize - 4, metrics.tileSize - 4, 12);
      context.stroke();

      if (moveHighlightSet.has(key)) {
        context.fillStyle = "rgba(37, 92, 176, 0.24)";
        roundRect(context, px + 4, py + 4, metrics.tileSize - 8, metrics.tileSize - 8, 10);
        context.fill();
      }

      if (attackHighlightSet.has(key)) {
        context.fillStyle = "rgba(163, 35, 29, 0.2)";
        roundRect(context, px + 6, py + 6, metrics.tileSize - 12, metrics.tileSize - 12, 10);
        context.fill();
      }

      if (enemyThreatOutlineSet.has(key)) {
        context.fillStyle = "rgba(184, 32, 24, 0.08)";
        context.fillRect(px, py, metrics.tileSize, metrics.tileSize);
        drawThreatBoundary(context, { x, y }, enemyThreatOutlineSet, metrics.tileSize);
      }

      if (selectedTile && selectedTile.x === x && selectedTile.y === y) {
        context.strokeStyle = "#194d8d";
        context.lineWidth = 4;
        roundRect(context, px + 4, py + 4, metrics.tileSize - 8, metrics.tileSize - 8, 10);
        context.stroke();
      }

      if (stagedTile && stagedTile.x === x && stagedTile.y === y) {
        context.strokeStyle = "#d08a13";
        context.lineWidth = 4;
        roundRect(context, px + 10, py + 10, metrics.tileSize - 20, metrics.tileSize - 20, 10);
        context.stroke();
      }

      if (hoveredTile && hoveredTile.x === x && hoveredTile.y === y) {
        context.fillStyle = "rgba(255, 255, 255, 0.14)";
        roundRect(context, px + 2, py + 2, metrics.tileSize - 4, metrics.tileSize - 4, 12);
        context.fill();
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
      spriteImages,
    );
  }
}

function drawUnit(
  context: CanvasRenderingContext2D,
  unit: UnitState,
  runtime: RuntimeGameState,
  tileSize: number,
  displayedState: DisplayedUnitState,
  activePresentation: ActivePresentation | undefined,
  animationClock: number,
  spriteImages: Record<string, HTMLImageElement>,
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
  context.globalAlpha = displayedState.opacity;

  context.fillStyle = "rgba(32, 20, 12, 0.65)";
  roundRect(context, barX, barY, barWidth, barHeight, barHeight / 2);
  context.fill();

  context.fillStyle = getHealthBarColor(unit, runtime, displayedState.hp);
  roundRect(context, barX, barY, barWidth * hpRatio, barHeight, barHeight / 2);
  context.fill();

  const unitFillColor = displayedState.hasActed ? "#7b7b7b" : getTeamColor(unit.team);
  const unitStrokeColor = displayedState.hasActed ? "rgba(222, 222, 222, 0.92)" : "rgba(255, 250, 240, 0.9)";
  const unitTextColor = displayedState.hasActed ? "#f2f2f2" : "#fff8ed";
  const spriteDefinition = resolveUnitSprite(unit, displayedState.spritePose).definition;
  const spriteImage = spriteDefinition ? spriteImages[spriteDefinition.src] : undefined;
  const spriteSize = Math.max(24, tileSize * 0.72);

  context.fillStyle = unitFillColor;
  if (spriteImage && spriteImage.complete && spriteImage.naturalWidth > 0) {
    drawSprite(
      context,
      spriteImage,
      centerX,
      centerY,
      spriteSize,
      spriteDefinition,
      displayedState.spritePose,
      activePresentation,
      animationClock,
    );
  } else {
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = unitStrokeColor;
    context.lineWidth = 2;
    context.stroke();

    context.fillStyle = unitTextColor;
    context.font = `700 ${Math.max(12, tileSize * 0.28)}px Trebuchet MS`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(unit.name[0] ?? "?", centerX, centerY + 1);
  }
  context.restore();
}

function getDisplayedUnitState(
  unit: UnitState,
  presentationQueue: PresentationEvent[],
  grayLockUnitIds: string[],
  pendingDefeatedUnitIds: string[],
  activePresentation: ActivePresentation | undefined,
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

  if (activeMove) {
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
    spritePose: getDisplayedSpritePose(unit.id, activePresentation),
  };
}

function getDisplayedSpritePose(
  unitId: string,
  activePresentation: ActivePresentation | undefined,
): UnitSpritePose {
  if (!activePresentation) {
    return "idle";
  }

  if (activePresentation.event.type === "move" && activePresentation.event.unitId === unitId) {
    return "walk";
  }

  if (activePresentation.event.type === "combat") {
    if (activePresentation.event.attackerId === unitId) {
      return activePresentation.event.attackerToHp <= 0 ? "death" : "attack";
    }

    if (activePresentation.event.defenderId === unitId) {
      return activePresentation.event.defenderToHp <= 0 ? "death" : "hurt";
    }
  }

  return "idle";
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

function getCombatDeathTail(event: Extract<PresentationEvent, { type: "combat" }>): number {
  return event.defenderToHp <= 0 || event.attackerToHp <= 0 ? DEATH_ANIMATION_MS : 0;
}

function getTileFromPointer(
  event: React.MouseEvent<HTMLCanvasElement>,
  tileSize: number,
  width: number,
  height: number,
): Position | undefined {
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = Math.floor((event.clientX - bounds.left) / tileSize);
  const y = Math.floor((event.clientY - bounds.top) / tileSize);

  if (x < 0 || y < 0 || x >= width || y >= height) {
    return undefined;
  }

  return { x, y };
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
    default:
      return "#d4bc82";
  }
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

function drawSprite(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  centerX: number,
  centerY: number,
  size: number,
  definition: UnitSpriteDefinition | undefined,
  pose: UnitSpritePose,
  activePresentation: ActivePresentation | undefined,
  animationClock: number,
) {
  const frameCount = Math.max(1, definition?.frameCount ?? 1);
  const sourceWidth =
    definition?.frameWidth ?? Math.floor(image.naturalWidth / frameCount) ?? image.naturalWidth;
  const sourceHeight = definition?.frameHeight ?? image.naturalHeight;
  const frameIndex = getSpriteFrameIndex(frameCount, definition?.frameDurationMs, pose, activePresentation, animationClock);
  const sourceX = Math.min(frameIndex, frameCount - 1) * sourceWidth;
  const sourceY = 0;
  const drawX = centerX - size / 2;
  const drawY = centerY - size / 2;
  const offsetX = definition?.frameOffsetX ?? 0;
  const offsetY = definition?.frameOffsetY ?? 0;

  context.imageSmoothingEnabled = false;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    drawX + offsetX,
    drawY + offsetY,
    size,
    size,
  );
}

function getSpriteFrameIndex(
  frameCount: number,
  frameDurationMs: number | undefined,
  pose: UnitSpritePose,
  activePresentation: ActivePresentation | undefined,
  animationClock: number,
): number {
  if (frameCount <= 1) {
    return 0;
  }

  const msPerFrame = Math.max(60, frameDurationMs ?? 120);

  if (!activePresentation) {
    if (pose === "idle") {
      return Math.floor(animationClock / msPerFrame) % frameCount;
    }

    return 0;
  }

  const elapsed = Math.max(0, animationClock - activePresentation.startedAt);
  return Math.floor(elapsed / msPerFrame) % frameCount;
}
