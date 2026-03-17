import { useEffect, useMemo, useRef, useState } from "react";
import type { Position, Team, TileDefinition, UnitState } from "../../game/types";

type BattleCanvasProps = {
  tiles: TileDefinition[][];
  width: number;
  height: number;
  units: UnitState[];
  hoveredTile?: Position;
  selectedTile?: Position;
  stagedTile?: Position;
  moveHighlightTiles: Position[];
  attackHighlightTiles: Position[];
  enemyThreatOutlineTiles: Position[];
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

const MAX_CANVAS_HEIGHT_OFFSET = 142;
const MOVE_ANIMATION_MS = 180;

export function BattleCanvas(props: BattleCanvasProps) {
  const {
    tiles,
    width,
    height,
    units,
    hoveredTile,
    selectedTile,
    stagedTile,
    moveHighlightTiles,
    attackHighlightTiles,
    enemyThreatOutlineTiles,
    onTileClick,
    onTileHover,
    onCancel,
  } = props;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const [metrics, setMetrics] = useState<BoardMetrics>({
    width: width * 64,
    height: height * 64,
    tileSize: 64,
  });
  const [animatedPositions, setAnimatedPositions] = useState<Record<string, VisualPosition>>(() =>
    Object.fromEntries(units.map((unit) => [unit.id, { x: unit.position.x, y: unit.position.y }])),
  );

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
    const previousPositions = animatedPositions;
    const nextTargets = Object.fromEntries(
      units.map((unit) => [unit.id, { x: unit.position.x, y: unit.position.y }]),
    );

    const startPositions = Object.fromEntries(
      units.map((unit) => [
        unit.id,
        previousPositions[unit.id] ?? { x: unit.position.x, y: unit.position.y },
      ]),
    );

    const shouldAnimate = units.some((unit) => {
      const start = startPositions[unit.id];
      return start.x !== unit.position.x || start.y !== unit.position.y;
    });

    if (!shouldAnimate) {
      setAnimatedPositions(nextTargets);
      return;
    }

    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / MOVE_ANIMATION_MS);
      const eased = 1 - (1 - progress) * (1 - progress);

      setAnimatedPositions(
        Object.fromEntries(
          units.map((unit) => {
            const start = startPositions[unit.id];
            const target = nextTargets[unit.id];

            return [
              unit.id,
              {
                x: start.x + (target.x - start.x) * eased,
                y: start.y + (target.y - start.y) * eased,
              },
            ];
          }),
        ),
      );

      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(tick);
      }
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current !== undefined) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [units]);

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
      tiles,
      width,
      height,
      units,
      animatedPositions,
      hoveredTile,
      selectedTile,
      stagedTile,
      moveHighlightSet,
      attackHighlightSet,
      enemyThreatOutlineSet,
      metrics,
    });
  }, [
    attackHighlightSet,
    enemyThreatOutlineSet,
    height,
    hoveredTile,
    metrics,
    moveHighlightSet,
    animatedPositions,
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
    tiles: TileDefinition[][];
    width: number;
    height: number;
    units: UnitState[];
    animatedPositions: Record<string, VisualPosition>;
    hoveredTile?: Position;
    selectedTile?: Position;
    stagedTile?: Position;
    moveHighlightSet: Set<string>;
    attackHighlightSet: Set<string>;
    enemyThreatOutlineSet: Set<string>;
    metrics: BoardMetrics;
  },
) {
  const {
    tiles,
    width,
    height,
    units,
    animatedPositions,
    hoveredTile,
    selectedTile,
    stagedTile,
    moveHighlightSet,
    attackHighlightSet,
    enemyThreatOutlineSet,
    metrics,
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

  for (const unit of units.filter((candidate) => !candidate.isDefeated)) {
    drawUnit(
      context,
      unit,
      metrics.tileSize,
      animatedPositions[unit.id] ?? { x: unit.position.x, y: unit.position.y },
    );
  }
}

function drawUnit(
  context: CanvasRenderingContext2D,
  unit: UnitState,
  tileSize: number,
  visualPosition: VisualPosition,
) {
  const centerX = visualPosition.x * tileSize + tileSize / 2;
  const centerY = visualPosition.y * tileSize + tileSize / 2;
  const radius = Math.max(12, tileSize * 0.22);
  const hpRatio = Math.max(0, Math.min(1, unit.currentHp / unit.stats.maxHp));
  const barWidth = Math.max(20, tileSize * 0.58);
  const barHeight = Math.max(4, tileSize * 0.08);
  const barX = centerX - barWidth / 2;
  const barY = centerY - radius - Math.max(10, tileSize * 0.18);

  context.fillStyle = "rgba(32, 20, 12, 0.65)";
  roundRect(context, barX, barY, barWidth, barHeight, barHeight / 2);
  context.fill();

  context.fillStyle = getHealthBarColor(hpRatio);
  roundRect(context, barX, barY, barWidth * hpRatio, barHeight, barHeight / 2);
  context.fill();

  context.fillStyle = getTeamColor(unit.team);
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = "rgba(255, 250, 240, 0.9)";
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = "#fff8ed";
  context.font = `700 ${Math.max(12, tileSize * 0.28)}px Trebuchet MS`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(unit.name[0] ?? "?", centerX, centerY + 1);
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

function getHealthBarColor(hpRatio: number): string {
  if (hpRatio <= 0.25) {
    return "#c53c2f";
  }

  if (hpRatio <= 0.5) {
    return "#d08a13";
  }

  return "#4c9a58";
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
