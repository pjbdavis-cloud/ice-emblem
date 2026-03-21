import { act } from "react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialRuntimeState } from "../../game/core/state";
import { demoMap } from "../../game/data/demoMap";
import { gameReducer } from "../../app/slices/gameSlice";
import { BattleScreen } from "./BattleScreen";

vi.mock("./BattleCanvas", () => ({
  BattleCanvas: (props: {
    onTileClick: (position: { x: number; y: number }) => void;
    onTileHover: (position?: { x: number; y: number }) => void;
  }) => (
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
      <button type="button" onClick={() => props.onTileHover({ x: 5, y: 1 })}>
        Hover Bandit
      </button>
      <button type="button" onClick={() => props.onTileHover(undefined)}>
        Clear Hover
      </button>
    </div>
  ),
}));

describe("BattleScreen interactions", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("selects and deselects a unit when clicked twice", async () => {
    const user = renderBattleScreen();

    await user.click(screen.getByRole("button", { name: "Click Aster" }));
    expect(screen.getByText("Aster")).toBeInTheDocument();
    expect(screen.getByText("Ready to move")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Click Aster" }));
    expect(screen.getByText("No unit selected.")).toBeInTheDocument();
  });

  it("stages a move on a reachable tile and shows the command menu", async () => {
    const user = renderBattleScreen();

    await user.click(screen.getByRole("button", { name: "Click Aster" }));
    await user.click(screen.getByRole("button", { name: "Click Nearby Tile" }));
    const commandCard = screen.getByRole("heading", { name: "Command" }).closest("section");
    if (!commandCard) {
      throw new Error("Expected command card");
    }
    const commandPanel = within(commandCard);

    expect(screen.getByText("Move to 1,3")).toBeInTheDocument();
    expect(commandPanel.getByRole("button", { name: "Attack" })).toBeDisabled();
    expect(commandPanel.getByRole("button", { name: "Wait" })).toBeEnabled();
    expect(commandPanel.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("cancels staged actions hierarchically with Escape", async () => {
    const user = renderBattleScreen();

    await user.click(screen.getByRole("button", { name: "Click Mira" }));
    await user.click(screen.getByRole("button", { name: "Click Archer Attack Tile" }));
    await user.click(screen.getByRole("button", { name: "Attack" }));

    expect(screen.getByText("Choose a red target, or go back and pick Wait.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();

    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Attack" })).toBeEnabled();
    expect(screen.getByText("Move to 5,3")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(
      screen.getByText("Click a blue tile to stage a move. The unit will not move until you confirm Wait or Attack."),
    ).toBeInTheDocument();
    expect(screen.getByText("Mira")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.getByText("No unit selected.")).toBeInTheDocument();
  });

  it("keeps hover and selected panels separate", async () => {
    const user = renderBattleScreen();

    await user.click(screen.getByRole("button", { name: "Click Aster" }));
    await user.click(screen.getByRole("button", { name: "Hover Bandit" }));

    expect(screen.getByRole("heading", { name: "Hover" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Selected" })).toBeInTheDocument();
    expect(screen.getByText("Bandit")).toBeInTheDocument();
    expect(screen.getByText("Status: Enemy")).toBeInTheDocument();
    expect(screen.getByText("Ready to move")).toBeInTheDocument();
  });
});

function renderBattleScreen() {
  vi.useFakeTimers();

  const store = configureStore({
    reducer: {
      game: gameReducer,
    },
    preloadedState: {
      game: {
        runtime: createInitialRuntimeState(demoMap),
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
