import { act, useEffect } from "react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialRuntimeState } from "../../game/core/state";
import { demoMap } from "../../game/data/demoMap";
import { gameReducer } from "../../app/slices/gameSlice";
import { BattleScreen } from "./BattleScreen";

vi.mock("./BattleCanvas", () => ({
  BattleCanvas: (props: {
    onTileClick: (position: { x: number; y: number }) => void;
    onTileRightClick: (position?: { x: number; y: number }) => void;
    onTileHover: (position?: { x: number; y: number }) => void;
    isInteractionLocked?: boolean;
    moveHighlightTiles: Array<{ x: number; y: number }>;
    attackHighlightTiles: Array<{ x: number; y: number }>;
    isAttackTargeting: boolean;
    targetableEnemyTiles: Array<{ x: number; y: number }>;
    hoveredAttackTargetTile?: { x: number; y: number };
    selectedEnemyThreatTiles: Array<{ x: number; y: number }>;
    enemyThreatOutlineTiles: Array<{ x: number; y: number }>;
    hoveredMovePath: Array<{ x: number; y: number }>;
    previewMove?: { unitId: string; path: Array<{ x: number; y: number }>; destination: { x: number; y: number } };
    onPreviewMoveComplete?: () => void;
  }) => {
    useEffect(() => {
      if (props.previewMove) {
        props.onPreviewMoveComplete?.();
      }
    }, [props.onPreviewMoveComplete, props.previewMove]);

    return (
      <div data-testid="mock-battle-canvas">
        <button type="button" onClick={() => props.onTileClick({ x: 1, y: 4 })}>
          Click Aster
        </button>
        <button type="button" onClick={() => props.onTileClick({ x: 2, y: 5 })}>
          Click Mira
        </button>
        <button type="button" onClick={() => props.onTileClick({ x: 1, y: 3 })}>
          Click Nearby Tile
        </button>
        <button type="button" onClick={() => props.onTileClick({ x: 4, y: 2 })}>
          Click Melee Attack Tile
        </button>
        <button type="button" onClick={() => props.onTileClick({ x: 5, y: 3 })}>
          Click Archer Attack Tile
        </button>
        <button type="button" onClick={() => props.onTileClick({ x: 5, y: 1 })}>
          Click Bandit
        </button>
        <button type="button" onClick={() => props.onTileRightClick({ x: 5, y: 1 })}>
          Right Click Bandit
        </button>
        <button type="button" onClick={() => props.onTileRightClick({ x: 1, y: 4 })}>
          Right Click Aster
        </button>
        <button type="button" onMouseEnter={() => props.onTileHover({ x: 5, y: 1 })}>
          Hover Bandit
        </button>
        <button type="button" onMouseEnter={() => props.onTileHover({ x: 2, y: 4 })}>
          Hover Right One
        </button>
        <button type="button" onMouseEnter={() => props.onTileHover({ x: 3, y: 4 })}>
          Hover Right Two
        </button>
        <button type="button" onMouseEnter={() => props.onTileHover({ x: 3, y: 3 })}>
          Hover Up One
        </button>
        <button type="button" onMouseEnter={() => props.onTileHover({ x: 3, y: 2 })}>
          Hover Up Two
        </button>
        <button type="button" onMouseEnter={() => props.onTileHover({ x: 1, y: 3 })}>
          Hover Nearby Tile
        </button>
        <button type="button" onMouseEnter={() => props.onTileHover({ x: 2, y: 3 })}>
          Hover Corner Tile
        </button>
        <button type="button" onMouseEnter={() => props.onTileHover({ x: 2, y: 5 })}>
          Hover Ally Tile
        </button>
        <button type="button" onMouseEnter={() => props.onTileHover(undefined)}>
          Clear Hover
        </button>
        <output data-testid="interaction-locked">{String(Boolean(props.isInteractionLocked))}</output>
        <output data-testid="move-highlight-tiles">
          {props.moveHighlightTiles.map((tile) => `${tile.x},${tile.y}`).join(" | ")}
        </output>
        <output data-testid="hovered-move-path">
          {props.hoveredMovePath.map((tile) => `${tile.x},${tile.y}`).join(" -> ")}
        </output>
        <output data-testid="preview-move-path">
          {props.previewMove?.path.map((tile) => `${tile.x},${tile.y}`).join(" -> ") ?? ""}
        </output>
        <output data-testid="attack-highlight-tiles">
          {props.attackHighlightTiles.map((tile) => `${tile.x},${tile.y}`).join(" | ")}
        </output>
        <output data-testid="targetable-enemy-tiles">
          {props.targetableEnemyTiles.map((tile) => `${tile.x},${tile.y}`).join(" | ")}
        </output>
        <output data-testid="hovered-attack-target-tile">
          {props.hoveredAttackTargetTile ? `${props.hoveredAttackTargetTile.x},${props.hoveredAttackTargetTile.y}` : ""}
        </output>
        <output data-testid="selected-enemy-threat-tiles">
          {props.selectedEnemyThreatTiles.map((tile) => `${tile.x},${tile.y}`).join(" | ")}
        </output>
        <output data-testid="enemy-threat-outline-tiles">
          {props.enemyThreatOutlineTiles.map((tile) => `${tile.x},${tile.y}`).join(" | ")}
        </output>
      </div>
    );
  },
}));

describe("BattleScreen interactions", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens the action menu when clicking the selected unit again", async () => {
    const user = renderBattleScreen();

    await user.click(screen.getByRole("button", { name: "Click Aster" }));
    expect(screen.getByText("Aster")).toBeInTheDocument();
    expect(screen.getByText("Ready to move")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Click Aster" }));
    expect(screen.getByText("Aster at 1,4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wait" })).toBeEnabled();
  });

  it("unselects a unit on right click", async () => {
    const user = renderBattleScreen();

    await user.click(screen.getByRole("button", { name: "Click Aster" }));
    expect(screen.getByText("Aster")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Right Click Aster" }));
    expect(screen.getByText("No unit selected.")).toBeInTheDocument();
  });

  it("stages a move on a reachable tile and shows the action menu in the sidebar", async () => {
    const user = renderBattleScreen();

    await user.click(screen.getByRole("button", { name: "Click Aster" }));
    await user.click(screen.getByRole("button", { name: "Click Nearby Tile" }));

    expect(screen.getByText("Aster at 1,3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Attack" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Use Item" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Wait" })).toBeEnabled();
  });

  it("cancels the staged menu on right click", async () => {
    const user = renderBattleScreen();

    await user.click(screen.getByRole("button", { name: "Click Aster" }));
    await user.click(screen.getByRole("button", { name: "Click Nearby Tile" }));

    fireEvent.contextMenu(screen.getByText("Aster at 1,3"));

    expect(screen.queryByText("Aster at 1,3")).not.toBeInTheDocument();
    expect(screen.getByText("Aster")).toBeInTheDocument();
  });

  it("cancels staged actions hierarchically with Escape", async () => {
    const user = renderBattleScreen();

    await user.click(screen.getByRole("button", { name: "Click Mira" }));
    await user.click(screen.getByRole("button", { name: "Click Archer Attack Tile" }));
    await user.click(screen.getByRole("button", { name: "Attack" }));

    expect(screen.getByText("Select a target to attack.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();

    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Attack" })).toBeEnabled();
    expect(screen.getByText("Mira at 5,3")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Attack" })).not.toBeInTheDocument();
    expect(screen.getByText("Mira")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.getByText("No unit selected.")).toBeInTheDocument();
  });

  it("keeps enemy hover available while choosing an attack target", async () => {
    const user = renderBattleScreen();

    await user.click(screen.getByRole("button", { name: "Click Mira" }));
    await user.click(screen.getByRole("button", { name: "Click Archer Attack Tile" }));
    await user.click(screen.getByRole("button", { name: "Attack" }));
    await user.hover(screen.getByRole("button", { name: "Hover Bandit" }));

    expect(screen.getByText("Select a target to attack.")).toBeInTheDocument();
    expect(screen.getAllByText("Bandit").length).toBeGreaterThan(0);
    expect(screen.getByText(/Combat: Mira deals/)).toBeInTheDocument();
    expect(screen.getByTestId("targetable-enemy-tiles")).toHaveTextContent("5,1");
    expect(screen.getByTestId("hovered-attack-target-tile")).toHaveTextContent("5,1");
  });

  it("shows only direct post-move attack range after staging a move", async () => {
    const user = renderBattleScreen();

    await user.click(screen.getByRole("button", { name: "Click Mira" }));
    await user.click(screen.getByRole("button", { name: "Click Archer Attack Tile" }));

    expect(screen.getByTestId("attack-highlight-tiles")).toHaveTextContent("5,1");
    expect(screen.getByTestId("attack-highlight-tiles")).not.toHaveTextContent("2,3");
  });

  it("switches from attack area tiles to targetable enemies during attack targeting", async () => {
    const user = renderBattleScreen();

    await user.click(screen.getByRole("button", { name: "Click Mira" }));
    await user.click(screen.getByRole("button", { name: "Click Archer Attack Tile" }));
    expect(screen.getByTestId("attack-highlight-tiles")).toHaveTextContent("5,1");

    await user.click(screen.getByRole("button", { name: "Attack" }));

    expect(screen.getByTestId("attack-highlight-tiles")).toHaveTextContent("");
    expect(screen.getByTestId("targetable-enemy-tiles")).toHaveTextContent("5,1");
  });

  it("toggles an enemy threat selection with either left or right click", async () => {
    const user = renderBattleScreen();

    await user.click(screen.getByRole("button", { name: "Click Bandit" }));
    expect(screen.getByTestId("selected-enemy-threat-tiles")).toHaveTextContent("5,1");
    expect(screen.getByTestId("enemy-threat-outline-tiles").textContent).not.toEqual("");

    await user.click(screen.getByRole("button", { name: "Right Click Bandit" }));
    expect(screen.getByTestId("selected-enemy-threat-tiles")).toHaveTextContent("");

    await user.click(screen.getByRole("button", { name: "Right Click Bandit" }));
    expect(screen.getByTestId("selected-enemy-threat-tiles")).toHaveTextContent("5,1");

    await user.click(screen.getByRole("button", { name: "Click Bandit" }));
    expect(screen.getByTestId("selected-enemy-threat-tiles")).toHaveTextContent("");
  });

  it("can select all and clear all enemy threat selections", async () => {
    const user = renderBattleScreen();

    await user.click(screen.getByRole("button", { name: "Select All Threat" }));
    expect(screen.getByTestId("selected-enemy-threat-tiles").textContent).not.toEqual("");

    await user.click(screen.getByRole("button", { name: "Select None Threat" }));
    expect(screen.getByTestId("selected-enemy-threat-tiles")).toHaveTextContent("");
  });

  it("keeps hover and selected panels separate", async () => {
    const user = renderBattleScreen();

    await user.click(screen.getByRole("button", { name: "Click Aster" }));
    await user.hover(screen.getByRole("button", { name: "Hover Bandit" }));

    expect(screen.getByRole("heading", { name: "Hover" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Selected" })).toBeInTheDocument();
    expect(screen.getAllByText("Bandit").length).toBeGreaterThan(0);
    expect(screen.getByText("Status: Enemy")).toBeInTheDocument();
    expect(screen.getByText(/Combat: Aster deals/)).toBeInTheDocument();
    expect(screen.getByText("Ready to move")).toBeInTheDocument();
  });

  it("clears the combat preview when hover leaves an enemy", async () => {
    const user = renderBattleScreen();
    const combatPreviewCard = screen.getByRole("heading", { name: "Combat Preview" }).closest("section");
    expect(combatPreviewCard).not.toBeNull();
    const combatPreview = within(combatPreviewCard as HTMLElement);

    await user.click(screen.getByRole("button", { name: "Click Aster" }));
    await user.hover(screen.getByRole("button", { name: "Hover Bandit" }));

    expect(combatPreview.getAllByText("Aster").length).toBeGreaterThan(0);
    expect(combatPreview.getAllByText("Bandit").length).toBeGreaterThan(0);
    expect(combatPreview.getByText("Character")).toBeInTheDocument();
    expect(combatPreview.getByText("Hit Points")).toBeInTheDocument();
    expect(combatPreview.getByText("Damage")).toBeInTheDocument();
    expect(combatPreview.getByText("Weapon")).toBeInTheDocument();

    await user.hover(screen.getByRole("button", { name: "Clear Hover" }));

    expect(combatPreview.queryByText("DMG")).not.toBeInTheDocument();
    expect(combatPreview.getByText("Select a unit, stage a move, then hover an enemy to preview that fight.")).toBeInTheDocument();
  });

  it("shows both units, hp, damage, and ko status in the combat preview", async () => {
    const user = renderBattleScreen();
    const combatPreviewCard = screen.getByRole("heading", { name: "Combat Preview" }).closest("section");
    expect(combatPreviewCard).not.toBeNull();
    const combatPreview = within(combatPreviewCard as HTMLElement);

    await user.click(screen.getByRole("button", { name: "Click Aster" }));
    await user.hover(screen.getByRole("button", { name: "Hover Bandit" }));

    expect(combatPreview.getAllByText("Aster").length).toBeGreaterThan(0);
    expect(combatPreview.getAllByText("Bandit").length).toBeGreaterThan(0);
    expect(combatPreview.getByText("Character")).toBeInTheDocument();
    expect(combatPreview.getByText("Hit Points")).toBeInTheDocument();
    expect(combatPreview.getByText("Damage")).toBeInTheDocument();
    expect(combatPreview.getByText("Weapon")).toBeInTheDocument();
    expect(combatPreview.getByText("21/21")).toBeInTheDocument();
    expect(combatPreview.getByText("23/23")).toBeInTheDocument();
    expect(combatPreview.getByText("9 — 12")).toBeInTheDocument();
    expect(combatPreview.getByText("8 — 11")).toBeInTheDocument();
    expect(combatPreview.getByText("Iron Sword")).toBeInTheDocument();
    expect(combatPreview.getByText("Iron Axe")).toBeInTheDocument();
    expect(combatPreview.getByText("↑")).toBeInTheDocument();
    expect(combatPreview.getByText("↓")).toBeInTheDocument();
  });

  it("shows compact selected unit details including class, proficiencies, and items", async () => {
    const user = renderBattleScreen();

    await user.click(screen.getByRole("button", { name: "Click Aster" }));

    expect(screen.getByText("Journeyman")).toBeInTheDocument();
    expect(screen.getByText("Sword E")).toBeInTheDocument();
    expect(screen.getByText("Iron Sword")).toBeInTheDocument();
    expect(screen.getByText("Equipped")).toBeInTheDocument();
  });

  it("shows hover unit class, proficiencies, and items", async () => {
    const user = renderBattleScreen();

    await user.hover(screen.getByRole("button", { name: "Hover Bandit" }));

    expect(screen.getByText("Sailor")).toBeInTheDocument();
    expect(screen.getByText("Axe E")).toBeInTheDocument();
    expect(screen.getByText("Iron Axe")).toBeInTheDocument();
    expect(screen.getByText("Equipped")).toBeInTheDocument();
  });

  it("does not show movement or attack previews for a friendly unit that has already acted", async () => {
    const user = renderBattleScreen((runtime) => {
      runtime.units["player-archer"].hasMoved = true;
      runtime.units["player-archer"].hasActed = true;
      return runtime;
    });

    await user.hover(screen.getByRole("button", { name: "Hover Ally Tile" }));

    expect(screen.getByTestId("move-highlight-tiles")).toHaveTextContent("");
    expect(screen.getByTestId("attack-highlight-tiles")).toHaveTextContent("");
  });

  it("still allows selecting a spent friendly unit for inspection and combat preview", async () => {
    const user = renderBattleScreen((runtime) => {
      runtime.units["player-lord"].hasMoved = true;
      runtime.units["player-lord"].hasActed = true;
      return runtime;
    });

    await user.click(screen.getByRole("button", { name: "Click Aster" }));
    expect(screen.getByText("Aster")).toBeInTheDocument();
    expect(screen.getByText("Moved this turn")).toBeInTheDocument();
    expect(screen.getByText("Action spent")).toBeInTheDocument();

    await user.hover(screen.getByRole("button", { name: "Hover Bandit" }));
    const combatPreviewCard = screen.getByRole("heading", { name: "Combat Preview" }).closest("section");
    expect(combatPreviewCard).not.toBeNull();
    const combatPreview = within(combatPreviewCard as HTMLElement);

    expect(combatPreview.getAllByText("Aster").length).toBeGreaterThan(0);
    expect(combatPreview.getAllByText("Bandit").length).toBeGreaterThan(0);
  });

  it("hides the presentation log sidebar during normal play", () => {
    renderBattleScreen();

    expect(screen.queryByRole("heading", { name: "Presentation Log" })).not.toBeInTheDocument();
  });

  it("shows allied occupied tiles in the selected unit movement preview", async () => {
    const user = renderBattleScreen();

    await user.click(screen.getByRole("button", { name: "Click Aster" }));

    expect(screen.getByTestId("move-highlight-tiles")).toHaveTextContent("2,5");
    expect(screen.getByTestId("attack-highlight-tiles")).not.toHaveTextContent("2,5");
  });

  it("restores the previous hover path when returning to an earlier tile", async () => {
    const user = renderBattleScreen();

    await user.click(screen.getByRole("button", { name: "Click Aster" }));
    await user.hover(screen.getByRole("button", { name: "Hover Nearby Tile" }));
    expect(screen.getByTestId("hovered-move-path")).toHaveTextContent("1,4 -> 1,3");

    await user.hover(screen.getByRole("button", { name: "Hover Corner Tile" }));
    expect(screen.getByTestId("hovered-move-path")).toHaveTextContent("1,4 -> 1,3 -> 2,3");

    await user.hover(screen.getByRole("button", { name: "Hover Nearby Tile" }));
    expect(screen.getByTestId("hovered-move-path")).toHaveTextContent("1,4 -> 1,3");
  });

  it("pops the hover path stack when revisiting the previous cell", async () => {
    const user = renderBattleScreen();

    await user.click(screen.getByRole("button", { name: "Click Aster" }));
    await user.hover(screen.getByRole("button", { name: "Hover Right One" }));
    await user.hover(screen.getByRole("button", { name: "Hover Right Two" }));
    await user.hover(screen.getByRole("button", { name: "Hover Up One" }));
    await user.hover(screen.getByRole("button", { name: "Hover Up Two" }));

    expect(screen.getByTestId("hovered-move-path")).toHaveTextContent("1,4 -> 2,4 -> 3,4 -> 3,3 -> 3,2");

    await user.hover(screen.getByRole("button", { name: "Hover Up One" }));

    expect(screen.getByTestId("hovered-move-path")).toHaveTextContent("1,4 -> 2,4 -> 3,4 -> 3,3");
  });

  it("uses the currently previewed hover path when staging a move", async () => {
    const user = renderBattleScreen();

    await user.click(screen.getByRole("button", { name: "Click Aster" }));
    await user.hover(screen.getByRole("button", { name: "Hover Nearby Tile" }));

    expect(screen.getByTestId("hovered-move-path")).toHaveTextContent("1,4 -> 1,3");

    await user.click(screen.getByRole("button", { name: "Click Nearby Tile" }));

    expect(screen.getByText("Aster at 1,3")).toBeInTheDocument();
    expect(screen.getByTestId("preview-move-path")).toHaveTextContent("1,4 -> 1,3");
  });

  it("shows a victory overlay with restart as the only available action", () => {
    renderBattleScreen((runtime) => {
      runtime.gameResult = "victory";
      return runtime;
    });

    expect(screen.getByTestId("battle-result-overlay")).toHaveTextContent("Victory");
    expect(screen.getByRole("button", { name: "Restart" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End Phase" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
    expect(screen.getByTestId("interaction-locked")).toHaveTextContent("true");
  });

  it("shows a defeat overlay with restart as the only available action", () => {
    renderBattleScreen((runtime) => {
      runtime.gameResult = "defeat";
      return runtime;
    });

    expect(screen.getByTestId("battle-result-overlay")).toHaveTextContent("Defeat");
    expect(screen.getByRole("button", { name: "Restart" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select All Threat" })).not.toBeInTheDocument();
  });

  it("locks board interaction after the game ends", async () => {
    const user = renderBattleScreen((runtime) => {
      runtime.gameResult = "victory";
      return runtime;
    });

    await user.click(screen.getByRole("button", { name: "Click Aster" }));

    expect(screen.getByText("No unit selected.")).toBeInTheDocument();
    expect(screen.queryByText("Aster")).not.toBeInTheDocument();
  });

  it("restarts from the existing reset behavior after the game ends", async () => {
    const user = renderBattleScreen((runtime) => {
      runtime.gameResult = "defeat";
      runtime.turnNumber = 4;
      runtime.units["player-lord"].currentHp = 0;
      runtime.units["player-lord"].isDefeated = true;
      return runtime;
    });

    await user.click(screen.getByRole("button", { name: "Restart" }));

    expect(screen.queryByTestId("battle-result-overlay")).not.toBeInTheDocument();
    expect(screen.getByText("Turn 1 | PLAYER PHASE")).toBeInTheDocument();
    expect(screen.getByText("No unit selected.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "End Phase" })).toBeInTheDocument();
  });
});

function renderBattleScreen(
  mutateRuntime?: (
    runtime: ReturnType<typeof createInitialRuntimeState>,
  ) => ReturnType<typeof createInitialRuntimeState>,
) {
  vi.useFakeTimers();

  const runtime = createInitialRuntimeState(demoMap);
  const preparedRuntime = mutateRuntime ? mutateRuntime(runtime) : runtime;

  const store = configureStore({
    reducer: {
      game: gameReducer,
    },
    preloadedState: {
      game: {
        runtime: preparedRuntime,
      },
    },
  });
  render(
    <Provider store={store}>
      <BattleScreen />
    </Provider>,
  );

  act(() => {
    vi.advanceTimersByTime(1700);
  });

  vi.useRealTimers();
  const user = userEvent.setup();

  return user;
}
